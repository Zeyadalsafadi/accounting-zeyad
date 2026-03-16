import express from 'express';
import { PERMISSIONS } from '@paint-shop/shared';
import db from '../db.js';
import { authRequired, requirePermission } from '../middleware/auth.js';
import { writeAuditLog } from '../utils/audit.js';

const router = express.Router();
router.use(authRequired);

function toNum(v) {
  return Number(v ?? 0);
}

function normalizeText(v) {
  return String(v ?? '').trim();
}

function getAllowNegativeCash() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'ALLOW_NEGATIVE_CASH'").get();
  return String(row?.value || 'false').toLowerCase() === 'true';
}

function getAccount(accountId) {
  return db.prepare('SELECT id, name, currency, is_active FROM cash_accounts WHERE id = ?').get(accountId);
}

function getAccountBalance(accountId, excludedMovementId = null) {
  const clauses = ['cash_account_id = ?'];
  const params = [accountId];

  if (excludedMovementId) {
    clauses.push('id != ?');
    params.push(excludedMovementId);
  }

  const row = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN direction = 'IN' THEN original_amount ELSE -original_amount END), 0) AS balance
    FROM cash_movements
    WHERE ${clauses.join(' AND ')}
  `).get(...params);
  return toNum(row?.balance);
}

function getDailySummary(accountId, date, excludedMovementId = null) {
  const openingRow = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN direction = 'IN' THEN original_amount ELSE -original_amount END), 0) AS amount
    FROM cash_movements
    WHERE cash_account_id = ?
      AND movement_date < ?
      ${excludedMovementId ? 'AND id != ?' : ''}
  `).get(...[accountId, date, ...(excludedMovementId ? [excludedMovementId] : [])]);

  const flowRow = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN direction = 'IN' THEN original_amount ELSE 0 END), 0) AS total_in,
      COALESCE(SUM(CASE WHEN direction = 'OUT' THEN original_amount ELSE 0 END), 0) AS total_out
    FROM cash_movements
    WHERE cash_account_id = ?
      AND movement_date = ?
      ${excludedMovementId ? 'AND id != ?' : ''}
  `).get(...[accountId, date, ...(excludedMovementId ? [excludedMovementId] : [])]);

  const openingBalance = toNum(openingRow?.amount);
  const totalIn = toNum(flowRow?.total_in);
  const totalOut = toNum(flowRow?.total_out);
  const expectedBalance = openingBalance + totalIn - totalOut;

  return {
    openingBalance,
    totalIn,
    totalOut,
    expectedBalance
  };
}

router.use(requirePermission(PERMISSIONS.SETTINGS_MANAGE));

router.get('/accounts', (_req, res) => {
  const accounts = db.prepare('SELECT id, name, currency, is_active FROM cash_accounts ORDER BY id').all();

  const data = accounts.map((acc) => ({
    ...acc,
    balance: getAccountBalance(acc.id)
  }));

  return res.json({ success: true, data });
});

router.post('/accounts', (req, res) => {
  const payload = {
    name: normalizeText(req.body.name),
    currency: String(req.body.currency || '').toUpperCase(),
    isActive: Number(req.body.isActive ?? 1) === 0 ? 0 : 1
  };

  if (!payload.name || !['SYP', 'USD'].includes(payload.currency)) {
    return res.status(400).json({ success: false, error: 'بيانات الصندوق غير صحيحة' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO cash_accounts (name, currency, is_active, created_at, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(payload.name, payload.currency, payload.isActive);

    const account = getAccount(result.lastInsertRowid);

    writeAuditLog({
      userId: req.user.id,
      entityName: 'cash_accounts',
      entityId: result.lastInsertRowid,
      action: 'CREATE',
      reason: 'CASH_ACCOUNT_CREATE',
      metadata: account
    });

    return res.status(201).json({
      success: true,
      data: {
        ...account,
        balance: 0
      }
    });
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE')) {
      return res.status(409).json({ success: false, error: 'اسم الصندوق مستخدم بالفعل' });
    }
    return res.status(500).json({ success: false, error: 'تعذر إضافة الصندوق' });
  }
});

router.patch('/accounts/:id/status', (req, res) => {
  const accountId = Number(req.params.id);
  const isActive = Number(req.body.isActive ?? 1) === 0 ? 0 : 1;

  if (!accountId) {
    return res.status(400).json({ success: false, error: 'الصندوق المطلوب غير صحيح' });
  }

  const account = getAccount(accountId);
  if (!account) {
    return res.status(404).json({ success: false, error: 'الصندوق غير موجود' });
  }

  db.prepare(`
    UPDATE cash_accounts
    SET is_active = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(isActive, accountId);

  const updatedAccount = getAccount(accountId);

  writeAuditLog({
    userId: req.user.id,
    entityName: 'cash_accounts',
    entityId: accountId,
    action: 'UPDATE',
    reason: isActive ? 'CASH_ACCOUNT_ACTIVATE' : 'CASH_ACCOUNT_DEACTIVATE',
    metadata: updatedAccount
  });

  return res.json({
    success: true,
    data: {
      ...updatedAccount,
      balance: getAccountBalance(accountId)
    }
  });
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

