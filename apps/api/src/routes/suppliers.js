import express from 'express';
import { PERMISSIONS, SUPPORTED_CURRENCIES } from '@paint-shop/shared';
import db from '../db.js';
import { authRequired, requirePermission } from '../middleware/auth.js';
import { writeAuditLog } from '../utils/audit.js';
import { getRateForCurrency } from '../utils/exchangeRate.js';
import { computeAgingFromEntries } from '../utils/aging.js';

const router = express.Router();
router.use(authRequired);

function validatePayload(payload) {
  if (!payload.name || payload.name.trim().length < 2) return 'اسم المورد مطلوب ويجب ألا يقل عن حرفين';
  if (!SUPPORTED_CURRENCIES.includes(payload.currency)) return 'العملة غير مدعومة';
  if (Number(payload.openingBalance) < 0) return 'الرصيد الافتتاحي لا يمكن أن يكون سالباً';
  return null;
}

function toNum(value) {
  return Number(value ?? 0);
}

function resolveCashAccountByCurrency(currency) {
  const account = db.prepare('SELECT id, name, currency, is_active FROM cash_accounts WHERE currency = ? AND is_active = 1 ORDER BY id LIMIT 1').get(currency);
  if (!account) throw new Error(`لا يوجد حساب صندوق نشط للعملة ${currency}`);
  return account;
}

function getAllowNegativeCash() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'ALLOW_NEGATIVE_CASH'").get();
  return String(row?.value || 'false').toLowerCase() === 'true';
}

