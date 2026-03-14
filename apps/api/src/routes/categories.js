import express from 'express';
import { USER_ROLES } from '@paint-shop/shared';
import db from '../db.js';
import { authRequired, requireRoles } from '../middleware/auth.js';
import { writeAuditLog } from '../utils/audit.js';

const router = express.Router();
router.use(authRequired);

router.get('/', (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const sql = `
    SELECT id, name_ar, name_en, notes, is_active, created_at, updated_at
    FROM categories
    ${q ? 'WHERE name_ar LIKE ? OR COALESCE(name_en,\'\') LIKE ?' : ''}
    ORDER BY id DESC
  `;
  const rows = q
    ? db.prepare(sql).all(`%${q}%`, `%${q}%`)
    : db.prepare(sql).all();

  return res.json({ success: true, data: rows });
});

router.post('/', requireRoles(USER_ROLES.ADMIN), (req, res) => {
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

router.patch('/:id', requireRoles(USER_ROLES.ADMIN), (req, res) => {
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

router.patch('/:id/disable', requireRoles(USER_ROLES.ADMIN), (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: 'معرف التصنيف غير صالح' });

  db.prepare('UPDATE categories SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  writeAuditLog({ userId: req.user.id, entityName: 'categories', entityId: id, action: 'UPDATE', reason: 'DISABLE' });

  return res.json({ success: true });
});

export default router;
