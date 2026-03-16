import fs from 'node:fs';
import path from 'node:path';
import db from '../db.js';
import { env } from '../config/env.js';

const BACKUP_STALE_DAYS = 7;
const BACKUP_SETTING_DEFINITIONS = [
  { key: 'AUTO_BACKUP_ENABLED', value: 'false', valueType: 'BOOLEAN' },
  { key: 'AUTO_BACKUP_INTERVAL_DAYS', value: '7', valueType: 'NUMBER' },
  { key: 'AUTO_BACKUP_RETENTION_COUNT', value: '10', valueType: 'NUMBER' }
];

function escapeSqlitePath(value) {
  return String(value).replace(/'/g, "''");
}

function ensureBackupsDir() {
  const backupsDir = path.join(path.dirname(env.dbPath), 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });
  return backupsDir;
}

function ensureBackupSettings() {
  const stmt = db.prepare(`
    INSERT INTO settings (key, value, value_type)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO NOTHING
  `);
  for (const item of BACKUP_SETTING_DEFINITIONS) {
    stmt.run(item.key, item.value, item.valueType);
  }
}

function currentIsoStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function getCustomerPriceRows(productId) {
  return db.prepare(`
    SELECT customer_id, product_unit_id, price_syp, notes
    FROM product_customer_prices
    WHERE product_id = ?
    ORDER BY id
  `).all(productId);
}

