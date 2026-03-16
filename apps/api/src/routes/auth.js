import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db.js';
import { env } from '../config/env.js';
import { writeAuditLog } from '../utils/audit.js';
import { authRequired } from '../middleware/auth.js';
import { buildUserSession } from '../utils/accessControl.js';
import { getLicenseState } from '../utils/license.js';

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'اسم المستخدم وكلمة المرور مطلوبان' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ success: false, error: 'بيانات الدخول غير صحيحة' });
  }

  db.prepare(`
    UPDATE users
    SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(user.id);

  const refreshedUser = db.prepare(`
    SELECT id, username, full_name, role, access_role, is_active, last_login_at
    FROM users
    WHERE id = ?
  `).get(user.id);

  const token = jwt.sign({ id: user.id }, env.jwtSecret, { expiresIn: '12h' });

  writeAuditLog({
    userId: user.id,
    entityName: 'users',
    entityId: user.id,
    action: 'LOGIN',
    metadata: { username: user.username, role: user.role }
  });

  return res.json({
    success: true,
    data: {
      token,
      user: buildUserSession(refreshedUser),
      license: getLicenseState()
    }
  });
});

router.get('/me', authRequired, (req, res) => {
  const user = db.prepare(`
    SELECT id, username, full_name, role, is_active
    FROM users
    WHERE id = ?
  `).get(req.user.id);

  if (!user || user.is_active !== 1) {
    return res.status(401).json({ success: false, error: 'المستخدم غير نشط' });
  }

  return res.json({
    success: true,
    data: {
      user: buildUserSession(user),
      license: req.license || getLicenseState()
    }
  });
});

export default router;
