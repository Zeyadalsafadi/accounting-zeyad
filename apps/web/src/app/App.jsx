import { Navigate, Route, Routes } from 'react-router-dom';
import { USER_ROLES } from '@paint-shop/shared';
import LoginPage from '../pages/LoginPage.jsx';
import FoundationPage from '../pages/FoundationPage.jsx';
import UsersPage from '../pages/UsersPage.jsx';
import CategoriesPage from '../pages/CategoriesPage.jsx';
import ProductsPage from '../pages/ProductsPage.jsx';
import SuppliersPage from '../pages/SuppliersPage.jsx';
import CustomersPage from '../pages/CustomersPage.jsx';
import PurchasesPage from '../pages/PurchasesPage.jsx';
import SalesPage from '../pages/SalesPage.jsx';
import CashManagementPage from '../pages/CashManagementPage.jsx';
import ExpensesPage from '../pages/ExpensesPage.jsx';
import { getCurrentUser, getToken } from '../utils/auth.js';

function ProtectedRoute({ children, allowedRoles = [] }) {
  const token = getToken();
  const user = getCurrentUser();

  if (!token || !user) return <Navigate to="/login" replace />;
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) return <Navigate to="/" replace />;

  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><FoundationPage /></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}><UsersPage /></ProtectedRoute>} />
      <Route path="/categories" element={<ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}><CategoriesPage /></ProtectedRoute>} />
      <Route path="/products" element={<ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}><ProductsPage /></ProtectedRoute>} />
      <Route path="/suppliers" element={<ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}><SuppliersPage /></ProtectedRoute>} />
      <Route path="/customers" element={<ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}><CustomersPage /></ProtectedRoute>} />
      <Route path="/purchases" element={<ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}><PurchasesPage /></ProtectedRoute>} />
      <Route path="/sales" element={<ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}><SalesPage /></ProtectedRoute>} />
      <Route path="/cash-management" element={<ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}><CashManagementPage /></ProtectedRoute>} />
      <Route path="/expenses" element={<ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}><ExpensesPage /></ProtectedRoute>} />
    </Routes>
  );
}
