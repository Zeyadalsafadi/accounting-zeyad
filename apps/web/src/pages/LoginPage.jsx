import { useEffect, useState } from 'react';
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
  const [licenseInfo, setLicenseInfo] = useState(null);

  useEffect(() => {
    api.get('/system/config')
      .then((response) => setLicenseInfo(response.data.data?.license || null))
      .catch(() => setLicenseInfo(null));
  }, []);

  const licenseStatusLabel = (status) => {
    const map = {
      ACTIVE: 'licenseStatusActive',
      GRACE: 'licenseStatusGrace',
      EXPIRED: 'licenseStatusExpired',
      MISSING: 'licenseStatusMissing',
      INVALID: 'licenseStatusInvalid',
      UNCONFIGURED: 'licenseStatusUnconfigured'
    };
    return t(map[status] || 'licenseStatusUnknown');
  };

  const licenseStatusTone = (status) => {
    if (status === 'ACTIVE') return 'summary-success';
    if (status === 'GRACE') return 'summary-warning';
    return 'summary-danger';
  };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api.post('/auth/login', { username, password });
      const { token, user, license } = response.data.data;
      saveSession({ token, user, license });

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

        {licenseInfo ? (
          <div className={`summary-card ${licenseStatusTone(licenseInfo.status)}`} style={{ marginBottom: 12 }}>
            <p className="summary-label">{t('licenseStatus')}</p>
            <strong className="summary-value">{licenseStatusLabel(licenseInfo.status)}</strong>
            <small>{licenseInfo.message || '-'}</small>
            <small>{t('licenseExpiresAt')}: {licenseInfo.expiresAt || '-'}</small>
          </div>
        ) : null}

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
