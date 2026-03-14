import express from 'express';
import bcrypt from 'bcryptjs';
import { USER_ROLES } from '@paint-shop/shared';
import db from '../db.js';
import { authRequired, requireRoles } from '../middleware/auth.js';
import { writeAuditLog } from '../utils/audit.js';

const router = express.Router();

router.use(authRequired);
router.use(requireRoles(USER_ROLES.ADMIN));

router.get('/', (_req, res) => {
  const users = db.prepare(`
    SELECT id, username, full_name, role, is_active, created_at
    FROM users
    ORDER BY id DESC
  `).all();

  return res.json({ success: true, data: users });
});

router.post('/', (req, res) => {
  const { username, password, fullName, role } = req.body;

  if (!username || !password || !fullName || !role) {
    return res.status(400).json({ success: false, error: 'جميع الحقول مطلوبة' });
  }

  if (![USER_ROLES.ADMIN, USER_ROLES.CASHIER].includes(role)) {
    return res.status(400).json({ success: false, error: 'الدور يجب أن يكون مدير أو كاشير' });
  }

  if (String(password).length < 6) {
    return res.status(400).json({ success: false, error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ success: false, error: 'اسم المستخدم مستخدم بالفعل' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare('INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)')
    .run(username, hash, fullName, role);

  writeAuditLog({
    userId: req.user.id,
    entityName: 'users',
    entityId: result.lastInsertRowid,
    action: 'CREATE',
    metadata: { username, role }
  });

  return res.status(201).json({ success: true, data: { id: result.lastInsertRowid } });
});

export default router;
