import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { USER_ROLES } from '@paint-shop/shared';
import api from '../services/api.js';
import { APP_NAME_AR, ROLE_LABELS_AR } from '../constants/app.js';
import { clearSession } from '../utils/auth.js';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    username: '',
    password: '',
    fullName: '',
    role: USER_ROLES.CASHIER
  });
  const [error, setError] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/users');
      setUsers(res.data.data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'تعذر تحميل المستخدمين');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const createUser = async (e) => {
    e.preventDefault();
    setError('');

    try {
      await api.post('/users', form);
      setForm({ username: '', password: '', fullName: '', role: USER_ROLES.CASHIER });
      await loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'تعذر إنشاء المستخدم');
    }
  };

  return (
    <main className="container">
      <header className="header-row">
        <div>
          <h1>{APP_NAME_AR}</h1>
          <p className="hint">إدارة المستخدمين (مدير فقط)</p>
        </div>
        <div className="header-actions">
          <Link className="btn" to="/">الرئيسية</Link>
          <button
            className="btn danger"
            onClick={() => {
              clearSession();
              window.location.href = '/login';
            }}
          >
            تسجيل خروج
          </button>
        </div>
      </header>

      <section className="card">
        <h2>إضافة مستخدم</h2>
        <form className="form-grid" onSubmit={createUser}>
          <input placeholder="اسم المستخدم" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          <input placeholder="الاسم الكامل" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
          <input placeholder="كلمة المرور" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value={USER_ROLES.CASHIER}>كاشير</option>
            <option value={USER_ROLES.ADMIN}>مدير</option>
          </select>
          <button className="btn" type="submit">حفظ</button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="card">
        <h2>المستخدمون</h2>
        {loading ? (
          <p>جاري التحميل...</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>المعرف</th>
                <th>اسم المستخدم</th>
                <th>الاسم</th>
                <th>الدور</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.id}</td>
                  <td>{user.username}</td>
                  <td>{user.full_name}</td>
                  <td>{ROLE_LABELS_AR[user.role] || user.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
