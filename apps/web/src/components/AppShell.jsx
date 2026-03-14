import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  APP_NAME,
  MENU_SECTIONS,
  QUICK_ACTIONS,
  ROLE_LABEL_KEYS,
  SHELL_ICON_ACTIONS,
  WORKSPACE_ROUTE_META
} from '../constants/app.js';
import { clearSession, getCurrentUser, hasPermission } from '../utils/auth.js';
import { useI18n } from '../i18n/I18nProvider.jsx';

const HOME_TAB = { to: '/', labelKey: 'dashboard' };

function getRouteMeta(pathname) {
  return WORKSPACE_ROUTE_META[pathname] || {
    labelKey: 'dashboard',
    groupKey: 'system',
    descriptionKey: 'workspace.dashboard'
  };
}

function ShellIcon({ kind }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.8',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className: 'shell-icon-svg',
    'aria-hidden': 'true'
  };

  switch (kind) {
    case 'product':
      return (
        <svg {...common}>
          <path d="M4 8.5h16l-1.4 8.4a2 2 0 0 1-2 1.6H7.4a2 2 0 0 1-2-1.6L4 8.5Z" />
          <path d="M8 8.5V7a4 4 0 1 1 8 0v1.5" />
          <path d="M10.5 12h3" />
        </svg>
      );
    case 'customers':
      return (
        <svg {...common}>
          <circle cx="9" cy="9" r="3" />
          <path d="M4.5 18a4.5 4.5 0 0 1 9 0" />
          <circle cx="17.5" cy="10" r="2.5" />
          <path d="M15.5 18a3.5 3.5 0 0 1 4-2.8" />
        </svg>
      );
    case 'suppliers':
      return (
        <svg {...common}>
          <path d="M3.5 16.5V8.5h10v8" />
          <path d="M13.5 11h3l4 3v2.5h-2" />
          <circle cx="8" cy="17.5" r="1.5" />
          <circle cx="18" cy="17.5" r="1.5" />
          <path d="M13.5 17.5H16.5" />
          <path d="M6 11h4" />
        </svg>
      );
    case 'expenses':
      return (
        <svg {...common}>
          <path d="M7 3.5h10v17H7z" />
          <path d="M9.5 8h5" />
          <path d="M9.5 11.5h5" />
          <path d="M9.5 15h3" />
          <path d="M15.5 18.5l3-3" />
          <path d="M18.5 18.5h-3v-3" />
        </svg>
      );
    case 'exchange':
      return (
        <svg {...common}>
          <path d="M6 7h11" />
          <path d="m14 4 3 3-3 3" />
          <path d="M18 17H7" />
          <path d="m10 14-3 3 3 3" />
        </svg>
      );
    default:
      return null;
  }
}

