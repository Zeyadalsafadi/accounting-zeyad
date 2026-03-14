import express from 'express';
import { PERMISSIONS } from '@paint-shop/shared';
import db from '../db.js';
import { authRequired, requirePermission } from '../middleware/auth.js';
import { writeAuditLog } from '../utils/audit.js';
import { getExchangeRateConfig } from '../utils/exchangeRate.js';

const router = express.Router();
router.use(authRequired);

function toNum(value) {
  return Number(value ?? 0);
}

function getAllowNegativeCash() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'ALLOW_NEGATIVE_CASH'").get();
  return String(row?.value || 'false').toLowerCase() === 'true';
}

function getCashAccountByCurrency(currency) {
  const account = db.prepare(`
    SELECT id, name, currency, is_active
    FROM cash_accounts
    WHERE currency = ? AND is_active = 1
    ORDER BY id
    LIMIT 1
  `).get(currency);

  if (!account) {
    throw new Error(`لا يوجد حساب صندوق نشط للعملة ${currency}`);
  }

  return account;
}

function getAccountBalance(accountId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN direction = 'IN' THEN original_amount ELSE -original_amount END), 0) AS balance
    FROM cash_movements
    WHERE cash_account_id = ?
  `).get(accountId);
  return toNum(row?.balance);
}

function validatePayload(payload) {
  if (!['BUY_USD', 'SELL_USD'].includes(payload.type)) return 'نوع العملية غير صالح';
  if (!payload.date) return 'تاريخ العملية مطلوب';
  if (payload.usdAmount <= 0) return 'قيمة الدولار يجب أن تكون أكبر من صفر';
  if (payload.exchangeRate <= 0) return 'سعر الصرف يجب أن يكون أكبر من صفر';
  if (payload.sypAmount <= 0) return 'القيمة المكافئة بالليرة غير صالحة';
  return null;
}

function buildCashMovementNote(payload) {
  const directionLabel = payload.type === 'BUY_USD' ? 'شراء دولار' : 'بيع دولار';
  return [directionLabel, payload.counterparty, payload.notes].filter(Boolean).join(' | ');
}

router.get('/', (req, res) => {
  const from = req.query.from ? String(req.query.from) : null;
  const to = req.query.to ? String(req.query.to) : null;
  const type = req.query.type ? String(req.query.type) : null;

  let sql = `
    SELECT t.*, u.full_name AS created_by_name
    FROM currency_exchange_transactions t
    LEFT JOIN users u ON u.id = t.created_by_user_id
    WHERE 1=1
  `;
  const params = [];

  if (from) {
    sql += ' AND t.exchange_date >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND t.exchange_date <= ?';
    params.push(to);
  }
  if (type && ['BUY_USD', 'SELL_USD'].includes(type)) {
    sql += ' AND t.transaction_type = ?';
    params.push(type);
  }

  sql += ' ORDER BY t.id DESC';

  const transactions = db.prepare(sql).all(...params);
  const summary = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN transaction_type = 'BUY_USD' THEN usd_amount ELSE 0 END), 0) AS total_usd_bought,
      COALESCE(SUM(CASE WHEN transaction_type = 'SELL_USD' THEN usd_amount ELSE 0 END), 0) AS total_usd_sold,
      COALESCE(SUM(CASE WHEN transaction_type = 'BUY_USD' THEN usd_amount ELSE -usd_amount END), 0) AS net_usd_movement,
      COALESCE(SUM(CASE WHEN exchange_date = DATE('now') THEN usd_amount ELSE 0 END), 0) AS today_usd_activity
    FROM currency_exchange_transactions
  `).get();

  return res.json({
    success: true,
    data: {
      transactions,
      summary: {
        ...summary,
        active_rate: Number(getExchangeRateConfig().activeRate || 0)
      }
    }
  });
});

