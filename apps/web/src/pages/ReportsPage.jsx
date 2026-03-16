import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PERMISSIONS, PRICE_TIER_CODES } from '@paint-shop/shared';
import api from '../services/api.js';
import { formatCommercialSyp } from '../utils/commercialCurrency.js';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { getCurrentUser, hasPermission } from '../utils/auth.js';
import { printHtmlDocument } from '../utils/print.js';

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

function deltaTone(value) {
  return Number(value || 0) >= 0 ? 'success' : 'danger';
}

export default function ReportsPage() {
  const { t, language, dir } = useI18n();
  const reportRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get('view');
  const activeView = requestedView === 'profit-loss' || requestedView === 'aging' ? requestedView : 'sales';
  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [exchangeRateConfig, setExchangeRateConfig] = useState(null);
  const [profitLoss, setProfitLoss] = useState(null);
  const [aging, setAging] = useState({ asOfDate: todayString(), customers: null, suppliers: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const currentUser = getCurrentUser();
  const canPrintReports = hasPermission(currentUser, PERMISSIONS.REPORTS_PRINT);
  const [filters, setFilters] = useState({
    from: searchParams.get('from') || monthStartString(),
    to: searchParams.get('to') || todayString(),
    categoryId: searchParams.get('categoryId') || '',
    unitName: searchParams.get('unitName') || '',
    tierCode: searchParams.get('tierCode') || ''
  });

  const loadSalesOverview = async () => {
    const [salesRes, rateRes, categoriesRes, productsRes] = await Promise.all([
      api.get('/sales'),
      api.get('/exchange-rate'),
      api.get('/categories'),
      api.get('/products')
    ]);

    setSales(salesRes.data.data || []);
    setExchangeRateConfig(rateRes.data.data || null);
    setCategories((categoriesRes.data.data || []).filter((item) => item.is_active));
    setProducts((productsRes.data.data || []).filter((item) => item.is_active));
  };

  const loadProfitLoss = async (nextFilters) => {
    const res = await api.get('/reports/profit-loss', {
      params: {
        from: nextFilters.from,
        to: nextFilters.to,
        categoryId: nextFilters.categoryId || undefined,
        unitName: nextFilters.unitName || undefined,
        tierCode: nextFilters.tierCode || undefined
      }
    });
    setProfitLoss(res.data.data || null);
  };

  const loadAging = async (asOfDate) => {
    const [customersRes, suppliersRes] = await Promise.all([
      api.get('/customers/reports/aging', { params: { asOfDate } }),
      api.get('/suppliers/reports/aging', { params: { asOfDate } })
    ]);
    setAging({
      asOfDate,
      customers: customersRes.data.data || null,
      suppliers: suppliersRes.data.data || null
    });
  };

  useEffect(() => {
    setLoading(true);
    setError('');

    Promise.all([
      loadSalesOverview(),
      loadProfitLoss(filters),
      loadAging(filters.to)
    ]).catch((err) => {
      setError(err.response?.data?.error || t('loadingReportsFailed'));
    }).finally(() => setLoading(false));
  }, []);

  const activeSales = useMemo(
    () => sales.filter((invoice) => invoice.status === 'ACTIVE' && Number(invoice.total_original || 0) > 0),
    [sales]
  );

  const unitOptions = useMemo(
    () => [...new Set(products.flatMap((product) => (product.units || []).map((unit) => unit.unit_name)).filter(Boolean))].sort(),
    [products]
  );

  const priceTierOptions = useMemo(
    () => PRICE_TIER_CODES.map((tier) => ({
      value: tier.value,
      label: t(`priceTier${tier.value.charAt(0)}${tier.value.slice(1).toLowerCase()}`) || tier.label
    })),
    [t]
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
    if (filters.categoryId) next.set('categoryId', filters.categoryId);
    else next.delete('categoryId');
    if (filters.unitName) next.set('unitName', filters.unitName);
    else next.delete('unitName');
    if (filters.tierCode) next.set('tierCode', filters.tierCode);
    else next.delete('tierCode');
    setSearchParams(next);
  };

  const applyPreset = async (preset) => {
    const nextFilters = {
      ...buildPresetRange(preset),
      categoryId: filters.categoryId,
      unitName: filters.unitName,
      tierCode: filters.tierCode
    };
    setFilters(nextFilters);
    const next = new URLSearchParams(searchParams);
    next.set('from', nextFilters.from);
    next.set('to', nextFilters.to);
    if (nextFilters.categoryId) next.set('categoryId', nextFilters.categoryId);
    else next.delete('categoryId');
    if (nextFilters.unitName) next.set('unitName', nextFilters.unitName);
    else next.delete('unitName');
    if (nextFilters.tierCode) next.set('tierCode', nextFilters.tierCode);
    else next.delete('tierCode');
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
    if (filters.categoryId) next.set('categoryId', filters.categoryId);
    else next.delete('categoryId');
    if (filters.unitName) next.set('unitName', filters.unitName);
    else next.delete('unitName');
    if (filters.tierCode) next.set('tierCode', filters.tierCode);
    else next.delete('tierCode');
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

  const runAgingReport = async (event) => {
    event.preventDefault();
    const next = new URLSearchParams(searchParams);
    next.set('view', 'aging');
    next.set('from', filters.from);
    next.set('to', filters.to);
    if (filters.categoryId) next.set('categoryId', filters.categoryId);
    else next.delete('categoryId');
    if (filters.unitName) next.set('unitName', filters.unitName);
    else next.delete('unitName');
    if (filters.tierCode) next.set('tierCode', filters.tierCode);
    else next.delete('tierCode');
    setSearchParams(next);

    setLoading(true);
    setError('');
    try {
      await loadAging(filters.to);
    } catch (err) {
      setError(err.response?.data?.error || t('loadingReportsFailed'));
    } finally {
      setLoading(false);
    }
  };

  const summary = profitLoss?.summary;
  const comparison = profitLoss?.comparison;
  const hasProfitLossActivity = summary
    ? [summary.revenue, summary.cogs, summary.expenses, summary.netProfit].some((value) => Number(value || 0) !== 0)
    : false;

  const printCurrentReport = () => {
    if (!reportRef.current) return;
    const title = activeView === 'profit-loss'
      ? t('printProfitLoss')
      : activeView === 'aging'
        ? t('printAgingReport')
        : t('printSalesReport');
    printHtmlDocument({
      title,
      html: reportRef.current.innerHTML,
      lang: language,
      dir
    });
  };

  const customerAgingTotals = useMemo(() => {
    const rows = aging.customers?.rows || [];
    return rows.reduce((groups, row) => {
      const current = groups.get(row.currency) || { totalOutstanding: 0, unappliedCredits: 0 };
      current.totalOutstanding += Number(row.totalOutstanding || 0);
      current.unappliedCredits += Number(row.unappliedCredits || 0);
      groups.set(row.currency, current);
      return groups;
    }, new Map());
  }, [aging.customers]);

  const supplierAgingTotals = useMemo(() => {
    const rows = aging.suppliers?.rows || [];
    return rows.reduce((groups, row) => {
      const current = groups.get(row.currency) || { totalOutstanding: 0, unappliedCredits: 0 };
      current.totalOutstanding += Number(row.totalOutstanding || 0);
      current.unappliedCredits += Number(row.unappliedCredits || 0);
      groups.set(row.currency, current);
      return groups;
    }, new Map());
  }, [aging.suppliers]);

  return (
    <main className="container reports-page">
      <div className="cash-tabs" role="tablist" aria-label={t('reports')}>
        <button
          className={`cash-tab${activeView === 'sales' ? ' active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeView === 'sales'}
          onClick={() => updateView('sales')}
        >
          {t('salesReports')}
        </button>
        <button
          className={`cash-tab${activeView === 'profit-loss' ? ' active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeView === 'profit-loss'}
          onClick={() => updateView('profit-loss')}
        >
          {t('profitLoss')}
        </button>
        <button
          className={`cash-tab${activeView === 'aging' ? ' active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeView === 'aging'}
          onClick={() => updateView('aging')}
        >
          {t('agingReport')}
        </button>
      </div>

      <section className="card">
        <div className="header-actions reports-toolbar-actions">
          {canPrintReports ? (
            <button className="btn secondary no-print" type="button" onClick={printCurrentReport}>
              {activeView === 'profit-loss'
                ? t('printProfitLoss')
                : activeView === 'aging'
                  ? t('printAgingReport')
                  : t('printSalesReport')}
            </button>
          ) : null}
        </div>

        <div ref={reportRef}>
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
        ) : activeView === 'profit-loss' ? (
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
                <div className="form-field">
                  <label className="field-label">{t('categoryFilter')}</label>
                  <select value={filters.categoryId} onChange={(e) => setFilters((current) => ({ ...current, categoryId: e.target.value }))}>
                    <option value="">{t('allCategories')}</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name_ar}</option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label className="field-label">{t('unitFilter')}</label>
                  <select value={filters.unitName} onChange={(e) => setFilters((current) => ({ ...current, unitName: e.target.value }))}>
                    <option value="">{t('allUnits')}</option>
                    {unitOptions.map((unitName) => (
                      <option key={unitName} value={unitName}>{unitName}</option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label className="field-label">{t('priceTierFilter')}</label>
                  <select value={filters.tierCode} onChange={(e) => setFilters((current) => ({ ...current, tierCode: e.target.value }))}>
                    <option value="">{t('allPriceTiers')}</option>
                    {priceTierOptions.map((tier) => (
                      <option key={tier.value} value={tier.value}>{tier.label}</option>
                    ))}
                  </select>
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

                {comparison ? (
                  <div className="summary-grid" style={{ marginTop: 12 }}>
                    <ReportCard
                      label={t('previousRevenueDelta')}
                      value={formatCommercialSyp(comparison.deltas?.revenue || 0, 'SYP', 1)}
                      tone={deltaTone(comparison.deltas?.revenue)}
                      secondary={`${comparison.previousPeriod?.from} - ${comparison.previousPeriod?.to}`}
                    />
                    <ReportCard
                      label={t('previousGrossProfitDelta')}
                      value={formatCommercialSyp(comparison.deltas?.grossProfit || 0, 'SYP', 1)}
                      tone={deltaTone(comparison.deltas?.grossProfit)}
                      secondary={t('comparisonWithPreviousPeriod')}
                    />
                    <ReportCard
                      label={t('previousNetProfitDelta')}
                      value={formatCommercialSyp(comparison.deltas?.netProfit || 0, 'SYP', 1)}
                      tone={deltaTone(comparison.deltas?.netProfit)}
                      secondary={t('comparisonWithPreviousPeriod')}
                    />
                  </div>
                ) : null}

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
                    <h3>{t('topPerformers')}</h3>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('product')}</th>
                          <th>{t('grossProfit')}</th>
                          <th>{t('grossMargin')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(profitLoss.topProducts || []).map((row) => (
                          <tr key={`top-${row.productId}`}>
                            <td>{row.productName}</td>
                            <td>{formatCommercialSyp(row.profit, 'SYP', 1)}</td>
                            <td>{Number(row.marginPct || 0).toFixed(2)}%</td>
                          </tr>
                        ))}
                        {(profitLoss.topProducts || []).length === 0 ? <tr><td colSpan="3">{t('noActivityInRange')}</td></tr> : null}
                      </tbody>
                    </table>
                  </div>
                  <div className="card">
                    <h3>{t('bottomPerformers')}</h3>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('product')}</th>
                          <th>{t('grossProfit')}</th>
                          <th>{t('grossMargin')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(profitLoss.bottomProducts || []).map((row) => (
                          <tr key={`bottom-${row.productId}`}>
                            <td>{row.productName}</td>
                            <td>{formatCommercialSyp(row.profit, 'SYP', 1)}</td>
                            <td>{Number(row.marginPct || 0).toFixed(2)}%</td>
                          </tr>
                        ))}
                        {(profitLoss.bottomProducts || []).length === 0 ? <tr><td colSpan="3">{t('noActivityInRange')}</td></tr> : null}
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

                <div className="form-grid" style={{ marginTop: 12 }}>
                  <div className="card">
                    <h3>{t('salesByUnit')}</h3>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('unit')}</th>
                          <th>{t('quantity')}</th>
                          <th>{t('revenue')}</th>
                          <th>{t('grossProfit')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(profitLoss.salesByUnit || []).map((row) => (
                          <tr key={row.unitName || 'blank-unit'}>
                            <td>{row.unitName || '-'}</td>
                            <td>{row.qtySold}</td>
                            <td>{formatCommercialSyp(row.revenue, 'SYP', 1)}</td>
                            <td>{formatCommercialSyp(row.profit, 'SYP', 1)}</td>
                          </tr>
                        ))}
                        {(profitLoss.salesByUnit || []).length === 0 ? (
                          <tr><td colSpan="4">{t('noActivityInRange')}</td></tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>

                  <div className="card">
                    <h3>{t('salesByPriceTier')}</h3>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('priceTier')}</th>
                          <th>{t('quantity')}</th>
                          <th>{t('revenue')}</th>
                          <th>{t('grossProfit')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(profitLoss.salesByPriceTier || []).map((row) => (
                          <tr key={`${row.tierCode}-${row.tierName}`}>
                            <td>{row.tierName}</td>
                            <td>{row.qtySold}</td>
                            <td>{formatCommercialSyp(row.revenue, 'SYP', 1)}</td>
                            <td>{formatCommercialSyp(row.profit, 'SYP', 1)}</td>
                          </tr>
                        ))}
                        {(profitLoss.salesByPriceTier || []).length === 0 ? (
                          <tr><td colSpan="4">{t('noActivityInRange')}</td></tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="form-grid" style={{ marginTop: 12 }}>
                  <div className="card">
                    <h3>{t('topUnits')}</h3>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('unit')}</th>
                          <th>{t('grossProfit')}</th>
                          <th>{t('revenue')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(profitLoss.topUnits || []).map((row) => (
                          <tr key={`top-unit-${row.unitName || 'blank'}`}>
                            <td>{row.unitName || '-'}</td>
                            <td>{formatCommercialSyp(row.profit, 'SYP', 1)}</td>
                            <td>{formatCommercialSyp(row.revenue, 'SYP', 1)}</td>
                          </tr>
                        ))}
                        {(profitLoss.topUnits || []).length === 0 ? <tr><td colSpan="3">{t('noActivityInRange')}</td></tr> : null}
                      </tbody>
                    </table>
                  </div>

                  <div className="card">
                    <h3>{t('bottomUnits')}</h3>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('unit')}</th>
                          <th>{t('grossProfit')}</th>
                          <th>{t('revenue')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(profitLoss.bottomUnits || []).map((row) => (
                          <tr key={`bottom-unit-${row.unitName || 'blank'}`}>
                            <td>{row.unitName || '-'}</td>
                            <td>{formatCommercialSyp(row.profit, 'SYP', 1)}</td>
                            <td>{formatCommercialSyp(row.revenue, 'SYP', 1)}</td>
                          </tr>
                        ))}
                        {(profitLoss.bottomUnits || []).length === 0 ? <tr><td colSpan="3">{t('noActivityInRange')}</td></tr> : null}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="form-grid" style={{ marginTop: 12 }}>
                  <div className="card">
                    <h3>{t('topPriceTiers')}</h3>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('priceTier')}</th>
                          <th>{t('grossProfit')}</th>
                          <th>{t('revenue')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(profitLoss.topPriceTiers || []).map((row) => (
                          <tr key={`top-tier-${row.tierCode}-${row.tierName}`}>
                            <td>{row.tierName}</td>
                            <td>{formatCommercialSyp(row.profit, 'SYP', 1)}</td>
                            <td>{formatCommercialSyp(row.revenue, 'SYP', 1)}</td>
                          </tr>
                        ))}
                        {(profitLoss.topPriceTiers || []).length === 0 ? <tr><td colSpan="3">{t('noActivityInRange')}</td></tr> : null}
                      </tbody>
                    </table>
                  </div>

                  <div className="card">
                    <h3>{t('bottomPriceTiers')}</h3>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('priceTier')}</th>
                          <th>{t('grossProfit')}</th>
                          <th>{t('revenue')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(profitLoss.bottomPriceTiers || []).map((row) => (
                          <tr key={`bottom-tier-${row.tierCode}-${row.tierName}`}>
                            <td>{row.tierName}</td>
                            <td>{formatCommercialSyp(row.profit, 'SYP', 1)}</td>
                            <td>{formatCommercialSyp(row.revenue, 'SYP', 1)}</td>
                          </tr>
                        ))}
                        {(profitLoss.bottomPriceTiers || []).length === 0 ? <tr><td colSpan="3">{t('noActivityInRange')}</td></tr> : null}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="form-grid" style={{ marginTop: 12 }}>
                  <div className="card">
                    <h3>{t('profitByProduct')}</h3>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('product')}</th>
                          <th>{t('quantity')}</th>
                          <th>{t('revenue')}</th>
                          <th>{t('cogs')}</th>
                          <th>{t('grossProfit')}</th>
                          <th>{t('grossMargin')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(profitLoss.productProfitability || []).map((row) => (
                          <tr key={row.productId}>
                            <td>{row.productName}</td>
                            <td>{row.qtySold}</td>
                            <td>{formatCommercialSyp(row.revenue, 'SYP', 1)}</td>
                            <td>{formatCommercialSyp(row.cogs, 'SYP', 1)}</td>
                            <td>{formatCommercialSyp(row.profit, 'SYP', 1)}</td>
                            <td>{Number(row.marginPct || 0).toFixed(2)}%</td>
                          </tr>
                        ))}
                        {(profitLoss.productProfitability || []).length === 0 ? (
                          <tr><td colSpan="6">{t('noActivityInRange')}</td></tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>

                  <div className="card">
                    <h3>{t('profitByCustomer')}</h3>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('customer')}</th>
                          <th>{t('invoiceCount')}</th>
                          <th>{t('revenue')}</th>
                          <th>{t('cogs')}</th>
                          <th>{t('grossProfit')}</th>
                          <th>{t('grossMargin')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(profitLoss.customerProfitability || []).map((row, index) => (
                          <tr key={`${row.customerId || 'cash'}-${index}`}>
                            <td>{row.customerName}</td>
                            <td>{row.invoiceCount}</td>
                            <td>{formatCommercialSyp(row.revenue, 'SYP', 1)}</td>
                            <td>{formatCommercialSyp(row.cogs, 'SYP', 1)}</td>
                            <td>{formatCommercialSyp(row.profit, 'SYP', 1)}</td>
                            <td>{Number(row.marginPct || 0).toFixed(2)}%</td>
                          </tr>
                        ))}
                        {(profitLoss.customerProfitability || []).length === 0 ? (
                          <tr><td colSpan="6">{t('noActivityInRange')}</td></tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="form-grid" style={{ marginTop: 12 }}>
                  <div className="card">
                    <h3>{t('topCustomers')}</h3>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('customer')}</th>
                          <th>{t('grossProfit')}</th>
                          <th>{t('grossMargin')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(profitLoss.topCustomers || []).map((row, index) => (
                          <tr key={`top-customer-${row.customerId || 'cash'}-${index}`}>
                            <td>{row.customerName}</td>
                            <td>{formatCommercialSyp(row.profit, 'SYP', 1)}</td>
                            <td>{Number(row.marginPct || 0).toFixed(2)}%</td>
                          </tr>
                        ))}
                        {(profitLoss.topCustomers || []).length === 0 ? <tr><td colSpan="3">{t('noActivityInRange')}</td></tr> : null}
                      </tbody>
                    </table>
                  </div>
                  <div className="card">
                    <h3>{t('bottomCustomers')}</h3>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('customer')}</th>
                          <th>{t('grossProfit')}</th>
                          <th>{t('grossMargin')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(profitLoss.bottomCustomers || []).map((row, index) => (
                          <tr key={`bottom-customer-${row.customerId || 'cash'}-${index}`}>
                            <td>{row.customerName}</td>
                            <td>{formatCommercialSyp(row.profit, 'SYP', 1)}</td>
                            <td>{Number(row.marginPct || 0).toFixed(2)}%</td>
                          </tr>
                        ))}
                        {(profitLoss.bottomCustomers || []).length === 0 ? <tr><td colSpan="3">{t('noActivityInRange')}</td></tr> : null}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="card" style={{ marginTop: 12 }}>
                  <h3>{t('profitByInvoice')}</h3>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('invoiceNumber')}</th>
                        <th>{t('date')}</th>
                        <th>{t('customer')}</th>
                        <th>{t('items')}</th>
                        <th>{t('revenue')}</th>
                        <th>{t('cogs')}</th>
                        <th>{t('grossProfit')}</th>
                        <th>{t('grossMargin')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(profitLoss.invoiceProfitability || []).map((row) => (
                        <tr key={row.invoiceId}>
                          <td>{row.invoiceNo}</td>
                          <td>{row.invoiceDate}</td>
                          <td>{row.customerName}</td>
                          <td>{row.linesCount}</td>
                          <td>{formatCommercialSyp(row.revenue, 'SYP', 1)}</td>
                          <td>{formatCommercialSyp(row.cogs, 'SYP', 1)}</td>
                          <td>{formatCommercialSyp(row.profit, 'SYP', 1)}</td>
                          <td>{Number(row.marginPct || 0).toFixed(2)}%</td>
                        </tr>
                      ))}
                      {(profitLoss.invoiceProfitability || []).length === 0 ? (
                        <tr><td colSpan="8">{t('noActivityInRange')}</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </>
        ) : (
          <>
            <div className="section-header">
              <h2>{t('agingReport')}</h2>
              <p className="hint">{t('agingReportHint')}</p>
            </div>

            <form onSubmit={runAgingReport}>
              <div className="form-grid">
                <div className="form-field">
                  <label className="field-label">{t('asOfDate')}</label>
                  <input type="date" value={filters.to} onChange={(e) => setFilters((current) => ({ ...current, to: e.target.value }))} required />
                </div>
              </div>
              <div className="header-actions" style={{ marginTop: 12, marginBottom: 12 }}>
                <button className="btn secondary" type="button" onClick={() => applyPreset('today')}>{t('today')}</button>
                <button className="btn secondary" type="button" onClick={() => applyPreset('month')}>{t('thisMonth')}</button>
                <button className="btn secondary" type="button" onClick={() => applyPreset('year')}>{t('thisYear')}</button>
                <button className="btn" type="submit">{t('updateReport')}</button>
              </div>
            </form>

            <div className="summary-grid" style={{ marginBottom: 12 }}>
              <ReportCard label={t('entitiesCount')} value={(aging.customers?.rows || []).length} secondary={t('agingReceivables')} />
              {Array.from(customerAgingTotals.entries()).map(([currency, totals]) => (
                <ReportCard
                  key={`customer-${currency}`}
                  label={`${t('amountReceivableFromCustomer')} ${currency}`}
                  value={formatCommercialSyp(totals.totalOutstanding, currency, exchangeRateConfig?.activeRate)}
                  secondary={`${t('unappliedCredits')} ${formatCommercialSyp(totals.unappliedCredits, currency, exchangeRateConfig?.activeRate)}`}
                />
              ))}
              <ReportCard label={t('entitiesCount')} value={(aging.suppliers?.rows || []).length} secondary={t('agingPayables')} />
              {Array.from(supplierAgingTotals.entries()).map(([currency, totals]) => (
                <ReportCard
                  key={`supplier-${currency}`}
                  label={`${t('amountOwedToSupplier')} ${currency}`}
                  value={currency === 'SYP'
                    ? formatCommercialSyp(totals.totalOutstanding, currency, exchangeRateConfig?.activeRate)
                    : `${Number(totals.totalOutstanding || 0).toFixed(2)} ${currency}`}
                  secondary={`${t('unappliedCredits')} ${currency === 'SYP'
                    ? formatCommercialSyp(totals.unappliedCredits, currency, exchangeRateConfig?.activeRate)
                    : `${Number(totals.unappliedCredits || 0).toFixed(2)} ${currency}`}`}
                />
              ))}
            </div>

            <div className="form-grid">
              <div className="card">
                <h3>{t('agingReceivables')}</h3>
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('customer')}</th>
                      <th>{t('currency')}</th>
                      <th>{t('agingBucketCurrent')}</th>
                      <th>{t('agingBucket31To60')}</th>
                      <th>{t('agingBucket61To90')}</th>
                      <th>{t('agingBucket90Plus')}</th>
                      <th>{t('totalOutstanding')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(aging.customers?.rows || []).map((row) => (
                      <tr key={row.customer_id}>
                        <td>{row.customer_name}</td>
                        <td>{row.currency}</td>
                        <td>{formatCommercialSyp(row.current, row.currency, exchangeRateConfig?.activeRate)}</td>
                        <td>{formatCommercialSyp(row.days31To60, row.currency, exchangeRateConfig?.activeRate)}</td>
                        <td>{formatCommercialSyp(row.days61To90, row.currency, exchangeRateConfig?.activeRate)}</td>
                        <td>{formatCommercialSyp(row.days90Plus, row.currency, exchangeRateConfig?.activeRate)}</td>
                        <td>{formatCommercialSyp(row.totalOutstanding, row.currency, exchangeRateConfig?.activeRate)}</td>
                      </tr>
                    ))}
                    {(aging.customers?.rows || []).length === 0 ? (
                      <tr><td colSpan="7">{t('noAgingData')}</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div className="card">
                <h3>{t('agingPayables')}</h3>
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('supplierName')}</th>
                      <th>{t('currency')}</th>
                      <th>{t('agingBucketCurrent')}</th>
                      <th>{t('agingBucket31To60')}</th>
                      <th>{t('agingBucket61To90')}</th>
                      <th>{t('agingBucket90Plus')}</th>
                      <th>{t('totalOutstanding')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(aging.suppliers?.rows || []).map((row) => (
                      <tr key={row.supplier_id}>
                        <td>{row.supplier_name}</td>
                        <td>{row.currency}</td>
                        <td>{Number(row.current || 0).toFixed(2)}</td>
                        <td>{Number(row.days31To60 || 0).toFixed(2)}</td>
                        <td>{Number(row.days61To90 || 0).toFixed(2)}</td>
                        <td>{Number(row.days90Plus || 0).toFixed(2)}</td>
                        <td>{Number(row.totalOutstanding || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                    {(aging.suppliers?.rows || []).length === 0 ? (
                      <tr><td colSpan="7">{t('noAgingData')}</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
        </div>

        {error ? <p className="error">{error}</p> : null}
      </section>
    </main>
  );
}
