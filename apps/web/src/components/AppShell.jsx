import { useEffect, useMemo, useRef, useState } from 'react';
import { PERMISSIONS } from '@paint-shop/shared';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  APP_NAME,
  MENU_SECTIONS,
  QUICK_ACTIONS,
  ROLE_LABEL_KEYS,
  WORKSPACE_ROUTE_META
} from '../constants/app.js';
import { clearSession, getCurrentLicense, getCurrentUser, hasPermission } from '../utils/auth.js';
import { canAccessLicensedPath } from '../utils/license.js';
import { useI18n } from '../i18n/I18nProvider.jsx';

function getRouteMeta(pathname) {
  return WORKSPACE_ROUTE_META[pathname] || {
    labelKey: 'dashboard',
    groupKey: 'system',
    descriptionKey: 'workspace.dashboard'
  };
}

function getItemPath(item) {
  return item.to ? item.to.split('?')[0] : '';
}

function isRouteActive(target, pathname, search) {
  if (!target) return false;
  const [targetPath, targetSearch = ''] = target.split('?');
  if (targetPath !== pathname) return false;
  return targetSearch ? search === `?${targetSearch}` : true;
}

export default function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(() => getCurrentUser());
  const [license, setLicense] = useState(() => getCurrentLicense());
  const [openMenuKey, setOpenMenuKey] = useState(null);
  const menuBarRef = useRef(null);
  const { language, languages, setLanguage, t } = useI18n();

  const activeMeta = useMemo(() => getRouteMeta(location.pathname), [location.pathname]);
  const [brandArabic, ...brandRest] = APP_NAME.split(' ');
  const brandEnglish = brandRest.join(' ');

  useEffect(() => {
    const handleSessionChange = () => {
      setUser(getCurrentUser());
      setLicense(getCurrentLicense());
    };

    window.addEventListener('app-session-changed', handleSessionChange);
    return () => window.removeEventListener('app-session-changed', handleSessionChange);
  }, []);

  useEffect(() => {
    if (!canAccessLicensedPath(license, location.pathname)) {
      navigate('/');
    }
  }, [license, location.pathname, navigate]);

  useEffect(() => {
    if (!openMenuKey) return undefined;

    const handlePointerDown = (event) => {
      if (menuBarRef.current && !menuBarRef.current.contains(event.target)) {
        setOpenMenuKey(null);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [openMenuKey]);

  const visibleMenuSections = useMemo(() => (
    MENU_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.placeholder) return true;
        if (item.permission && !hasPermission(user, item.permission)) return false;
        if (item.to && !canAccessLicensedPath(license, getItemPath(item))) return false;
        return true;
      })
    })).filter((section) => section.items.length > 0)
  ), [license, user]);

  const visibleQuickActions = useMemo(() => (
    QUICK_ACTIONS.filter((item) => (
      hasPermission(user, item.permission) && canAccessLicensedPath(license, getItemPath(item))
    ))
  ), [license, user]);

  const sidebarCashAction = useMemo(() => {
    const item = { labelKey: 'cashbox', to: '/cash-management?tab=balances', permission: PERMISSIONS.SETTINGS_MANAGE };
    return hasPermission(user, item.permission) && canAccessLicensedPath(license, getItemPath(item)) ? item : null;
  }, [license, user]);

  const promotedQuickActions = useMemo(() => (
    sidebarCashAction ? [...visibleQuickActions, sidebarCashAction] : visibleQuickActions
  ), [sidebarCashAction, visibleQuickActions]);

  const sidebarAccessLinks = useMemo(() => ([
    { labelKey: 'addProduct', to: '/products', permission: PERMISSIONS.INVENTORY_VIEW },
    { labelKey: 'suppliers', to: '/suppliers', permission: PERMISSIONS.SUPPLIERS_VIEW },
    { labelKey: 'customerData', to: '/customers', permission: PERMISSIONS.CUSTOMERS_VIEW },
    { labelKey: 'exchangeRate', to: '/exchange-rate', permission: PERMISSIONS.EXCHANGE_RATE_VIEW },
    { labelKey: 'settingsAdmin', to: '/settings', permission: PERMISSIONS.SETTINGS_VIEW },
    { labelKey: 'expensesModule', to: '/expenses', permission: PERMISSIONS.EXPENSES_VIEW }
  ].filter((item) => (
    hasPermission(user, item.permission) && canAccessLicensedPath(license, getItemPath(item))
  ))), [license, user]);

  const programMenuSections = useMemo(() => {
    const sectionMap = new Map(
      visibleMenuSections.map((section) => [section.key, { ...section, items: [...section.items] }])
    );

    const addItemToSection = (sectionKey, item) => {
      const section = sectionMap.get(sectionKey);
      if (!section) return;
      if (item.permission && !hasPermission(user, item.permission)) return;
      if (item.to && !canAccessLicensedPath(license, getItemPath(item))) return;
      if (section.items.some((existing) => existing.labelKey === item.labelKey && existing.to === item.to)) return;
      section.items.push(item);
    };

    addItemToSection('financial', {
      labelKey: 'purchasesInvoices',
      to: '/purchases',
      permission: PERMISSIONS.PURCHASES_VIEW
    });
    addItemToSection('financial', {
      labelKey: 'suppliers',
      to: '/suppliers',
      permission: PERMISSIONS.SUPPLIERS_VIEW
    });
    addItemToSection('inventory', {
      labelKey: 'categories',
      to: '/categories',
      permission: PERMISSIONS.INVENTORY_VIEW
    });

    return ['financial', 'inventory', 'sales', 'customers', 'reports', 'administration', 'information']
      .map((key) => sectionMap.get(key))
      .filter(Boolean);
  }, [license, user, visibleMenuSections]);

  const handleMenuAction = (item) => {
    if (!item.to || item.placeholder) return;
    setOpenMenuKey(null);
    navigate(item.to);
  };

  const logout = () => {
    clearSession();
    navigate('/login');
  };

  const licenseStatusLabel = (status) => {
    const map = {
      ACTIVE: 'licenseStatusActive',
      GRACE: 'licenseStatusGrace',
      EXPIRED: 'licenseStatusExpired',
      MISSING: 'licenseStatusMissing',
      INVALID: 'licenseStatusInvalid',
      UNCONFIGURED: 'licenseStatusUnconfigured'
    };
    return t(map[status] || 'licenseStatusUnknown');
  };

  const userRoleLabel = user?.role ? t(ROLE_LABEL_KEYS[user.role] || user.role) : '-';
  const showWorkspaceHeader = !['/sales', '/purchases', '/cash-management', '/currency-exchange', '/expenses', '/exchange-rate', '/products', '/customers', '/suppliers', '/reports', '/settings', '/users', '/help'].includes(location.pathname);
  const activeLicenseLabel = license ? licenseStatusLabel(license.status) : t('licenseStatusMissing');

  const handleWindowControl = async (action) => {
    if (action === 'hideMenus') {
      document.body.classList.toggle('program-menu-collapsed');
      return;
    }

    if (action === 'fullscreen') {
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        } else if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } catch {
        // Ignore browser restrictions on fullscreen changes.
      }
      return;
    }

    window.close();
  };

  return (
    <div className="shop-app-frame">
      <div className="manager-shell shop-shell program-shell-layout">
        <header className="program-shell-header">
          <div className="program-titlebar">
            <div className="program-titlebar-left">
              <button
                className="program-titlebar-tool"
                type="button"
                title={t('helpCenterTitle')}
                aria-label={t('helpCenterTitle')}
                onClick={() => navigate('/help')}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="M9.5 9.2a2.8 2.8 0 1 1 4.1 2.5c-1 .6-1.6 1.1-1.6 2.2" />
                  <circle cx="12" cy="17.3" r="0.9" />
                </svg>
              </button>
              <button
                className="program-titlebar-tool"
                type="button"
                title="حفظ البيانات"
                aria-label="حفظ البيانات"
                onClick={() => navigate('/settings')}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 4.8h11.8l2.2 2.2V19.2H5Z" />
                  <path d="M8 4.8v5.3h7V4.8" />
                  <path d="M8 14.2h8" />
                </svg>
              </button>
              <button
                className="program-titlebar-tool program-titlebar-language-toggle"
                type="button"
                title={t('language')}
                aria-label={t('language')}
                onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
              >
                <span>{language === 'ar' ? 'EN' : 'AR'}</span>
              </button>
              <span className="program-titlebar-user">{user?.fullName || '-'} · {userRoleLabel}</span>
            </div>

            <div className="program-titlebar-center">
              <strong>{t(activeMeta.labelKey)}</strong>
            </div>

            <div className="program-window-controls">
              <button type="button" className="program-window-button" aria-label="Hide menus" title="Hide menus" onClick={() => handleWindowControl('hideMenus')}>
                <span />
              </button>
              <button type="button" className="program-window-button" aria-label="Fullscreen" title="Fullscreen" onClick={() => handleWindowControl('fullscreen')}>
                <span className="program-window-square" />
              </button>
              <button type="button" className="program-window-button program-window-button-close" aria-label="Close window" title="Close window" onClick={() => handleWindowControl('close')}>
                <span className="program-window-close" />
              </button>
            </div>
          </div>
        </header>

        <aside className="sidebar shop-sidebar program-sidebar">
          <div className="brand-block program-sidebar-brand">
            <span className="brand-title">{brandArabic}</span>
            {brandEnglish ? <span className="brand-subtitle">{brandEnglish}</span> : null}
          </div>

          {promotedQuickActions.length > 0 ? (
            <section className="nav-section program-sidebar-shortcuts">
              <div className="nav-stack">
                {promotedQuickActions.map((item) => (
                  <button
                    key={item.to}
                    type="button"
                    className={`nav-item nav-item-accent${isRouteActive(item.to, location.pathname, location.search) ? ' active' : ''}`}
                    onClick={() => handleMenuAction(item)}
                  >
                    {t(item.labelKey)}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {sidebarAccessLinks.length > 0 ? (
            <section className="program-sidebar-access-grid">
              {sidebarAccessLinks.map((item) => (
                <button
                  key={item.to}
                  type="button"
                  className={`program-sidebar-access-card${isRouteActive(item.to, location.pathname, location.search) ? ' active' : ''}`}
                  onClick={() => handleMenuAction(item)}
                >
                  {t(item.labelKey)}
                </button>
              ))}
            </section>
          ) : null}

          {license ? (
            <div className={`sidebar-card utility-card compact-utility-card program-sidebar-license-row ${license.status === 'ACTIVE' ? 'utility-card-success' : license.status === 'GRACE' ? 'utility-card-warning' : 'utility-card-danger'}`}>
              <span>{t('licenseStatus')}</span>
              <strong>{activeLicenseLabel}</strong>
            </div>
          ) : null}
        </aside>

        <main className="workspace shop-workspace program-workspace">
          <nav className="program-menubar" aria-label="Program navigation" ref={menuBarRef}>
            <div className="program-menubar-primary">
              {programMenuSections.map((section) => {
                const sectionActive = section.items.some((item) => {
                  if (!item.to) return false;
                  return isRouteActive(item.to, location.pathname, location.search) || getItemPath(item) === location.pathname;
                });

                return (
                  <div
                    key={section.key}
                    className={`program-menu-group${sectionActive ? ' active' : ''}${openMenuKey === section.key ? ' open' : ''}`}
                  >
                    <button
                      type="button"
                      className="program-menu-trigger"
                      onClick={() => setOpenMenuKey((current) => (current === section.key ? null : section.key))}
                    >
                      {t(section.labelKey)}
                    </button>
                    {openMenuKey === section.key ? (
                      <div className="program-menu-dropdown">
                      {section.items.map((item, index) => (
                        <button
                          key={`${section.key}-${item.labelKey}-${index}`}
                          type="button"
                          className={[
                            'program-menu-item',
                            isRouteActive(item.to, location.pathname, location.search) ? 'active' : '',
                            item.placeholder ? 'is-placeholder' : ''
                          ].filter(Boolean).join(' ')}
                          onClick={() => handleMenuAction(item)}
                          disabled={item.placeholder}
                          title={item.noteKey ? t(item.noteKey) : ''}
                        >
                          <span>{t(item.labelKey)}</span>
                          {item.placeholder ? <small>{t('soon')}</small> : null}
                        </button>
                      ))}

                      {section.key === 'information' ? (
                        <>
                          <div className="program-menu-divider" />
                          {languages.map((item) => (
                            <button
                              key={item.code}
                              type="button"
                              className={`program-menu-item${item.code === language ? ' active' : ''}`}
                              onClick={() => {
                                setLanguage(item.code);
                                setOpenMenuKey(null);
                              }}
                            >
                              <span>{item.label}</span>
                            </button>
                          ))}
                          <button
                            type="button"
                            className="program-menu-item"
                            onClick={() => {
                              setOpenMenuKey(null);
                              logout();
                            }}
                          >
                            <span>{t('logout')}</span>
                          </button>
                        </>
                      ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </nav>

          {showWorkspaceHeader ? (
            <header className="workspace-header shop-workspace-header">
              <div>
                <p className="eyebrow">{t(activeMeta.groupKey)}</p>
                <h2>{t(activeMeta.labelKey)}</h2>
                <p className="workspace-description">{t(activeMeta.descriptionKey)}</p>
              </div>
            </header>
          ) : null}

          <div className="shop-workspace-body">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