router.post('/', requirePermission(PERMISSIONS.CURRENCY_EXCHANGE_CREATE), (req, res) => {
  const payload = {
    type: req.body.type,
    date: req.body.date,
    usdAmount: toNum(req.body.usdAmount),
    exchangeRate: toNum(req.body.exchangeRate),
    sypAmount: toNum(req.body.usdAmount) * toNum(req.body.exchangeRate),
    counterparty: req.body.counterparty ? String(req.body.counterparty).trim() : null,
    notes: req.body.notes ? String(req.body.notes).trim() : null
  };

  const validationError = validatePayload(payload);
  if (validationError) {
    return res.status(400).json({ success: false, error: validationError });
  }

  let sypAccount;
  let usdAccount;
  try {
    sypAccount = getCashAccountByCurrency('SYP');
    usdAccount = getCashAccountByCurrency('USD');
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }

  const allowNegative = getAllowNegativeCash();
  const outgoingAccount = payload.type === 'BUY_USD' ? sypAccount : usdAccount;
  const outgoingAmount = payload.type === 'BUY_USD' ? payload.sypAmount : payload.usdAmount;
  const currentBalance = getAccountBalance(outgoingAccount.id);

  if (!allowNegative && currentBalance - outgoingAmount < 0) {
    return res.status(400).json({ success: false, error: `الرصيد غير كافٍ في صندوق ${outgoingAccount.name}` });
  }

  const movementNote = buildCashMovementNote(payload);

  const trx = db.transaction(() => {
    const insertResult = db.prepare(`
      INSERT INTO currency_exchange_transactions (
        exchange_date, transaction_type, usd_amount, exchange_rate, syp_amount,
        counterparty_name, notes, syp_cash_account_id, usd_cash_account_id, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.date,
      payload.type,
      payload.usdAmount,
      payload.exchangeRate,
      payload.sypAmount,
      payload.counterparty,
      payload.notes,
      sypAccount.id,
      usdAccount.id,
      req.user.id
    );

    const exchangeId = Number(insertResult.lastInsertRowid);

    if (payload.type === 'BUY_USD') {
      db.prepare(`
        INSERT INTO cash_movements (
          cash_account_id, movement_date, movement_type, direction,
          currency, original_amount, exchange_rate, base_amount,
          source_type, source_id, notes, created_by_user_id
        ) VALUES (?, ?, 'MANUAL_OUT', 'OUT', 'SYP', ?, 1, ?, 'MANUAL', ?, ?, ?)
      `).run(sypAccount.id, payload.date, payload.sypAmount, payload.sypAmount, exchangeId, movementNote, req.user.id);

      db.prepare(`
        INSERT INTO cash_movements (
          cash_account_id, movement_date, movement_type, direction,
          currency, original_amount, exchange_rate, base_amount,
          source_type, source_id, notes, created_by_user_id
        ) VALUES (?, ?, 'MANUAL_IN', 'IN', 'USD', ?, ?, ?, 'MANUAL', ?, ?, ?)
      `).run(usdAccount.id, payload.date, payload.usdAmount, payload.exchangeRate, payload.sypAmount, exchangeId, movementNote, req.user.id);
    } else {
      db.prepare(`
        INSERT INTO cash_movements (
          cash_account_id, movement_date, movement_type, direction,
          currency, original_amount, exchange_rate, base_amount,
          source_type, source_id, notes, created_by_user_id
        ) VALUES (?, ?, 'MANUAL_OUT', 'OUT', 'USD', ?, ?, ?, 'MANUAL', ?, ?, ?)
      `).run(usdAccount.id, payload.date, payload.usdAmount, payload.exchangeRate, payload.sypAmount, exchangeId, movementNote, req.user.id);

      db.prepare(`
        INSERT INTO cash_movements (
          cash_account_id, movement_date, movement_type, direction,
          currency, original_amount, exchange_rate, base_amount,
          source_type, source_id, notes, created_by_user_id
        ) VALUES (?, ?, 'MANUAL_IN', 'IN', 'SYP', ?, 1, ?, 'MANUAL', ?, ?, ?)
      `).run(sypAccount.id, payload.date, payload.sypAmount, payload.sypAmount, exchangeId, movementNote, req.user.id);
    }

    writeAuditLog({
      userId: req.user.id,
      entityName: 'currency_exchange_transactions',
      entityId: exchangeId,
      action: 'CREATE',
      reason: payload.type
    });

    return exchangeId;
  });

  try {
    const id = trx();
    return res.status(201).json({ success: true, data: { id } });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message || 'تعذر حفظ عملية الصرف' });
  }
});

export default router;
