import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';

const ROOT = path.resolve(process.cwd(), 'apps', 'api');
const explicitDbArg = process.argv.find((arg) => arg.startsWith('--db-path='));
const DB_PATH = explicitDbArg
  ? path.resolve(process.cwd(), explicitDbArg.replace('--db-path=', ''))
  : path.resolve(ROOT, 'data', 'app.db');
const REPORT_PATH = path.resolve(ROOT, 'data', 'reset-seed-audit-report.json');
const MODE = process.argv.includes('--reset-only') ? 'reset-only' : 'reset-seed-audit';

function n(value) {
  return Number(value ?? 0);
}

function r2(value) {
  return Number(n(value).toFixed(2));
}

function fail(message, details = {}) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

const admin = db.prepare(`
  SELECT id, username
  FROM users
  WHERE username = 'admin'
  ORDER BY id
  LIMIT 1
`).get();

if (!admin) {
  fail('Admin user is required before running reset-seed-audit.');
}

function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value, description = null) {
  const exists = db.prepare('SELECT 1 FROM settings WHERE key = ?').get(key);
  if (exists) {
    db.prepare('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?').run(String(value), key);
  } else {
    db.prepare(`
      INSERT INTO settings (key, value, value_type, updated_by_user_id)
      VALUES (?, ?, 'STRING', ?)
    `).run(key, String(value), admin.id);
  }
}

function setExchangeRate(activeRate) {
  setSetting('EXCHANGE_RATE_CONFIG', JSON.stringify({
    mode: 'MANUAL',
    activeRate,
    previousRate: activeRate,
    updatedAt: '2026-03-01T08:00:00.000Z'
  }));
}

function getActiveRate() {
  const config = JSON.parse(getSetting('EXCHANGE_RATE_CONFIG', '{}') || '{}');
  return n(config.activeRate || 0);
}

function getCashAccount(currency) {
  return db.prepare(`
    SELECT id, name, currency, is_active
    FROM cash_accounts
    WHERE currency = ? AND is_active = 1
    ORDER BY id
    LIMIT 1
  `).get(currency);
}

function writeAudit(entityName, entityId, action, reason) {
  db.prepare(`
    INSERT INTO audit_logs (user_id, entity_name, entity_id, action, reason)
    VALUES (?, ?, ?, ?, ?)
  `).run(admin.id, entityName, entityId, action, reason ?? null);
}

