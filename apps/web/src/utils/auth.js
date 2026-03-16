const DEVICE_ID_STORAGE_KEY = 'device.id';

export function getToken() {
  return localStorage.getItem('token');
}

export function getCurrentLicense() {
  const raw = localStorage.getItem('license');
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function emitSessionChange() {
  window.dispatchEvent(new CustomEvent('app-session-changed'));
}

function createFallbackDeviceId() {
  return `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateDeviceId() {
  const current = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (current) return current;

  const nextId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : createFallbackDeviceId();

  localStorage.setItem(DEVICE_ID_STORAGE_KEY, nextId);
  return nextId;
}

export function getDeviceName() {
  if (typeof navigator === 'undefined') return 'MyShop device';

  const platform = navigator.userAgentData?.platform || navigator.platform || 'unknown-platform';
  return `MyShop ${platform}`.trim();
}

export function getDeviceHeaders() {
  return {
    'X-Device-Id': getOrCreateDeviceId(),
    'X-Device-Name': getDeviceName()
  };
}

export function getCurrentUser() {
  const raw = localStorage.getItem('user');
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveLicenseStatus(license) {
  localStorage.setItem('license', JSON.stringify(license || null));
  emitSessionChange();
}

export function saveSession({ token, user, license }) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  localStorage.setItem('license', JSON.stringify(license || null));
  emitSessionChange();
}

export function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('license');
  emitSessionChange();
}

export function hasPermission(user, permissionKey) {
  if (!permissionKey) return true;
  return Array.isArray(user?.permissions) && user.permissions.includes(permissionKey);
}
