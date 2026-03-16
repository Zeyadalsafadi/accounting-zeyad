import express from 'express';
import { PERMISSIONS, SUPPORTED_CURRENCIES } from '@paint-shop/shared';
import db from '../db.js';
import { authRequired, requirePermission } from '../middleware/auth.js';
import { writeAuditLog } from '../utils/audit.js';
import { getRateForCurrency } from '../utils/exchangeRate.js';

const router = express.Router();
router.use(authRequired);
const TRANSACTION_LOCK_HOURS = 24;

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

function canOverrideApproved(req) {
  return Array.isArray(req.user?.permissions) && req.user.permissions.includes(PERMISSIONS.EXPENSES_OVERRIDE_LOCK);
}

function isOutsideLockWindow(value) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return false;
  return ((Date.now() - timestamp) / (1000 * 60 * 60)) > TRANSACTION_LOCK_HOURS;
}

router.get('/', (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const from = req.query.from ? String(req.query.from) : null;
  const to = req.query.to ? String(req.query.to) : null;

  let sql = `
    SELECT e.id, e.expense_date, e.expense_category, e.original_amount, e.currency, e.exchange_rate,
           e.base_amount, e.beneficiary, e.notes, e.status, e.approval_status, e.updated_at,
           e.created_at, e.approved_at, a.name AS cash_account_name, u.full_name AS approved_by_name
    FROM expenses e
    LEFT JOIN cash_accounts a ON a.id = e.paid_from_cash_account_id
    LEFT JOIN users u ON u.id = e.approved_by_user_id
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
        paid_from_cash_account_id, beneficiary, notes, created_by_user_id, approval_status
      ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      req.user.id,
      'DRAFT'
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
  if (existing.approval_status === 'APPROVED' && !canOverrideApproved(req)) {
    return res.status(400).json({ success: false, error: 'لا يمكن تعديل مصروف معتمد بدون صلاحية تجاوز' });
  }
  if (!canOverrideApproved(req) && isOutsideLockWindow(existing.created_at || existing.expense_date)) {
    return res.status(400).json({ success: false, error: 'انتهت نافذة تعديل المصروف' });
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
    const before = db.prepare(`
      SELECT expense_date, expense_category, currency, original_amount, exchange_rate, base_amount, beneficiary, notes, approval_status, status
      FROM expenses WHERE id = ?
    `).get(id);
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

    const after = db.prepare(`
      SELECT expense_date, expense_category, currency, original_amount, exchange_rate, base_amount, beneficiary, notes, approval_status, status
      FROM expenses WHERE id = ?
    `).get(id);
    writeAuditLog({ userId: req.user.id, entityName: 'expenses', entityId: id, action: 'UPDATE', metadata: { before, after } });
  });

  try {
    trx();
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message || 'فشل تعديل المصروف' });
  }
});

router.post('/:id/cancel', requirePermission(PERMISSIONS.EXPENSES_DELETE), (req, res) => {
  const id = Number(req.params.id);
  const reason = String(req.body.reason || '').trim();

  if (!id) return res.status(400).json({ success: false, error: 'معرف المصروف غير صالح' });
  if (!reason) return res.status(400).json({ success: false, error: 'سبب الإلغاء مطلوب' });

  const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ success: false, error: 'المصروف غير موجود' });
  if (existing.status === 'CANCELLED') {
    return res.status(400).json({ success: false, error: 'المصروف ملغى مسبقاً' });
  }
  if (existing.approval_status === 'APPROVED' && !canOverrideApproved(req)) {
    return res.status(400).json({ success: false, error: 'لا يمكن إلغاء مصروف معتمد بدون صلاحية تجاوز' });
  }
  if (!canOverrideApproved(req) && isOutsideLockWindow(existing.created_at || existing.expense_date)) {
    return res.status(400).json({ success: false, error: 'انتهت نافذة إلغاء المصروف' });
  }

  const trx = db.transaction(() => {
    const movements = db.prepare(`
      SELECT *
      FROM cash_movements
      WHERE source_type = 'EXPENSE' AND source_id = ?
      ORDER BY id ASC
    `).all(id);

    for (const movement of movements) {
      db.prepare(`
        INSERT INTO cash_movements (
          cash_account_id, movement_date, movement_type, direction,
          currency, original_amount, exchange_rate, base_amount,
          source_type, source_id, notes, created_by_user_id
        ) VALUES (?, DATE('now'), ?, ?, ?, ?, ?, ?, 'EXPENSE', ?, ?, ?)
      `).run(
        movement.cash_account_id,
        movement.direction === 'IN' ? 'REFUND_OUT' : 'REFUND_IN',
        movement.direction === 'IN' ? 'OUT' : 'IN',
        movement.currency,
        movement.original_amount,
        movement.exchange_rate,
        movement.base_amount,
        id,
        `${reason} | عكس حركة مصروف ${id}`,
        req.user.id
      );
    }

    db.prepare(`
      UPDATE expenses
      SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);

    writeAuditLog({ userId: req.user.id, entityName: 'expenses', entityId: id, action: 'CANCEL', reason });
  });

  try {
    trx();
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message || 'فشل إلغاء المصروف' });
  }
});

router.post('/:id/approve', requirePermission(PERMISSIONS.EXPENSES_APPROVE), (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: 'معرف المصروف غير صالح' });

  const expense = db.prepare('SELECT id, status, approval_status FROM expenses WHERE id = ?').get(id);
  if (!expense) return res.status(404).json({ success: false, error: 'المصروف غير موجود' });
  if (expense.status === 'CANCELLED') {
    return res.status(400).json({ success: false, error: 'لا يمكن اعتماد مصروف ملغى' });
  }
  if (expense.approval_status === 'APPROVED') {
    return res.status(400).json({ success: false, error: 'المصروف معتمد مسبقاً' });
  }

  db.prepare(`
    UPDATE expenses
    SET approval_status = 'APPROVED', approved_at = CURRENT_TIMESTAMP, approved_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(req.user.id, id);

  writeAuditLog({ userId: req.user.id, entityName: 'expenses', entityId: id, action: 'APPROVE' });
  return res.json({ success: true });
});

router.post('/:id/unapprove', requirePermission(PERMISSIONS.EXPENSES_APPROVE), (req, res) => {
  const id = Number(req.params.id);
  const reason = String(req.body.reason || '').trim();
  if (!id) return res.status(400).json({ success: false, error: 'معرف المصروف غير صالح' });
  if (!reason) return res.status(400).json({ success: false, error: 'سبب إلغاء الاعتماد مطلوب' });
  if (!canOverrideApproved(req)) {
    return res.status(403).json({ success: false, error: 'لا توجد صلاحية لإلغاء اعتماد المصروف' });
  }

  const expense = db.prepare('SELECT id, status, approval_status FROM expenses WHERE id = ?').get(id);
  if (!expense) return res.status(404).json({ success: false, error: 'المصروف غير موجود' });
  if (expense.status === 'CANCELLED') {
    return res.status(400).json({ success: false, error: 'لا يمكن إلغاء اعتماد مصروف ملغى' });
  }
  if (expense.approval_status !== 'APPROVED') {
    return res.status(400).json({ success: false, error: 'المصروف ليس معتمداً' });
  }

  db.prepare(`
    UPDATE expenses
    SET approval_status = 'DRAFT', approved_at = NULL, approved_by_user_id = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);

  writeAuditLog({ userId: req.user.id, entityName: 'expenses', entityId: id, action: 'UNAPPROVE', reason });
  return res.json({ success: true });
});

export default router;
