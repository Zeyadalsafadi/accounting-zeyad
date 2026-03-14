import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api.js';
import { useI18n } from '../i18n/I18nProvider.jsx';

export default function ExchangeRatePage() {
  const { t } = useI18n();
  const modeLabels = useMemo(() => ({
    MANUAL: t('manual'),
    AUTO: t('automatic')
  }), [t]);

  const [config, setConfig] = useState(null);
  const [manualRate, setManualRate] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const load = async () => {
    const res = await api.get('/exchange-rate');
    setConfig(res.data.data || null);
    setManualRate(String(res.data.data?.manualRate || ''));
  };

  useEffect(() => {
    load().catch(() => setError(t('loadingExchangeRateFailed')));
  }, [t]);

  const saveManual = async () => {
    setError('');
    setStatus('');
    try {
      const res = await api.patch('/exchange-rate', {
        mode: 'MANUAL',
        manualRate: Number(manualRate)
      });
      setConfig(res.data.data || null);
      setStatus(t('exchangeRateSaved'));
    } catch (err) {
      setError(err.response?.data?.error || t('exchangeRateSaveFailed'));
    }
  };

  const switchMode = async (mode) => {
    setError('');
    setStatus('');
    try {
      const res = await api.patch('/exchange-rate', {
        mode,
        manualRate: Number(manualRate || config?.manualRate || 0)
      });
      setConfig(res.data.data || null);
      setStatus(mode === 'AUTO' ? t('autoModeEnabled') : t('manualModeEnabled'));
    } catch (err) {
      setError(err.response?.data?.error || t('exchangeRateModeUpdateFailed'));
    }
  };

  const refreshAutomatic = async () => {
    setError('');
    setStatus('');
    try {
      const res = await api.post('/exchange-rate/refresh');
      setConfig(res.data.data || null);
      setStatus(t('autoRateRefreshed'));
    } catch (err) {
      setConfig(err.response?.data?.data || config);
      setError(err.response?.data?.error || t('autoRateRefreshFailed'));
    }
  };

  return (
    <main className="container">
      <header className="header-row">
        <h1>{t('exchangeRateTitle')}</h1>
        <Link className="btn" to="/">{t('back')}</Link>
      </header>

      <section className="card">
        <h2>{t('currentActiveRate')}</h2>
        {config ? (
          <div className="summary-grid">
            <article className="summary-card">
              <p className="summary-label">{t('rateValue')}</p>
              <strong className="summary-value">1 USD = {config.activeRate} SYP</strong>
            </article>
            <article className="summary-card">
              <p className="summary-label">{t('mode')}</p>
              <strong className="summary-value">{modeLabels[config.mode] || config.mode}</strong>
            </article>
            <article className="summary-card">
              <p className="summary-label">{t('source')}</p>
              <strong className="summary-value">{config.source || '-'}</strong>
            </article>
            <article className="summary-card">
              <p className="summary-label">{t('lastActiveUpdate')}</p>
              <strong className="summary-value">{config.lastUpdatedAt || '-'}</strong>
            </article>
            <article className="summary-card">
              <p className="summary-label">{t('lastSync')}</p>
              <strong className="summary-value">{config.lastSyncAt || '-'}</strong>
            </article>
            <article className="summary-card">
              <p className="summary-label">{t('automaticUpdateStatus')}</p>
              <strong className="summary-value">{config.autoStatus || '-'}</strong>
            </article>
          </div>
        ) : (
          <p className="hint">{t('loadingCurrentRate')}</p>
        )}
      </section>

      <section className="card">
        <h2>{t('manageMode')}</h2>
        <div className="header-actions" style={{ marginBottom: 12 }}>
          <button className={`btn${config?.mode === 'MANUAL' ? ' secondary' : ''}`} type="button" onClick={() => switchMode('MANUAL')}>{t('manual')}</button>
          <button className={`btn${config?.mode === 'AUTO' ? ' secondary' : ''}`} type="button" onClick={() => switchMode('AUTO')}>{t('automatic')}</button>
        </div>

        <div className="form-grid">
          <div className="form-field">
            <label className="field-label">{t('manualEntry')}</label>
            <div className="inline-field-group">
              <input type="number" min="0.0001" step="0.0001" value={manualRate} onChange={(e) => setManualRate(e.target.value)} />
              <input type="text" readOnly value="SYP per 1 USD" />
            </div>
          </div>
          <div className="form-field">
            <label className="field-label">{t('autoSync')}</label>
            <button className="btn" type="button" onClick={refreshAutomatic}>{t('refreshNow')}</button>
          </div>
        </div>

        <div className="header-actions" style={{ marginTop: 12 }}>
          <button className="btn" type="button" onClick={saveManual}>{t('saveManualRate')}</button>
        </div>

        {status && <p className="hint">{status}</p>}
        {config?.lastError ? <p className="error">{config.lastError}</p> : null}
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}
