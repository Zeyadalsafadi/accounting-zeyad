import { useEffect, useState } from 'react';
import api from '../services/api.js';
import { formatCommercialSyp } from '../utils/commercialCurrency.js';
import { useI18n } from '../i18n/I18nProvider.jsx';

export default function DashboardPage() {
  const { t } = useI18n();
  const [summary, setSummary] = useState(null);
  const [exchangeRateConfig, setExchangeRateConfig] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get('/dashboard/summary').then((res) => setSummary(res.data.data)),
      api.get('/exchange-rate').then((res) => setExchangeRateConfig(res.data.data || null))
    ]).catch(() => {
      setSummary(null);
      setExchangeRateConfig(null);
    });
  }, []);

  return (
    <section>
      <h2>{t('dashboardTitle')}</h2>
      <p>{t('dashboardSubtitle')}</p>

      <div className="stats-grid">
        <Stat title={t('todaySales')} value={formatCommercialSyp(summary?.sales ?? 0, 'SYP', exchangeRateConfig?.activeRate)} />
        <Stat title={t('todayPurchases')} value={summary?.purchases ?? 0} />
        <Stat title={t('todayExpenses')} value={summary?.expenses ?? 0} />
        <Stat title={t('lowStockProducts')} value={summary?.lowStock ?? 0} />
      </div>
    </section>
  );
}

function Stat({ title, value }) {
  return (
    <article className="stat-card">
      <h3>{title}</h3>
      <strong>{value}</strong>
    </article>
  );
}