function getAccountBalance(accountId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN direction = 'IN' THEN original_amount ELSE -original_amount END), 0) AS balance
    FROM cash_movements
    WHERE cash_account_id = ?
  `).get(accountId);
  return toNum(row?.balance);
}

function getSupplierSummary(id) {
  const supplier = db.prepare(`
    SELECT id, name, opening_balance, current_balance, currency
    FROM suppliers
    WHERE id = ?
  `).get(id);

  if (!supplier) return null;

  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status != 'CANCELLED' THEN total_original ELSE 0 END), 0) AS total_purchases,
      COALESCE(SUM(CASE WHEN status != 'CANCELLED' THEN paid_original ELSE 0 END), 0) AS total_payments,
      COALESCE(SUM(CASE WHEN status != 'CANCELLED' THEN 1 ELSE 0 END), 0) AS invoice_count,
      MAX(invoice_date) AS last_transaction_date
    FROM purchase_invoices
    WHERE supplier_id = ?
  `).get(id);

  const standaloneSettlements = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM supplier_settlements
    WHERE supplier_id = ?
  `).get(id);

  const currentBalance = Number(supplier.current_balance || 0);
  const totalPayments = Number(totals?.total_payments || 0) + Number(standaloneSettlements?.total || 0);

  return {
    supplier_id: supplier.id,
    supplier_name: supplier.name,
    currency: supplier.currency,
    opening_balance: Number(supplier.opening_balance || 0),
    current_balance: currentBalance,
    total_purchases: Number(totals?.total_purchases || 0),
    total_payments: totalPayments,
    standalone_settlements: Number(standaloneSettlements?.total || 0),
    outstanding_from_purchases: Number(totals?.total_purchases || 0) - totalPayments,
    amount_owed_to_supplier: Math.max(currentBalance, 0),
    amount_receivable_from_supplier: Math.max(currentBalance * -1, 0),
    invoice_count: Number(totals?.invoice_count || 0),
    last_transaction_date: totals?.last_transaction_date || null
  };
}

function getSupplierSettlements(id) {
  return db.prepare(`
    SELECT s.id, s.settlement_date, s.amount, s.currency, s.reference, s.notes, s.balance_after,
           u.full_name AS created_by_name
    FROM supplier_settlements s
    LEFT JOIN users u ON u.id = s.created_by_user_id
    WHERE s.supplier_id = ?
    ORDER BY s.id DESC
  `).all(id);
}

function getSuppliersAging(asOfDate) {
  const suppliers = db.prepare(`
    SELECT id, name, current_balance, opening_balance, currency, created_at, is_active
    FROM suppliers
    WHERE is_active = 1
    ORDER BY name
  `).all();

  const purchases = db.prepare(`
    SELECT supplier_id, invoice_date, (total_original - paid_original) AS remaining_original
    FROM purchase_invoices
    WHERE status != 'CANCELLED'
      AND COALESCE(total_original - paid_original, 0) > 0
  `).all();

  const settlements = db.prepare(`
    SELECT supplier_id, settlement_date, amount
    FROM supplier_settlements
    WHERE COALESCE(amount, 0) > 0
  `).all();

  const invoiceCredits = db.prepare(`
    SELECT supplier_id, invoice_date, ABS(total_original - paid_original) AS credit_amount
    FROM purchase_invoices
    WHERE status != 'CANCELLED'
      AND COALESCE(total_original - paid_original, 0) < 0
  `).all();

  const purchaseMap = new Map();
  const settlementMap = new Map();

  for (const row of purchases) {
    if (!purchaseMap.has(row.supplier_id)) purchaseMap.set(row.supplier_id, []);
    purchaseMap.get(row.supplier_id).push({
      type: 'INVOICE',
      date: row.invoice_date,
      amount: toNum(row.remaining_original)
    });
  }

  for (const row of settlements) {
    if (!settlementMap.has(row.supplier_id)) settlementMap.set(row.supplier_id, []);
    settlementMap.get(row.supplier_id).push({
      date: row.settlement_date,
      amount: toNum(row.amount)
    });
  }

  for (const row of invoiceCredits) {
    if (!settlementMap.has(row.supplier_id)) settlementMap.set(row.supplier_id, []);
    settlementMap.get(row.supplier_id).push({
      date: row.invoice_date,
      amount: toNum(row.credit_amount)
    });
  }

  const rows = suppliers.map((supplier) => {
    const entries = [];
    if (toNum(supplier.opening_balance) > 0) {
      entries.push({
        type: 'OPENING',
        date: String(supplier.created_at || asOfDate).slice(0, 10),
        amount: toNum(supplier.opening_balance)
      });
    }
    entries.push(...(purchaseMap.get(supplier.id) || []));

    const aging = computeAgingFromEntries({
      entries,
      settlements: settlementMap.get(supplier.id) || [],
      asOfDate
    });

    return {
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      currency: supplier.currency,
      current_balance: toNum(supplier.current_balance),
      ...aging
    };
  }).filter((row) => row.totalOutstanding > 0 || row.unappliedCredits > 0 || row.current_balance !== 0);

  const totals = rows.reduce((acc, row) => ({
    current: acc.current + row.current,
    days31To60: acc.days31To60 + row.days31To60,
    days61To90: acc.days61To90 + row.days61To90,
    days90Plus: acc.days90Plus + row.days90Plus,
    totalOutstanding: acc.totalOutstanding + row.totalOutstanding,
    unappliedCredits: acc.unappliedCredits + row.unappliedCredits
  }), {
    current: 0,
    days31To60: 0,
    days61To90: 0,
    days90Plus: 0,
    totalOutstanding: 0,
    unappliedCredits: 0
  });

  return { asOfDate, rows, totals };
}

router.get('/', (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const sql = `
    SELECT id, name, phone, address, opening_balance, current_balance, currency, notes, is_active, updated_at
    FROM suppliers
    ${q ? 'WHERE name LIKE ? OR COALESCE(phone,\'\') LIKE ?' : ''}
    ORDER BY id DESC
  `;

  const rows = q ? db.prepare(sql).all(`%${q}%`, `%${q}%`) : db.prepare(sql).all();
  return res.json({ success: true, data: rows });
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: 'معرف المورد غير صالح' });

  const row = db.prepare(`
    SELECT id, name, phone, address, opening_balance, current_balance, currency, notes, is_active, created_at, updated_at
    FROM suppliers WHERE id = ?
  `).get(id);

  if (!row) return res.status(404).json({ success: false, error: 'المورد غير موجود' });
  return res.json({ success: true, data: row });
});

router.get('/:id/summary', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: 'معرف المورد غير صالح' });

  const summary = getSupplierSummary(id);
  if (!summary) return res.status(404).json({ success: false, error: 'المورد غير موجود' });

  return res.json({ success: true, data: summary });
});

router.get('/:id/settlements', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: 'معرف المورد غير صالح' });

  const supplier = db.prepare('SELECT id FROM suppliers WHERE id = ?').get(id);
  if (!supplier) return res.status(404).json({ success: false, error: 'المورد غير موجود' });

  return res.json({ success: true, data: getSupplierSettlements(id) });
});

router.get('/reports/aging', (req, res) => {
  const asOfDate = req.query.asOfDate ? String(req.query.asOfDate) : new Date().toISOString().slice(0, 10);
  return res.json({ success: true, data: getSuppliersAging(asOfDate) });
});

router.post('/:id/settlements', requirePermission(PERMISSIONS.SUPPLIERS_SETTLE), (req, res) => {
  const supplierId = Number(req.params.id);
  if (!supplierId) return res.status(400).json({ success: false, error: 'معرف المورد غير صالح' });

  const payload = {
    date: req.body.date,
    amount: toNum(req.body.amount),
    currency: req.body.currency,
    reference: req.body.reference ? String(req.body.reference).trim() : null,
    notes: req.body.notes ? String(req.body.notes).trim() : null
  };

  if (!payload.date) return res.status(400).json({ success: false, error: 'تاريخ السداد مطلوب' });
  if (!SUPPORTED_CURRENCIES.includes(payload.currency)) return res.status(400).json({ success: false, error: 'العملة غير مدعومة' });
  if (payload.amount <= 0) return res.status(400).json({ success: false, error: 'قيمة السداد يجب أن تكون أكبر من صفر' });

  const supplier = db.prepare('SELECT id, name, current_balance, currency, is_active FROM suppliers WHERE id = ?').get(supplierId);
  if (!supplier || supplier.is_active !== 1) {
    return res.status(400).json({ success: false, error: 'المورد غير موجود أو معطل' });
  }
  if (supplier.currency !== payload.currency) {
    return res.status(400).json({ success: false, error: 'عملة السداد يجب أن تطابق عملة المورد الحالية' });
  }
  if (toNum(supplier.current_balance) <= 0) {
    return res.status(400).json({ success: false, error: 'لا يوجد رصيد مستحق على هذا المورد لتسويته' });
  }
  if (payload.amount > toNum(supplier.current_balance)) {
    return res.status(400).json({ success: false, error: 'قيمة السداد أكبر من الرصيد المستحق للمورد' });
  }

  let cashAccount;
  try {
    cashAccount = resolveCashAccountByCurrency(payload.currency);
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }

  const currentCashBalance = getAccountBalance(cashAccount.id);
  if (!getAllowNegativeCash() && currentCashBalance - payload.amount < 0) {
    return res.status(400).json({ success: false, error: `الرصيد غير كافٍ في صندوق ${cashAccount.name}` });
  }

  const balanceAfter = toNum(supplier.current_balance) - payload.amount;
  const exchangeRate = getRateForCurrency(payload.currency);

  const trx = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO supplier_settlements (
        supplier_id, settlement_date, amount, currency, cash_account_id,
        reference, notes, balance_after, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      supplierId,
      payload.date,
      payload.amount,
      payload.currency,
      cashAccount.id,
      payload.reference,
      payload.notes,
      balanceAfter,
      req.user.id
    );

    const settlementId = Number(result.lastInsertRowid);

    db.prepare('UPDATE suppliers SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(balanceAfter, supplierId);

    db.prepare(`
      INSERT INTO cash_movements (
        cash_account_id, movement_date, movement_type, direction,
        currency, original_amount, exchange_rate, base_amount,
        source_type, source_id, notes, created_by_user_id
      ) VALUES (?, ?, 'MANUAL_OUT', 'OUT', ?, ?, ?, ?, 'MANUAL', ?, ?, ?)
    `).run(
      cashAccount.id,
      payload.date,
      payload.currency,
      payload.amount,
      exchangeRate,
      payload.amount * exchangeRate,
      settlementId,
      [supplier.name, payload.reference, payload.notes].filter(Boolean).join(' | ') || `سداد مديونية مورد ${supplier.name}`,
      req.user.id
    );

    writeAuditLog({
      userId: req.user.id,
      entityName: 'supplier_settlements',
      entityId: settlementId,
      action: 'CREATE',
      reason: 'SUPPLIER_SETTLEMENT'
    });

    return settlementId;
  });

  try {
    const id = trx();
    return res.status(201).json({ success: true, data: { id, balanceAfter } });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message || 'تعذر تسجيل سداد المورد' });
  }
});

router.post('/', requirePermission(PERMISSIONS.SUPPLIERS_CREATE), (req, res) => {
  const payload = {
    name: String(req.body.name || '').trim(),
    phone: req.body.phone || null,
    address: req.body.address || null,
    openingBalance: Number(req.body.openingBalance ?? 0),
    currency: req.body.currency || 'SYP',
    notes: req.body.notes || null
  };

  const validationError = validatePayload(payload);
  if (validationError) return res.status(400).json({ success: false, error: validationError });

  const result = db.prepare(`
    INSERT INTO suppliers (name, phone, address, opening_balance, current_balance, currency, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    payload.name,
    payload.phone,
    payload.address,
    payload.openingBalance,
    payload.openingBalance,
    payload.currency,
    payload.notes
  );

  writeAuditLog({ userId: req.user.id, entityName: 'suppliers', entityId: result.lastInsertRowid, action: 'CREATE' });
  return res.status(201).json({ success: true, data: { id: result.lastInsertRowid } });
});

