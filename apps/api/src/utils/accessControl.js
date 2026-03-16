import {
  ALL_USER_ROLES,
  PERMISSION_DEFINITIONS,
  PERMISSIONS,
  USER_ROLES
} from '@paint-shop/shared';
import db from '../db.js';

export const GENERAL_SETTINGS_DEFINITIONS = [
  { key: 'COMPANY_NAME', label: 'اسم الشركة', valueType: 'STRING', defaultValue: 'متجر الدهانات' },
  { key: 'COMPANY_LOGO_URL', label: 'رابط الشعار', valueType: 'STRING', defaultValue: '' },
  { key: 'DEFAULT_CURRENCY', label: 'العملة الأساسية', valueType: 'STRING', defaultValue: 'SYP' },
  { key: 'LANGUAGE', label: 'اللغة', valueType: 'STRING', defaultValue: 'ar' },
  { key: 'DATE_FORMAT', label: 'تنسيق التاريخ', valueType: 'STRING', defaultValue: 'YYYY-MM-DD' },
  { key: 'INVOICE_HEADER_TEXT', label: 'رأس الفاتورة', valueType: 'STRING', defaultValue: 'أهلاً بكم في متجر الدهانات' },
  { key: 'INVOICE_FOOTER_TEXT', label: 'تذييل الفاتورة', valueType: 'STRING', defaultValue: 'شكراً لتعاملكم معنا' },
  { key: 'EXCHANGE_RATE_DEFAULT_MODE', label: 'وضع سعر الصرف الافتراضي', valueType: 'STRING', defaultValue: 'MANUAL' }
];

const allPermissionKeys = PERMISSION_DEFINITIONS.map((item) => item.key);

export const DEFAULT_ROLE_PERMISSIONS = {
  [USER_ROLES.SUPER_ADMIN]: allPermissionKeys,
  [USER_ROLES.OWNER]: allPermissionKeys,
  [USER_ROLES.ADMIN]: allPermissionKeys,
  [USER_ROLES.ACCOUNTANT]: [
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_COLLECT,
    PERMISSIONS.SUPPLIERS_VIEW,
    PERMISSIONS.SUPPLIERS_SETTLE,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.SALES_APPROVE,
    PERMISSIONS.PURCHASES_VIEW,
    PERMISSIONS.PURCHASES_APPROVE,
    PERMISSIONS.EXPENSES_VIEW,
    PERMISSIONS.EXPENSES_CREATE,
    PERMISSIONS.EXPENSES_EDIT,
    PERMISSIONS.EXPENSES_APPROVE,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.REPORTS_EXPORT,
    PERMISSIONS.EXCHANGE_RATE_VIEW,
    PERMISSIONS.CURRENCY_EXCHANGE_VIEW
  ],
  [USER_ROLES.CASHIER]: [
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_COLLECT,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.SALES_CREATE,
    PERMISSIONS.SALES_PRINT,
    PERMISSIONS.REPORTS_VIEW
  ],
  [USER_ROLES.SALES]: [
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_CREATE,
    PERMISSIONS.CUSTOMERS_EDIT,
    PERMISSIONS.CUSTOMERS_COLLECT,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.SALES_CREATE,
    PERMISSIONS.SALES_EDIT,
    PERMISSIONS.SALES_PRINT,
    PERMISSIONS.REPORTS_VIEW
  ],
  [USER_ROLES.PURCHASES]: [
    PERMISSIONS.SUPPLIERS_VIEW,
    PERMISSIONS.SUPPLIERS_CREATE,
    PERMISSIONS.SUPPLIERS_EDIT,
    PERMISSIONS.SUPPLIERS_SETTLE,
    PERMISSIONS.PURCHASES_VIEW,
    PERMISSIONS.PURCHASES_CREATE,
    PERMISSIONS.PURCHASES_EDIT,
    PERMISSIONS.PURCHASES_PRINT,
    PERMISSIONS.INVENTORY_VIEW
  ],
  [USER_ROLES.INVENTORY]: [
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_CREATE,
    PERMISSIONS.INVENTORY_EDIT,
    PERMISSIONS.REPORTS_VIEW
  ],
  [USER_ROLES.REPORTS]: [
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.REPORTS_PRINT,
    PERMISSIONS.REPORTS_EXPORT
  ]
};

