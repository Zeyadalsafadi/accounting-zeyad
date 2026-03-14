import { Navigate, Route, Routes } from 'react-router-dom';
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
import AppShell from '../components/AppShell.jsx';
import { getCurrentUser, getToken, hasPermission } from '../utils/auth.js';

function ProtectedRoute({ children, allowedRoles = [], allowedPermissions = [] }) {
  const token = getToken();
  const user = getCurrentUser();

  if (!token || !user) return <Navigate to="/login" replace />;
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) return <Navigate to="/" replace />;
  if (allowedPermissions.length > 0 && !allowedPermissions.some((permission) => hasPermission(user, permission))) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default function App() {
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
        <Route path="cash-management" element={<ProtectedRoute allowedRoles={[USER_ROLES.ADMIN, USER_ROLES.OWNER, USER_ROLES.SUPER_ADMIN]}><CashManagementPage /></ProtectedRoute>} />
        <Route path="expenses" element={<ProtectedRoute allowedPermissions={[PERMISSIONS.EXPENSES_VIEW]}><ExpensesPage /></ProtectedRoute>} />
        <Route path="exchange-rate" element={<ProtectedRoute allowedPermissions={[PERMISSIONS.EXCHANGE_RATE_VIEW]}><ExchangeRatePage /></ProtectedRoute>} />
        <Route path="currency-exchange" element={<ProtectedRoute allowedPermissions={[PERMISSIONS.CURRENCY_EXCHANGE_VIEW]}><CurrencyExchangePage /></ProtectedRoute>} />
      </Route>
    </Routes>
  );
}
