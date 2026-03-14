import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api.js';
import { formatCommercialSyp } from '../utils/commercialCurrency.js';
import { useI18n } from '../i18n/I18nProvider.jsx';

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartString() {
  const today = todayString();
  return `${today.slice(0, 8)}01`;
}

function buildPresetRange(preset) {
  const today = new Date();
  const format = (value) => value.toISOString().slice(0, 10);

  if (preset === 'today') {
    const date = format(today);
    return { from: date, to: date };
  }

  if (preset === 'week') {
    const start = new Date(today);
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diff);
    return { from: format(start), to: format(today) };
  }

  if (preset === 'year') {
    const start = new Date(today.getFullYear(), 0, 1);
    return { from: format(start), to: format(today) };
  }

  return { from: monthStartString(), to: format(today) };
}

function ReportCard({ label, value, tone = 'neutral', secondary }) {
  return (
    <div className={`summary-card ${tone !== 'neutral' ? `summary-${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {secondary ? <small>{secondary}</small> : null}
    </div>
  );
}

export default function ReportsPage() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeView = searchParams.get('view') === 'profit-loss' ? 'profit-loss' : 'sales';
  const [sales, setSales] = useState([]);
  const [exchangeRateConfig, setExchangeRateConfig] = useState(null);
  const [profitLoss, setProfitLoss] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    from: searchParams.get('from') || monthStartString(),
    to: searchParams.get('to') || todayString()
  });

  const loadSalesOverview = async () => {
    const [salesRes, rateRes] = await Promise.all([
      api.get('/sales'),
      api.get('/exchange-rate')
    ]);

    setSales(salesRes.data.data || []);
    setExchangeRateConfig(rateRes.data.data || null);
  };

  const loadProfitLoss = async (nextFilters) => {
    const res = await api.get('/reports/profit-loss', {
      params: {
        from: nextFilters.from,
        to: nextFilters.to
      }
    });
    setProfitLoss(res.data.data || null);
  };

  useEffect(() => {
    setLoading(true);
    setError('');

    Promise.all([
      loadSalesOverview(),
      loadProfitLoss(filters)
    ]).catch((err) => {
      setError(err.response?.data?.error || t('loadingReportsFailed'));
    }).finally(() => setLoading(false));
  }, []);

  const activeSales = useMemo(
    () => sales.filter((invoice) => invoice.status === 'ACTIVE' && Number(invoice.total_original || 0) > 0),
    [sales]
  );

  const salesSummary = useMemo(() => {
    const invoiceCount = activeSales.length;
    const grossSales = activeSales.reduce((sum, invoice) => sum + Number(invoice.total_original || 0), 0);
    const collected = activeSales.reduce((sum, invoice) => sum + Number(invoice.received_original || 0), 0);
    const receivables = activeSales.reduce((sum, invoice) => sum + Math.max(0, Number(invoice.remaining_original || 0)), 0);

    return { invoiceCount, grossSales, collected, receivables };
  }, [activeSales]);

  const updateView = (view) => {
    const next = new URLSearchParams(searchParams);
    next.set('view', view);
    next.set('from', filters.from);
    next.set('to', filters.to);
    setSearchParams(next);
  };

  const applyPreset = async (preset) => {
    const nextFilters = buildPresetRange(preset);
    setFilters(nextFilters);
    const next = new URLSearchParams(searchParams);
    next.set('from', nextFilters.from);
    next.set('to', nextFilters.to);
    setSearchParams(next);

    setLoading(true);
    setError('');
    try {
      await loadProfitLoss(nextFilters);
    } catch (err) {
      setError(err.response?.data?.error || t('loadingProfitLossFailed'));
    } finally {
      setLoading(false);
    }
  };

  const runProfitLoss = async (event) => {
    event.preventDefault();
    const next = new URLSearchParams(searchParams);
    next.set('view', 'profit-loss');
    next.set('from', filters.from);
    next.set('to', filters.to);
    setSearchParams(next);

    setLoading(true);
    setError('');
    try {
      await loadProfitLoss(filters);
    } catch (err) {
      setError(err.response?.data?.error || t('loadingProfitLossFailed'));
    } finally {
      setLoading(false);
    }
  };

  const summary = profitLoss?.summary;
  const hasProfitLossActivity = summary
    ? [summary.revenue, summary.cogs, summary.expenses, summary.netProfit].some((value) => Number(value || 0) !== 0)
    : false;

  return (
    <main className="container">
      <header className="header-row">
        <h1>{t('reports')}</h1>
        <Link className="btn" to="/">{t('back')}</Link>
      </header>

      <section className="card">
        <div className="header-actions" style={{ marginBottom: 12 }}>
          <button className={`btn${activeView === 'sales' ? '' : ' secondary'}`} type="button" onClick={() => updateView('sales')}>
            {t('salesReports')}
          </button>
          <button className={`btn${activeView === 'profit-loss' ? '' : ' secondary'}`} type="button" onClick={() => updateView('profit-loss')}>
            {t('profitLoss')}
          </button>
        </div>

        {activeView === 'sales' ? (
          <>
            <div className="section-header">
              <h2>{t('salesReports')}</h2>
              <p className="hint">{t('salesReportHint')}</p>
            </div>

            <div className="summary-grid">
              <ReportCard label={t('invoiceCount')} value={salesSummary.invoiceCount} />
              <ReportCard label={t('totalSales')} value={formatCommercialSyp(salesSummary.grossSales, 'SYP', exchangeRateConfig?.activeRate)} />
              <ReportCard label={t('totalCollected')} value={formatCommercialSyp(salesSummary.collected, 'SYP', exchangeRateConfig?.activeRate)} />
              <ReportCard label={t('receivables')} value={formatCommercialSyp(salesSummary.receivables, 'SYP', exchangeRateConfig?.activeRate)} />
            </div>

            <table className="table">
              <thead>
                <tr>
                  <th>{t('invoiceNumber')}</th>
                  <th>{t('date')}</th>
                  <th>{t('customer')}</th>
                  <th>{t('totalSales')}</th>
                  <th>{t('received')}</th>
                  <th>{t('remaining')}</th>
                  <th>{t('status')}</th>
                </tr>
              </thead>
              <tbody>
                {activeSales.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{invoice.invoice_no}</td>
                    <td>{invoice.invoice_date}</td>
                    <td>{invoice.customer_name || t('cashCustomer')}</td>
                    <td>{formatCommercialSyp(invoice.total_original, invoice.currency, exchangeRateConfig?.activeRate)}</td>
                    <td>{formatCommercialSyp(invoice.received_original, invoice.currency, exchangeRateConfig?.activeRate)}</td>
                    <td>{formatCommercialSyp(invoice.remaining_original, invoice.currency, exchangeRateConfig?.activeRate)}</td>
                    <td>{invoice.status === 'ACTIVE' ? t('activeStatus') : t('cancelledStatus')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <>
            <div className="section-header">
              <h2>{t('profitLoss')}</h2>
              <p className="hint">{t('profitLossHint')}</p>
            </div>

            <form onSubmit={runProfitLoss}>
              <div className="form-grid">
                <div className="form-field">
                  <label className="field-label">{t('fromDate')}</label>
                  <input type="date" value={filters.from} onChange={(e) => setFilters((current) => ({ ...current, from: e.target.value }))} required />
                </div>
                <div className="form-field">
                  <label className="field-label">{t('toDate')}</label>
                  <input type="date" value={filters.to} onChange={(e) => setFilters((current) => ({ ...current, to: e.target.value }))} required />
                </div>
              </div>

              <div className="header-actions" style={{ marginTop: 12, marginBottom: 12 }}>
                <button className="btn secondary" type="button" onClick={() => applyPreset('today')}>{t('today')}</button>
                <button className="btn secondary" type="button" onClick={() => applyPreset('week')}>{t('thisWeek')}</button>
                <button className="btn secondary" type="button" onClick={() => applyPreset('month')}>{t('thisMonth')}</button>
                <button className="btn secondary" type="button" onClick={() => applyPreset('year')}>{t('thisYear')}</button>
                <button className="btn" type="submit">{t('updateReport')}</button>
              </div>
            </form>

            {loading ? <p className="hint">{t('loadingProfitLoss')}</p> : null}

            {profitLoss && !loading ? (
              <>
                <div className="summary-grid">
                  <ReportCard label={t('totalRevenue')} value={formatCommercialSyp(summary?.revenue || 0, 'SYP', 1)} />
                  <ReportCard label={t('totalCogs')} value={formatCommercialSyp(summary?.cogs || 0, 'SYP', 1)} />
                  <ReportCard
                    label={t('grossProfit')}
                    value={formatCommercialSyp(summary?.grossProfit || 0, 'SYP', 1)}
                    tone={Number(summary?.grossProfit || 0) >= 0 ? 'success' : 'danger'}
                    secondary={`${t('grossMargin')} ${Number(summary?.grossMarginPct || 0).toFixed(2)}%`}
                  />
                  <ReportCard label={t('totalExpenses')} value={formatCommercialSyp(summary?.expenses || 0, 'SYP', 1)} />
                  <ReportCard
                    label={t('netProfitLoss')}
                    value={formatCommercialSyp(summary?.netProfit || 0, 'SYP', 1)}
                    tone={Number(summary?.netProfit || 0) >= 0 ? 'success' : 'danger'}
                    secondary={`${t('netMargin')} ${Number(summary?.netMarginPct || 0).toFixed(2)}%`}
                  />
                </div>

                {!hasProfitLossActivity ? (
                  <div className="card" style={{ marginTop: 12 }}>
                    <p className="hint">{t('noActivityInRange')}</p>
                  </div>
                ) : null}

                <div className="form-grid" style={{ marginTop: 12 }}>
                  <div className="card">
                    <h3>{t('reportCalculation')}</h3>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('entity')}</th>
                          <th>{t('amount')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>{t('revenue')}</td>
                          <td>{formatCommercialSyp(summary?.revenue || 0, 'SYP', 1)}</td>
                        </tr>
                        <tr>
                          <td>{t('totalCogs')}</td>
                          <td>{formatCommercialSyp(summary?.cogs || 0, 'SYP', 1)}</td>
                        </tr>
                        <tr>
                          <td>{t('grossProfit')}</td>
                          <td>{formatCommercialSyp(summary?.grossProfit || 0, 'SYP', 1)}</td>
                        </tr>
                        <tr>
                          <td>{t('totalExpenses')}</td>
                          <td>{formatCommercialSyp(summary?.expenses || 0, 'SYP', 1)}</td>
                        </tr>
                        <tr>
                          <td>{t('netProfitLoss')}</td>
                          <td>{formatCommercialSyp(summary?.netProfit || 0, 'SYP', 1)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="card">
                    <h3>{t('additionalMetrics')}</h3>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('entity')}</th>
                          <th>{t('amount')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>{t('invoiceCount')}</td>
                          <td>{summary?.invoiceCount || 0}</td>
                        </tr>
                        <tr>
                          <td>{t('activeCustomers')}</td>
                          <td>{summary?.customerCount || 0}</td>
                        </tr>
                        <tr>
                          <td>{t('averageInvoice')}</td>
                          <td>{formatCommercialSyp(summary?.averageInvoice || 0, 'SYP', 1)}</td>
                        </tr>
                        <tr>
                          <td>{t('expenseEntries')}</td>
                          <td>{summary?.expenseCount || 0}</td>
                        </tr>
                        <tr>
                          <td>{t('period')}</td>
                          <td>{profitLoss.period.from} - {profitLoss.period.to}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="form-grid" style={{ marginTop: 12 }}>
                  <div className="card">
                    <h3>{t('expenseBreakdown')}</h3>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('category')}</th>
                          <th>{t('expenseEntries')}</th>
                          <th>{t('amount')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(profitLoss.expenseBreakdown || []).length > 0 ? (profitLoss.expenseBreakdown || []).map((row) => (
                          <tr key={row.category}>
                            <td>{row.category || t('category')}</td>
                            <td>{row.entry_count}</td>
                            <td>{formatCommercialSyp(row.amount, 'SYP', 1)}</td>
                          </tr>
                        )) : (
                          <tr>
                            <td colSpan="3">{t('noExpensesInRange')}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="card">
                    <h3>{t('performanceByDate')}</h3>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('date')}</th>
                          <th>{t('revenue')}</th>
                          <th>{t('cogs')}</th>
                          <th>{t('expenses')}</th>
                          <th>{t('netProfit')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(profitLoss.timeline || []).length > 0 ? (profitLoss.timeline || []).map((row) => (
                          <tr key={row.periodDate}>
                            <td>{row.periodDate}</td>
                            <td>{formatCommercialSyp(row.revenue, 'SYP', 1)}</td>
                            <td>{formatCommercialSyp(row.cogs, 'SYP', 1)}</td>
                            <td>{formatCommercialSyp(row.expenses, 'SYP', 1)}</td>
                            <td>{formatCommercialSyp(row.netProfit, 'SYP', 1)}</td>
                          </tr>
                        )) : (
                          <tr>
                            <td colSpan="5">{t('noDailyDataInRange')}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : null}
          </>
        )}

        {error ? <p className="error">{error}</p> : null}
      </section>
    </main>
  );
}
