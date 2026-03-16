import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { PERMISSIONS, USER_ROLES } from '@paint-shop/shared';
import LoginPage from '../pages/LoginPage.jsx';
import FoundationPage from '../pages/FoundationPage.jsx';
import SettingsPage from '../pages/SettingsPage.jsx';
import CategoriesPage from '../pages/CategoriesPage.jsx';
import ProductsPage from '../pages/ProductsPage.jsx';
import SuppliersPage from '../pages/SuppliersPage.jsx';
import CustomersPage from '../pages/CustomersPage.jsx';
import PurchasesPage from '../pages/PurchasesPage.jsx';
import SalesPage from '../pages/SalesPage.jsx';
import ReportsPage from '../pages/ReportsPage.jsx';
import CashManagementPage from '../pages/CashManagementPage.jsx';
import ExpensesPage from '../pages/ExpensesPage.jsx';
import ExchangeRatePage from '../pages/ExchangeRatePage.jsx';
import CurrencyExchangePage from '../pages/CurrencyExchangePage.jsx';
import HelpPage from '../pages/HelpPage.jsx';
import AppShell from '../components/AppShell.jsx';
import { getCurrentLicense, getCurrentUser, getToken, hasPermission } from '../utils/auth.js';
import { canAccessLicensedPath } from '../utils/license.js';

function ProtectedRoute({ children, allowedRoles = [], allowedPermissions = [] }) {
  const location = useLocation();
  const token = getToken();
  const user = getCurrentUser();
  const license = getCurrentLicense();

  if (!token || !user) return <Navigate to="/login" replace />;
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) return <Navigate to="/" replace />;
  if (allowedPermissions.length > 0 && !allowedPermissions.some((permission) => hasPermission(user, permission))) {
    return <Navigate to="/" replace />;
  }
  if (!canAccessLicensedPath(license, location.pathname)) return <Navigate to="/" replace />;

  return children;
}

export default function App() {
  const [, setSessionVersion] = useState(0);

  useEffect(() => {
    const handleSessionChange = () => setSessionVersion((value) => value + 1);
    window.addEventListener('app-session-changed', handleSessionChange);
    return () => window.removeEventListener('app-session-changed', handleSessionChange);
  }, []);

  useEffect(() => {
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;

    const handleNumberInputFocus = (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (input.type !== 'number' || input.readOnly || input.disabled) return;

      const normalizedValue = String(input.value ?? '').trim();
      if (!/^0(?:\.0+)?$/.test(normalizedValue)) return;

      valueSetter?.call(input, '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };

    document.addEventListener('focusin', handleNumberInputFocus, true);
    return () => document.removeEventListener('focusin', handleNumberInputFocus, true);
  }, []);

  useEffect(() => {
    const protectedDisplaySelector = [
      'input[readonly]',
      'textarea[readonly]',
      'select:disabled',
      '.sales-receipt-readonly',
      '.status-box',
      '.summary-card',
      '.cash-empty-state'
    ].join(', ');

    const isProtectedDisplayField = (element) => {
      if (!(element instanceof HTMLElement)) return false;

      const field = element.closest('input, textarea, select');
      if (field instanceof HTMLElement) {
        if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
          return field.readOnly || field.disabled;
        }

        if (field instanceof HTMLSelectElement) {
          return field.disabled;
        }
      }

      return Boolean(element.closest(protectedDisplaySelector));
    };

    const preventProtectedFieldSelection = (event) => {
      if (!isProtectedDisplayField(event.target)) return;
      event.preventDefault();
    };

    const preventProtectedFieldMouseDown = (event) => {
      if (!isProtectedDisplayField(event.target)) return;
      event.preventDefault();
    };

    const blurProtectedFieldFocus = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!isProtectedDisplayField(target)) return;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
        target.blur();
      }
    };

    document.addEventListener('selectstart', preventProtectedFieldSelection, true);
    document.addEventListener('mousedown', preventProtectedFieldMouseDown, true);
    document.addEventListener('focusin', blurProtectedFieldFocus, true);
    return () => {
      document.removeEventListener('selectstart', preventProtectedFieldSelection, true);
      document.removeEventListener('mousedown', preventProtectedFieldMouseDown, true);
      document.removeEventListener('focusin', blurProtectedFieldFocus, true);
    };
  }, []);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route index element={<FoundationPage />} />
        <Route path="users" element={<ProtectedRoute allowedPermissions={[PERMISSIONS.SETTINGS_VIEW, PERMISSIONS.USERS_VIEW]}><SettingsPage /></ProtectedRoute>} />
        <Route path="settings" element={<ProtectedRoute allowedPermissions={[PERMISSIONS.SETTINGS_VIEW]}><SettingsPage /></ProtectedRoute>} />
        <Route path="categories" element={<ProtectedRoute allowedPermissions={[PERMISSIONS.INVENTORY_VIEW]}><CategoriesPage /></ProtectedRoute>} />
        <Route path="products" element={<ProtectedRoute allowedPermissions={[PERMISSIONS.INVENTORY_VIEW]}><ProductsPage /></ProtectedRoute>} />
        <Route path="suppliers" element={<ProtectedRoute allowedPermissions={[PERMISSIONS.SUPPLIERS_VIEW]}><SuppliersPage /></ProtectedRoute>} />
        <Route path="customers" element={<ProtectedRoute allowedPermissions={[PERMISSIONS.CUSTOMERS_VIEW]}><CustomersPage /></ProtectedRoute>} />
        <Route path="purchases" element={<ProtectedRoute allowedPermissions={[PERMISSIONS.PURCHASES_VIEW]}><PurchasesPage /></ProtectedRoute>} />
        <Route path="sales" element={<ProtectedRoute allowedPermissions={[PERMISSIONS.SALES_VIEW]}><SalesPage /></ProtectedRoute>} />
        <Route path="reports" element={<ProtectedRoute allowedPermissions={[PERMISSIONS.REPORTS_VIEW]}><ReportsPage /></ProtectedRoute>} />
        <Route path="help" element={<ProtectedRoute><HelpPage /></ProtectedRoute>} />
        <Route path="cash-management" element={<ProtectedRoute allowedRoles={[USER_ROLES.ADMIN, USER_ROLES.OWNER, USER_ROLES.SUPER_ADMIN]}><CashManagementPage /></ProtectedRoute>} />
        <Route path="expenses" element={<ProtectedRoute allowedPermissions={[PERMISSIONS.EXPENSES_VIEW]}><ExpensesPage /></ProtectedRoute>} />
        <Route path="exchange-rate" element={<ProtectedRoute allowedPermissions={[PERMISSIONS.EXCHANGE_RATE_VIEW]}><ExchangeRatePage /></ProtectedRoute>} />
        <Route path="currency-exchange" element={<ProtectedRoute allowedPermissions={[PERMISSIONS.CURRENCY_EXCHANGE_VIEW]}><CurrencyExchangePage /></ProtectedRoute>} />
      </Route>
    </Routes>
  );
}
