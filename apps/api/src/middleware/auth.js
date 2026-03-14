import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import db from '../db.js';
import { buildUserSession } from '../utils/accessControl.js';

export function authRequired(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'غير مصرح' });
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, env.jwtSecret);
    const user = db.prepare(`
      SELECT id, username, full_name, role, access_role, is_active, last_login_at
      FROM users
      WHERE id = ?
    `).get(decoded.id);

    if (!user || user.is_active !== 1) {
      return res.status(401).json({ success: false, error: 'المستخدم غير نشط أو غير موجود' });
    }

    req.user = buildUserSession(user);
    return next();
  } catch {
    return res.status(401).json({ success: false, error: 'رمز دخول غير صالح' });
  }
}

export function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user?.role) {
      return res.status(401).json({ success: false, error: 'غير مصرح' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'ليس لديك صلاحية لهذه العملية' });
    }

    return next();
  };
}

export function requirePermission(...permissionKeys) {
  return (req, res, next) => {
    if (!req.user?.permissions) {
      return res.status(401).json({ success: false, error: 'غير مصرح' });
    }

    const hasAny = permissionKeys.some((permissionKey) => req.user.permissions.includes(permissionKey));
    if (!hasAny) {
      return res.status(403).json({ success: false, error: 'ليس لديك صلاحية لهذه العملية' });
    }

    return next();
  };
}
