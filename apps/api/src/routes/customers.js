import express from 'express';
import { SUPPORTED_CURRENCIES, USER_ROLES } from '@paint-shop/shared';
import db from '../db.js';
import { authRequired, requireRoles } from '../middleware/auth.js';
import { writeAuditLog } from '../utils/audit.js';

const router = express.Router();
router.use(authRequired);

function validatePayload(payload) {
  if (!payload.name || payload.name.trim().length < 2) return 'اسم العميل مطلوب ويجب ألا يقل عن حرفين';
  if (!SUPPORTED_CURRENCIES.includes(payload.currency)) return 'العملة غير مدعومة';
  if (Number(payload.openingBalance) < 0) return 'الرصيد الافتتاحي لا يمكن أن يكون سالباً';
  return null;
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

router.post('/', requireRoles(USER_ROLES.ADMIN), (req, res) => {
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

router.patch('/:id', requireRoles(USER_ROLES.ADMIN), (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: 'معرف العميل غير صالح' });

  const existing = db.prepare('SELECT id, opening_balance FROM customers WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ success: false, error: 'العميل غير موجود' });

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

  writeAuditLog({ userId: req.user.id, entityName: 'customers', entityId: id, action: 'UPDATE' });
  return res.json({ success: true });
});

export default router;
