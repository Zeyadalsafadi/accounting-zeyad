import express from 'express';
import {
  ALL_USER_ROLES,
  PERMISSION_DEFINITIONS,
  PERMISSIONS,
  USER_ROLES
} from '@paint-shop/shared';
import db from '../db.js';
import { authRequired, requirePermission } from '../middleware/auth.js';
import { writeAuditLog } from '../utils/audit.js';
import {
  DEFAULT_ROLE_PERMISSIONS,
  GENERAL_SETTINGS_DEFINITIONS,
  getGeneralSettingsMap
} from '../utils/accessControl.js';
import {
  archiveCurrentOperationalState,
  carryForwardOpeningBalances,
  getArchiveMetadata,
  getYearEndCounts,
  listYearEndArchives,
  listYearOpeningRuns,
  resetOperationalData,
  restoreOperationalArchive,
  validateYearEndConfirmation,
  YEAR_END_CONFIRMATION_PHRASE,
  YEAR_END_MODE_CARRY_FORWARD,
  YEAR_END_MODE_FULL_RESET
} from '../utils/yearEnd.js';

const router = express.Router();
const YEAR_END_ALLOWED_ROLES = [USER_ROLES.SUPER_ADMIN, USER_ROLES.OWNER, USER_ROLES.ADMIN];

router.use(authRequired);
router.use(requirePermission(PERMISSIONS.SETTINGS_VIEW));

router.get('/general', (_req, res) => {
  return res.json({
    success: true,
    data: {
      definitions: GENERAL_SETTINGS_DEFINITIONS,
      values: getGeneralSettingsMap()
    }
  });
});

router.patch('/general', requirePermission(PERMISSIONS.SETTINGS_MANAGE), (req, res) => {
  const updates = req.body.values || {};
  const validKeys = new Map(GENERAL_SETTINGS_DEFINITIONS.map((item) => [item.key, item]));

  const trx = db.transaction(() => {
    const stmt = db.prepare(`
      INSERT INTO settings (key, value, value_type, updated_by_user_id, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        value_type = excluded.value_type,
        updated_by_user_id = excluded.updated_by_user_id,
        updated_at = CURRENT_TIMESTAMP
    `);

    for (const [key, value] of Object.entries(updates)) {
      const definition = validKeys.get(key);
      if (!definition) continue;
      stmt.run(key, String(value ?? ''), definition.valueType, req.user.id);
    }
  });

  trx();

  writeAuditLog({
    userId: req.user.id,
    entityName: 'settings',
    action: 'UPDATE',
    metadata: { keys: Object.keys(updates) }
  });

  return res.json({ success: true, data: getGeneralSettingsMap() });
});

router.get('/roles', (_req, res) => {
  const permissionGroups = PERMISSION_DEFINITIONS.reduce((groups, item) => {
    if (!groups[item.module]) groups[item.module] = [];
    groups[item.module].push(item);
    return groups;
  }, {});

  const rows = db.prepare(`
    SELECT role_key, permission_key, is_allowed
    FROM role_permissions
    WHERE is_allowed = 1
  `).all();

  const allowedMap = rows.reduce((map, row) => {
    if (!map[row.role_key]) map[row.role_key] = [];
    map[row.role_key].push(row.permission_key);
    return map;
  }, {});

  const roles = ALL_USER_ROLES.map((roleKey) => ({
    roleKey,
    permissions: allowedMap[roleKey] || DEFAULT_ROLE_PERMISSIONS[roleKey] || []
  }));

  return res.json({
    success: true,
    data: {
      roles,
      permissionGroups
    }
  });
});