export default function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = getCurrentUser();
  const { language, languages, setLanguage, t } = useI18n();
  const [activeMenu, setActiveMenu] = useState(null);
  const [openTabs, setOpenTabs] = useState([HOME_TAB]);

  const activeMeta = useMemo(() => getRouteMeta(location.pathname), [location.pathname]);

  useEffect(() => {
    const meta = getRouteMeta(location.pathname);
    setOpenTabs((current) => {
      if (current.some((tab) => tab.to === location.pathname)) return current;
      return [...current, { to: location.pathname, labelKey: meta.labelKey }];
    });
    setActiveMenu(null);
  }, [location.pathname]);

  const closeTab = (event, tabPath) => {
    event.stopPropagation();
    if (tabPath === '/') return;

    setOpenTabs((current) => {
      const nextTabs = current.filter((tab) => tab.to !== tabPath);
      if (location.pathname === tabPath) {
        navigate(nextTabs[nextTabs.length - 1]?.to || '/');
      }
      return nextTabs;
    });
  };

  const handleMenuAction = (item) => {
    setActiveMenu(null);
    if (item.to) {
      navigate(item.to);
    }
  };

  const logout = () => {
    clearSession();
    navigate('/login');
  };

  const visibleMenuSections = MENU_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.placeholder || hasPermission(user, item.permission))
  })).filter((section) => section.items.length > 0);

  const visibleQuickActions = QUICK_ACTIONS.filter((item) => hasPermission(user, item.permission));
  const visibleShellIconActions = SHELL_ICON_ACTIONS.filter((item) => hasPermission(user, item.permission));

  return (
    <div className="app-shell">
      <header className="desktop-chrome">
        <div className="desktop-titlebar">
          <div>
            <h1>{APP_NAME}</h1>
            <p>{t('shellTagline')}</p>
          </div>
          <div className="desktop-session">
            <select className="language-switcher" value={language} onChange={(e) => setLanguage(e.target.value)} aria-label={t('language')}>
              {languages.map((item) => (
                <option key={item.code} value={item.code}>{item.label}</option>
              ))}
            </select>
            <div className="session-pill">
              <strong>{user?.fullName}</strong>
              <span>{t(ROLE_LABEL_KEYS[user?.role] || user?.role)}</span>
            </div>
            <button className="btn danger" type="button" onClick={logout}>{t('logout')}</button>
          </div>
        </div>

        <nav className="menu-bar" aria-label={t('system')}>
          {visibleMenuSections.map((section) => (
            <div
              key={section.key}
              className="menu-group"
              onMouseEnter={() => setActiveMenu(section.key)}
              onMouseLeave={() => setActiveMenu((current) => (current === section.key ? null : current))}
            >
              <button
                type="button"
                className={`menu-trigger ${activeMenu === section.key ? 'active' : ''}`}
                onClick={() => setActiveMenu((current) => (current === section.key ? null : section.key))}
              >
                {t(section.labelKey)}
              </button>
              {activeMenu === section.key && (
                <div className="menu-dropdown">
                  {section.items.map((item) => (
                    <button
                      key={item.labelKey}
                      type="button"
                      className={`menu-item ${item.placeholder ? 'placeholder' : ''}`}
                      onClick={() => handleMenuAction(item)}
                      disabled={item.placeholder}
                      title={item.noteKey ? t(item.noteKey) : ''}
                    >
                      <span>{t(item.labelKey)}</span>
                      {item.placeholder ? <small>{t('soon')}</small> : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="quick-toolbar">
          {visibleQuickActions.map((action) => (
            <NavLink key={action.to} to={action.to} className={({ isActive }) => `quick-tool${isActive ? ' active' : ''}`}>
              <span className="quick-tool-icon" aria-hidden="true">{action.icon}</span>
              <span>{t(action.labelKey)}</span>
            </NavLink>
          ))}
        </div>
      </header>

      <div className="desktop-body">
        <main className="workspace-area">
          <div className="workspace-tabs" role="tablist" aria-label={t('currentModule')}>
            {openTabs.map((tab) => (
              <button
                key={tab.to}
                type="button"
                className={`workspace-tab ${location.pathname === tab.to ? 'active' : ''}`}
                onClick={() => navigate(tab.to)}
              >
                <span>{t(tab.labelKey || tab.label)}</span>
                {tab.to !== '/' ? (
                  <span className="tab-close" onClick={(event) => closeTab(event, tab.to)} aria-hidden="true">x</span>
                ) : null}
              </button>
            ))}
          </div>

          <section className="workspace-window">
            <div className="window-heading">
              <div>
                <p className="window-group">{t(activeMeta.groupKey)}</p>
                <h2>{t(activeMeta.labelKey)}</h2>
              </div>
              <p className="window-description">{t(activeMeta.descriptionKey)}</p>
            </div>
            <div className="workspace-canvas">
              <Outlet />
            </div>
          </section>
        </main>

        <aside className="shell-icon-rail" aria-label={t('action')}>
          {visibleShellIconActions.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={t(item.labelKey)}
              aria-label={t(item.labelKey)}
              data-icon-kind={item.icon}
              className={({ isActive }) => `shell-icon-link${isActive ? ' active' : ''}`}
            >
              <span className="shell-icon-glyph" data-icon-kind={item.icon} aria-hidden="true">
                <ShellIcon kind={item.icon} />
              </span>
            </NavLink>
          ))}
        </aside>
      </div>

      <footer className="status-strip">
        <span>{t('currentModule')}: {t(activeMeta.labelKey)}</span>
        <span>{t('group')}: {t(activeMeta.groupKey)}</span>
        <span>{t('connected')}</span>
      </footer>
    </div>
  );
}