export function listManualBackups() {
  ensureBackupSettings();
  const backupsDir = ensureBackupsDir();
  return fs.readdirSync(backupsDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      const metadataPath = path.join(backupsDir, file);
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      return {
        ...metadata,
        metadataPath,
        dbPath: path.join(backupsDir, metadata.fileName)
      };
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function getBackupSettings() {
  ensureBackupSettings();
  const rows = db.prepare(`
    SELECT key, value
    FROM settings
    WHERE key IN (?, ?, ?)
  `).all(...BACKUP_SETTING_DEFINITIONS.map((item) => item.key));
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    autoBackupEnabled: String(values.AUTO_BACKUP_ENABLED || 'false').toLowerCase() === 'true',
    intervalDays: Number(values.AUTO_BACKUP_INTERVAL_DAYS || 7),
    retentionCount: Number(values.AUTO_BACKUP_RETENTION_COUNT || 10)
  };
}

function createBackupRun({ mode, userId }) {
  const result = db.prepare(`
    INSERT INTO backup_runs (run_mode, status, created_by_user_id)
    VALUES (?, 'RUNNING', ?)
  `).run(mode, userId || null);
  return Number(result.lastInsertRowid);
}

function finalizeBackupRun(runId, payload) {
  db.prepare(`
    UPDATE backup_runs
    SET status = ?, completed_at = CURRENT_TIMESTAMP, backup_id = ?, file_name = ?, error_message = ?, metadata_json = ?
    WHERE id = ?
  `).run(
    payload.status,
    payload.backupId || null,
    payload.fileName || null,
    payload.errorMessage || null,
    payload.metadata ? JSON.stringify(payload.metadata) : null,
    runId
  );
}

function trimOldBackups(retentionCount) {
  const backups = listManualBackups();
  for (const backup of backups.slice(Math.max(retentionCount, 0))) {
    if (fs.existsSync(backup.dbPath)) fs.unlinkSync(backup.dbPath);
    if (fs.existsSync(backup.metadataPath)) fs.unlinkSync(backup.metadataPath);
  }
}

function runBackup({ userId, username, mode }) {
  ensureBackupSettings();
  const settings = getBackupSettings();
  const runId = createBackupRun({ mode, userId });
  const backupsDir = ensureBackupsDir();
  const stamp = currentIsoStamp();
  const backupId = `backup-${stamp}`;
  const fileName = `${backupId}.sqlite`;
  const dbPath = path.join(backupsDir, fileName);
  const metadataPath = path.join(backupsDir, `${backupId}.json`);

  try {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    db.exec(`VACUUM INTO '${escapeSqlitePath(dbPath)}'`);

    const metadata = {
      backupId,
      fileName,
      createdAt: new Date().toISOString(),
      sourceDbPath: env.dbPath,
      createdByUserId: userId || null,
      createdByUsername: username || null,
      mode
    };
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
    trimOldBackups(settings.retentionCount);
    finalizeBackupRun(runId, { status: 'SUCCESS', backupId, fileName, metadata });
    return { ...metadata, dbPath, metadataPath, runId };
  } catch (error) {
    finalizeBackupRun(runId, { status: 'FAILED', errorMessage: error.message, metadata: { sourceDbPath: env.dbPath, mode } });
    throw error;
  }
}

export function createManualBackup({ userId, username }) {
  return runBackup({ userId, username, mode: 'MANUAL' });
}

export function updateBackupSettings({ autoBackupEnabled, intervalDays, retentionCount, userId }) {
  ensureBackupSettings();
  const stmt = db.prepare(`
    INSERT INTO settings (key, value, value_type, updated_by_user_id, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_by_user_id = excluded.updated_by_user_id,
      updated_at = CURRENT_TIMESTAMP
  `);

  stmt.run('AUTO_BACKUP_ENABLED', autoBackupEnabled ? 'true' : 'false', 'BOOLEAN', userId || null);
  stmt.run('AUTO_BACKUP_INTERVAL_DAYS', String(Math.max(1, Number(intervalDays || 7))), 'NUMBER', userId || null);
  stmt.run('AUTO_BACKUP_RETENTION_COUNT', String(Math.max(1, Number(retentionCount || 10))), 'NUMBER', userId || null);
  return getBackupSettings();
}

export function listBackupRuns(limit = 20) {
  return db.prepare(`
    SELECT br.*, u.full_name AS created_by_name
    FROM backup_runs br
    LEFT JOIN users u ON u.id = br.created_by_user_id
    ORDER BY br.id DESC
    LIMIT ?
  `).all(limit);
}

export function maybeRunScheduledBackup() {
  const settings = getBackupSettings();
  if (!settings.autoBackupEnabled) {
    return { ran: false, reason: 'disabled' };
  }

  const lastSuccess = db.prepare(`
    SELECT completed_at
    FROM backup_runs
    WHERE status = 'SUCCESS'
    ORDER BY id DESC
    LIMIT 1
  `).get();
  const dueMillis = settings.intervalDays * 24 * 60 * 60 * 1000;
  const isDue = !lastSuccess || ((Date.now() - new Date(lastSuccess.completed_at).getTime()) >= dueMillis);
  if (!isDue) {
    return { ran: false, reason: 'not_due' };
  }

  const backup = runBackup({ userId: null, username: 'system', mode: 'AUTO' });
  return { ran: true, backup };
}

export function getDataManagementOverview() {
  ensureBackupSettings();
  const backups = listManualBackups();
  const settings = getBackupSettings();
  const recentRuns = listBackupRuns();
  const latest = backups[0] || null;
  const staleThreshold = Date.now() - (BACKUP_STALE_DAYS * 24 * 60 * 60 * 1000);
  const latestFailure = recentRuns.find((item) => item.status === 'FAILED') || null;
  const backupStatus = latest
    ? {
        exists: true,
        stale: new Date(latest.createdAt).getTime() < staleThreshold,
        latestCreatedAt: latest.createdAt,
        latestBackupId: latest.backupId
      }
    : {
        exists: false,
        stale: true,
        latestCreatedAt: null,
        latestBackupId: null
      };

  const alerts = [];
  if (!backupStatus.exists) alerts.push({ type: 'warning', code: 'MISSING_BACKUP' });
  if (backupStatus.stale) alerts.push({ type: 'warning', code: 'STALE_BACKUP' });
  if (latestFailure && (!latest || new Date(latestFailure.started_at).getTime() > new Date(latest.createdAt || 0).getTime())) {
    alerts.push({ type: 'danger', code: 'LAST_BACKUP_FAILED', message: latestFailure.error_message || null });
  }

  return {
    settings,
    backupStatus,
    backups,
    recentRuns,
    alerts,
    supportedDatasets: ['categories', 'customers', 'suppliers', 'products']
  };
}

export function exportDataset(dataset) {
  if (dataset === 'categories') {
    const rows = db.prepare(`
      SELECT name_ar, name_en, is_active
      FROM categories
      ORDER BY id
    `).all();
    return { dataset, rows };
  }

  if (dataset === 'customers') {
    const rows = db.prepare(`
      SELECT name, phone, address, opening_balance, current_balance, currency, notes, is_active
      FROM customers
      ORDER BY id
    `).all();
    return { dataset, rows };
  }

  if (dataset === 'suppliers') {
    const rows = db.prepare(`
      SELECT name, phone, address, opening_balance, current_balance, currency, notes, is_active
      FROM suppliers
      ORDER BY id
    `).all();
    return { dataset, rows };
  }

  if (dataset === 'products') {
    const rows = db.prepare(`
      SELECT
        p.sku,
        p.barcode,
        p.name_ar,
        p.name_en,
        p.unit,
        p.purchase_price,
        p.selling_price,
        p.default_currency,
        p.current_qty,
        p.min_stock_level,
        p.avg_cost_base,
        p.notes,
        p.is_active,
        c.name_ar AS category_name
      FROM products p
      JOIN categories c ON c.id = p.category_id
      ORDER BY p.id
    `).all().map((row) => {
      const productId = db.prepare('SELECT id FROM products WHERE sku = ?').get(row.sku)?.id;
      return {
        ...row,
        units: db.prepare(`
          SELECT unit_name, conversion_factor, is_base, sort_order
          FROM product_units
          WHERE product_id = ?
          ORDER BY sort_order, id
        `).all(productId),
        priceTiers: db.prepare(`
          SELECT pt.tier_code, pt.tier_name, pt.price_syp, pu.unit_name
          FROM product_price_tiers pt
          JOIN product_units pu ON pu.id = pt.product_unit_id
          WHERE pt.product_id = ?
          ORDER BY pt.id
        `).all(productId),
        customerPrices: getCustomerPriceRows(productId).map((price) => {
          const customer = db.prepare('SELECT name FROM customers WHERE id = ?').get(price.customer_id);
          const unit = db.prepare('SELECT unit_name FROM product_units WHERE id = ?').get(price.product_unit_id);
          return {
            customer_name: customer?.name || '',
            unit_name: unit?.unit_name || '',
            price_syp: price.price_syp,
            notes: price.notes
          };
        })
      };
    });
    return { dataset, rows };
  }

  throw new Error('مجموعة البيانات غير مدعومة');
}

function upsertCategory(entry) {
  const existing = db.prepare('SELECT id FROM categories WHERE name_ar = ?').get(entry.name_ar);
  if (existing) {
    db.prepare(`
      UPDATE categories
      SET name_en = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(entry.name_en || null, entry.is_active ? 1 : 0, existing.id);
    return existing.id;
  }

  const result = db.prepare(`
    INSERT INTO categories (name_ar, name_en, is_active)
    VALUES (?, ?, ?)
  `).run(entry.name_ar, entry.name_en || null, entry.is_active ? 1 : 0);
  return Number(result.lastInsertRowid);
}

function upsertCustomer(entry) {
  const existing = db.prepare('SELECT id FROM customers WHERE name = ?').get(entry.name);
  if (existing) {
    db.prepare(`
      UPDATE customers
      SET phone = ?, address = ?, opening_balance = ?, current_balance = ?, currency = ?, notes = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      entry.phone || null,
      entry.address || null,
      Number(entry.opening_balance || 0),
      Number(entry.current_balance ?? entry.opening_balance ?? 0),
      entry.currency || 'SYP',
      entry.notes || null,
      entry.is_active ? 1 : 0,
      existing.id
    );
    return existing.id;
  }

  const result = db.prepare(`
    INSERT INTO customers (name, phone, address, opening_balance, current_balance, currency, notes, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.name,
    entry.phone || null,
    entry.address || null,
    Number(entry.opening_balance || 0),
    Number(entry.current_balance ?? entry.opening_balance ?? 0),
    entry.currency || 'SYP',
    entry.notes || null,
    entry.is_active ? 1 : 0
  );
  return Number(result.lastInsertRowid);
}

function upsertSupplier(entry) {
  const existing = db.prepare('SELECT id FROM suppliers WHERE name = ?').get(entry.name);
  if (existing) {
    db.prepare(`
      UPDATE suppliers
      SET phone = ?, address = ?, opening_balance = ?, current_balance = ?, currency = ?, notes = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      entry.phone || null,
      entry.address || null,
      Number(entry.opening_balance || 0),
      Number(entry.current_balance ?? entry.opening_balance ?? 0),
      entry.currency || 'SYP',
      entry.notes || null,
      entry.is_active ? 1 : 0,
      existing.id
    );
    return existing.id;
  }

  const result = db.prepare(`
    INSERT INTO suppliers (name, phone, address, opening_balance, current_balance, currency, notes, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.name,
    entry.phone || null,
    entry.address || null,
    Number(entry.opening_balance || 0),
    Number(entry.current_balance ?? entry.opening_balance ?? 0),
    entry.currency || 'SYP',
    entry.notes || null,
    entry.is_active ? 1 : 0
  );
  return Number(result.lastInsertRowid);
}

function upsertProduct(entry) {
  const categoryId = upsertCategory({
    name_ar: entry.category_name,
    name_en: null,
    is_active: true
  });

  const existing = db.prepare('SELECT id FROM products WHERE sku = ?').get(entry.sku);
  let productId = existing?.id || null;

  if (productId) {
    db.prepare(`
      UPDATE products
      SET category_id = ?, barcode = ?, name_ar = ?, name_en = ?, unit = ?, purchase_price = ?, selling_price = ?,
          default_currency = ?, current_qty = ?, min_stock_level = ?, avg_cost_base = ?, notes = ?, is_active = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      categoryId,
      entry.barcode || null,
      entry.name_ar,
      entry.name_en || null,
      entry.unit,
      Number(entry.purchase_price || 0),
      Number(entry.selling_price || 0),
      entry.default_currency || 'SYP',
      Number(entry.current_qty || 0),
      Number(entry.min_stock_level || 0),
      Number(entry.avg_cost_base || 0),
      entry.notes || null,
      entry.is_active ? 1 : 0,
      productId
    );
  } else {
    const result = db.prepare(`
      INSERT INTO products (
        category_id, sku, barcode, name_ar, name_en, unit,
        purchase_price, selling_price, default_currency, current_qty, min_stock_level, avg_cost_base, notes, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      categoryId,
      entry.sku,
      entry.barcode || null,
      entry.name_ar,
      entry.name_en || null,
      entry.unit,
      Number(entry.purchase_price || 0),
      Number(entry.selling_price || 0),
      entry.default_currency || 'SYP',
      Number(entry.current_qty || 0),
      Number(entry.min_stock_level || 0),
      Number(entry.avg_cost_base || 0),
      entry.notes || null,
      entry.is_active ? 1 : 0
    );
    productId = Number(result.lastInsertRowid);
  }

  db.prepare('DELETE FROM product_customer_prices WHERE product_id = ?').run(productId);
  db.prepare('DELETE FROM product_price_tiers WHERE product_id = ?').run(productId);
  db.prepare('DELETE FROM product_units WHERE product_id = ?').run(productId);

  const unitMap = new Map();
  const insertUnit = db.prepare(`
    INSERT INTO product_units (product_id, unit_name, conversion_factor, is_base, sort_order, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  for (const [index, unit] of (entry.units || []).entries()) {
    const result = insertUnit.run(productId, unit.unit_name, Number(unit.conversion_factor || 1), unit.is_base ? 1 : 0, Number(unit.sort_order ?? index));
    unitMap.set(unit.unit_name, Number(result.lastInsertRowid));
  }

  const insertTier = db.prepare(`
    INSERT INTO product_price_tiers (product_id, product_unit_id, tier_code, tier_name, price_syp, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  for (const tier of (entry.priceTiers || [])) {
    const unitId = unitMap.get(tier.unit_name);
    if (!unitId) continue;
    insertTier.run(productId, unitId, tier.tier_code, tier.tier_name || tier.tier_code, Number(tier.price_syp || 0));
  }

  const insertCustomerPrice = db.prepare(`
    INSERT INTO product_customer_prices (product_id, customer_id, product_unit_id, price_syp, notes, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  for (const price of (entry.customerPrices || [])) {
    const customer = db.prepare('SELECT id FROM customers WHERE name = ?').get(price.customer_name);
    const unitId = unitMap.get(price.unit_name);
    if (!customer || !unitId) continue;
    insertCustomerPrice.run(productId, customer.id, unitId, Number(price.price_syp || 0), price.notes || null);
  }

  return productId;
}

export function importDataset(dataset, rows) {
  if (!Array.isArray(rows)) {
    throw new Error('صيغة البيانات غير صالحة للاستيراد');
  }

  return db.transaction(() => {
    if (dataset === 'categories') {
      return rows.map((row) => upsertCategory(row)).length;
    }
    if (dataset === 'customers') {
      return rows.map((row) => upsertCustomer(row)).length;
    }
    if (dataset === 'suppliers') {
      return rows.map((row) => upsertSupplier(row)).length;
    }
    if (dataset === 'products') {
      return rows.map((row) => upsertProduct(row)).length;
    }
    throw new Error('مجموعة البيانات غير مدعومة');
  })();
}
