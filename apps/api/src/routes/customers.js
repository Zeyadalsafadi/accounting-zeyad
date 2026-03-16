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
  if (!payload.name || payload.name.trim().length < 2) return 'اسم العميل مطلوب ويجب ألا يقل عن حرفين';
  if (!SUPPORTED_CURRENCIES.includes(payload.currency)) return 'العملة غير مدعومة';
  if (Number(payload.openingBalance) < 0) return 'الرصيد الافتتاحي لا يمكن أن يكون سالباً';
  return null;
}

function toNum(value) {
  return Number(value ?? 0);
}

function convertSettlementToCustomerCurrency(currency, receivedSyp, receivedUsd, usdExchangeRate) {
  if (currency === 'USD') {
    return toNum(receivedUsd) + (usdExchangeRate > 0 ? (toNum(receivedSyp) / usdExchangeRate) : 0);
  }
  return toNum(receivedSyp) + (toNum(receivedUsd) * usdExchangeRate);
}

function resolveCashAccountByCurrency(currency) {
  const account = db.prepare('SELECT id, name, currency, is_active FROM cash_accounts WHERE currency = ? AND is_active = 1 ORDER BY id LIMIT 1').get(currency);
  if (!account) throw new Error(`لا يوجد حساب صندوق نشط للعملة ${currency}`);
  return account;
}

function getCustomerSummary(id) {
  const customer = db.prepare(`
    SELECT id, name, opening_balance, current_balance, currency
    FROM customers
    WHERE id = ?
  `).get(id);

  if (!customer) return null;

  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status != 'CANCELLED' THEN total_original ELSE 0 END), 0) AS total_sales,
      COALESCE(SUM(CASE WHEN status != 'CANCELLED' THEN received_original ELSE 0 END), 0) AS total_collections_from_invoices,
      COALESCE(SUM(CASE WHEN status != 'CANCELLED' THEN 1 ELSE 0 END), 0) AS invoice_count,
      MAX(invoice_date) AS last_transaction_date
    FROM sales_invoices
    WHERE customer_id = ?
  `).get(id);

  const standaloneCollections = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM customer_collections
    WHERE customer_id = ?
  `).get(id);

  const currentBalance = toNum(customer.current_balance);
  const totalCollections = toNum(totals?.total_collections_from_invoices) + toNum(standaloneCollections?.total);

  return {
    customer_id: customer.id,
    customer_name: customer.name,
    currency: customer.currency,
    opening_balance: toNum(customer.opening_balance),
    current_balance: currentBalance,
    total_sales: toNum(totals?.total_sales),
    total_collections_from_invoices: totalCollections,
    standalone_collections: toNum(standaloneCollections?.total),
    outstanding_from_sales: toNum(totals?.total_sales) - totalCollections,
    amount_receivable_from_customer: Math.max(currentBalance, 0),
    customer_credit_in_our_favor: Math.max(currentBalance * -1, 0),
    invoice_count: toNum(totals?.invoice_count),
    last_transaction_date: totals?.last_transaction_date || null
  };
}

function getCustomerCollections(id) {
  return db.prepare(`
    SELECT c.id, c.collection_date, c.amount, c.currency, c.reference, c.notes, c.balance_after,
           c.received_syp, c.received_usd, c.exchange_rate_used, c.total_settled_syp,
           u.full_name AS created_by_name
    FROM customer_collections c
    LEFT JOIN users u ON u.id = c.created_by_user_id
    WHERE c.customer_id = ?
    ORDER BY c.id DESC
  `).all(id);
}

