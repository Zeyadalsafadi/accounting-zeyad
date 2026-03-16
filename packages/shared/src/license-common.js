export const LICENSE_PREFIX = 'PSL1';
export const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const LICENSE_MODULE_OPTIONS = [
  { value: 'sales', label: 'Sales' },
  { value: 'purchases', label: 'Purchases' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'customers', label: 'Customers' },
  { value: 'suppliers', label: 'Suppliers' },
  { value: 'reports', label: 'Reports' },
  { value: 'cash-management', label: 'Cash Management' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'exchange-rate', label: 'Exchange Rate' },
  { value: 'currency-exchange', label: 'Currency Exchange' },
  { value: 'settings', label: 'Settings' }
];

export const DEFAULT_PLAN_TEMPLATES = [
  {
    code: 'STANDARD',
    name: 'Standard',
    defaultGraceDays: 7,
    maxDevices: 1,
    enabledModules: [
      'sales',
      'purchases',
      'inventory',
      'customers',
      'suppliers',
      'reports',
      'cash-management',
      'exchange-rate',
      'currency-exchange',
      'settings'
    ]
  },
  {
    code: 'PRO',
    name: 'Pro',
    defaultGraceDays: 10,
    maxDevices: 2,
    enabledModules: [
      'sales',
      'purchases',
      'inventory',
      'customers',
      'suppliers',
      'reports',
      'cash-management',
      'expenses',
      'exchange-rate',
      'currency-exchange',
      'settings'
    ]
  },
  {
    code: 'ENTERPRISE',
    name: 'Enterprise',
    defaultGraceDays: 14,
    maxDevices: 5,
    enabledModules: LICENSE_MODULE_OPTIONS.map((item) => item.value)
  }
];

export function normalizePublicKey(value) {
  return String(value || '').replace(/\\n/g, '\n').trim();
}

export function normalizeIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function normalizeEnabledModules(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean)
  )];
}

function normalizeObject(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeObject(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .reduce((accumulator, key) => {
      const normalizedValue = normalizeObject(value[key]);
      if (normalizedValue !== undefined) {
        accumulator[key] = normalizedValue;
      }
      return accumulator;
    }, {});
}

export function normalizeLicensePayload(rawPayload, { defaultIssuedAt = null } = {}) {
  const graceDaysValue = Number(rawPayload?.graceDays ?? 0);
  const graceDays = Number.isFinite(graceDaysValue) && graceDaysValue > 0
    ? Math.floor(graceDaysValue)
    : 0;
  const maxDevicesValue = Number(rawPayload?.maxDevices);
  const maxDevices = Number.isFinite(maxDevicesValue) && maxDevicesValue > 0
    ? Math.floor(maxDevicesValue)
    : null;

  const issuedAt = normalizeIsoDate(rawPayload?.issuedAt) || normalizeIsoDate(defaultIssuedAt);

  return {
    licenseId: String(rawPayload?.licenseId || '').trim(),
    customerName: String(rawPayload?.customerName || '').trim(),
    planCode: String(rawPayload?.planCode || '').trim(),
    issuedAt,
    expiresAt: normalizeIsoDate(rawPayload?.expiresAt),
    graceDays,
    maxDevices,
    enabledModules: normalizeEnabledModules(rawPayload?.enabledModules),
    metadata: rawPayload?.metadata && typeof rawPayload.metadata === 'object'
      ? normalizeObject(rawPayload.metadata)
      : {}
  };
}

export function validateLicensePayload(payload) {
  if (!payload.licenseId) {
    throw new Error('بيانات الترخيص تفتقد رقم الترخيص');
  }

  if (!payload.customerName) {
    throw new Error('بيانات الترخيص تفتقد اسم العميل');
  }

  if (!payload.planCode) {
    throw new Error('بيانات الترخيص تفتقد رمز الخطة');
  }

  if (!payload.expiresAt) {
    throw new Error('بيانات الترخيص تفتقد تاريخ الانتهاء');
  }
}

export function serializeLicensePayload(payload) {
  const canonicalPayload = {
    licenseId: payload.licenseId,
    customerName: payload.customerName,
    planCode: payload.planCode,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    graceDays: payload.graceDays,
    maxDevices: payload.maxDevices,
    enabledModules: payload.enabledModules,
    metadata: payload.metadata
  };

  return JSON.stringify(canonicalPayload);
}

export function getLicenseMessage(status) {
  switch (status) {
    case 'ACTIVE':
      return 'الترخيص نشط ويمكن استخدام النظام بشكل كامل ضمن الوحدات المفعلة';
    case 'GRACE':
      return 'الترخيص منتهي لكنه ما زال ضمن فترة السماح';
    case 'EXPIRED':
      return 'انتهت صلاحية الترخيص. القراءة متاحة والكتابة موقوفة';
    case 'INVALID':
      return 'مفتاح الترخيص غير صالح أو تم العبث به';
    case 'MISSING':
      return 'لا يوجد مفتاح ترخيص مفعّل على هذا النظام';
    case 'UNCONFIGURED':
      return 'لم تتم تهيئة المفتاح العام للتحقق من الترخيص';
    default:
      return 'حالة الترخيص غير معروفة';
  }
}

export function calculateLicenseState(payload, now = new Date()) {
  const expiresAt = new Date(payload.expiresAt);
  const graceEndsAt = new Date(expiresAt.getTime() + (payload.graceDays * DAY_IN_MS));

  if (now.getTime() <= expiresAt.getTime()) {
    return {
      status: 'ACTIVE',
      daysRemaining: Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_IN_MS)),
      graceEndsAt: graceEndsAt.toISOString()
    };
  }

  if (payload.graceDays > 0 && now.getTime() <= graceEndsAt.getTime()) {
    return {
      status: 'GRACE',
      daysRemaining: Math.max(0, Math.ceil((graceEndsAt.getTime() - now.getTime()) / DAY_IN_MS)),
      graceEndsAt: graceEndsAt.toISOString()
    };
  }

  return {
    status: 'EXPIRED',
    daysRemaining: 0,
    graceEndsAt: payload.graceDays > 0 ? graceEndsAt.toISOString() : null
  };
}

export function formatPublicKeyForEnv(publicKeyPem) {
  return normalizePublicKey(publicKeyPem).replace(/\r?\n/g, '\\n');
}