router.get('/daily-summary', (req, res) => {
  const accountId = req.query.accountId ? Number(req.query.accountId) : null;
  const date = req.query.date ? String(req.query.date) : null;

  if (!accountId || !date) {
    return res.status(400).json({ success: false, error: 'الحساب والتاريخ مطلوبان' });
  }

  const account = getAccount(accountId);
  if (!account || account.is_active !== 1) {
    return res.status(400).json({ success: false, error: 'حساب الصندوق غير موجود أو غير نشط' });
  }

  const existingClosing = db.prepare(`
    SELECT c.*, u.full_name AS closed_by_name
    FROM cash_daily_closings c
    LEFT JOIN users u ON u.id = c.closed_by_user_id
    WHERE c.cash_account_id = ? AND c.closing_date = ?
  `).get(accountId, date);

  const summary = getDailySummary(accountId, date, existingClosing?.adjustment_movement_id || null);

  return res.json({
    success: true,
    data: {
      account,
      date,
      ...summary,
      currentBalance: getAccountBalance(accountId, existingClosing?.adjustment_movement_id || null),
      existingClosing: existingClosing || null
    }
  });
});

router.get('/closing-history', (req, res) => {
  const accountId = req.query.accountId ? Number(req.query.accountId) : null;
  const from = req.query.from ? String(req.query.from) : null;
  const to = req.query.to ? String(req.query.to) : null;

  let sql = `
    SELECT c.*, a.name AS account_name, a.currency, u.full_name AS closed_by_name
    FROM cash_daily_closings c
    JOIN cash_accounts a ON a.id = c.cash_account_id
    LEFT JOIN users u ON u.id = c.closed_by_user_id
    WHERE 1=1
  `;
  const params = [];

  if (accountId) {
    sql += ' AND c.cash_account_id = ?';
    params.push(accountId);
  }
  if (from) {
    sql += ' AND c.closing_date >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND c.closing_date <= ?';
    params.push(to);
  }

  sql += ' ORDER BY c.closing_date DESC, c.id DESC LIMIT 200';

  return res.json({ success: true, data: db.prepare(sql).all(...params) });
});

router.post('/deposit', (req, res) => {
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

router.post('/withdraw', (req, res) => {
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

router.post('/opening-balance', (req, res) => {
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

router.post('/closing-balance', (req, res) => {
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

  const allowNegative = getAllowNegativeCash();

  const result = db.transaction(() => {
    const existingClosing = db.prepare(`
      SELECT *
      FROM cash_daily_closings
      WHERE cash_account_id = ? AND closing_date = ?
    `).get(payload.accountId, payload.date);

    const summary = getDailySummary(payload.accountId, payload.date, existingClosing?.adjustment_movement_id || null);
    const delta = payload.countedAmount - summary.expectedBalance;

    if (!allowNegative && payload.countedAmount < 0) {
      throw new Error('لا يمكن تطبيق إغلاق ينتج عنه رصيد سالب');
    }

    if (existingClosing?.adjustment_movement_id) {
      db.prepare('DELETE FROM cash_movements WHERE id = ?').run(existingClosing.adjustment_movement_id);
    }

    let adjustmentMovementId = null;
    if (delta !== 0) {
      const direction = delta > 0 ? 'IN' : 'OUT';
      const amount = Math.abs(delta);
      const adjustmentResult = db.prepare(`
        INSERT INTO cash_movements (
          cash_account_id, movement_date, movement_type, direction,
          currency, original_amount, exchange_rate, base_amount,
          source_type, source_id, notes, created_by_user_id
        ) VALUES (?, ?, 'CLOSING_ADJUSTMENT', ?, ?, ?, 1, ?, 'MANUAL', NULL, ?, ?)
      `).run(
        payload.accountId,
        payload.date,
        direction,
        account.currency,
        amount,
        amount,
        payload.notes || 'تسوية رصيد الإغلاق',
        req.user.id
      );
      adjustmentMovementId = adjustmentResult.lastInsertRowid;
    }

    db.prepare(`
      INSERT INTO cash_daily_closings (
        cash_account_id, closing_date, opening_balance, total_in, total_out,
        expected_balance, counted_amount, variance, adjustment_movement_id,
        notes, closed_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(cash_account_id, closing_date) DO UPDATE SET
        opening_balance = excluded.opening_balance,
        total_in = excluded.total_in,
        total_out = excluded.total_out,
        expected_balance = excluded.expected_balance,
        counted_amount = excluded.counted_amount,
        variance = excluded.variance,
        adjustment_movement_id = excluded.adjustment_movement_id,
        notes = excluded.notes,
        closed_by_user_id = excluded.closed_by_user_id,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      payload.accountId,
      payload.date,
      summary.openingBalance,
      summary.totalIn,
      summary.totalOut,
      summary.expectedBalance,
      payload.countedAmount,
      delta,
      adjustmentMovementId,
      payload.notes,
      req.user.id
    );

    return {
      accountId: payload.accountId,
      date: payload.date,
      openingBalance: summary.openingBalance,
      totalIn: summary.totalIn,
      totalOut: summary.totalOut,
      expectedBalance: summary.expectedBalance,
      countedAmount: payload.countedAmount,
      delta,
      adjustmentMovementId
    };
  })();

  writeAuditLog({
    userId: req.user.id,
    entityName: 'cash_daily_closings',
    action: 'CREATE',
    reason: `${payload.accountId}:${payload.date}`,
    metadata: result
  });

  return res.status(201).json({ success: true, data: result });
});

export default router;
