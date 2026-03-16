import path from 'node:path';
import db from './db.js';
import {
  createLicenseToken,
  evaluateLicenseToken,
  fingerprintPrivateKey,
  fingerprintPublicKey,
  formatPublicKeyForEnv,
  generateLicenseKeyPair,
  getPublicKeyFromPrivateKey,
  normalizeEnabledModules,
  normalizeLicensePayload,
  parseLicenseToken,
  validateKeyPair
} from '@paint-shop/shared/src/license-node.js';
import { calculateLicenseState } from '@paint-shop/shared/src/license-common.js';
import { DEFAULT_PLAN_TEMPLATES, DEFAULT_SETTINGS, LICENSE_MODULE_OPTIONS } from './defaults.js';
import {
  fileExists,
  getAppHome,
  getDatabasePath,
  getDefaultKeyStoragePath,
  readTextFile,
  resolveKeyStoragePath,
  writeTextFile
} from './storage.js';

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function sanitizePlanTemplates(planTemplates) {
  if (!Array.isArray(planTemplates)) {
    return DEFAULT_PLAN_TEMPLATES;
  }

  const cleaned = planTemplates
    .map((item) => ({
      code: String(item?.code || '').trim().toUpperCase(),
      name: String(item?.name || '').trim(),
      defaultGraceDays: Math.max(0, Number(item?.defaultGraceDays || 0) || 0),
      maxDevices: Number(item?.maxDevices) > 0 ? Math.floor(Number(item.maxDevices)) : null,
      enabledModules: normalizeEnabledModules(item?.enabledModules)
    }))
    .filter((item) => item.code && item.name);

  return cleaned.length > 0 ? cleaned : DEFAULT_PLAN_TEMPLATES;
}