router.patch('/:id', requirePermission(PERMISSIONS.SUPPLIERS_EDIT), (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: 'معرف المورد غير صالح' });

  const existing = db.prepare('SELECT id, opening_balance, current_balance FROM suppliers WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ success: false, error: 'المورد غير موجود' });
  const before = db.prepare(`
    SELECT name, phone, address, opening_balance, current_balance, currency, notes, is_active
    FROM suppliers WHERE id = ?
  `).get(id);

  const payload = {
    name: String(req.body.name || '').trim(),
    phone: req.body.phone || null,
    address: req.body.address || null,
    openingBalance: Number(req.body.openingBalance ?? 0),
    currency: req.body.currency || 'SYP',
    notes: req.body.notes || null
  };

  const validationError = validatePayload(payload);
  if (validationError) return res.status(400).json({ success: false, error: validationError });

  const delta = payload.openingBalance - Number(existing.opening_balance || 0);

  db.prepare(`
    UPDATE suppliers
    SET name = ?, phone = ?, address = ?, opening_balance = ?, current_balance = current_balance + ?, currency = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(payload.name, payload.phone, payload.address, payload.openingBalance, delta, payload.currency, payload.notes, id);

  const after = db.prepare(`
    SELECT name, phone, address, opening_balance, current_balance, currency, notes, is_active
    FROM suppliers WHERE id = ?
  `).get(id);

  writeAuditLog({
    userId: req.user.id,
    entityName: 'suppliers',
    entityId: id,
    action: 'UPDATE',
    metadata: { before, after }
  });
  return res.json({ success: true });
});

export default router;
