const PATH_MODULE_MAP = [
  ['/categories', 'inventory'],
  ['/products', 'inventory'],
  ['/customers', 'customers'],
  ['/suppliers', 'suppliers'],
  ['/purchases', 'purchases'],
  ['/sales', 'sales'],
  ['/reports', 'reports'],
  ['/cash-management', 'cash-management'],
  ['/expenses', 'expenses'],
  ['/exchange-rate', 'exchange-rate'],
  ['/currency-exchange', 'currency-exchange']
];

function normalizePath(pathname) {
  return String(pathname || '/').split('?')[0];
}

function shouldRestrictModules(license) {
  return license?.enforcement === 'strict'
    && license?.verified
    && Array.isArray(license?.enabledModules)
    && license.enabledModules.length > 0;
}

export function getLicensedModuleForPath(pathname) {
  const normalizedPath = normalizePath(pathname);
  const match = PATH_MODULE_MAP.find(([prefix]) => normalizedPath.startsWith(prefix));
  return match?.[1] || null;
}

export function isLicensedModuleEnabled(license, moduleKey) {
  if (!moduleKey) return true;
  if (!shouldRestrictModules(license)) return true;
  return license.enabledModules.includes(moduleKey);
}

export function canAccessLicensedPath(license, pathname) {
  return isLicensedModuleEnabled(license, getLicensedModuleForPath(pathname));
}
