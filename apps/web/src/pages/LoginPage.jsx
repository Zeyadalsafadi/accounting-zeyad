import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { USER_ROLES } from '@paint-shop/shared';
import api from '../services/api.js';
import { saveSession } from '../utils/auth.js';

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api.post('/auth/login', { username, password });
      const { token, user } = response.data.data;
      saveSession({ token, user });

      if (user.role === USER_ROLES.ADMIN) {
        navigate('/users');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'تعذر تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="center-page">
      <form className="card login-card" onSubmit={submit}>
        <h2>تسجيل الدخول</h2>
        <p className="hint">مدير: admin/admin123 — كاشير: cashier/cashier123</p>

        <label>اسم المستخدم</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} required />

        <label>كلمة المرور</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

        {error && <p className="error">{error}</p>}
        <button className="btn" type="submit" disabled={loading}>{loading ? 'جاري الدخول...' : 'دخول'}</button>
      </form>
    </div>
  );
}
