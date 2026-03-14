import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { env } from '../config/env.js';

function n(value) {
  return Number(value ?? 0);
}

function r2(value) {
  return Number(n(value).toFixed(2));
}

export const YEAR_END_CONFIRMATION_PHRASE = 'RESET YEAR';
export const YEAR_END_MODE_FULL_RESET = 'FULL_RESET';
export const YEAR_END_MODE_CARRY_FORWARD = 'CARRY_FORWARD';

const RESET_TABLES = [
  'cash_movements',
  'sales_invoice_items',
  'purchase_invoice_items',
  'inventory_movements',
  'customer_collections',
  'supplier_settlements',
  'currency_exchange_transactions',
  'expenses',
  'sales_invoices',
  'purchase_invoices',
  'products',
  'categories',
  'customers',
  'suppliers',
  'cash_accounts'
];

const RESTORE_TABLES = [
  'categories',
  'customers',
  'suppliers',
  'cash_accounts',
  'products',
  'purchase_invoices',
  'sales_invoices',
  'expenses',
  'customer_collections',
  'supplier_settlements',
  'currency_exchange_transactions',
  'inventory_movements',
  'purchase_invoice_items',
  'sales_invoice_items',
  'cash_movements'
];

const OPERATIONAL_COUNT_KEYS = [
  'categories',
  'products',
  'suppliers',
  'customers',
  'purchaseInvoices',
  'purchaseInvoiceItems',
  'salesInvoices',
  'salesInvoiceItems',
  'expenses',
  'customerCollections',
  'supplierSettlements',
  'currencyExchanges',
  'inventoryMovements',
  'cashMovements',
  'cashAccounts'
];

function quote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function tableColumns(database, tableName) {
  return database.prepare(`PRAGMA table_info(${tableName})`).all().map((row) => row.name);
}

function resetSequences(database) {
  const placeholders = RESET_TABLES.map(() => '?').join(', ');
  database.prepare(`DELETE FROM sqlite_sequence WHERE name IN (${placeholders})`).run(...RESET_TABLES);
}

export function getArchivesDirectory() {
  return path.resolve(path.dirname(env.dbPath), 'archives');
}

export function getYearEndCounts(database = db) {
  const readCount = (table) => Number(database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
  return {
    categories: readCount('categories'),
    products: readCount('products'),
    suppliers: readCount('suppliers'),
    customers: readCount('customers'),
    purchaseInvoices: readCount('purchase_invoices'),
    purchaseInvoiceItems: readCount('purchase_invoice_items'),
    salesInvoices: readCount('sales_invoices'),
    salesInvoiceItems: readCount('sales_invoice_items'),
    expenses: readCount('expenses'),
    customerCollections: readCount('customer_collections'),
    supplierSettlements: readCount('supplier_settlements'),
    currencyExchanges: readCount('currency_exchange_transactions'),
    inventoryMovements: readCount('inventory_movements'),
    cashMovements: readCount('cash_movements'),
    cashAccounts: readCount('cash_accounts')
  };
}

export function validateYearEndConfirmation({ phrase, password, userId, allowedRoles, accessRole }) {
  if (!allowedRoles.includes(accessRole)) {
    return 'غير مسموح بتنفيذ إقفال السنة المالية';
  }

  if (String(phrase || '').trim().toUpperCase() !== YEAR_END_CONFIRMATION_PHRASE) {
    return `يجب كتابة عبارة التأكيد ${YEAR_END_CONFIRMATION_PHRASE}`;
  }

  if (!password) {
    return 'تأكيد كلمة المرور مطلوب';
  }

  const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ? AND is_active = 1').get(userId);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return 'تأكيد كلمة المرور غير صحيح';
  }

  return null;
}

