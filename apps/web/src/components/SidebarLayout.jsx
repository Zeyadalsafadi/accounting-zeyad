import { Link, Outlet, useNavigate } from 'react-router-dom';

const links = [
  { to: '/', label: 'لوحة التحكم' },
  { to: '/setup', label: 'تهيئة النظام (MVP)' }
];

export default function SidebarLayout() {
  const navigate = useNavigate();

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>متجر الدهانات</h1>
        {links.map((link) => (
          <Link key={link.to} to={link.to} className="nav-link">
            {link.label}
          </Link>
        ))}
        <button className="btn danger" onClick={logout}>تسجيل خروج</button>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