function getCustomersAging(asOfDate) {
  const customers = db.prepare(`
    SELECT id, name, current_balance, opening_balance, currency, created_at, is_active
    FROM customers
    WHERE is_active = 1
    ORDER BY name
  `).all();

  const invoices = db.prepare(`
    SELECT customer_id, invoice_date, (total_original - received_original) AS remaining_original
    FROM sales_invoices
    WHERE status != 'CANCELLED'
      AND customer_id IS NOT NULL
      AND COALESCE(total_original - received_original, 0) > 0
  `).all();

  const collections = db.prepare(`
    SELECT customer_id, collection_date, amount
    FROM customer_collections
    WHERE COALESCE(amount, 0) > 0
  `).all();

  const invoiceCredits = db.prepare(`
    SELECT customer_id, invoice_date, ABS(total_original - received_original) AS credit_amount
    FROM sales_invoices
    WHERE status != 'CANCELLED'
      AND customer_id IS NOT NULL
      AND COALESCE(total_original - received_original, 0) < 0
  `).all();

  const invoiceMap = new Map();
  const collectionMap = new Map();

  for (const row of invoices) {
    if (!invoiceMap.has(row.customer_id)) invoiceMap.set(row.customer_id, []);
    invoiceMap.get(row.customer_id).push({
      type: 'INVOICE',
      date: row.invoice_date,
      amount: toNum(row.remaining_original)
    });
  }

  for (const row of collections) {
    if (!collectionMap.has(row.customer_id)) collectionMap.set(row.customer_id, []);
    collectionMap.get(row.customer_id).push({
      date: row.collection_date,
      amount: toNum(row.amount)
    });
  }

  for (const row of invoiceCredits) {
    if (!collectionMap.has(row.customer_id)) collectionMap.set(row.customer_id, []);
    collectionMap.get(row.customer_id).push({
      date: row.invoice_date,
      amount: toNum(row.credit_amount)
    });
  }

  const rows = customers.map((customer) => {
    const entries = [];
    if (toNum(customer.opening_balance) > 0) {
      entries.push({
        type: 'OPENING',
        date: String(customer.created_at || asOfDate).slice(0, 10),
        amount: toNum(customer.opening_balance)
      });
    }
    entries.push(...(invoiceMap.get(customer.id) || []));

    const aging = computeAgingFromEntries({
      entries,
      settlements: collectionMap.get(customer.id) || [],
      asOfDate
    });

    return {
      customer_id: customer.id,
      customer_name: customer.name,
      currency: customer.currency,
      current_balance: toNum(customer.current_balance),
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
    FROM customers
    ${q ? 'WHERE name LIKE ? OR COALESCE(phone,\'\') LIKE ?' : ''}
    ORDER BY id DESC
  `;

  const rows = q ? db.prepare(sql).all(`%${q}%`, `%${q}%`) : db.prepare(sql).all();
  return res.json({ success: true, data: rows });
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: 'معرف العميل غير صالح' });

  const row = db.prepare(`
    SELECT id, name, phone, address, opening_balance, current_balance, currency, notes, is_active, created_at, updated_at
    FROM customers WHERE id = ?
  `).get(id);

  if (!row) return res.status(404).json({ success: false, error: 'العميل غير موجود' });
  return res.json({ success: true, data: row });
});

router.get('/:id/summary', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: 'معرف العميل غير صالح' });

  const summary = getCustomerSummary(id);
  if (!summary) return res.status(404).json({ success: false, error: 'العميل غير موجود' });

  return res.json({ success: true, data: summary });
});

router.get('/:id/collections', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: 'معرف العميل غير صالح' });

  const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(id);
  if (!customer) return res.status(404).json({ success: false, error: 'العميل غير موجود' });

  return res.json({ success: true, data: getCustomerCollections(id) });
});

router.get('/reports/aging', (req, res) => {
  const asOfDate = req.query.asOfDate ? String(req.query.asOfDate) : new Date().toISOString().slice(0, 10);
  return res.json({ success: true, data: getCustomersAging(asOfDate) });
});

router.post('/:id/collections', requirePermission(PERMISSIONS.CUSTOMERS_COLLECT), (req, res) => {
  const customerId = Number(req.params.id);
  if (!customerId) return res.status(400).json({ success: false, error: 'معرف العميل غير صالح' });

  const payload = {
    date: req.body.date,
    receivedSyp: toNum(req.body.receivedSyp),
    receivedUsd: toNum(req.body.receivedUsd),
    reference: req.body.reference ? String(req.body.reference).trim() : null,
    notes: req.body.notes ? String(req.body.notes).trim() : null
  };

  if (!payload.date) return res.status(400).json({ success: false, error: 'تاريخ التحصيل مطلوب' });
  if (payload.receivedSyp < 0 || payload.receivedUsd < 0) {
    return res.status(400).json({ success: false, error: 'قيم التحصيل لا يمكن أن تكون سالبة' });
  }
  if (payload.receivedSyp <= 0 && payload.receivedUsd <= 0) {
    return res.status(400).json({ success: false, error: 'يجب إدخال مبلغ محصل بعملة واحدة على الأقل' });
  }

  const customer = db.prepare('SELECT id, name, current_balance, currency, is_active FROM customers WHERE id = ?').get(customerId);
  if (!customer || customer.is_active !== 1) {
    return res.status(400).json({ success: false, error: 'العميل غير موجود أو معطل' });
  }
  if (toNum(customer.current_balance) <= 0) {
    return res.status(400).json({ success: false, error: 'لا يوجد رصيد مستحق على هذا العميل لتحصيله' });
  }

  const usdExchangeRate = getRateForCurrency('USD');
  if (usdExchangeRate <= 0) {
    return res.status(400).json({ success: false, error: 'سعر الصرف النشط غير صالح' });
  }

  const totalSettledSyp = payload.receivedSyp + (payload.receivedUsd * usdExchangeRate);
  const totalSettledOriginal = convertSettlementToCustomerCurrency(
    customer.currency,
    payload.receivedSyp,
    payload.receivedUsd,
    usdExchangeRate
  );

  if (totalSettledOriginal > toNum(customer.current_balance)) {
    return res.status(400).json({ success: false, error: 'قيمة التحصيل أكبر من الرصيد المستحق على العميل' });
  }

  let sypCashAccount = null;
  let usdCashAccount = null;
  try {
    if (payload.receivedSyp > 0) sypCashAccount = resolveCashAccountByCurrency('SYP');
    if (payload.receivedUsd > 0) usdCashAccount = resolveCashAccountByCurrency('USD');
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }

  const balanceAfter = toNum(customer.current_balance) - totalSettledOriginal;

  const trx = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO customer_collections (
        customer_id, collection_date, amount, currency, cash_account_id,
        reference, notes, balance_after, created_by_user_id,
        received_syp, received_usd, exchange_rate_used, total_settled_syp,
        syp_cash_account_id, usd_cash_account_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      customerId,
      payload.date,
      totalSettledOriginal,
      customer.currency,
      sypCashAccount?.id || usdCashAccount?.id,
      payload.reference,
      payload.notes,
      balanceAfter,
      req.user.id,
      payload.receivedSyp,
      payload.receivedUsd,
      usdExchangeRate,
      totalSettledSyp,
      sypCashAccount?.id || null,
      usdCashAccount?.id || null
    );

    const collectionId = Number(result.lastInsertRowid);

    db.prepare('UPDATE customers SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(balanceAfter, customerId);

    if (payload.receivedSyp > 0 && sypCashAccount) {
      db.prepare(`
        INSERT INTO cash_movements (
          cash_account_id, movement_date, movement_type, direction,
          currency, original_amount, exchange_rate, base_amount,
          source_type, source_id, notes, created_by_user_id
        ) VALUES (?, ?, 'MANUAL_IN', 'IN', 'SYP', ?, 1, ?, 'MANUAL', ?, ?, ?)
      `).run(
        sypCashAccount.id,
        payload.date,
        payload.receivedSyp,
        payload.receivedSyp,
        collectionId,
        [customer.name, 'تحصيل SYP', payload.reference, payload.notes].filter(Boolean).join(' | '),
        req.user.id
      );
    }

    if (payload.receivedUsd > 0 && usdCashAccount) {
      db.prepare(`
        INSERT INTO cash_movements (
          cash_account_id, movement_date, movement_type, direction,
          currency, original_amount, exchange_rate, base_amount,
          source_type, source_id, notes, created_by_user_id
        ) VALUES (?, ?, 'MANUAL_IN', 'IN', 'USD', ?, ?, ?, 'MANUAL', ?, ?, ?)
      `).run(
        usdCashAccount.id,
        payload.date,
        payload.receivedUsd,
        usdExchangeRate,
        payload.receivedUsd * usdExchangeRate,
        collectionId,
        [customer.name, 'تحصيل USD', payload.reference, payload.notes].filter(Boolean).join(' | '),
        req.user.id
      );
    }

    writeAuditLog({
      userId: req.user.id,
      entityName: 'customer_collections',
      entityId: collectionId,
      action: 'CREATE',
      reason: 'CUSTOMER_COLLECTION'
    });

    return collectionId;
  });

  try {
    const id = trx();
    return res.status(201).json({ success: true, data: { id, balanceAfter } });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message || 'تعذر تسجيل تحصيل العميل' });
  }
});

router.post('/', requirePermission(PERMISSIONS.CUSTOMERS_CREATE), (req, res) => {
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
    INSERT INTO customers (name, phone, address, opening_balance, current_balance, currency, notes)
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

  writeAuditLog({ userId: req.user.id, entityName: 'customers', entityId: result.lastInsertRowid, action: 'CREATE' });
  return res.status(201).json({ success: true, data: { id: result.lastInsertRowid } });
});

router.patch('/:id', requirePermission(PERMISSIONS.CUSTOMERS_EDIT), (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: 'معرف العميل غير صالح' });

  const existing = db.prepare('SELECT id, opening_balance FROM customers WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ success: false, error: 'العميل غير موجود' });
  const before = db.prepare(`
    SELECT name, phone, address, opening_balance, current_balance, currency, notes, is_active
    FROM customers WHERE id = ?
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
    UPDATE customers
    SET name = ?, phone = ?, address = ?, opening_balance = ?, current_balance = current_balance + ?, currency = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(payload.name, payload.phone, payload.address, payload.openingBalance, delta, payload.currency, payload.notes, id);

  const after = db.prepare(`
    SELECT name, phone, address, opening_balance, current_balance, currency, notes, is_active
    FROM customers WHERE id = ?
  `).get(id);

  writeAuditLog({
    userId: req.user.id,
    entityName: 'customers',
    entityId: id,
    action: 'UPDATE',
    metadata: { before, after }
  });
  return res.json({ success: true });
});

export default router;
