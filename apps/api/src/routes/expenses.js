import express from 'express';
import { PERMISSIONS, SUPPORTED_CURRENCIES } from '@paint-shop/shared';
import db from '../db.js';
import { authRequired, requirePermission } from '../middleware/auth.js';
import { writeAuditLog } from '../utils/audit.js';
import { getRateForCurrency } from '../utils/exchangeRate.js';

const router = express.Router();
router.use(authRequired);

function toNum(v) {
  return Number(v ?? 0);
}

function validatePayload(payload) {
  if (!payload.expenseDate) return 'تاريخ المصروف مطلوب';
  if (!payload.type || payload.type.trim().length < 2) return 'نوع المصروف مطلوب';
  if (toNum(payload.amount) <= 0) return 'قيمة المصروف يجب أن تكون أكبر من صفر';
  if (!SUPPORTED_CURRENCIES.includes(payload.currency)) return 'العملة غير مدعومة';
  if (getRateForCurrency(payload.currency) <= 0) return 'سعر الصرف النشط غير صالح';
  return null;
}

function resolveCashAccountByCurrency(currency) {
  const account = db.prepare('SELECT id, currency, is_active FROM cash_accounts WHERE currency = ? AND is_active = 1 ORDER BY id LIMIT 1').get(currency);
  if (!account) {
    throw new Error(`لا يوجد حساب صندوق نشط للعملة ${currency}`);
  }
  return account;
}

router.get('/', (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const from = req.query.from ? String(req.query.from) : null;
  const to = req.query.to ? String(req.query.to) : null;

  let sql = `
    SELECT e.id, e.expense_date, e.expense_category, e.original_amount, e.currency, e.exchange_rate,
           e.base_amount, e.beneficiary, e.notes, e.status, e.updated_at,
           a.name AS cash_account_name
    FROM expenses e
    LEFT JOIN cash_accounts a ON a.id = e.paid_from_cash_account_id
    WHERE 1=1
  `;
  const params = [];

  if (q) {
    sql += ' AND (e.expense_category LIKE ? OR COALESCE(e.beneficiary,\'\') LIKE ? OR COALESCE(e.notes,\'\') LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (from) {
    sql += ' AND e.expense_date >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND e.expense_date <= ?';
    params.push(to);
  }

  sql += ' ORDER BY e.id DESC';

  const rows = db.prepare(sql).all(...params);
  return res.json({ success: true, data: rows });
});

