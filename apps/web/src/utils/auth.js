export function getToken() {
  return localStorage.getItem('token');
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

export function saveSession({ token, user }) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

export function hasPermission(user, permissionKey) {
  if (!permissionKey) return true;
  return Array.isArray(user?.permissions) && user.permissions.includes(permissionKey);
}
