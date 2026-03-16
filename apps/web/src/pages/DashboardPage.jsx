import { useEffect, useState } from 'react';
import api from '../services/api.js';
import { formatCommercialSyp } from '../utils/commercialCurrency.js';
import { useI18n } from '../i18n/I18nProvider.jsx';

export default function DashboardPage() {
  const { t } = useI18n();
  const [summary, setSummary] = useState(null);
  const [exchangeRateConfig, setExchangeRateConfig] = useState(null);
  const totals = summary?.totals || {};
  const lowStockCount = summary?.lowStockCount ?? summary?.lowStock?.length ?? 0;

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
        <Stat title={t('todaySales')} value={formatCommercialSyp(totals.salesBase ?? 0, 'SYP', exchangeRateConfig?.activeRate)} />
        <Stat title={t('todayPurchases')} value={totals.purchasesBase ?? 0} />
        <Stat title={t('todayExpenses')} value={totals.expensesBase ?? 0} />
        <Stat title={t('lowStockProducts')} value={lowStockCount} />
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