router.patch('/roles/:roleKey', requirePermission(PERMISSIONS.SETTINGS_MANAGE), (req, res) => {
  const roleKey = String(req.params.roleKey || '');
  const permissions = Array.isArray(req.body.permissions) ? req.body.permissions : [];

  if (!ALL_USER_ROLES.includes(roleKey)) {
    return res.status(400).json({ success: false, error: 'الدور غير صالح' });
  }

  const valid = new Set(PERMISSION_DEFINITIONS.map((item) => item.key));
  for (const permissionKey of permissions) {
    if (!valid.has(permissionKey)) {
      return res.status(400).json({ success: false, error: `الصلاحية ${permissionKey} غير معروفة` });
    }
  }

  const trx = db.transaction(() => {
    db.prepare('DELETE FROM role_permissions WHERE role_key = ?').run(roleKey);
    const stmt = db.prepare(`
      INSERT INTO role_permissions (role_key, permission_key, is_allowed)
      VALUES (?, ?, 1)
    `);

    for (const permissionKey of permissions) {
      stmt.run(roleKey, permissionKey);
    }
  });

  trx();

  writeAuditLog({
    userId: req.user.id,
    entityName: 'roles',
    action: 'UPDATE',
    reason: roleKey,
    metadata: { permissionsCount: permissions.length }
  });

  return res.json({ success: true });
});

router.get('/audit', requirePermission(PERMISSIONS.SETTINGS_VIEW), (_req, res) => {
  const logs = db.prepare(`
    SELECT a.id, a.event_time, a.entity_name, a.entity_id, a.action, a.reason, a.metadata_json,
           u.full_name AS user_name
    FROM audit_logs a
    LEFT JOIN users u ON u.id = a.user_id
    ORDER BY a.id DESC
    LIMIT 100
  `).all();

  return res.json({ success: true, data: logs });
});

router.get('/year-end', requirePermission(PERMISSIONS.SETTINGS_YEAR_END), (req, res) => {
  return res.json({
    success: true,
    data: {
      allowedRoles: YEAR_END_ALLOWED_ROLES,
      confirmationPhrase: YEAR_END_CONFIRMATION_PHRASE,
      supportedModes: [
        {
          key: YEAR_END_MODE_FULL_RESET,
          label: 'Archive + Full Operational Reset',
          available: true
        },
        {
          key: YEAR_END_MODE_CARRY_FORWARD,
          label: 'Archive + Carry Forward Opening Balances',
          available: true
        }
      ],
      currentCounts: getYearEndCounts(),
      archives: listYearEndArchives(),
      carryForwardRuns: listYearOpeningRuns()
    }
  });
});