function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ? LIMIT 1').get(key);
  return row?.value ?? fallback;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP
  `).run(key, value);
}

export function getManagerSettings() {
  const rawTemplates = parseJson(getSetting('planTemplates', JSON.stringify(DEFAULT_SETTINGS.planTemplates)), DEFAULT_SETTINGS.planTemplates);

  return {
    keyStoragePath: getSetting('keyStoragePath', DEFAULT_SETTINGS.keyStoragePath),
    resolvedKeyStoragePath: resolveKeyStoragePath(getSetting('keyStoragePath', DEFAULT_SETTINGS.keyStoragePath)),
    defaultGraceDays: Math.max(0, Number(getSetting('defaultGraceDays', String(DEFAULT_SETTINGS.defaultGraceDays))) || DEFAULT_SETTINGS.defaultGraceDays),
    expiringSoonDays: Math.max(1, Number(getSetting('expiringSoonDays', String(DEFAULT_SETTINGS.expiringSoonDays))) || DEFAULT_SETTINGS.expiringSoonDays),
    licenseIdPrefix: String(getSetting('licenseIdPrefix', DEFAULT_SETTINGS.licenseIdPrefix) || DEFAULT_SETTINGS.licenseIdPrefix).trim().toUpperCase(),
    planTemplates: sanitizePlanTemplates(rawTemplates),
    appHome: getAppHome(),
    databasePath: getDatabasePath(),
    defaultKeyStoragePath: getDefaultKeyStoragePath()
  };
}

export function updateManagerSettings(input) {
  const current = getManagerSettings();
  const nextSettings = {
    keyStoragePath: typeof input?.keyStoragePath === 'string' ? input.keyStoragePath.trim() : current.keyStoragePath,
    defaultGraceDays: Math.max(0, Number(input?.defaultGraceDays ?? current.defaultGraceDays) || current.defaultGraceDays),
    expiringSoonDays: Math.max(1, Number(input?.expiringSoonDays ?? current.expiringSoonDays) || current.expiringSoonDays),
    licenseIdPrefix: String(input?.licenseIdPrefix || current.licenseIdPrefix).trim().toUpperCase() || current.licenseIdPrefix,
    planTemplates: sanitizePlanTemplates(input?.planTemplates ?? current.planTemplates)
  };

  setSetting('keyStoragePath', nextSettings.keyStoragePath);
  setSetting('defaultGraceDays', String(nextSettings.defaultGraceDays));
  setSetting('expiringSoonDays', String(nextSettings.expiringSoonDays));
  setSetting('licenseIdPrefix', nextSettings.licenseIdPrefix);
  setSetting('planTemplates', JSON.stringify(nextSettings.planTemplates));

  return getManagerSettings();
}

function getActiveKeyRow() {
  return db.prepare(`
    SELECT *
    FROM key_store
    WHERE is_active = 1
    ORDER BY updated_at DESC, id DESC
    LIMIT 1
  `).get();
}

function mapKeyRow(row) {
  if (!row) return null;

  const hasPrivateKey = fileExists(row.private_key_path);
  return {
    id: row.id,
    label: row.label,
    publicKeyPem: row.public_key_pem,
    publicKeyPath: row.public_key_path,
    privateKeyPath: row.private_key_path,
    publicKeyFingerprint: row.public_key_fingerprint,
    privateKeyFingerprint: row.private_key_fingerprint,
    hasPrivateKey,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publicKeyEnvValue: formatPublicKeyForEnv(row.public_key_pem)
  };
}

export function getKeysState() {
  const keys = db.prepare(`
    SELECT *
    FROM key_store
    ORDER BY updated_at DESC, id DESC
    LIMIT 12
  `).all().map(mapKeyRow);

  const settings = getManagerSettings();

  return {
    appHome: settings.appHome,
    databasePath: settings.databasePath,
    storagePath: settings.resolvedKeyStoragePath,
    activeKey: keys.find((item) => item.isActive) || null,
    keys
  };
}

function persistKeyPair({ label, privateKeyPem, publicKeyPem }) {
  const settings = getManagerSettings();
  const validated = validateKeyPair({ privateKeyPem, publicKeyPem });
  const storagePath = settings.resolvedKeyStoragePath;
  const publicFingerprint = validated.publicKeyFingerprint || fingerprintPublicKey(validated.publicKeyPem);
  const privateFingerprint = validated.privateKeyPem
    ? validated.privateKeyFingerprint || fingerprintPrivateKey(validated.privateKeyPem)
    : null;
  const filePrefix = `${Date.now()}-${publicFingerprint.slice(0, 12)}`;
  const publicKeyPath = path.join(storagePath, `${filePrefix}-license-public.pem`);
  const privateKeyPath = validated.privateKeyPem
    ? path.join(storagePath, `${filePrefix}-license-private.pem`)
    : null;

  writeTextFile(publicKeyPath, validated.publicKeyPem);
  if (validated.privateKeyPem && privateKeyPath) {
    writeTextFile(privateKeyPath, validated.privateKeyPem);
  }

  const save = db.transaction(() => {
    db.prepare('UPDATE key_store SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE is_active = 1').run();
    db.prepare(`
      INSERT INTO key_store (
        label,
        public_key_pem,
        public_key_path,
        private_key_path,
        public_key_fingerprint,
        private_key_fingerprint,
        is_active,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      String(label || 'Primary Signing Key').trim() || 'Primary Signing Key',
      validated.publicKeyPem,
      publicKeyPath,
      privateKeyPath,
      publicFingerprint,
      privateFingerprint
    );
  });

  save();
  return getKeysState();
}

export function generateAndStoreKeys({ label }) {
  const keyPair = generateLicenseKeyPair();
  return persistKeyPair({
    label: label || 'Generated Signing Key',
    privateKeyPem: keyPair.privateKey,
    publicKeyPem: keyPair.publicKey
  });
}

export function importKeys({ label, privateKeyPem, publicKeyPem }) {
  const normalizedPrivate = String(privateKeyPem || '').trim();
  const normalizedPublic = String(publicKeyPem || '').trim();

  if (!normalizedPrivate && !normalizedPublic) {
    throw new Error('Paste a private key, a public key, or both.');
  }

  return persistKeyPair({
    label: label || 'Imported Signing Key',
    privateKeyPem: normalizedPrivate || null,
    publicKeyPem: normalizedPublic || (normalizedPrivate ? getPublicKeyFromPrivateKey(normalizedPrivate) : null)
  });
}