export function getLegacyRoleForAccessRole(accessRole) {
  switch (accessRole) {
    case USER_ROLES.SUPER_ADMIN:
    case USER_ROLES.OWNER:
      return USER_ROLES.OWNER;
    case USER_ROLES.ADMIN:
      return USER_ROLES.ADMIN;
    case USER_ROLES.ACCOUNTANT:
      return USER_ROLES.ACCOUNTANT;
    default:
      return USER_ROLES.CASHIER;
  }
}

export function getEffectiveAccessRole(user) {
  return user?.access_role || user?.accessRole || user?.role || USER_ROLES.CASHIER;
}

export function ensureAccessControlData() {
  const insertPermission = db.prepare(`
    INSERT INTO permissions (permission_key, module_name, action_name, label)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(permission_key) DO UPDATE SET
      module_name = excluded.module_name,
      action_name = excluded.action_name,
      label = excluded.label
  `);

  const insertRolePermission = db.prepare(`
    INSERT OR IGNORE INTO role_permissions (role_key, permission_key, is_allowed)
    VALUES (?, ?, 1)
  `);

  const setAccessRole = db.prepare(`
    UPDATE users
    SET access_role = CASE
      WHEN access_role IS NOT NULL AND access_role != '' THEN access_role
      ELSE role
    END
    WHERE access_role IS NULL OR access_role = ''
  `);

  const upsertSetting = db.prepare(`
    INSERT INTO settings (key, value, value_type)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO NOTHING
  `);

  const seed = db.transaction(() => {
    setAccessRole.run();

    for (const permission of PERMISSION_DEFINITIONS) {
      insertPermission.run(permission.key, permission.module, permission.action, permission.label);
    }

    for (const roleKey of ALL_USER_ROLES) {
      const allowed = DEFAULT_ROLE_PERMISSIONS[roleKey] || [];
      for (const permissionKey of allowed) {
        insertRolePermission.run(roleKey, permissionKey);
      }
    }

    for (const setting of GENERAL_SETTINGS_DEFINITIONS) {
      upsertSetting.run(setting.key, setting.defaultValue, setting.valueType);
    }
  });

  seed();
}

export function getRolePermissions(roleKey) {
  if ([USER_ROLES.SUPER_ADMIN, USER_ROLES.OWNER, USER_ROLES.ADMIN].includes(roleKey)) {
    return [...allPermissionKeys];
  }

  return db.prepare(`
    SELECT permission_key
    FROM role_permissions
    WHERE role_key = ? AND is_allowed = 1
  `).all(roleKey).map((row) => row.permission_key);
}

export function getUserPermissionOverrides(userId) {
  return db.prepare(`
    SELECT permission_key, is_allowed
    FROM user_permission_overrides
    WHERE user_id = ?
  `).all(userId);
}

export function getEffectivePermissionsForUserId(userId) {
  const user = db.prepare(`
    SELECT id, role, access_role, is_active
    FROM users
    WHERE id = ?
  `).get(userId);

  if (!user || user.is_active !== 1) return [];

  const roleKey = getEffectiveAccessRole(user);
  const permissionSet = new Set(getRolePermissions(roleKey));
  const overrides = getUserPermissionOverrides(userId);

  for (const override of overrides) {
    if (Number(override.is_allowed) === 1) {
      permissionSet.add(override.permission_key);
    } else {
      permissionSet.delete(override.permission_key);
    }
  }

  return Array.from(permissionSet);
}

export function buildUserSession(user) {
  const accessRole = getEffectiveAccessRole(user);
  return {
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    role: accessRole,
    legacyRole: user.role,
    permissions: getEffectivePermissionsForUserId(user.id),
    lastLoginAt: user.last_login_at || null
  };
}

export function getGeneralSettingsMap() {
  const rows = db.prepare(`
    SELECT key, value
    FROM settings
    WHERE key IN (${GENERAL_SETTINGS_DEFINITIONS.map(() => '?').join(',')})
  `).all(...GENERAL_SETTINGS_DEFINITIONS.map((item) => item.key));

  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  return GENERAL_SETTINGS_DEFINITIONS.reduce((result, definition) => {
    result[definition.key] = values[definition.key] ?? definition.defaultValue;
    return result;
  }, {});
}
