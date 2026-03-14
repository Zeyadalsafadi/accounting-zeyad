import { Link } from 'react-router-dom';
import { USER_ROLES } from '@paint-shop/shared';
import { APP_NAME_AR, ROLE_LABELS_AR } from '../constants/app.js';
import { clearSession, getCurrentUser } from '../utils/auth.js';

export default function FoundationPage() {
  const user = getCurrentUser();

  return (
    <main className="container">
      <header className="header-row">
        <div>
          <h1>{APP_NAME_AR}</h1>
          <p className="hint">المستخدم الحالي: {user?.fullName} ({ROLE_LABELS_AR[user?.role] || user?.role})</p>
        </div>
        <button className="btn danger" onClick={() => { clearSession(); window.location.href = '/login'; }}>
          تسجيل خروج
        </button>
      </header>

      <section className="card">
        <h2>لوحة البداية</h2>
        <p>اختر الوحدة التي تريد إدارتها:</p>
        <div className="header-actions">
          {user?.role === USER_ROLES.ADMIN && <Link className="btn" to="/users">المستخدمون</Link>}
          {user?.role === USER_ROLES.ADMIN && <Link className="btn" to="/categories">التصنيفات</Link>}
          {user?.role === USER_ROLES.ADMIN && <Link className="btn" to="/products">المنتجات</Link>}
          {user?.role === USER_ROLES.ADMIN && <Link className="btn" to="/suppliers">الموردون</Link>}
          {user?.role === USER_ROLES.ADMIN && <Link className="btn" to="/customers">العملاء</Link>}
          {user?.role === USER_ROLES.ADMIN && <Link className="btn" to="/purchases">المشتريات</Link>}
          {user?.role === USER_ROLES.ADMIN && <Link className="btn" to="/sales">المبيعات</Link>}
          {user?.role === USER_ROLES.ADMIN && <Link className="btn" to="/cash-management">إدارة الصندوق</Link>}
          {user?.role === USER_ROLES.ADMIN && <Link className="btn" to="/expenses">المصاريف</Link>}
        </div>
      </section>
    </main>
  );
}