export function revealPrivateKey() {
  const activeKey = getActiveKeyRow();
  if (!activeKey?.private_key_path || !fileExists(activeKey.private_key_path)) {
    throw new Error('No private key is available for the active signing key.');
  }

  return {
    fingerprint: activeKey.private_key_fingerprint,
    privateKeyPem: readTextFile(activeKey.private_key_path)
  };
}

export function suggestNextLicenseId() {
  const settings = getManagerSettings();
  const year = new Date().getUTCFullYear();
  const prefix = `${settings.licenseIdPrefix}-${year}-`;
  const rows = db.prepare(`
    SELECT license_id
    FROM licenses
    WHERE license_id LIKE ?
    ORDER BY id DESC
  `).all(`${prefix}%`);

  const maxSequence = rows.reduce((maxValue, row) => {
    const match = String(row.license_id || '').match(/-(\d{4,})$/);
    if (!match) return maxValue;
    return Math.max(maxValue, Number(match[1]) || 0);
  }, 0);

  return `${prefix}${String(maxSequence + 1).padStart(4, '0')}`;
}

function ensureCustomer(customerName, notes) {
  const normalizedName = String(customerName || '').trim();
  const existing = db.prepare(`
    SELECT id
    FROM customers
    WHERE LOWER(customer_name) = LOWER(?)
    LIMIT 1
  `).get(normalizedName);

  if (existing) {
    db.prepare(`
      UPDATE customers
      SET notes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(String(notes || '').trim() || null, existing.id);

    return existing.id;
  }

  const result = db.prepare(`
    INSERT INTO customers (customer_name, notes, created_at, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(normalizedName, String(notes || '').trim() || null);

  return result.lastInsertRowid;
}

function computeStatusTag(payload, expiringSoonDays) {
  const state = calculateLicenseState(payload);
  if (state.status === 'EXPIRED') {
    return 'expired';
  }

  if (state.status === 'GRACE' || Number(state.daysRemaining || 0) <= expiringSoonDays) {
    return 'expiring-soon';
  }

  return 'active';
}

function refreshStoredStatusTag(licenseId, nextStatusTag) {
  db.prepare(`
    UPDATE licenses
    SET status_tag = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status_tag <> ?
  `).run(nextStatusTag, Number(licenseId), nextStatusTag);
}

function mapLicenseRow(row, { expiringSoonDays = DEFAULT_SETTINGS.expiringSoonDays } = {}) {
  if (!row) return null;

  const payload = parseJson(row.payload_json, {});
  const metadata = parseJson(row.metadata_json, {});
  const enabledModules = parseJson(row.enabled_modules_json, []);
  const state = payload?.expiresAt ? calculateLicenseState(payload) : null;
  const liveStatusTag = payload?.expiresAt
    ? computeStatusTag(payload, expiringSoonDays)
    : row.status_tag;

  if (liveStatusTag && row.id) {
    refreshStoredStatusTag(row.id, liveStatusTag);
  }

  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    licenseId: row.license_id,
    planCode: row.plan_code,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    graceDays: row.grace_days,
    maxDevices: row.max_devices,
    enabledModules,
    metadata,
    notes: metadata?.notes || '',
    payload,
    finalToken: row.final_token,
    signingKeyFingerprint: row.signing_key_fingerprint,
    statusTag: liveStatusTag,
    relationType: row.relation_type,
    parentLicenseRecordId: row.parent_license_record_id,
    replacedByLicenseRecordId: row.replaced_by_license_record_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lifecycleStatus: state?.status || 'INVALID',
    daysRemaining: state?.daysRemaining ?? null,
    graceEndsAt: state?.graceEndsAt ?? null
  };
}

export function listLicenses(filters = {}) {
  const settings = getManagerSettings();
  const rows = db.prepare(`
    SELECT licenses.*, customers.customer_name
    FROM licenses
    JOIN customers ON customers.id = licenses.customer_id
  `).all().map((row) => mapLicenseRow(row, { expiringSoonDays: settings.expiringSoonDays }));

  const search = String(filters.q || '').trim().toLowerCase();
  const planCode = String(filters.planCode || '').trim().toUpperCase();
  const statusTag = String(filters.statusTag || '').trim().toLowerCase();
  const sortKey = String(filters.sort || 'issuedAt-desc').trim();

  let filtered = rows;

  if (search) {
    filtered = filtered.filter((row) => (
      row.customerName.toLowerCase().includes(search)
      || row.licenseId.toLowerCase().includes(search)
    ));
  }

  if (planCode) {
    filtered = filtered.filter((row) => row.planCode === planCode);
  }

  if (statusTag) {
    filtered = filtered.filter((row) => row.statusTag === statusTag);
  }

  const sorts = {
    'issuedAt-desc': (left, right) => right.issuedAt.localeCompare(left.issuedAt),
    'issuedAt-asc': (left, right) => left.issuedAt.localeCompare(right.issuedAt),
    'expiresAt-desc': (left, right) => right.expiresAt.localeCompare(left.expiresAt),
    'expiresAt-asc': (left, right) => left.expiresAt.localeCompare(right.expiresAt)
  };

  filtered.sort(sorts[sortKey] || sorts['issuedAt-desc']);

  return filtered;
}

export function getLicenseDetails(id) {
  const settings = getManagerSettings();
  const row = db.prepare(`
    SELECT licenses.*, customers.customer_name
    FROM licenses
    JOIN customers ON customers.id = licenses.customer_id
    WHERE licenses.id = ?
    LIMIT 1
  `).get(Number(id));

  if (!row) {
    throw new Error('License record was not found.');
  }

  const record = mapLicenseRow(row, { expiringSoonDays: settings.expiringSoonDays });
  const rootId = record.parentLicenseRecordId || record.id;

  const events = db.prepare(`
    SELECT *
    FROM license_events
    WHERE license_record_id = ?
    ORDER BY created_at DESC, id DESC
  `).all(record.id).map((event) => ({
    id: event.id,
    eventType: event.event_type,
    eventData: parseJson(event.event_data_json, {}),
    createdAt: event.created_at
  }));

  const history = db.prepare(`
    SELECT licenses.*, customers.customer_name
    FROM licenses
    JOIN customers ON customers.id = licenses.customer_id
    WHERE licenses.id = ? OR licenses.parent_license_record_id = ?
    ORDER BY licenses.created_at DESC, licenses.id DESC
  `).all(rootId, rootId).map((historyRow) => mapLicenseRow(historyRow, { expiringSoonDays: settings.expiringSoonDays }));

  return {
    ...record,
    events,
    history
  };
}

export function issueLicense(input) {
  const activeKey = getActiveKeyRow();
  if (!activeKey?.private_key_path || !fileExists(activeKey.private_key_path)) {
    throw new Error('Generate or import a signing key before issuing licenses.');
  }

  const settings = getManagerSettings();
  const notes = String(input?.notes || '').trim();
  const normalizedDraft = normalizeLicensePayload({
    licenseId: input?.licenseId,
    customerName: input?.customerName,
    planCode: input?.planCode,
    issuedAt: input?.issuedAt || new Date().toISOString(),
    expiresAt: input?.expiresAt,
    graceDays: input?.graceDays ?? settings.defaultGraceDays,
    maxDevices: input?.maxDevices,
    enabledModules: input?.enabledModules,
    metadata: {
      ...(input?.metadata && typeof input.metadata === 'object' ? input.metadata : {}),
      notes
    }
  }, { defaultIssuedAt: new Date().toISOString() });

  const issuedAtDate = new Date(normalizedDraft.issuedAt);
  const expiresAtDate = new Date(normalizedDraft.expiresAt);
  if (Number.isNaN(issuedAtDate.getTime()) || Number.isNaN(expiresAtDate.getTime())) {
    throw new Error('Issued at and expiration dates must be valid.');
  }

  if (expiresAtDate.getTime() < issuedAtDate.getTime()) {
    throw new Error('Expiration date cannot be before the issue date.');
  }

  if (!input?.allowDuplicateLicenseId) {
    const duplicate = db.prepare(`
      SELECT id
      FROM licenses
      WHERE license_id = ?
      LIMIT 1
    `).get(normalizedDraft.licenseId);

    if (duplicate) {
      throw new Error('This license ID already exists. Enable duplicate issuance only if you are intentionally reissuing.');
    }
  }

  const privateKeyPem = readTextFile(activeKey.private_key_path);
  const finalToken = createLicenseToken(normalizedDraft, privateKeyPem, { issuedAt: normalizedDraft.issuedAt });
  const parsed = parseLicenseToken(finalToken);
  const statusTag = computeStatusTag(parsed.payload, settings.expiringSoonDays);
  const customerId = ensureCustomer(parsed.payload.customerName, notes);
  const relationType = ['renewed', 'reissued'].includes(String(input?.relationType || '')) ? input.relationType : 'issued';

  const createdId = db.transaction(() => {
    const insertLicense = db.prepare(`
      INSERT INTO licenses (
        customer_id,
        license_id,
        plan_code,
        issued_at,
        expires_at,
        grace_days,
        max_devices,
        enabled_modules_json,
        metadata_json,
        payload_json,
        final_token,
        signing_key_fingerprint,
        status_tag,
        relation_type,
        parent_license_record_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    const result = insertLicense.run(
      customerId,
      parsed.payload.licenseId,
      parsed.payload.planCode,
      parsed.payload.issuedAt,
      parsed.payload.expiresAt,
      parsed.payload.graceDays,
      parsed.payload.maxDevices,
      JSON.stringify(parsed.payload.enabledModules),
      JSON.stringify(parsed.payload.metadata),
      JSON.stringify(parsed.payload),
      finalToken,
      activeKey.public_key_fingerprint,
      statusTag,
      relationType,
      input?.parentLicenseRecordId ? Number(input.parentLicenseRecordId) : null
    );

    const licenseRecordId = Number(result.lastInsertRowid);

    db.prepare(`
      INSERT INTO license_events (license_record_id, event_type, event_data_json, created_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(licenseRecordId, relationType, JSON.stringify({
      notes,
      allowDuplicateLicenseId: Boolean(input?.allowDuplicateLicenseId)
    }));

    if (input?.parentLicenseRecordId) {
      db.prepare(`
        UPDATE licenses
        SET replaced_by_license_record_id = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(licenseRecordId, Number(input.parentLicenseRecordId));
    }

    return licenseRecordId;
  })();

  return getLicenseDetails(createdId);
}

export function validateLicenseTokenLocally({ token, publicKeyPem }) {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) {
    throw new Error('Paste a license token first.');
  }

  const activeKey = getActiveKeyRow();
  const effectivePublicKey = String(publicKeyPem || activeKey?.public_key_pem || '').trim();

  let parsed = null;
  try {
    parsed = parseLicenseToken(normalizedToken);
  } catch (error) {
    return {
      status: 'INVALID',
      message: error.message,
      verificationConfigured: Boolean(effectivePublicKey),
      verified: false,
      payload: null,
      enabledModules: [],
      maxDevices: null,
      daysRemaining: null,
      graceEndsAt: null
    };
  }

  try {
    return evaluateLicenseToken(normalizedToken, {
      publicKey: effectivePublicKey,
      allowUnconfigured: true
    });
  } catch (error) {
    return {
      status: 'INVALID',
      message: error.message,
      verificationConfigured: Boolean(effectivePublicKey),
      verified: false,
      payload: parsed.payload,
      enabledModules: parsed.payload.enabledModules,
      maxDevices: parsed.payload.maxDevices,
      daysRemaining: null,
      graceEndsAt: null
    };
  }
}

export function getDashboardSnapshot() {
  const licenses = listLicenses();
  const activeKey = mapKeyRow(getActiveKeyRow());

  return {
    totalLicenses: licenses.length,
    activeLicenses: licenses.filter((item) => item.statusTag === 'active').length,
    expiringSoonLicenses: licenses.filter((item) => item.statusTag === 'expiring-soon').length,
    expiredLicenses: licenses.filter((item) => item.statusTag === 'expired').length,
    keyReady: Boolean(activeKey?.publicKeyFingerprint),
    signingReady: Boolean(activeKey?.hasPrivateKey),
    recentLicenses: licenses.slice(0, 6)
  };
}

export function getBootstrapData() {
  return {
    settings: getManagerSettings(),
    keyInfo: getKeysState(),
    dashboard: getDashboardSnapshot(),
    availableModules: LICENSE_MODULE_OPTIONS,
    nextLicenseId: suggestNextLicenseId(),
    licenses: listLicenses({ sort: 'issuedAt-desc' })
  };
}
