import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PERMISSIONS } from '@paint-shop/shared';
import api from '../services/api.js';
import { hasPermission, saveSession } from '../utils/auth.js';
import { useI18n } from '../i18n/I18nProvider.jsx';

export default function LoginPage() {
  const navigate = useNavigate();
  const { t, brand } = useI18n();
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

      if (hasPermission(user, PERMISSIONS.SETTINGS_VIEW)) {
        navigate('/settings');
      } else if (hasPermission(user, PERMISSIONS.SALES_VIEW)) {
        navigate('/sales');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.error || t('loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="center-page">
      <form className="card login-card" onSubmit={submit}>
        <h2>{brand}</h2>
        <p className="hint">{t('authHint')}</p>

        <label>{t('username')}</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} required />

        <label>{t('password')}</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

        {error && <p className="error">{error}</p>}
        <button className="btn" type="submit" disabled={loading}>{loading ? t('loginLoading') : t('loginSubmit')}</button>
      </form>
    </div>
  );
}
