import express from 'express';
import bcrypt from 'bcryptjs';
import {
  ALL_USER_ROLES,
  PERMISSION_DEFINITIONS,
  PERMISSIONS
} from '@paint-shop/shared';
import db from '../db.js';
import { authRequired, requirePermission } from '../middleware/auth.js';
import { writeAuditLog } from '../utils/audit.js';
import {
  buildUserSession,
  getEffectivePermissionsForUserId,
  getLegacyRoleForAccessRole,
  getUserPermissionOverrides
} from '../utils/accessControl.js';

const router = express.Router();

router.use(authRequired);

function normalizeText(value) {
  const text = String(value || '').trim();
  return text.length > 0 ? text : null;
}

function validateUserPayload(payload, isCreate = false) {
  if (!payload.username || payload.username.length < 3) return 'اسم المستخدم يجب أن لا يقل عن 3 أحرف';
  if (!payload.fullName || payload.fullName.length < 2) return 'الاسم الكامل مطلوب';
  if (!ALL_USER_ROLES.includes(payload.accessRole)) return 'الدور المحدد غير صالح';
  if (payload.email && !payload.email.includes('@')) return 'البريد الإلكتروني غير صالح';
  if (isCreate && (!payload.password || payload.password.length < 6)) return 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
  if (payload.password && payload.password.length < 6) return 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
  return null;
}

function listUsers() {
  return db.prepare(`
    SELECT id, username, full_name, role, access_role, is_active, phone, email, notes, created_at, last_login_at
    FROM users
    ORDER BY id DESC
  `).all().map((user) => ({
    ...buildUserSession(user),
    isActive: Number(user.is_active) === 1,
    phone: user.phone || '',
    email: user.email || '',
    notes: user.notes || '',
    createdAt: user.created_at,
    legacyRole: user.role
  }));
}

router.get('/me/access', requirePermission(PERMISSIONS.SETTINGS_VIEW, PERMISSIONS.USERS_VIEW), (req, res) => {
  return res.json({
    success: true,
    data: {
      user: req.user,
      permissions: PERMISSION_DEFINITIONS
    }
  });
});

router.get('/', requirePermission(PERMISSIONS.USERS_VIEW), (_req, res) => {
  return res.json({ success: true, data: listUsers() });
});

router.post('/', requirePermission(PERMISSIONS.USERS_CREATE), (req, res) => {
  const payload = {
    username: normalizeText(req.body.username),
    password: String(req.body.password || ''),
    fullName: normalizeText(req.body.fullName),
    accessRole: req.body.accessRole,
    phone: normalizeText(req.body.phone),
    email: normalizeText(req.body.email),
    notes: normalizeText(req.body.notes),
    isActive: req.body.isActive === false ? 0 : 1
  };

  const validationError = validateUserPayload(payload, true);
  if (validationError) return res.status(400).json({ success: false, error: validationError });

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(payload.username);
  if (existing) return res.status(409).json({ success: false, error: 'اسم المستخدم مستخدم بالفعل' });

  const hash = bcrypt.hashSync(payload.password, 10);
  const result = db.prepare(`
    INSERT INTO users (
      username, password_hash, full_name, role, access_role, is_active, phone, email, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    payload.username,
    hash,
    payload.fullName,
    getLegacyRoleForAccessRole(payload.accessRole),
    payload.accessRole,
    payload.isActive,
    payload.phone,
    payload.email,
    payload.notes
  );

  writeAuditLog({
    userId: req.user.id,
    entityName: 'users',
    entityId: result.lastInsertRowid,
    action: 'CREATE',
    metadata: { username: payload.username, role: payload.accessRole }
  });

  return res.status(201).json({ success: true, data: { id: result.lastInsertRowid } });
});

router.patch('/:id', requirePermission(PERMISSIONS.USERS_EDIT), (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: 'معرف المستخدم غير صالح' });

  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });

  const payload = {
    username: normalizeText(req.body.username),
    password: normalizeText(req.body.password),
    fullName: normalizeText(req.body.fullName),
    accessRole: req.body.accessRole,
    phone: normalizeText(req.body.phone),
    email: normalizeText(req.body.email),
    notes: normalizeText(req.body.notes),
    isActive: req.body.isActive === false ? 0 : 1
  };

  const validationError = validateUserPayload(payload, false);
  if (validationError) return res.status(400).json({ success: false, error: validationError });

  const duplicate = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(payload.username, id);
  if (duplicate) return res.status(409).json({ success: false, error: 'اسم المستخدم مستخدم بالفعل' });

  if (Number(req.user.id) === id && payload.isActive !== 1) {
    return res.status(400).json({ success: false, error: 'لا يمكن تعطيل المستخدم الحالي' });
  }

  db.prepare(`
    UPDATE users
    SET username = ?, full_name = ?, role = ?, access_role = ?, is_active = ?, phone = ?, email = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    payload.username,
    payload.fullName,
    getLegacyRoleForAccessRole(payload.accessRole),
    payload.accessRole,
    payload.isActive,
    payload.phone,
    payload.email,
    payload.notes,
    id
  );

  if (payload.password) {
    db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(bcrypt.hashSync(payload.password, 10), id);
  }

  writeAuditLog({
    userId: req.user.id,
    entityName: 'users',
    entityId: id,
    action: 'UPDATE',
    metadata: { username: payload.username, role: payload.accessRole, isActive: payload.isActive }
  });

  return res.json({ success: true });
});