export function listYearEndArchives() {
  const archivesDir = getArchivesDirectory();
  if (!fs.existsSync(archivesDir)) {
    return [];
  }

  return fs.readdirSync(archivesDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      const fullPath = path.join(archivesDir, file);
      try {
        const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        return parsed;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function getArchiveMetadata(archiveId) {
  const metadataPath = path.join(getArchivesDirectory(), `${archiveId}.json`);
  if (!fs.existsSync(metadataPath)) {
    throw new Error('بيانات الأرشيف المطلوبة غير موجودة');
  }
  return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
}

export function listYearOpeningRuns() {
  return db.prepare(`
    SELECT r.id, r.archive_id, r.source_year, r.target_year, r.carry_mode, r.status,
           r.summary_json, r.created_at, u.full_name AS executed_by_name
    FROM year_opening_runs r
    LEFT JOIN users u ON u.id = r.executed_by_user_id
    ORDER BY r.id DESC
  `).all().map((row) => ({
    ...row,
    summary: row.summary_json ? JSON.parse(row.summary_json) : null
  }));
}

export function archiveCurrentOperationalState({ userId, username, mode }) {
  const archivesDir = getArchivesDirectory();
  fs.mkdirSync(archivesDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archiveBaseName = `year-end-${stamp}`;
  const archiveDbPath = path.join(archivesDir, `${archiveBaseName}.sqlite`);
  const metadataPath = path.join(archivesDir, `${archiveBaseName}.json`);

  db.pragma('wal_checkpoint(TRUNCATE)');
  if (fs.existsSync(archiveDbPath)) fs.unlinkSync(archiveDbPath);
  db.exec(`VACUUM INTO ${quote(archiveDbPath)}`);

  const verificationDb = new Database(archiveDbPath, { readonly: true });
  const counts = getYearEndCounts(verificationDb);
  verificationDb.close();

  const metadata = {
    archiveId: archiveBaseName,
    archiveFileName: path.basename(archiveDbPath),
    archiveDbPath,
    metadataPath,
    createdAt: new Date().toISOString(),
    createdByUserId: userId,
    createdByUsername: username,
    mode,
    sourceDbPath: env.dbPath,
    companyName: db.prepare("SELECT value FROM settings WHERE key = 'COMPANY_NAME'").get()?.value || null,
    counts
  };

  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  return metadata;
}

export function resetOperationalData() {
  const trx = db.transaction(() => {
    for (const table of RESET_TABLES) {
      db.prepare(`DELETE FROM ${table}`).run();
    }
    resetSequences(db);
  });

  trx();
  return getYearEndCounts();
}

function ensureOperationalStateIsEmpty() {
  const counts = getYearEndCounts();
  const hasOperationalData = OPERATIONAL_COUNT_KEYS.some((key) => Number(counts[key]) > 0);
  if (hasOperationalData) {
    throw new Error('لا يمكن تنفيذ ترحيل الأرصدة قبل أن تكون السنة الجديدة فارغة تشغيلياً');
  }
}

function archiveCashBalances(sourceDb) {
  return sourceDb.prepare(`
    SELECT ca.id, ca.name, ca.currency, ca.is_active,
           COALESCE(SUM(CASE WHEN cm.direction = 'IN' THEN cm.original_amount ELSE -cm.original_amount END), 0) AS balance
    FROM cash_accounts ca
    LEFT JOIN cash_movements cm ON cm.cash_account_id = ca.id
    GROUP BY ca.id, ca.name, ca.currency, ca.is_active
    ORDER BY ca.id
  `).all();
}

function archiveCategoriesForInventory(sourceDb) {
  return sourceDb.prepare(`
    SELECT DISTINCT c.*
    FROM categories c
    JOIN products p ON p.category_id = c.id
    WHERE p.current_qty != 0
    ORDER BY c.id
  `).all();
}

function archiveInventoryRows(sourceDb) {
  return sourceDb.prepare(`
    SELECT *
    FROM products
    WHERE current_qty != 0
    ORDER BY id
  `).all();
}

function archiveExchangeRate(sourceDb) {
  const value = sourceDb.prepare("SELECT value FROM settings WHERE key = 'EXCHANGE_RATE_CONFIG'").get()?.value;
  const parsed = value ? JSON.parse(value) : {};
  return n(parsed.activeRate || 1);
}

export function carryForwardOpeningBalances({ archiveId, sourceYear, targetYear, executedByUserId }) {
  if (!targetYear || !String(targetYear).trim()) {
    throw new Error('السنة الهدف مطلوبة');
  }
  if (!/^\d{4}$/.test(String(targetYear).trim())) {
    throw new Error('السنة الهدف يجب أن تكون بصيغة YYYY');
  }

  const metadata = getArchiveMetadata(archiveId);
  ensureOperationalStateIsEmpty();

  const archiveDbPath = path.join(getArchivesDirectory(), `${archiveId}.sqlite`);
  if (!fs.existsSync(archiveDbPath)) {
    throw new Error('ملف قاعدة الأرشيف غير موجود');
  }

  const existingRun = db.prepare(`
    SELECT id
    FROM year_opening_runs
    WHERE archive_id = ? AND target_year = ? AND carry_mode = ?
    LIMIT 1
  `).get(archiveId, String(targetYear), YEAR_END_MODE_CARRY_FORWARD);

  if (existingRun) {
    throw new Error('تم تنفيذ ترحيل أرصدة افتتاحية لهذا الأرشيف وهذه السنة مسبقاً');
  }

  const sourceDb = new Database(archiveDbPath, { readonly: true });
  const archivedRate = archiveExchangeRate(sourceDb);
  const archivedCustomers = sourceDb.prepare(`SELECT * FROM customers WHERE current_balance != 0 ORDER BY id`).all();
  const archivedSuppliers = sourceDb.prepare(`SELECT * FROM suppliers WHERE current_balance != 0 ORDER BY id`).all();
  const archivedCashAccounts = archiveCashBalances(sourceDb);
  const archivedCategories = archiveCategoriesForInventory(sourceDb);
  const archivedProducts = archiveInventoryRows(sourceDb);
  const sourceCategoryNameById = new Map(
    sourceDb.prepare('SELECT id, name_ar FROM categories').all().map((row) => [row.id, row.name_ar])
  );

  try {
    const trx = db.transaction(() => {
      const runResult = db.prepare(`
        INSERT INTO year_opening_runs (
          archive_id, source_year, target_year, carry_mode, status, executed_by_user_id, summary_json
        )
        VALUES (?, ?, ?, ?, 'SUCCESS', ?, NULL)
      `).run(
        archiveId,
        String(sourceYear || metadata.createdAt?.slice(0, 4) || ''),
        String(targetYear),
        YEAR_END_MODE_CARRY_FORWARD,
        executedByUserId
      );

      const runId = Number(runResult.lastInsertRowid);

      for (const category of archivedCategories) {
        db.prepare(`
          INSERT INTO categories (name_ar, name_en, is_active, notes)
          VALUES (?, ?, ?, ?)
        `).run(category.name_ar, category.name_en, category.is_active, category.notes ?? null);
      }

      const categoryMap = new Map(
        db.prepare('SELECT id, name_ar FROM categories').all().map((row) => [row.name_ar, row.id])
      );

      for (const customerRow of archivedCustomers) {
        db.prepare(`
          INSERT INTO customers (
            name, phone, address, notes, is_active, opening_balance, currency, current_balance
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          customerRow.name,
          customerRow.phone,
          customerRow.address,
          customerRow.notes,
          customerRow.is_active,
          customerRow.current_balance,
          customerRow.currency,
          customerRow.current_balance
        );

        db.prepare(`
          INSERT INTO opening_balance_entries (
            run_id, balance_type, entity_key, entity_label, currency, amount_original, amount_base, quantity, metadata_json
          )
          VALUES (?, 'CUSTOMER', ?, ?, ?, ?, ?, 0, ?)
        `).run(
          runId,
          String(customerRow.id),
          customerRow.name,
          customerRow.currency,
          customerRow.current_balance,
          customerRow.current_balance,
          JSON.stringify({ sourceCustomerId: customerRow.id })
        );
      }

      for (const supplierRow of archivedSuppliers) {
        db.prepare(`
          INSERT INTO suppliers (
            name, phone, address, notes, is_active, opening_balance, currency, current_balance
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          supplierRow.name,
          supplierRow.phone,
          supplierRow.address,
          supplierRow.notes,
          supplierRow.is_active,
          supplierRow.current_balance,
          supplierRow.currency,
          supplierRow.current_balance
        );

        db.prepare(`
          INSERT INTO opening_balance_entries (
            run_id, balance_type, entity_key, entity_label, currency, amount_original, amount_base, quantity, metadata_json
          )
          VALUES (?, 'SUPPLIER', ?, ?, ?, ?, ?, 0, ?)
        `).run(
          runId,
          String(supplierRow.id),
          supplierRow.name,
          supplierRow.currency,
          supplierRow.current_balance,
          supplierRow.current_balance,
          JSON.stringify({ sourceSupplierId: supplierRow.id })
        );
      }

      const cashAccountIdMap = new Map();
      for (const cashRow of archivedCashAccounts) {
        const insert = db.prepare(`
          INSERT INTO cash_accounts (name, currency, is_active)
          VALUES (?, ?, ?)
        `).run(cashRow.name, cashRow.currency, cashRow.is_active);
        const newCashAccountId = Number(insert.lastInsertRowid);
        cashAccountIdMap.set(cashRow.id, newCashAccountId);

        if (n(cashRow.balance) !== 0) {
          const openingAmount = Math.abs(n(cashRow.balance));
          db.prepare(`
            INSERT INTO cash_movements (
              cash_account_id, movement_date, movement_type, direction,
              currency, original_amount, exchange_rate, base_amount,
              source_type, source_id, notes, created_by_user_id
            )
            VALUES (?, DATE('now'), 'OPENING_BALANCE', ?, ?, ?, ?, ?, 'MANUAL', ?, ?, ?)
          `).run(
            newCashAccountId,
            n(cashRow.balance) >= 0 ? 'IN' : 'OUT',
            cashRow.currency,
            openingAmount,
            cashRow.currency === 'USD' ? archivedRate : 1,
            cashRow.currency === 'USD' ? openingAmount * archivedRate : openingAmount,
            runId,
            `Opening balance carry forward from archive ${archiveId}`,
            executedByUserId
          );
        }

        db.prepare(`
          INSERT INTO opening_balance_entries (
            run_id, balance_type, entity_key, entity_label, currency, amount_original, amount_base, quantity, metadata_json
          )
          VALUES (?, 'CASH_ACCOUNT', ?, ?, ?, ?, ?, 0, ?)
        `).run(
          runId,
          String(cashRow.id),
          cashRow.name,
          cashRow.currency,
          n(cashRow.balance),
          cashRow.currency === 'USD' ? n(cashRow.balance) * archivedRate : n(cashRow.balance),
          JSON.stringify({ sourceCashAccountId: cashRow.id, targetCashAccountId: newCashAccountId })
        );
      }

      for (const productRow of archivedProducts) {
        const targetCategoryId = categoryMap.get(sourceCategoryNameById.get(productRow.category_id));
        if (!targetCategoryId) {
          throw new Error(`تعذر مطابقة تصنيف المنتج ${productRow.name_ar} أثناء ترحيل أرصدة الافتتاح`);
        }
        db.prepare(`
          INSERT INTO products (
            category_id, sku, barcode, name_ar, name_en, unit, default_sale_price, min_stock_level,
            current_qty, avg_cost_base, is_active, purchase_price, selling_price, default_currency, notes
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          targetCategoryId,
          productRow.sku,
          productRow.barcode,
          productRow.name_ar,
          productRow.name_en,
          productRow.unit,
          productRow.default_sale_price,
          productRow.min_stock_level,
          productRow.current_qty,
          productRow.avg_cost_base,
          productRow.is_active,
          productRow.purchase_price,
          productRow.selling_price,
          productRow.default_currency,
          productRow.notes
        );

        db.prepare(`
          INSERT INTO opening_balance_entries (
            run_id, balance_type, entity_key, entity_label, currency, amount_original, amount_base, quantity, metadata_json
          )
          VALUES (?, 'INVENTORY', ?, ?, ?, ?, ?, ?, ?)
        `).run(
          runId,
          productRow.sku || String(productRow.id),
          productRow.name_ar,
          productRow.default_currency,
          n(productRow.current_qty) * n(productRow.avg_cost_base),
          n(productRow.current_qty) * n(productRow.avg_cost_base),
          productRow.current_qty,
          JSON.stringify({ sourceProductId: productRow.id, avgCostBase: productRow.avg_cost_base })
        );
      }

      const summary = {
        archiveId,
        sourceYear: String(sourceYear || metadata.createdAt?.slice(0, 4) || ''),
        targetYear: String(targetYear),
        customersCarried: archivedCustomers.length,
        suppliersCarried: archivedSuppliers.length,
        cashAccountsCarried: archivedCashAccounts.length,
        inventoryProductsCarried: archivedProducts.length,
        inventoryCategoriesCarried: archivedCategories.length
      };

      db.prepare('UPDATE year_opening_runs SET summary_json = ? WHERE id = ?').run(JSON.stringify(summary), runId);
    });

    trx();
  } finally {
    sourceDb.close();
  }

  return {
    archiveId,
    sourceYear: String(sourceYear || metadata.createdAt?.slice(0, 4) || ''),
    targetYear: String(targetYear),
    currentCounts: getYearEndCounts(),
    runs: listYearOpeningRuns()
  };
}

function copyTableRows(sourceDb, targetDb, tableName) {
  const columns = tableColumns(sourceDb, tableName);
  const rows = sourceDb.prepare(`SELECT ${columns.map((name) => `"${name}"`).join(', ')} FROM ${tableName}`).all();
  if (rows.length === 0) return 0;

  const placeholders = columns.map(() => '?').join(', ');
  const insert = targetDb.prepare(`
    INSERT INTO ${tableName} (${columns.map((name) => `"${name}"`).join(', ')})
    VALUES (${placeholders})
  `);

  for (const row of rows) {
    insert.run(...columns.map((name) => row[name]));
  }

  return rows.length;
}

export function restoreOperationalArchive({ archiveId }) {
  const archivesDir = getArchivesDirectory();
  const archiveDbPath = path.join(archivesDir, `${archiveId}.sqlite`);
  const metadataPath = path.join(archivesDir, `${archiveId}.json`);

  if (!fs.existsSync(archiveDbPath)) {
    throw new Error('ملف الأرشيف المطلوب غير موجود');
  }

  const sourceDb = new Database(archiveDbPath, { readonly: true });
  const restoredCounts = {};

  try {
    const trx = db.transaction(() => {
      for (const table of RESET_TABLES) {
        db.prepare(`DELETE FROM ${table}`).run();
      }
      resetSequences(db);

      for (const table of RESTORE_TABLES) {
        restoredCounts[table] = copyTableRows(sourceDb, db, table);
      }
    });

    trx();
  } finally {
    sourceDb.close();
  }

  return {
    archiveId,
    archiveDbPath,
    metadataPath,
    restoredCounts,
    currentCounts: getYearEndCounts()
  };
}
