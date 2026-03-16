import db from '../db.js';
import { env } from '../config/env.js';
import {
  calculateLicenseState,
  createLicenseToken as createSharedLicenseToken,
  evaluateLicenseToken,
  getLicenseMessage,
  normalizePublicKey,
  parseLicenseToken,
  verifyLicenseSignature
} from '@paint-shop/shared/src/license-node.js';

const LICENSE_SETTING_KEY = 'LICENSE_KEY';
const LICENSE_ACTIVATED_AT_KEY = 'LICENSE_ACTIVATED_AT';
const LICENSE_ACTIVATED_BY_KEY = 'LICENSE_ACTIVATED_BY_USER_ID';

const MODULE_ROUTE_PREFIXES = [
  ['/api/v1/categories', 'inventory'],
  ['/api/v1/products', 'inventory'],
  ['/api/v1/customers', 'customers'],
  ['/api/v1/suppliers', 'suppliers'],
  ['/api/v1/purchases', 'purchases'],
  ['/api/v1/sales', 'sales'],
  ['/api/v1/reports', 'reports'],
  ['/api/v1/cash-management', 'cash-management'],
  ['/api/v1/cash-accounts', 'cash-management'],
  ['/api/v1/expenses', 'expenses'],
  ['/api/v1/exchange-rate', 'exchange-rate'],
  ['/api/v1/currency-exchange', 'currency-exchange']
];

function getStoredLicenseSettings() {
  const rows = db.prepare(`
    SELECT key, value
    FROM settings
    WHERE key IN (?, ?, ?)
  `).all(LICENSE_SETTING_KEY, LICENSE_ACTIVATED_AT_KEY, LICENSE_ACTIVATED_BY_KEY);

  return rows.reduce((accumulator, row) => {
    accumulator[row.key] = row.value;
    return accumulator;
  }, {});
}

function getRegisteredDevices(licenseId) {
  if (!licenseId) return [];

  return db.prepare(`
    SELECT device_id AS deviceId,
           COALESCE(device_name, '') AS deviceName,
           first_seen_at AS firstSeenAt,
           last_seen_at AS lastSeenAt,
           last_user_id AS lastUserId
    FROM license_device_registrations
    WHERE license_id = ? AND is_active = 1
    ORDER BY last_seen_at DESC, id DESC
  `).all(licenseId);
}

function writeAccessAllowed(status) {
  if ((env.licenseEnforcement || 'off') !== 'strict') return true;
  return status === 'ACTIVE' || status === 'GRACE';
}

function buildLicenseState({
  status,
  payload = null,
  activatedAt = null,
  activatedByUserId = null,
  verificationConfigured = Boolean(normalizePublicKey(env.licensePublicKey)),
  verified = false,
  daysRemaining = null,
  graceEndsAt = null,
  registeredDevices = []
}) {
  return {
    status,
    message: getLicenseMessage(status),
    verificationConfigured,
    verified,
    enforcement: (env.licenseEnforcement || 'off') === 'strict' ? 'strict' : 'off',
    writeAccessAllowed: writeAccessAllowed(status),
    activatedAt,
    activatedByUserId: activatedByUserId ? Number(activatedByUserId) : null,
    payload,
    enabledModules: payload?.enabledModules || [],
    maxDevices: payload?.maxDevices ?? null,
    daysRemaining,
    graceEndsAt,
    registeredDevices
  };
}

function evaluateLicenseKey(licenseKey, { allowUnconfigured = false } = {}) {
  const parsedLicense = parseLicenseToken(licenseKey);
  const verificationConfigured = Boolean(normalizePublicKey(env.licensePublicKey));

  if (!verificationConfigured && !allowUnconfigured) {
    throw new Error('لم تتم تهيئة المفتاح العام للتحقق من الترخيص');
  }

  if (verificationConfigured && !verifyLicenseSignature(parsedLicense, env.licensePublicKey)) {
    throw new Error('تعذر التحقق من توقيع الترخيص');
  }

  const state = calculateLicenseState(parsedLicense.payload);
  return buildLicenseState({
    status: state.status,
    payload: parsedLicense.payload,
    verificationConfigured,
    verified: verificationConfigured,
    daysRemaining: state.daysRemaining,
    graceEndsAt: state.graceEndsAt
  });
}

function getRequestPath(req) {
  return `${req.baseUrl || ''}${req.path || ''}`;
}

function getLicensedModuleForPath(pathname) {
  const normalizedPath = String(pathname || '').split('?')[0];
  const match = MODULE_ROUTE_PREFIXES.find(([prefix]) => normalizedPath.startsWith(prefix));
  return match?.[1] || null;
}

function shouldRestrictModules(license) {
  return license.enforcement === 'strict'
    && license.verified
    && Array.isArray(license.enabledModules)
    && license.enabledModules.length > 0;
}

