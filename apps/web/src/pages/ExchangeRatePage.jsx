import { useEffect, useMemo, useState } from 'react';
import api from '../services/api.js';
import { useI18n } from '../i18n/I18nProvider.jsx';

export default function ExchangeRatePage() {
  const { t } = useI18n();
  const modeLabels = useMemo(() => ({
    MANUAL: t('manual'),
    AUTO: t('automatic')
  }), [t]);
  const numberFormatter = useMemo(() => new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }), []);
  const dateTimeFormatter = useMemo(() => new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }), []);

  const [config, setConfig] = useState(null);
  const [manualRate, setManualRate] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [activePanel, setActivePanel] = useState('summary');

  const formatRateInputValue = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return '';
    }
    return parsed.toFixed(2);
  };

  const load = async () => {
    const res = await api.get('/exchange-rate');
    setConfig(res.data.data || null);
    setManualRate(formatRateInputValue(res.data.data?.manualRate));
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
      setManualRate(formatRateInputValue(res.data.data?.manualRate ?? manualRate));
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
      setManualRate(formatRateInputValue(res.data.data?.manualRate ?? manualRate ?? config?.manualRate));
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
      setManualRate(formatRateInputValue(res.data.data?.manualRate ?? manualRate));
      setStatus(t('autoRateRefreshed'));
    } catch (err) {
      setConfig(err.response?.data?.data || config);
      setError(err.response?.data?.error || t('autoRateRefreshFailed'));
    }
  };

  const formatRateValue = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return value ?? '-';
    }

    return numberFormatter.format(parsed);
  };

  const formatDateTime = (value) => {
    if (!value) {
      return '-';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return dateTimeFormatter.format(parsed);
  };

  return (
    <main className="container exchange-rate-page">
      <div className="cash-tabs" role="tablist" aria-label={t('exchangeRateTitle')}>
        <button
          className={`cash-tab${activePanel === 'summary' ? ' active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activePanel === 'summary'}
          onClick={() => setActivePanel('summary')}
        >
          {t('currentActiveRate')}
        </button>
        <button
          className={`cash-tab${activePanel === 'manage' ? ' active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activePanel === 'manage'}
          onClick={() => setActivePanel('manage')}
        >
          {t('manageMode')}
        </button>
      </div>

      {activePanel === 'summary' ? (
        <section className="card">
          {config ? (
            <div className="summary-grid exchange-rate-summary-grid">
              <article className="summary-card exchange-rate-summary-card">
                <p className="summary-label exchange-rate-summary-label">{t('rateValue')}</p>
                <strong className="summary-value exchange-rate-summary-value exchange-rate-summary-value-code" dir="ltr">
                  1 USD = {formatRateValue(config.activeRate)} SYP
                </strong>
              </article>
              <article className="summary-card exchange-rate-summary-card">
                <p className="summary-label exchange-rate-summary-label">{t('mode')}</p>
                <strong className="summary-value exchange-rate-summary-value">{modeLabels[config.mode] || config.mode}</strong>
              </article>
              <article className="summary-card exchange-rate-summary-card">
                <p className="summary-label exchange-rate-summary-label">{t('source')}</p>
                <strong className="summary-value exchange-rate-summary-value">{config.source || '-'}</strong>
              </article>
              <article className="summary-card exchange-rate-summary-card">
                <p className="summary-label exchange-rate-summary-label">{t('lastActiveUpdate')}</p>
                <strong className="summary-value exchange-rate-summary-value exchange-rate-summary-value-date">
                  {formatDateTime(config.lastUpdatedAt)}
                </strong>
              </article>
              <article className="summary-card exchange-rate-summary-card">
                <p className="summary-label exchange-rate-summary-label">{t('lastSync')}</p>
                <strong className="summary-value exchange-rate-summary-value exchange-rate-summary-value-date">
                  {formatDateTime(config.lastSyncAt)}
                </strong>
              </article>
              <article className="summary-card exchange-rate-summary-card">
                <p className="summary-label exchange-rate-summary-label">{t('automaticUpdateStatus')}</p>
                <strong className="summary-value exchange-rate-summary-value">{config.autoStatus || '-'}</strong>
              </article>
            </div>
          ) : (
            <p className="hint">{t('loadingCurrentRate')}</p>
          )}
        </section>
      ) : (
        <section className="card">
          <div className="header-actions exchange-rate-mode-actions">
            <button className={`btn${config?.mode === 'MANUAL' ? ' secondary' : ''}`} type="button" onClick={() => switchMode('MANUAL')}>{t('manual')}</button>
            <button className={`btn${config?.mode === 'AUTO' ? ' secondary' : ''}`} type="button" onClick={() => switchMode('AUTO')}>{t('automatic')}</button>
          </div>

          <div className="form-grid exchange-rate-form-grid">
            <div className="form-field">
              <label className="field-label">{t('manualEntry')}</label>
              <div className="inline-field-group exchange-rate-manual-group">
                <input
                  className="exchange-rate-manual-input"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={manualRate}
                  onChange={(e) => setManualRate(e.target.value)}
                  onBlur={(e) => setManualRate(formatRateInputValue(e.target.value))}
                />
                <input className="exchange-rate-manual-hint" type="text" readOnly value={t('manualRatePairLabel')} />
              </div>
            </div>
            <div className="form-field exchange-rate-sync-field">
              <label className="field-label exchange-rate-sync-label">{t('autoSync')}</label>
              <button className="btn exchange-rate-sync-button" type="button" onClick={refreshAutomatic}>
                {t('refreshNow')}
              </button>
            </div>
          </div>

          <div className="header-actions exchange-rate-save-actions">
            <button className="btn" type="button" onClick={saveManual}>{t('saveManualRate')}</button>
          </div>

          {status && <p className="hint">{status}</p>}
          {config?.lastError ? <p className="error">{config.lastError}</p> : null}
          {error && <p className="error">{error}</p>}
        </section>
      )}
    </main>
  );
}