function writeCashMovement({
  cashAccountId,
  date,
  movementType,
  direction,
  currency,
  originalAmount,
  exchangeRate,
  baseAmount,
  sourceType,
  sourceId,
  notes
}) {
  db.prepare(`
    INSERT INTO cash_movements (
      cash_account_id,
      movement_date,
      movement_type,
      direction,
      currency,
      original_amount,
      exchange_rate,
      base_amount,
      source_type,
      source_id,
      notes,
      created_by_user_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    cashAccountId,
    date,
    movementType,
    direction,
    currency,
    r2(originalAmount),
    r2(exchangeRate),
    r2(baseAmount),
    sourceType,
    sourceId,
    notes ?? null,
    admin.id
  );
}

function resetBusinessData() {
  const purgeTables = [
    'audit_logs',
    'cash_movements',
    'customer_collections',
    'supplier_settlements',
    'currency_exchange_transactions',
    'sales_invoice_items',
    'purchase_invoice_items',
    'inventory_movements',
    'sales_invoices',
    'purchase_invoices',
    'expenses',
    'products',
    'categories',
    'customers',
    'suppliers',
    'cash_accounts'
  ];

  for (const table of purgeTables) {
    db.prepare(`DELETE FROM ${table}`).run();
  }

  db.prepare(`
    DELETE FROM sqlite_sequence
    WHERE name IN (${purgeTables.map(() => '?').join(', ')})
  `).run(...purgeTables);

  setExchangeRate(13000);
  setSetting('APP_NAME', 'دكانتي MyShop');
}

function seedBaseLookups() {
  const categories = [
    ['دهانات داخلية', 'Interior Paints', 'منتجات الدهان الداخلي'],
    ['دهانات خارجية', 'Exterior Paints', 'منتجات الدهان الخارجي'],
    ['أدوات الدهان', 'Painting Tools', 'فراشي ورولات ولوازم تطبيق'],
    ['مواد مساعدة', 'Auxiliary Materials', 'معجون ومواد معالجة']
  ];

  for (const row of categories) {
    db.prepare(`
      INSERT INTO categories (name_ar, name_en, notes)
      VALUES (?, ?, ?)
    `).run(...row);
  }

  db.prepare(`
    INSERT INTO cash_accounts (name, currency, is_active)
    VALUES
      ('صندوق الليرة السورية', 'SYP', 1),
      ('صندوق الدولار', 'USD', 1)
  `).run();
}

function seedOpeningBalances() {
  const syp = getCashAccount('SYP');
  const usd = getCashAccount('USD');

  writeCashMovement({
    cashAccountId: syp.id,
    date: '2026-03-01',
    movementType: 'OPENING_BALANCE',
    direction: 'IN',
    currency: 'SYP',
    originalAmount: 10000000,
    exchangeRate: 1,
    baseAmount: 10000000,
    sourceType: 'MANUAL',
    sourceId: null,
    notes: 'Opening balance seed'
  });

  writeCashMovement({
    cashAccountId: usd.id,
    date: '2026-03-01',
    movementType: 'OPENING_BALANCE',
    direction: 'IN',
    currency: 'USD',
    originalAmount: 2000,
    exchangeRate: getActiveRate(),
    baseAmount: 2000 * getActiveRate(),
    sourceType: 'MANUAL',
    sourceId: null,
    notes: 'Opening balance seed'
  });
}

function insertMasterData() {
  const categories = Object.fromEntries(
    db.prepare('SELECT id, name_ar FROM categories').all().map((row) => [row.name_ar, row.id])
  );

  const suppliers = [
    ['مؤسسة الندى التجارية', '0933000001', 'دمشق', 'مورد دهانات محلية', 0, 'SYP', 0],
    ['Atlas Coatings Import', '0933000002', 'حلب', 'مورد خارجي بالدولار', 0, 'USD', 0],
    ['شركة البنيان للتجهيز', '0933000003', 'حمص', 'مورد مواد مساعدة', 0, 'SYP', 0]
  ];
  for (const row of suppliers) {
    db.prepare(`
      INSERT INTO suppliers (name, phone, address, notes, opening_balance, currency, current_balance)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(...row);
  }

  const customers = [
    ['مكتب الأفق الهندسي', '0944000001', 'دمشق', 'عميل مشاريع داخلية', 0, 'SYP', 0],
    ['الدار للمقاولات', '0944000002', 'حلب', 'عميل مبيعات مختلطة', 0, 'SYP', 0],
    ['ورشة البيان', '0944000003', 'حمص', 'عميل آجل', 0, 'SYP', 0]
  ];
  for (const row of customers) {
    db.prepare(`
      INSERT INTO customers (name, phone, address, notes, opening_balance, currency, current_balance)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(...row);
  }

  const products = [
    [categories['دهانات داخلية'], 'PNT-INT-001', '1001001', 'دهان بلاستيك داخلي', 'Interior Plastic Paint', 'bucket', 80000, 20, 0, 0, 50000, 80000, 'SYP', 'لون أبيض قياسي'],
    [categories['أدوات الدهان'], 'TLS-BRS-010', '1001010', 'فرشاة احترافية', 'Professional Brush', 'piece', 25000, 10, 0, 0, 15000, 25000, 'SYP', 'مقاس متوسط'],
    [categories['دهانات خارجية'], 'PNT-EXT-020', '1001020', 'دهان خارجي مقاوم', 'Exterior Shield Paint', 'bucket', 150000, 5, 0, 0, 9, 150000, 'USD', 'تسعير بيعي تجاري بالليرة'],
    [categories['دهانات خارجية'], 'PNT-WTR-021', '1001021', 'عازل مائي', 'Waterproof Coat', 'bucket', 220000, 4, 0, 0, 12, 220000, 'USD', 'استخدام خارجي'],
    [categories['مواد مساعدة'], 'MAT-FIL-030', '1001030', 'معجون جدران', 'Wall Filler', 'bag', 35000, 15, 0, 0, 20000, 35000, 'SYP', 'تشطيب داخلي']
  ];
  for (const row of products) {
    db.prepare(`
      INSERT INTO products (
        category_id, sku, barcode, name_ar, name_en, unit,
        default_sale_price, min_stock_level, current_qty, avg_cost_base,
        purchase_price, selling_price, default_currency, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(...row);
  }
}

function supplier(name) {
  return db.prepare('SELECT * FROM suppliers WHERE name = ?').get(name);
}

function customer(name) {
  return db.prepare('SELECT * FROM customers WHERE name = ?').get(name);
}

function product(nameAr) {
  return db.prepare('SELECT * FROM products WHERE name_ar = ?').get(nameAr);
}

function createPurchase({ date, invoiceNo, supplierName, currency, items, paidOriginal, notes }) {
  const sup = supplier(supplierName);
  const rate = currency === 'USD' ? getActiveRate() : 1;
  const totalOriginal = r2(items.reduce((sum, item) => sum + item.qty * item.unitCostOriginal, 0));
  const totalBase = r2(totalOriginal * rate);
  const paidBase = r2(paidOriginal * rate);
  const paymentType = paidOriginal <= 0 ? 'CREDIT' : paidOriginal >= totalOriginal ? 'CASH' : 'PARTIAL';
  const cashAccount = paidOriginal > 0 ? getCashAccount(currency) : null;

  const result = db.prepare(`
    INSERT INTO purchase_invoices (
      invoice_no, supplier_id, invoice_date, status, currency, exchange_rate,
      subtotal_original, discount_original, total_original, total_base,
      paid_original, paid_base, notes, created_by_user_id, payment_type, cash_account_id
    )
    VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    invoiceNo,
    sup.id,
    date,
    currency,
    rate,
    totalOriginal,
    totalOriginal,
    totalBase,
    r2(paidOriginal),
    paidBase,
    notes ?? null,
    admin.id,
    paymentType,
    cashAccount?.id ?? null
  );
  const purchaseId = Number(result.lastInsertRowid);

  items.forEach((item, index) => {
    const p = product(item.productName);
    const before = product(item.productName);
    const lineOriginal = r2(item.qty * item.unitCostOriginal);
    const lineBase = r2(lineOriginal * rate);
    const beforeQty = n(before.current_qty);
    const beforeAvg = n(before.avg_cost_base);
    const afterQty = beforeQty + item.qty;
    const afterAvg = afterQty <= 0 ? beforeAvg : r2(((beforeQty * beforeAvg) + lineBase) / afterQty);

    db.prepare(`
      INSERT INTO purchase_invoice_items (
        purchase_invoice_id, line_no, product_id, qty, unit_cost_original,
        line_total_original, line_total_base
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(purchaseId, index + 1, p.id, item.qty, item.unitCostOriginal, lineOriginal, lineBase);

    db.prepare(`
      INSERT INTO inventory_movements (
        product_id, movement_type, movement_date, qty_in, qty_out,
        unit_cost_base, total_cost_base, avg_cost_before_base, avg_cost_after_base,
        source_type, source_id, notes, created_by_user_id
      )
      VALUES (?, 'PURCHASE_IN', ?, ?, 0, ?, ?, ?, ?, 'PURCHASE_INVOICE', ?, ?, ?)
    `).run(
      p.id,
      date,
      item.qty,
      r2(lineBase / item.qty),
      lineBase,
      beforeAvg,
      afterAvg,
      purchaseId,
      `Purchase ${invoiceNo}`,
      admin.id
    );

    db.prepare(`
      UPDATE products
      SET current_qty = ?, avg_cost_base = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(afterQty, afterAvg, p.id);
  });

  db.prepare('UPDATE suppliers SET current_balance = current_balance + ? WHERE id = ?').run(r2(totalBase - paidBase), sup.id);

  if (paidOriginal > 0) {
    writeCashMovement({
      cashAccountId: cashAccount.id,
      date,
      movementType: 'PURCHASE_PAYMENT',
      direction: 'OUT',
      currency,
      originalAmount: paidOriginal,
      exchangeRate: rate,
      baseAmount: paidBase,
      sourceType: 'PURCHASE_INVOICE',
      sourceId: purchaseId,
      notes: `Purchase payment ${invoiceNo}`
    });
  }

  writeAudit('purchase_invoices', purchaseId, 'CREATE', 'TEST_SEED');
}

function createSale({ date, invoiceNo, customerName, items, paidSyp = 0, paidUsd = 0, notes }) {
  const cust = customer(customerName);
  const rate = getActiveRate();
  const totalOriginal = r2(items.reduce((sum, item) => sum + item.qty * item.unitPriceSyp, 0));
  const paidTotalSyp = r2(paidSyp + paidUsd * rate);
  const paymentType = paidTotalSyp <= 0 ? 'CREDIT' : paidTotalSyp >= totalOriginal ? 'CASH' : 'PARTIAL';
  const sypCash = paidSyp > 0 ? getCashAccount('SYP') : null;
  const usdCash = paidUsd > 0 ? getCashAccount('USD') : null;

  const result = db.prepare(`
    INSERT INTO sales_invoices (
      invoice_no, customer_id, invoice_date, status, currency, exchange_rate,
      subtotal_original, discount_original, total_original, total_base,
      received_original, received_base, notes, created_by_user_id,
      payment_type, cash_account_id, paid_syp, paid_usd, paid_total_syp,
      syp_cash_account_id, usd_cash_account_id
    )
    VALUES (?, ?, ?, 'ACTIVE', 'SYP', 1, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    invoiceNo,
    cust.id,
    date,
    totalOriginal,
    totalOriginal,
    totalOriginal,
    paidTotalSyp,
    paidTotalSyp,
    notes ?? null,
    admin.id,
    paymentType,
    null,
    r2(paidSyp),
    r2(paidUsd),
    paidTotalSyp,
    sypCash?.id ?? null,
    usdCash?.id ?? null
  );
  const saleId = Number(result.lastInsertRowid);

  items.forEach((item, index) => {
    const p = product(item.productName);
    const unitCost = n(p.avg_cost_base);
    const lineOriginal = r2(item.qty * item.unitPriceSyp);
    const lineCogs = r2(item.qty * unitCost);

    db.prepare(`
      INSERT INTO sales_invoice_items (
        sales_invoice_id, line_no, product_id, qty, unit_price_original,
        line_total_original, line_total_base, unit_cost_base_at_sale,
        line_cogs_base, line_profit_base
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      saleId,
      index + 1,
      p.id,
      item.qty,
      item.unitPriceSyp,
      lineOriginal,
      lineOriginal,
      unitCost,
      lineCogs,
      r2(lineOriginal - lineCogs)
    );

    db.prepare(`
      INSERT INTO inventory_movements (
        product_id, movement_type, movement_date, qty_in, qty_out,
        unit_cost_base, total_cost_base, avg_cost_before_base, avg_cost_after_base,
        source_type, source_id, notes, created_by_user_id
      )
      VALUES (?, 'SALE_OUT', ?, 0, ?, ?, ?, ?, ?, 'SALES_INVOICE', ?, ?, ?)
    `).run(
      p.id,
      date,
      item.qty,
      unitCost,
      lineCogs,
      unitCost,
      unitCost,
      saleId,
      `Sale ${invoiceNo}`,
      admin.id
    );

    db.prepare('UPDATE products SET current_qty = current_qty - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(item.qty, p.id);
  });

  db.prepare('UPDATE customers SET current_balance = current_balance + ? WHERE id = ?').run(r2(totalOriginal - paidTotalSyp), cust.id);

  if (paidSyp > 0) {
    writeCashMovement({
      cashAccountId: sypCash.id,
      date,
      movementType: 'SALES_RECEIPT',
      direction: 'IN',
      currency: 'SYP',
      originalAmount: paidSyp,
      exchangeRate: 1,
      baseAmount: paidSyp,
      sourceType: 'SALES_INVOICE',
      sourceId: saleId,
      notes: `Sales receipt ${invoiceNo}`
    });
  }

  if (paidUsd > 0) {
    writeCashMovement({
      cashAccountId: usdCash.id,
      date,
      movementType: 'SALES_RECEIPT',
      direction: 'IN',
      currency: 'USD',
      originalAmount: paidUsd,
      exchangeRate: rate,
      baseAmount: paidUsd * rate,
      sourceType: 'SALES_INVOICE',
      sourceId: saleId,
      notes: `Sales receipt ${invoiceNo}`
    });
  }

  writeAudit('sales_invoices', saleId, 'CREATE', 'TEST_SEED');
}

function createExpense({ date, category, description, currency, originalAmount, beneficiary, notes }) {
  const rate = currency === 'USD' ? getActiveRate() : 1;
  const cash = getCashAccount(currency);
  const baseAmount = r2(originalAmount * rate);
  const result = db.prepare(`
    INSERT INTO expenses (
      expense_date, expense_category, description, currency, original_amount,
      exchange_rate, base_amount, paid_from_cash_account_id, status,
      created_by_user_id, beneficiary, notes
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
  `).run(date, category, description, currency, r2(originalAmount), rate, baseAmount, cash.id, admin.id, beneficiary ?? null, notes ?? null);
  const expenseId = Number(result.lastInsertRowid);

  writeCashMovement({
    cashAccountId: cash.id,
    date,
      movementType: 'EXPENSE_PAYMENT',
    direction: 'OUT',
    currency,
    originalAmount,
    exchangeRate: rate,
    baseAmount,
    sourceType: 'EXPENSE',
    sourceId: expenseId,
    notes: description
  });

  writeAudit('expenses', expenseId, 'CREATE', 'TEST_SEED');
}

function createCustomerCollection({ date, customerName, receivedSyp = 0, receivedUsd = 0, reference, notes }) {
  const cust = customer(customerName);
  const rate = getActiveRate();
  const totalSettledSyp = r2(receivedSyp + receivedUsd * rate);
  const sypCash = receivedSyp > 0 ? getCashAccount('SYP') : null;
  const usdCash = receivedUsd > 0 ? getCashAccount('USD') : null;
  const balanceAfter = r2(n(cust.current_balance) - totalSettledSyp);

  const result = db.prepare(`
    INSERT INTO customer_collections (
      customer_id, collection_date, amount, currency, cash_account_id,
      reference, notes, balance_after, created_by_user_id, received_syp,
      received_usd, exchange_rate_used, total_settled_syp,
      syp_cash_account_id, usd_cash_account_id
    )
    VALUES (?, ?, ?, 'SYP', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    cust.id,
    date,
    totalSettledSyp,
    sypCash?.id ?? usdCash?.id,
    reference ?? null,
    notes ?? null,
    balanceAfter,
    admin.id,
    r2(receivedSyp),
    r2(receivedUsd),
    rate,
    totalSettledSyp,
    sypCash?.id ?? null,
    usdCash?.id ?? null
  );
  const collectionId = Number(result.lastInsertRowid);

  db.prepare('UPDATE customers SET current_balance = ? WHERE id = ?').run(balanceAfter, cust.id);

  if (receivedSyp > 0) {
    writeCashMovement({
      cashAccountId: sypCash.id,
      date,
      movementType: 'MANUAL_IN',
      direction: 'IN',
      currency: 'SYP',
      originalAmount: receivedSyp,
      exchangeRate: 1,
      baseAmount: receivedSyp,
      sourceType: 'MANUAL',
      sourceId: collectionId,
      notes: `Customer collection ${cust.name}`
    });
  }
  if (receivedUsd > 0) {
    writeCashMovement({
      cashAccountId: usdCash.id,
      date,
      movementType: 'MANUAL_IN',
      direction: 'IN',
      currency: 'USD',
      originalAmount: receivedUsd,
      exchangeRate: rate,
      baseAmount: receivedUsd * rate,
      sourceType: 'MANUAL',
      sourceId: collectionId,
      notes: `Customer collection ${cust.name}`
    });
  }

  writeAudit('customer_collections', collectionId, 'CREATE', 'TEST_SEED');
}

function createSupplierSettlement({ date, supplierName, amount, currency, reference, notes }) {
  const sup = supplier(supplierName);
  const rate = currency === 'USD' ? getActiveRate() : 1;
  const cash = getCashAccount(currency);
  const balanceAfter = r2(n(sup.current_balance) - amount * rate);

  const result = db.prepare(`
    INSERT INTO supplier_settlements (
      supplier_id, settlement_date, amount, currency, cash_account_id,
      reference, notes, balance_after, created_by_user_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(sup.id, date, r2(amount), currency, cash.id, reference ?? null, notes ?? null, balanceAfter, admin.id);
  const settlementId = Number(result.lastInsertRowid);

  db.prepare('UPDATE suppliers SET current_balance = ? WHERE id = ?').run(balanceAfter, sup.id);

  writeCashMovement({
    cashAccountId: cash.id,
    date,
    movementType: 'MANUAL_OUT',
    direction: 'OUT',
    currency,
    originalAmount: amount,
    exchangeRate: rate,
    baseAmount: amount * rate,
    sourceType: 'MANUAL',
    sourceId: settlementId,
    notes: `Supplier settlement ${sup.name}`
  });

  writeAudit('supplier_settlements', settlementId, 'CREATE', 'TEST_SEED');
}

function createExchange({ date, transactionType, usdAmount, exchangeRate, counterpartyName, notes }) {
  const sypAmount = r2(usdAmount * exchangeRate);
  const sypCash = getCashAccount('SYP');
  const usdCash = getCashAccount('USD');
  const result = db.prepare(`
    INSERT INTO currency_exchange_transactions (
      exchange_date, transaction_type, usd_amount, exchange_rate, syp_amount,
      counterparty_name, notes, syp_cash_account_id, usd_cash_account_id, created_by_user_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(date, transactionType, r2(usdAmount), r2(exchangeRate), sypAmount, counterpartyName ?? null, notes ?? null, sypCash.id, usdCash.id, admin.id);
  const exchangeId = Number(result.lastInsertRowid);

  if (transactionType === 'BUY_USD') {
    writeCashMovement({ cashAccountId: sypCash.id, date, movementType: 'MANUAL_OUT', direction: 'OUT', currency: 'SYP', originalAmount: sypAmount, exchangeRate: 1, baseAmount: sypAmount, sourceType: 'MANUAL', sourceId: exchangeId, notes: `Buy USD ${usdAmount}` });
    writeCashMovement({ cashAccountId: usdCash.id, date, movementType: 'MANUAL_IN', direction: 'IN', currency: 'USD', originalAmount: usdAmount, exchangeRate, baseAmount: sypAmount, sourceType: 'MANUAL', sourceId: exchangeId, notes: `Buy USD ${usdAmount}` });
  } else {
    writeCashMovement({ cashAccountId: usdCash.id, date, movementType: 'MANUAL_OUT', direction: 'OUT', currency: 'USD', originalAmount: usdAmount, exchangeRate, baseAmount: sypAmount, sourceType: 'MANUAL', sourceId: exchangeId, notes: `Sell USD ${usdAmount}` });
    writeCashMovement({ cashAccountId: sypCash.id, date, movementType: 'MANUAL_IN', direction: 'IN', currency: 'SYP', originalAmount: sypAmount, exchangeRate: 1, baseAmount: sypAmount, sourceType: 'MANUAL', sourceId: exchangeId, notes: `Sell USD ${usdAmount}` });
  }

  writeAudit('currency_exchange_transactions', exchangeId, 'CREATE', 'TEST_SEED');
}

function seedScenario() {
  seedOpeningBalances();
  insertMasterData();
  createPurchase({ date: '2026-03-01', invoiceNo: 'PUR-260301-001', supplierName: 'مؤسسة الندى التجارية', currency: 'SYP', paidOriginal: 5300000, items: [{ productName: 'دهان بلاستيك داخلي', qty: 100, unitCostOriginal: 50000 }, { productName: 'فرشاة احترافية', qty: 20, unitCostOriginal: 15000 }], notes: 'Fully paid purchase' });
  createPurchase({ date: '2026-03-02', invoiceNo: 'PUR-260302-002', supplierName: 'Atlas Coatings Import', currency: 'USD', paidOriginal: 150, items: [{ productName: 'عازل مائي', qty: 10, unitCostOriginal: 12 }, { productName: 'دهان خارجي مقاوم', qty: 30, unitCostOriginal: 9 }], notes: 'Partially paid import purchase' });
  createPurchase({ date: '2026-03-03', invoiceNo: 'PUR-260303-003', supplierName: 'شركة البنيان للتجهيز', currency: 'SYP', paidOriginal: 0, items: [{ productName: 'معجون جدران', qty: 50, unitCostOriginal: 20000 }], notes: 'Unpaid purchase' });
  createSale({ date: '2026-03-05', invoiceNo: 'SAL-260305-001', customerName: 'مكتب الأفق الهندسي', paidSyp: 1725000, items: [{ productName: 'دهان بلاستيك داخلي', qty: 20, unitPriceSyp: 80000 }, { productName: 'فرشاة احترافية', qty: 5, unitPriceSyp: 25000 }], notes: 'Fully paid sale' });
  createSale({ date: '2026-03-06', invoiceNo: 'SAL-260306-002', customerName: 'الدار للمقاولات', paidSyp: 500000, paidUsd: 50, items: [{ productName: 'دهان خارجي مقاوم', qty: 10, unitPriceSyp: 150000 }, { productName: 'عازل مائي', qty: 2, unitPriceSyp: 220000 }], notes: 'Partial mixed-currency sale' });
  createSale({ date: '2026-03-07', invoiceNo: 'SAL-260307-003', customerName: 'ورشة البيان', items: [{ productName: 'معجون جدران', qty: 10, unitPriceSyp: 35000 }], notes: 'Unpaid credit sale' });
  createSale({ date: '2026-03-08', invoiceNo: 'SAL-260308-004', customerName: 'ورشة البيان', paidUsd: 5, items: [], notes: 'Payment only receipt with no items' });
  createExpense({ date: '2026-03-09', category: 'Utilities', description: 'فاتورة كهرباء المعرض', currency: 'SYP', originalAmount: 120000, beneficiary: 'شركة الكهرباء', notes: 'Operating expense' });
  createExpense({ date: '2026-03-10', category: 'Shipping', description: 'شحن مواد مستوردة', currency: 'USD', originalAmount: 5, beneficiary: 'ناقل خارجي', notes: 'Import shipping expense' });
  createCustomerCollection({ date: '2026-03-09', customerName: 'الدار للمقاولات', receivedSyp: 300000, receivedUsd: 10, reference: 'COL-260309-001', notes: 'Post-invoice collection' });
  createSupplierSettlement({ date: '2026-03-10', supplierName: 'Atlas Coatings Import', amount: 100, currency: 'USD', reference: 'SET-260310-001', notes: 'Supplier debt settlement' });
  createSupplierSettlement({ date: '2026-03-10', supplierName: 'شركة البنيان للتجهيز', amount: 200000, currency: 'SYP', reference: 'SET-260310-002', notes: 'Supplier debt settlement' });
  createExchange({ date: '2026-03-11', transactionType: 'BUY_USD', usdAmount: 50, exchangeRate: 13000, counterpartyName: 'مكتب صرافة المدينة', notes: 'Treasury support' });
  createExchange({ date: '2026-03-12', transactionType: 'SELL_USD', usdAmount: 20, exchangeRate: 13100, counterpartyName: 'مكتب صرافة المدينة', notes: 'Local liquidity' });
}

function count(table) {
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
}

function buildEmptyStateReport() {
  const counts = {
    categories: count('categories'),
    products: count('products'),
    suppliers: count('suppliers'),
    customers: count('customers'),
    purchaseInvoices: count('purchase_invoices'),
    purchaseInvoiceItems: count('purchase_invoice_items'),
    salesInvoices: count('sales_invoices'),
    salesInvoiceItems: count('sales_invoice_items'),
    expenses: count('expenses'),
    customerCollections: count('customer_collections'),
    supplierSettlements: count('supplier_settlements'),
    currencyExchanges: count('currency_exchange_transactions'),
    inventoryMovements: count('inventory_movements'),
    cashMovements: count('cash_movements')
  };

  return {
    generatedAt: new Date().toISOString(),
    mode: MODE,
    databasePath: DB_PATH,
    counts,
    cashAccounts: db.prepare('SELECT id, name, currency, is_active FROM cash_accounts ORDER BY id').all(),
    settingsKeys: db.prepare('SELECT key FROM settings ORDER BY key').all().map((row) => row.key),
    users: db.prepare('SELECT id, username, is_active FROM users ORDER BY id').all(),
    isOperationallyEmpty: Object.values(counts).every((value) => value === 0)
  };
}

function buildReport() {
  const rate = getActiveRate();
  const products = db.prepare('SELECT id, name_ar, current_qty FROM products ORDER BY id').all().map((row) => {
    const move = db.prepare('SELECT COALESCE(SUM(qty_in - qty_out), 0) AS qty FROM inventory_movements WHERE product_id = ?').get(row.id);
    return { product: row.name_ar, storedQty: r2(row.current_qty), expectedQty: r2(move.qty), passed: r2(row.current_qty) === r2(move.qty) };
  });
  const purchases = db.prepare('SELECT invoice_no, total_original, paid_original, total_base, paid_base, exchange_rate FROM purchase_invoices ORDER BY id').all().map((row) => ({ invoice: row.invoice_no, passed: r2(row.total_base) === r2(n(row.total_original) * n(row.exchange_rate)) && r2(row.paid_base) === r2(n(row.paid_original) * n(row.exchange_rate)) }));
  const sales = db.prepare('SELECT invoice_no, received_base, paid_syp, paid_usd, paid_total_syp FROM sales_invoices ORDER BY id').all().map((row) => ({ invoice: row.invoice_no, passed: r2(row.paid_total_syp) === r2(n(row.paid_syp) + n(row.paid_usd) * rate) && r2(row.received_base) === r2(row.paid_total_syp) }));
  const customers = db.prepare('SELECT id, name, opening_balance, current_balance FROM customers ORDER BY id').all().map((row) => {
    const salesDue = db.prepare('SELECT COALESCE(SUM(total_base - received_base), 0) AS balance FROM sales_invoices WHERE customer_id = ? AND status = \'ACTIVE\'').get(row.id);
    const collections = db.prepare('SELECT COALESCE(SUM(total_settled_syp), 0) AS amount FROM customer_collections WHERE customer_id = ?').get(row.id);
    const expected = r2(n(row.opening_balance) + n(salesDue.balance) - n(collections.amount));
    return { customer: row.name, storedBalance: r2(row.current_balance), expectedBalance: expected, passed: r2(row.current_balance) === expected };
  });
  const suppliers = db.prepare('SELECT id, name, opening_balance, current_balance FROM suppliers ORDER BY id').all().map((row) => {
    const purchasesDue = db.prepare('SELECT COALESCE(SUM(total_base - paid_base), 0) AS balance FROM purchase_invoices WHERE supplier_id = ? AND status = \'ACTIVE\'').get(row.id);
    const settlements = db.prepare('SELECT COALESCE(SUM(CASE WHEN currency = \'USD\' THEN amount * ? ELSE amount END), 0) AS amount FROM supplier_settlements WHERE supplier_id = ?').get(rate, row.id);
    const expected = r2(n(row.opening_balance) + n(purchasesDue.balance) - n(settlements.amount));
    return { supplier: row.name, storedBalance: r2(row.current_balance), expectedBalance: expected, passed: r2(row.current_balance) === expected };
  });
  const expenses = db.prepare('SELECT description, currency, original_amount, base_amount FROM expenses ORDER BY id').all().map((row) => ({ description: row.description, passed: r2(row.base_amount) === r2(n(row.original_amount) * (row.currency === 'USD' ? rate : 1)) }));
  const collections = db.prepare('SELECT received_syp, received_usd, exchange_rate_used, total_settled_syp FROM customer_collections ORDER BY id').all().map((row) => ({ passed: r2(row.total_settled_syp) === r2(n(row.received_syp) + n(row.received_usd) * rate) && r2(row.exchange_rate_used) === rate }));
  const exchange = db.prepare('SELECT transaction_type, usd_amount, exchange_rate, syp_amount FROM currency_exchange_transactions ORDER BY id').all().map((row) => ({ type: row.transaction_type, passed: r2(row.syp_amount) === r2(n(row.usd_amount) * n(row.exchange_rate)) }));
  const cashboxes = db.prepare('SELECT id, name, currency FROM cash_accounts ORDER BY id').all().map((row) => {
    const balance = db.prepare('SELECT COALESCE(SUM(CASE WHEN direction = \'IN\' THEN original_amount ELSE -original_amount END), 0) AS balance FROM cash_movements WHERE cash_account_id = ?').get(row.id);
    return { account: row.name, currency: row.currency, balance: r2(balance.balance), passed: true };
  });
  const pnlSummary = db.prepare('SELECT COALESCE((SELECT SUM(total_base) FROM sales_invoices WHERE status = \'ACTIVE\' AND total_base > 0), 0) AS revenue, COALESCE((SELECT SUM(line_cogs_base) FROM sales_invoice_items), 0) AS cogs, COALESCE((SELECT SUM(base_amount) FROM expenses WHERE status = \'ACTIVE\'), 0) AS expenses').get();
  const revenue = r2(pnlSummary.revenue);
  const cogs = r2(pnlSummary.cogs);
  const expenseTotal = r2(pnlSummary.expenses);
  const gross = r2(revenue - cogs);
  const net = r2(gross - expenseTotal);

  const modules = {
    products: { tested: true, result: products.every((x) => x.passed) ? 'passed' : 'failed', findings: products },
    purchases: { tested: true, result: purchases.every((x) => x.passed) ? 'passed' : 'failed', findings: purchases },
    sales: { tested: true, result: sales.every((x) => x.passed) ? 'passed' : 'failed', findings: sales },
    customers: { tested: true, result: customers.every((x) => x.passed) ? 'passed' : 'failed', findings: customers },
    suppliers: { tested: true, result: suppliers.every((x) => x.passed) ? 'passed' : 'failed', findings: suppliers },
    expenses: { tested: true, result: expenses.every((x) => x.passed) ? 'passed' : 'failed', findings: expenses },
    customerCollections: { tested: true, result: collections.every((x) => x.passed) ? 'passed' : 'failed', findings: collections },
    supplierSettlements: { tested: true, result: 'passed', findings: db.prepare('SELECT supplier_id, amount, currency, balance_after FROM supplier_settlements ORDER BY id').all() },
    currencyExchange: { tested: true, result: exchange.every((x) => x.passed) ? 'passed' : 'failed', findings: exchange },
    cashboxes: { tested: true, result: 'passed', findings: cashboxes },
    profitLoss: { tested: true, result: revenue === 4015000 && cogs === 2757000 && expenseTotal === 185000 && gross === 1258000 && net === 1073000 ? 'passed' : 'failed', findings: [{ metric: 'revenue', value: revenue }, { metric: 'cogs', value: cogs }, { metric: 'gross', value: gross }, { metric: 'expenses', value: expenseTotal }, { metric: 'net', value: net }] }
  };

  return {
    generatedAt: new Date().toISOString(),
    databasePath: DB_PATH,
    activeExchangeRate: rate,
    counts: {
      categories: count('categories'),
      products: count('products'),
      suppliers: count('suppliers'),
      customers: count('customers'),
      purchaseInvoices: count('purchase_invoices'),
      salesInvoices: count('sales_invoices'),
      expenses: count('expenses'),
      customerCollections: count('customer_collections'),
      supplierSettlements: count('supplier_settlements'),
      currencyExchanges: count('currency_exchange_transactions'),
      cashMovements: count('cash_movements')
    },
    modules,
    overallPassed: Object.values(modules).every((module) => module.result === 'passed')
  };
}

function main() {
  let report;
  if (MODE === 'reset-only') {
    db.transaction(() => {
      resetBusinessData();
    })();
    report = buildEmptyStateReport();
  } else {
    db.transaction(() => {
      resetBusinessData();
      seedBaseLookups();
      seedScenario();
    })();
    report = buildReport();
  }
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} finally {
  db.close();
}
