import express from 'express';
import { USER_ROLES } from '@paint-shop/shared';
import db from '../db.js';
import { authRequired, requireRoles } from '../middleware/auth.js';
import { writeAuditLog } from '../utils/audit.js';

const router = express.Router();
router.use(authRequired);

function toNum(v) {
  return Number(v ?? 0);
}

function getAllowNegativeCash() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'ALLOW_NEGATIVE_CASH'").get();
  return String(row?.value || 'false').toLowerCase() === 'true';
}

function getAccount(accountId) {
  return db.prepare('SELECT id, name, currency, is_active FROM cash_accounts WHERE id = ?').get(accountId);
}

function getAccountBalance(accountId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN direction = 'IN' THEN original_amount ELSE -original_amount END), 0) AS balance
    FROM cash_movements
    WHERE cash_account_id = ?
  `).get(accountId);
  return toNum(row?.balance);
}

router.get('/accounts', (req, res) => {
  const accounts = db.prepare('SELECT id, name, currency, is_active FROM cash_accounts ORDER BY id').all();

  const data = accounts.map((acc) => ({
    ...acc,
    balance: getAccountBalance(acc.id)
  }));

  return res.json({ success: true, data });
});

router.get('/movements', (req, res) => {
  const accountId = req.query.accountId ? Number(req.query.accountId) : null;
  const from = req.query.from ? String(req.query.from) : null;
  const to = req.query.to ? String(req.query.to) : null;

  let sql = `
    SELECT m.*, a.name AS account_name
    FROM cash_movements m
    JOIN cash_accounts a ON a.id = m.cash_account_id
    WHERE 1=1
  `;
  const params = [];

  if (accountId) {
    sql += ' AND m.cash_account_id = ?';
    params.push(accountId);
  }
  if (from) {
    sql += ' AND m.movement_date >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND m.movement_date <= ?';
    params.push(to);
  }

  sql += ' ORDER BY m.id DESC LIMIT 500';

  const rows = db.prepare(sql).all(...params);
  return res.json({ success: true, data: rows });
});

router.post('/deposit', requireRoles(USER_ROLES.ADMIN), (req, res) => {
  const payload = {
    accountId: Number(req.body.accountId),
    amount: toNum(req.body.amount),
    date: req.body.date,
    notes: req.body.notes || null
  };

  if (!payload.accountId || !payload.date || payload.amount <= 0) {
    return res.status(400).json({ success: false, error: 'بيانات الإيداع غير صحيحة' });
  }

  const account = getAccount(payload.accountId);
  if (!account || account.is_active !== 1) {
    return res.status(400).json({ success: false, error: 'حساب الصندوق غير موجود أو غير نشط' });
  }

  const result = db.prepare(`
    INSERT INTO cash_movements (
      cash_account_id, movement_date, movement_type, direction,
      currency, original_amount, exchange_rate, base_amount,
      source_type, source_id, notes, created_by_user_id
    ) VALUES (?, ?, 'MANUAL_IN', 'IN', ?, ?, 1, ?, 'MANUAL', NULL, ?, ?)
  `).run(payload.accountId, payload.date, account.currency, payload.amount, payload.amount, payload.notes, req.user.id);

  writeAuditLog({ userId: req.user.id, entityName: 'cash_movements', entityId: result.lastInsertRowid, action: 'CREATE', reason: 'MANUAL_DEPOSIT' });
  return res.status(201).json({ success: true, data: { id: result.lastInsertRowid } });
});

router.post('/withdraw', requireRoles(USER_ROLES.ADMIN), (req, res) => {
  const payload = {
    accountId: Number(req.body.accountId),
    amount: toNum(req.body.amount),
    date: req.body.date,
    notes: req.body.notes || null
  };

  if (!payload.accountId || !payload.date || payload.amount <= 0) {
    return res.status(400).json({ success: false, error: 'بيانات السحب غير صحيحة' });
  }

  const account = getAccount(payload.accountId);
  if (!account || account.is_active !== 1) {
    return res.status(400).json({ success: false, error: 'حساب الصندوق غير موجود أو غير نشط' });
  }

  const currentBalance = getAccountBalance(payload.accountId);
  const allowNegative = getAllowNegativeCash();
  if (!allowNegative && currentBalance - payload.amount < 0) {
    return res.status(400).json({ success: false, error: 'لا يمكن السحب لأن الرصيد غير كافٍ' });
  }

  const result = db.prepare(`
    INSERT INTO cash_movements (
      cash_account_id, movement_date, movement_type, direction,
      currency, original_amount, exchange_rate, base_amount,
      source_type, source_id, notes, created_by_user_id
    ) VALUES (?, ?, 'MANUAL_OUT', 'OUT', ?, ?, 1, ?, 'MANUAL', NULL, ?, ?)
  `).run(payload.accountId, payload.date, account.currency, payload.amount, payload.amount, payload.notes, req.user.id);

  writeAuditLog({ userId: req.user.id, entityName: 'cash_movements', entityId: result.lastInsertRowid, action: 'CREATE', reason: 'MANUAL_WITHDRAW' });
  return res.status(201).json({ success: true, data: { id: result.lastInsertRowid } });
});

router.post('/opening-balance', requireRoles(USER_ROLES.ADMIN), (req, res) => {
  const payload = {
    accountId: Number(req.body.accountId),
    amount: toNum(req.body.amount),
    date: req.body.date,
    notes: req.body.notes || null
  };

  if (!payload.accountId || !payload.date || payload.amount < 0) {
    return res.status(400).json({ success: false, error: 'بيانات الرصيد الافتتاحي غير صحيحة' });
  }

  const account = getAccount(payload.accountId);
  if (!account || account.is_active !== 1) {
    return res.status(400).json({ success: false, error: 'حساب الصندوق غير موجود أو غير نشط' });
  }

  const result = db.prepare(`
    INSERT INTO cash_movements (
      cash_account_id, movement_date, movement_type, direction,
      currency, original_amount, exchange_rate, base_amount,
      source_type, source_id, notes, created_by_user_id
    ) VALUES (?, ?, 'OPENING_BALANCE', 'IN', ?, ?, 1, ?, 'MANUAL', NULL, ?, ?)
  `).run(payload.accountId, payload.date, account.currency, payload.amount, payload.amount, payload.notes, req.user.id);

  writeAuditLog({ userId: req.user.id, entityName: 'cash_movements', entityId: result.lastInsertRowid, action: 'CREATE', reason: 'OPENING_BALANCE' });
  return res.status(201).json({ success: true, data: { id: result.lastInsertRowid } });
});

router.post('/closing-balance', requireRoles(USER_ROLES.ADMIN), (req, res) => {
  const payload = {
    accountId: Number(req.body.accountId),
    countedAmount: toNum(req.body.countedAmount),
    date: req.body.date,
    notes: req.body.notes || null
  };

  if (!payload.accountId || !payload.date || payload.countedAmount < 0) {
    return res.status(400).json({ success: false, error: 'بيانات الإغلاق غير صحيحة' });
  }

  const account = getAccount(payload.accountId);
  if (!account || account.is_active !== 1) {
    return res.status(400).json({ success: false, error: 'حساب الصندوق غير موجود أو غير نشط' });
  }

  const bookBalance = getAccountBalance(payload.accountId);
  const delta = payload.countedAmount - bookBalance;

  if (delta === 0) {
    return res.json({ success: true, data: { message: 'لا يوجد فرق للإغلاق', bookBalance, countedAmount: payload.countedAmount } });
  }

  const allowNegative = getAllowNegativeCash();
  if (!allowNegative && delta < 0 && bookBalance + delta < 0) {
    return res.status(400).json({ success: false, error: 'لا يمكن تطبيق إغلاق ينتج عنه رصيد سالب' });
  }

  const direction = delta > 0 ? 'IN' : 'OUT';
  const amount = Math.abs(delta);

  const result = db.prepare(`
    INSERT INTO cash_movements (
      cash_account_id, movement_date, movement_type, direction,
      currency, original_amount, exchange_rate, base_amount,
      source_type, source_id, notes, created_by_user_id
    ) VALUES (?, ?, 'CLOSING_ADJUSTMENT', ?, ?, ?, 1, ?, 'MANUAL', NULL, ?, ?)
  `).run(payload.accountId, payload.date, direction, account.currency, amount, amount, payload.notes || 'تسوية رصيد الإغلاق', req.user.id);

  writeAuditLog({ userId: req.user.id, entityName: 'cash_movements', entityId: result.lastInsertRowid, action: 'CREATE', reason: 'CLOSING_BALANCE' });
  return res.status(201).json({ success: true, data: { id: result.lastInsertRowid, bookBalance, countedAmount: payload.countedAmount, delta } });
});

export default router;