router.post('/year-end/archive-reset', requirePermission(PERMISSIONS.SETTINGS_YEAR_END), (req, res) => {
  const mode = String(req.body.mode || YEAR_END_MODE_FULL_RESET);
  const confirmationPhrase = req.body.confirmationPhrase;
  const password = req.body.password;

  if (mode !== YEAR_END_MODE_FULL_RESET) {
    return res.status(400).json({ success: false, error: 'النمط المطلوب غير مدعوم حالياً' });
  }

  const confirmationError = validateYearEndConfirmation({
    phrase: confirmationPhrase,
    password,
    userId: req.user.id,
    allowedRoles: YEAR_END_ALLOWED_ROLES,
    accessRole: req.user.role
  });

  if (confirmationError) {
    return res.status(403).json({ success: false, error: confirmationError });
  }

  try {
    const archive = archiveCurrentOperationalState({
      userId: req.user.id,
      username: req.user.username,
      mode
    });

    const postResetCounts = resetOperationalData();

    writeAuditLog({
      userId: req.user.id,
      entityName: 'year_end',
      action: 'ARCHIVE_RESET',
      reason: mode,
      metadata: {
        archiveId: archive.archiveId,
        archiveDbPath: archive.archiveDbPath,
        postResetCounts
      }
    });

    return res.json({
      success: true,
      data: {
        archive,
        mode,
        postResetCounts,
        preserved: ['users', 'settings', 'permissions', 'role_permissions', 'user_permission_overrides', 'schema_migrations']
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || 'تعذر تنفيذ الأرشفة وإعادة الضبط' });
  }
});

router.post('/year-end/archive-reset-carry-forward', requirePermission(PERMISSIONS.SETTINGS_YEAR_END), (req, res) => {
  const confirmationPhrase = req.body.confirmationPhrase;
  const password = req.body.password;
  const targetYear = req.body.targetYear ? String(req.body.targetYear) : '';
  const sourceYearInput = req.body.sourceYear ? String(req.body.sourceYear) : '';
  const mode = YEAR_END_MODE_CARRY_FORWARD;

  if (!targetYear) {
    return res.status(400).json({ success: false, error: 'السنة الهدف مطلوبة' });
  }

  const confirmationError = validateYearEndConfirmation({
    phrase: confirmationPhrase,
    password,
    userId: req.user.id,
    allowedRoles: YEAR_END_ALLOWED_ROLES,
    accessRole: req.user.role
  });

  if (confirmationError) {
    return res.status(403).json({ success: false, error: confirmationError });
  }

  try {
    const archive = archiveCurrentOperationalState({
      userId: req.user.id,
      username: req.user.username,
      mode
    });

    const postResetCounts = resetOperationalData();
    const sourceYear = sourceYearInput || archive.createdAt?.slice(0, 4) || '';
    const carried = carryForwardOpeningBalances({
      archiveId: archive.archiveId,
      sourceYear,
      targetYear,
      executedByUserId: req.user.id
    });

    writeAuditLog({
      userId: req.user.id,
      entityName: 'year_end',
      action: 'ARCHIVE_RESET_CARRY_FORWARD',
      reason: `${sourceYear}->${targetYear}`,
      metadata: {
        archiveId: archive.archiveId,
        archiveDbPath: archive.archiveDbPath,
        postResetCounts,
        carried
      }
    });

    return res.json({
      success: true,
      data: {
        archive,
        mode,
        sourceYear,
        targetYear,
        postResetCounts,
        carried,
        preserved: ['users', 'settings', 'permissions', 'role_permissions', 'user_permission_overrides', 'schema_migrations']
      }
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message || 'تعذر تنفيذ أرشفة السنة وترحيل الافتتاحيات' });
  }
});

router.post('/year-end/restore', requirePermission(PERMISSIONS.SETTINGS_YEAR_END), (req, res) => {
  const archiveId = String(req.body.archiveId || '');
  const confirmationPhrase = req.body.confirmationPhrase;
  const password = req.body.password;

  if (!archiveId) {
    return res.status(400).json({ success: false, error: 'معرّف الأرشيف مطلوب' });
  }

  const confirmationError = validateYearEndConfirmation({
    phrase: confirmationPhrase,
    password,
    userId: req.user.id,
    allowedRoles: YEAR_END_ALLOWED_ROLES,
    accessRole: req.user.role
  });

  if (confirmationError) {
    return res.status(403).json({ success: false, error: confirmationError });
  }

  try {
    const restored = restoreOperationalArchive({ archiveId });

    writeAuditLog({
      userId: req.user.id,
      entityName: 'year_end',
      action: 'RESTORE_ARCHIVE',
      reason: archiveId,
      metadata: restored
    });

    return res.json({ success: true, data: restored });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message || 'تعذر استعادة الأرشيف' });
  }
});

router.post('/year-end/carry-forward', requirePermission(PERMISSIONS.SETTINGS_YEAR_END), (req, res) => {
  const archiveId = String(req.body.archiveId || '');
  const sourceYear = req.body.sourceYear ? String(req.body.sourceYear) : '';
  const targetYear = req.body.targetYear ? String(req.body.targetYear) : '';
  const confirmationPhrase = req.body.confirmationPhrase;
  const password = req.body.password;

  if (!archiveId) {
    return res.status(400).json({ success: false, error: 'معرّف الأرشيف مطلوب' });
  }

  const confirmationError = validateYearEndConfirmation({
    phrase: confirmationPhrase,
    password,
    userId: req.user.id,
    allowedRoles: YEAR_END_ALLOWED_ROLES,
    accessRole: req.user.role
  });

  if (confirmationError) {
    return res.status(403).json({ success: false, error: confirmationError });
  }

  try {
    const resolvedSourceYear = sourceYear || getArchiveMetadata(archiveId).createdAt?.slice(0, 4) || '';
    const carried = carryForwardOpeningBalances({
      archiveId,
      sourceYear: resolvedSourceYear,
      targetYear,
      executedByUserId: req.user.id
    });

    writeAuditLog({
      userId: req.user.id,
      entityName: 'year_end',
      action: 'CARRY_FORWARD',
      reason: `${resolvedSourceYear}->${targetYear}`,
      metadata: carried
    });

    return res.json({ success: true, data: carried });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message || 'تعذر ترحيل الأرصدة الافتتاحية' });
  }
});

export default router;