router.post('/', requirePermission(PERMISSIONS.EXPENSES_CREATE), (req, res) => {
  const payload = {
    expenseDate: req.body.expenseDate,
    type: String(req.body.type || '').trim(),
    amount: toNum(req.body.amount),
    currency: req.body.currency,
    exchangeRate: getRateForCurrency(req.body.currency),
    beneficiary: req.body.beneficiary || null,
    notes: req.body.notes || null
  };

  const validationError = validatePayload(payload);
  if (validationError) return res.status(400).json({ success: false, error: validationError });

  let cashAccount;
  try {
    cashAccount = resolveCashAccountByCurrency(payload.currency);
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }

  const baseAmount = payload.amount * payload.exchangeRate;

  const trx = db.transaction(() => {
    const expResult = db.prepare(`
      INSERT INTO expenses (
        expense_date, expense_category, description, currency,
        original_amount, exchange_rate, base_amount,
        paid_from_cash_account_id, beneficiary, notes, created_by_user_id
      ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.expenseDate,
      payload.type,
      payload.currency,
      payload.amount,
      payload.exchangeRate,
      baseAmount,
      cashAccount.id,
      payload.beneficiary,
      payload.notes,
      req.user.id
    );

    const expenseId = expResult.lastInsertRowid;

    db.prepare(`
      INSERT INTO cash_movements (
        cash_account_id, movement_date, movement_type, direction,
        currency, original_amount, exchange_rate, base_amount,
        source_type, source_id, notes, created_by_user_id
      ) VALUES (?, ?, 'EXPENSE_PAYMENT', 'OUT', ?, ?, ?, ?, 'EXPENSE', ?, ?, ?)
    `).run(
      cashAccount.id,
      payload.expenseDate,
      payload.currency,
      payload.amount,
      payload.exchangeRate,
      baseAmount,
      expenseId,
      payload.notes || payload.type,
      req.user.id
    );

    writeAuditLog({ userId: req.user.id, entityName: 'expenses', entityId: expenseId, action: 'CREATE' });
    return expenseId;
  });

  try {
    const id = trx();
    return res.status(201).json({ success: true, data: { id } });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message || 'فشل إنشاء المصروف' });
  }
});

router.patch('/:id', requirePermission(PERMISSIONS.EXPENSES_EDIT), (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: 'معرف المصروف غير صالح' });

  const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ success: false, error: 'المصروف غير موجود' });
  if (existing.status === 'CANCELLED') {
    return res.status(400).json({ success: false, error: 'لا يمكن تعديل مصروف ملغى' });
  }

  const payload = {
    expenseDate: req.body.expenseDate,
    type: String(req.body.type || '').trim(),
    amount: toNum(req.body.amount),
    currency: req.body.currency,
    exchangeRate: getRateForCurrency(req.body.currency),
    beneficiary: req.body.beneficiary || null,
    notes: req.body.notes || null
  };

  const validationError = validatePayload(payload);
  if (validationError) return res.status(400).json({ success: false, error: validationError });

  let cashAccount;
  try {
    cashAccount = resolveCashAccountByCurrency(payload.currency);
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }

  const newBaseAmount = payload.amount * payload.exchangeRate;

  const trx = db.transaction(() => {
    const oldMovement = db.prepare(`
      SELECT * FROM cash_movements
      WHERE source_type = 'EXPENSE' AND source_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(id);

    if (oldMovement) {
      db.prepare(`
        INSERT INTO cash_movements (
          cash_account_id, movement_date, movement_type, direction,
          currency, original_amount, exchange_rate, base_amount,
          source_type, source_id, notes, created_by_user_id
        ) VALUES (?, DATE('now'), 'REFUND_IN', 'IN', ?, ?, ?, ?, 'EXPENSE', ?, ?, ?)
      `).run(
        oldMovement.cash_account_id,
        oldMovement.currency,
        oldMovement.original_amount,
        oldMovement.exchange_rate,
        oldMovement.base_amount,
        id,
        `عكس تعديل مصروف رقم ${id}`,
        req.user.id
      );
    }

    db.prepare(`
      UPDATE expenses
      SET expense_date = ?, expense_category = ?, currency = ?,
          original_amount = ?, exchange_rate = ?, base_amount = ?,
          paid_from_cash_account_id = ?, beneficiary = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      payload.expenseDate,
      payload.type,
      payload.currency,
      payload.amount,
      payload.exchangeRate,
      newBaseAmount,
      cashAccount.id,
      payload.beneficiary,
      payload.notes,
      id
    );

    db.prepare(`
      INSERT INTO cash_movements (
        cash_account_id, movement_date, movement_type, direction,
        currency, original_amount, exchange_rate, base_amount,
        source_type, source_id, notes, created_by_user_id
      ) VALUES (?, ?, 'EXPENSE_PAYMENT', 'OUT', ?, ?, ?, ?, 'EXPENSE', ?, ?, ?)
    `).run(
      cashAccount.id,
      payload.expenseDate,
      payload.currency,
      payload.amount,
      payload.exchangeRate,
      newBaseAmount,
      id,
      payload.notes || payload.type,
      req.user.id
    );

    writeAuditLog({ userId: req.user.id, entityName: 'expenses', entityId: id, action: 'UPDATE' });
  });

  try {
    trx();
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message || 'فشل تعديل المصروف' });
  }
});

export default router;