function isModuleEnabledForLicense(license, moduleKey) {
  if (!moduleKey) return true;
  if (!shouldRestrictModules(license)) return true;
  return license.enabledModules.includes(moduleKey);
}

function isMutationMethod(method) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method || '').toUpperCase());
}

function isLicenseRoute(pathname) {
  return pathname.startsWith('/api/v1/settings/license');
}

function isSettingsRoute(pathname) {
  return pathname.startsWith('/api/v1/settings');
}

function getDeviceIdentity(req) {
  const deviceId = String(req.headers['x-device-id'] || '').trim().slice(0, 190);
  const deviceName = String(req.headers['x-device-name'] || '').trim().slice(0, 190);
  return {
    deviceId,
    deviceName: deviceName || 'Unnamed device'
  };
}

function shouldTrackDevices(license, pathname) {
  return license.enforcement === 'strict'
    && Boolean(license.payload?.licenseId)
    && Boolean(license.maxDevices)
    && !isSettingsRoute(pathname);
}

function ensureDeviceAccess({ license, req, userId, pathname }) {
  if (!shouldTrackDevices(license, pathname)) {
    return { allowed: true, license };
  }

  const { deviceId, deviceName } = getDeviceIdentity(req);
  if (!deviceId) {
    return { allowed: false, reason: 'missing-device-id', license };
  }

  const licenseId = license.payload.licenseId;
  const currentDevice = db.prepare(`
    SELECT id
    FROM license_device_registrations
    WHERE license_id = ? AND device_id = ?
    LIMIT 1
  `).get(licenseId, deviceId);

  if (currentDevice) {
    db.prepare(`
      UPDATE license_device_registrations
      SET device_name = ?,
          last_seen_at = CURRENT_TIMESTAMP,
          last_user_id = ?,
          is_active = 1
      WHERE license_id = ? AND device_id = ?
    `).run(deviceName, userId || null, licenseId, deviceId);

    return {
      allowed: true,
      license: {
        ...license,
        registeredDevices: getRegisteredDevices(licenseId)
      }
    };
  }

  const activeCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM license_device_registrations
    WHERE license_id = ? AND is_active = 1
  `).get(licenseId);

  if (Number(activeCount?.count || 0) >= Number(license.maxDevices || 0)) {
    return {
      allowed: false,
      reason: 'device-limit-reached',
      license: {
        ...license,
        registeredDevices: getRegisteredDevices(licenseId)
      }
    };
  }

  db.prepare(`
    INSERT INTO license_device_registrations (
      license_id,
      device_id,
      device_name,
      last_user_id,
      is_active
    ) VALUES (?, ?, ?, ?, 1)
  `).run(licenseId, deviceId, deviceName, userId || null);

  return {
    allowed: true,
    license: {
      ...license,
      registeredDevices: getRegisteredDevices(licenseId)
    }
  };
}

export function getLicenseState() {
  const settings = getStoredLicenseSettings();
  const verificationConfigured = Boolean(normalizePublicKey(env.licensePublicKey));
  const licenseKey = settings[LICENSE_SETTING_KEY];
  const activatedAt = settings[LICENSE_ACTIVATED_AT_KEY] || null;
  const activatedByUserId = settings[LICENSE_ACTIVATED_BY_KEY] || null;

  if (!verificationConfigured) {
    return buildLicenseState({
      status: 'UNCONFIGURED',
      activatedAt,
      activatedByUserId,
      verificationConfigured: false
    });
  }

  if (!licenseKey) {
    return buildLicenseState({
      status: 'MISSING',
      activatedAt,
      activatedByUserId,
      verificationConfigured
    });
  }

  try {
    const evaluated = evaluateLicenseToken(licenseKey, { publicKey: env.licensePublicKey });
    return {
      ...buildLicenseState({
        status: evaluated.status,
        payload: evaluated.payload,
        activatedAt,
        activatedByUserId,
        verificationConfigured: evaluated.verificationConfigured,
        verified: evaluated.verified,
        daysRemaining: evaluated.daysRemaining,
        graceEndsAt: evaluated.graceEndsAt,
        registeredDevices: getRegisteredDevices(evaluated.payload?.licenseId)
      })
    };
  } catch {
    return buildLicenseState({
      status: 'INVALID',
      activatedAt,
      activatedByUserId,
      verificationConfigured
    });
  }
}

export function activateLicense({ licenseKey, userId }) {
  const nextState = evaluateLicenseKey(licenseKey);

  const persistLicense = db.transaction(() => {
    const upsert = db.prepare(`
      INSERT INTO settings (key, value, value_type, updated_by_user_id, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        value_type = excluded.value_type,
        updated_by_user_id = excluded.updated_by_user_id,
        updated_at = CURRENT_TIMESTAMP
    `);

    upsert.run(LICENSE_SETTING_KEY, String(licenseKey).trim(), 'string', userId || null);
    upsert.run(LICENSE_ACTIVATED_AT_KEY, new Date().toISOString(), 'string', userId || null);
    upsert.run(LICENSE_ACTIVATED_BY_KEY, String(userId || ''), 'string', userId || null);
  });

  persistLicense();
  return {
    ...nextState,
    activatedAt: new Date().toISOString(),
    activatedByUserId: userId || null
  };
}

export function removeStoredLicense(userId) {
  const currentState = getLicenseState();

  const clearLicense = db.transaction(() => {
    db.prepare(`
      DELETE FROM settings
      WHERE key IN (?, ?, ?)
    `).run(LICENSE_SETTING_KEY, LICENSE_ACTIVATED_AT_KEY, LICENSE_ACTIVATED_BY_KEY);

    if (currentState.payload?.licenseId) {
      db.prepare(`
        UPDATE license_device_registrations
        SET is_active = 0,
            last_seen_at = CURRENT_TIMESTAMP,
            last_user_id = ?
        WHERE license_id = ?
      `).run(userId || null, currentState.payload.licenseId);
    }
  });

  clearLicense();
  return getLicenseState();
}

export function removeRegisteredLicenseDevice({ deviceId, userId }) {
  const currentState = getLicenseState();
  if (!currentState.payload?.licenseId) {
    return currentState;
  }

  db.prepare(`
    UPDATE license_device_registrations
    SET is_active = 0,
        last_seen_at = CURRENT_TIMESTAMP,
        last_user_id = ?
    WHERE license_id = ? AND device_id = ?
  `).run(userId || null, currentState.payload.licenseId, String(deviceId || '').trim());

  return getLicenseState();
}

export function resolveLicenseRequestContext(req, { userId } = {}) {
  const pathname = getRequestPath(req);
  let license = getLicenseState();

  if (license.enforcement !== 'strict' || isLicenseRoute(pathname)) {
    return { allowed: true, license, moduleKey: null };
  }

  const moduleKey = getLicensedModuleForPath(pathname);
  if (moduleKey && !isModuleEnabledForLicense(license, moduleKey)) {
    return { allowed: false, blockCode: 'LICENSE_MODULE_BLOCKED', license, moduleKey };
  }

  const deviceCheck = ensureDeviceAccess({ license, req, userId, pathname });
  license = deviceCheck.license;
  if (!deviceCheck.allowed) {
    return {
      allowed: false,
      blockCode: 'LICENSE_DEVICE_BLOCKED',
      license,
      moduleKey,
      deviceReason: deviceCheck.reason
    };
  }

  if (isMutationMethod(req.method) && !license.writeAccessAllowed) {
    return { allowed: false, blockCode: 'LICENSE_WRITE_BLOCKED', license, moduleKey };
  }

  return { allowed: true, license, moduleKey };
}

export function shouldBlockMutationForLicense(req, license) {
  return isMutationMethod(req.method) && !license.writeAccessAllowed && !isLicenseRoute(getRequestPath(req));
}

export function buildLicenseWriteErrorMessage(license) {
  if (license.status === 'EXPIRED') {
    return 'انتهت صلاحية الترخيص. يمكن القراءة فقط حتى يتم تجديده';
  }

  if (license.status === 'MISSING') {
    return 'لا يمكن تنفيذ عمليات الكتابة قبل تفعيل الترخيص';
  }

  if (license.status === 'INVALID') {
    return 'مفتاح الترخيص غير صالح. لا يمكن تنفيذ عمليات الكتابة';
  }

  if (license.status === 'UNCONFIGURED') {
    return 'المفتاح العام غير مهيأ على الخادم. لا يمكن تنفيذ عمليات الكتابة';
  }

  return 'عمليات الكتابة موقوفة بسبب حالة الترخيص الحالية';
}

export function buildLicenseModuleErrorMessage() {
  return 'هذه الوحدة غير مفعلة في الترخيص الحالي';
}

export function buildLicenseDeviceErrorMessage(reason, license) {
  if (reason === 'missing-device-id') {
    return 'تعذر التحقق من هوية هذا الجهاز. أعد تشغيل التطبيق ثم حاول مجددًا';
  }

  if (reason === 'device-limit-reached') {
    return `تم تجاوز عدد الأجهزة المسموح به لهذا الترخيص (${license.maxDevices || 0})`;
  }

  return 'هذا الجهاز غير مسموح له باستخدام الترخيص الحالي';
}

export function createLicenseToken(payload, privateKey) {
  return createSharedLicenseToken(payload, privateKey);
}
