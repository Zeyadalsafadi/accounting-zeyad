import { Link } from 'react-router-dom';
import { PERMISSIONS } from '@paint-shop/shared';
import { APP_NAME, ROLE_LABEL_KEYS } from '../constants/app.js';
import { getCurrentUser, hasPermission } from '../utils/auth.js';
import { useI18n } from '../i18n/I18nProvider.jsx';

export default function FoundationPage() {
  const user = getCurrentUser();
  const { t } = useI18n();

  const adminActions = [
    { to: '/sales', labelKey: 'salesInvoices', noteKey: 'workspace.sales' },
    { to: '/purchases', labelKey: 'purchasesInvoices', noteKey: 'workspace.purchases' },
    { to: '/products', labelKey: 'productsManagement', noteKey: 'workspace.products' },
    { to: '/customers', labelKey: 'customerData', noteKey: 'workspace.customers' },
    { to: '/suppliers', labelKey: 'suppliers', noteKey: 'workspace.suppliers' },
    { to: '/reports', labelKey: 'reports', noteKey: 'workspace.reports' },
    { to: '/cash-management', labelKey: 'cashbox', noteKey: 'workspace.cashManagement' },
    { to: '/expenses', labelKey: 'expensesModule', noteKey: 'workspace.expenses' },
    { to: '/exchange-rate', labelKey: 'exchangeRate', noteKey: 'workspace.exchangeRate' },
    { to: '/currency-exchange', labelKey: 'usdExchange', noteKey: 'workspace.currencyExchange' },
    { to: '/settings', labelKey: 'settingsAdmin', noteKey: 'workspace.settings' }
  ];

  const visibleActions = adminActions.filter((action) => {
    if (action.to === '/sales') return hasPermission(user, PERMISSIONS.SALES_VIEW);
    if (action.to === '/purchases') return hasPermission(user, PERMISSIONS.PURCHASES_VIEW);
    if (action.to === '/products') return hasPermission(user, PERMISSIONS.INVENTORY_VIEW);
    if (action.to === '/customers') return hasPermission(user, PERMISSIONS.CUSTOMERS_VIEW);
    if (action.to === '/suppliers') return hasPermission(user, PERMISSIONS.SUPPLIERS_VIEW);
    if (action.to === '/expenses') return hasPermission(user, PERMISSIONS.EXPENSES_VIEW);
    if (action.to === '/exchange-rate') return hasPermission(user, PERMISSIONS.EXCHANGE_RATE_VIEW);
    if (action.to === '/currency-exchange') return hasPermission(user, PERMISSIONS.CURRENCY_EXCHANGE_VIEW);
    if (action.to === '/settings') return hasPermission(user, PERMISSIONS.SETTINGS_VIEW);
    return true;
  });

  return (
    <main className="container">
      <header className="header-row">
        <div>
          <h1>{APP_NAME}</h1>
          <p className="hint">
            {t('foundationInfo')}: {user?.fullName} ({t(ROLE_LABEL_KEYS[user?.role] || user?.role)})
          </p>
        </div>
      </header>

      <section className="card">
        <h2>{t('mainOffice')}</h2>
        <p className="hint">{t('mainOfficeHint')}</p>
        <table className="table">
          <thead>
            <tr>
              <th>{t('module')}</th>
              <th>{t('practicalDescription')}</th>
              <th>{t('action')}</th>
            </tr>
          </thead>
          <tbody>
            {visibleActions.map((action) => (
              <tr key={action.to}>
                <td>{t(action.labelKey)}</td>
                <td>{t(action.noteKey)}</td>
                <td><Link className="btn" to={action.to}>{t('openWindow')}</Link></td>
              </tr>
            ))}
            {hasPermission(user, PERMISSIONS.SETTINGS_VIEW) ? (
              <tr>
                <td>{t('infoManagement')}</td>
                <td>{t('managementAndReferenceData')}</td>
                <td>
                  <div className="header-actions">
                    <Link className="btn secondary" to="/settings">{t('administration')}</Link>
                    <Link className="btn secondary" to="/categories">{t('categories')}</Link>
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </main>
  );
}
