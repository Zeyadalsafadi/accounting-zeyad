import express from 'express';
import { PERMISSIONS } from '@paint-shop/shared';
import db from '../db.js';
import { authRequired, requirePermission } from '../middleware/auth.js';
import { writeAuditLog } from '../utils/audit.js';

const router = express.Router();
router.use(authRequired);

router.get('/', (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const status = (req.query.status || 'all').toString().trim().toLowerCase();
  if (!['active', 'inactive', 'all'].includes(status)) {
    return res.status(400).json({ success: false, error: 'قيمة الحالة غير صالحة' });
  }

  const where = [];
  const params = [];

  if (status === 'active') where.push('is_active = 1');
  if (status === 'inactive') where.push('is_active = 0');
  if (q) {
    where.push('(name_ar LIKE ? OR COALESCE(name_en,\'\') LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  const sql = `
    SELECT id, name_ar, name_en, notes, is_active, created_at, updated_at
    FROM categories
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY id DESC
  `;
  const rows = db.prepare(sql).all(...params);

  return res.json({ success: true, data: rows });
});

router.post('/', requirePermission(PERMISSIONS.INVENTORY_CREATE), (req, res) => {
  const { name, nameEn = null, notes = null } = req.body;
  if (!name || String(name).trim().length < 2) {
    return res.status(400).json({ success: false, error: 'اسم التصنيف مطلوب ويجب ألا يقل عن حرفين' });
  }

  const exists = db.prepare('SELECT id FROM categories WHERE name_ar = ?').get(String(name).trim());
  if (exists) return res.status(409).json({ success: false, error: 'اسم التصنيف موجود مسبقاً' });

  const result = db
    .prepare('INSERT INTO categories (name_ar, name_en, notes) VALUES (?, ?, ?)')
    .run(String(name).trim(), nameEn || null, notes || null);

  writeAuditLog({ userId: req.user.id, entityName: 'categories', entityId: result.lastInsertRowid, action: 'CREATE' });
  return res.status(201).json({ success: true, data: { id: result.lastInsertRowid } });
});

router.patch('/:id', requirePermission(PERMISSIONS.INVENTORY_EDIT), (req, res) => {
  const id = Number(req.params.id);
  const { name, nameEn = null, notes = null } = req.body;

  if (!id) return res.status(400).json({ success: false, error: 'معرف التصنيف غير صالح' });
  if (!name || String(name).trim().length < 2) {
    return res.status(400).json({ success: false, error: 'اسم التصنيف مطلوب ويجب ألا يقل عن حرفين' });
  }

  const exists = db.prepare('SELECT id FROM categories WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ success: false, error: 'التصنيف غير موجود' });

  db.prepare('UPDATE categories SET name_ar = ?, name_en = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(String(name).trim(), nameEn || null, notes || null, id);

  writeAuditLog({ userId: req.user.id, entityName: 'categories', entityId: id, action: 'UPDATE' });
  return res.json({ success: true });
});

router.patch('/:id/disable', requirePermission(PERMISSIONS.INVENTORY_DELETE), (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: 'معرف التصنيف غير صالح' });

  const exists = db.prepare('SELECT id FROM categories WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ success: false, error: 'التصنيف غير موجود' });

  db.prepare('UPDATE categories SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  writeAuditLog({ userId: req.user.id, entityName: 'categories', entityId: id, action: 'UPDATE', reason: 'DISABLE' });

  const updated = db.prepare('SELECT id, name_ar, name_en, notes, is_active, created_at, updated_at FROM categories WHERE id = ?').get(id);
  return res.json({ success: true, data: updated });
});

router.patch('/:id/reactivate', requirePermission(PERMISSIONS.INVENTORY_EDIT), (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: 'معرف التصنيف غير صالح' });

  const exists = db.prepare('SELECT id FROM categories WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ success: false, error: 'التصنيف غير موجود' });

  db.prepare('UPDATE categories SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  writeAuditLog({ userId: req.user.id, entityName: 'categories', entityId: id, action: 'UPDATE', reason: 'REACTIVATE' });

  const updated = db.prepare('SELECT id, name_ar, name_en, notes, is_active, created_at, updated_at FROM categories WHERE id = ?').get(id);
  return res.json({ success: true, data: updated });
});

export default router;