router.post('/:id/reset-password', requirePermission(PERMISSIONS.USERS_RESET_PASSWORD), (req, res) => {
  const id = Number(req.params.id);
  const password = String(req.body.password || '');

  if (!id) return res.status(400).json({ success: false, error: 'معرف المستخدم غير صالح' });
  if (password.length < 6) return res.status(400).json({ success: false, error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });

  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });

  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(bcrypt.hashSync(password, 10), id);

  writeAuditLog({
    userId: req.user.id,
    entityName: 'users',
    entityId: id,
    action: 'UPDATE',
    reason: 'PASSWORD_RESET'
  });

  return res.json({ success: true });
});

router.get('/:id/permissions', requirePermission(PERMISSIONS.USERS_VIEW), (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: 'معرف المستخدم غير صالح' });

  const user = db.prepare(`
    SELECT id, username, full_name, role, access_role, is_active, last_login_at
    FROM users
    WHERE id = ?
  `).get(id);

  if (!user) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });

  return res.json({
    success: true,
    data: {
      user: buildUserSession(user),
      effectivePermissions: getEffectivePermissionsForUserId(id),
      overrides: getUserPermissionOverrides(id).map((item) => ({
        permissionKey: item.permission_key,
        isAllowed: Number(item.is_allowed) === 1
      }))
    }
  });
});

router.patch('/:id/permissions', requirePermission(PERMISSIONS.USERS_EDIT), (req, res) => {
  const id = Number(req.params.id);
  const overrides = Array.isArray(req.body.overrides) ? req.body.overrides : [];

  if (!id) return res.status(400).json({ success: false, error: 'معرف المستخدم غير صالح' });
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });

  const validPermissions = new Set(PERMISSION_DEFINITIONS.map((item) => item.key));

  const applyOverrides = db.transaction(() => {
    db.prepare('DELETE FROM user_permission_overrides WHERE user_id = ?').run(id);

    const stmt = db.prepare(`
      INSERT INTO user_permission_overrides (user_id, permission_key, is_allowed, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `);

    for (const item of overrides) {
      if (!validPermissions.has(item.permissionKey)) {
        throw new Error(`الصلاحية ${item.permissionKey} غير معروفة`);
      }
      if (item.mode === 'default') continue;
      stmt.run(id, item.permissionKey, item.mode === 'allow' ? 1 : 0);
    }
  });

  try {
    applyOverrides();
    writeAuditLog({
      userId: req.user.id,
      entityName: 'users',
      entityId: id,
      action: 'UPDATE',
      metadata: { overridesCount: overrides.length }
    });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message || 'تعذر حفظ صلاحيات المستخدم' });
  }
});

router.get('/roles/catalog/all', requirePermission(PERMISSIONS.SETTINGS_VIEW), (_req, res) => {
  return res.json({ success: true, data: { roles: ALL_USER_ROLES, permissions: PERMISSION_DEFINITIONS } });
});

export default router;
