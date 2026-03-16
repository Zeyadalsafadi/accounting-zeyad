import { useEffect, useMemo, useRef, useState } from 'react';
import { PERMISSIONS, SUPPORTED_CURRENCIES } from '@paint-shop/shared';
import api from '../services/api.js';
import { formatCommercialSyp } from '../utils/commercialCurrency.js';
import { formatExchangeRate } from '../utils/exchangeRate.js';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { getCurrentUser, hasPermission } from '../utils/auth.js';
import { printHtmlDocument } from '../utils/print.js';
import EntityPickerField from '../components/EntityPickerField.jsx';

const today = new Date().toISOString().slice(0, 10);
const initialForm = {
  id: null,
  name: '',
  phone: '',
  address: '',
  openingBalance: '',
  currency: 'SYP',
  notes: ''
};

const initialCollectionForm = {
  date: today,
  receivedSyp: '',
  receivedUsd: '',
  reference: '',
  notes: ''
};

export default function CustomersPage() {
  const { t, language, dir } = useI18n();
  const statementRef = useRef(null);
  const [list, setList] = useState([]);
  const [allCustomers, setAllCustomers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [details, setDetails] = useState(null);
  const [summary, setSummary] = useState(null);
  const [aging, setAging] = useState({ asOfDate: today, rows: [] });
  const [collections, setCollections] = useState([]);
  const [collectionForm, setCollectionForm] = useState(initialCollectionForm);
  const [exchangeRateConfig, setExchangeRateConfig] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [activeCustomersPanel, setActiveCustomersPanel] = useState('form');
  const currentUser = getCurrentUser();
  const canPrintStatements = hasPermission(currentUser, PERMISSIONS.REPORTS_PRINT) || hasPermission(currentUser, PERMISSIONS.CUSTOMERS_VIEW);
  const currencyLabelMap = useMemo(() => ({
    SYP: t('sypCurrencyLabel'),
    USD: t('usdCurrencyLabel')
  }), [t]);
  const getCurrencyLabel = (currency) => currencyLabelMap[currency] || currency;
  const savedCustomerOptions = useMemo(() => (
    [...allCustomers]
      .filter((customer) => customer?.id && customer?.name)
      .sort((a, b) => a.name.localeCompare(b.name, language === 'en' ? 'en' : 'ar'))
  ), [allCustomers, language]);

  const load = async (q = '') => {
    const res = await api.get('/customers', { params: q ? { q } : {} });
    setList(res.data.data || []);
  };

  const loadAllCustomers = async () => {
    const res = await api.get('/customers');
    setAllCustomers(res.data.data || []);
  };

  const loadAging = async (asOfDate = today) => {
    const res = await api.get('/customers/reports/aging', { params: { asOfDate } });
    setAging(res.data.data || { asOfDate, rows: [] });
  };

  const openCustomerWorkspace = async (id, panel = null) => {
    setError('');
    try {
      const [detailsRes, summaryRes, collectionsRes] = await Promise.all([
        api.get(`/customers/${id}`),
        api.get(`/customers/${id}/summary`),
        api.get(`/customers/${id}/collections`)
      ]);
      setDetails(detailsRes.data.data);
      setSummary(summaryRes.data.data);
      setCollections(collectionsRes.data.data || []);
      if (panel) setActiveCustomersPanel(panel);
    } catch {
      setError(t('customerDetailsFailed'));
    }
  };

  useEffect(() => {
    Promise.all([
      load(),
      loadAllCustomers(),
      loadAging(today),
      api.get('/exchange-rate').then((res) => setExchangeRateConfig(res.data.data || null))
    ]).catch(() => setError(t('loadingCustomersFailed')));
  }, [t]);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        ...form,
        openingBalance: Number(form.openingBalance || 0)
      };
      if (form.id) await api.patch(`/customers/${form.id}`, payload);
      else await api.post('/customers', payload);
      setForm(initialForm);
      setActiveCustomersPanel('list');
      await Promise.all([load(search), loadAllCustomers()]);
    } catch (err) {
      setError(err.response?.data?.error || t('customerSaveFailed'));
    }
  };

  const selectExistingCustomer = async (customer) => {
    setForm({
      id: customer.id,
      name: customer.name,
      phone: customer.phone || '',
      address: customer.address || '',
      openingBalance: customer.opening_balance ?? '',
      currency: customer.currency,
      notes: customer.notes || ''
    });
    await openCustomerWorkspace(customer.id);
  };

  const handleNameChange = async (value) => {
    const normalizedValue = value.trim().toLowerCase();
    const leavingCurrentSelection = Boolean(form.id) && form.name.trim().toLowerCase() !== normalizedValue;
    setForm((current) => ({
      ...current,
      id: leavingCurrentSelection ? null : current.id,
      name: value
    }));
    const match = savedCustomerOptions.find((customer) => customer.name.trim().toLowerCase() === normalizedValue);
    if (!match && leavingCurrentSelection) {
      setDetails(null);
      setSummary(null);
      setCollections([]);
    }
    if (!match || match.id === form.id) return;
    try {
      await selectExistingCustomer(match);
    } catch {
      setError(t('customerSelectedLoadFailed'));
    }
  };

  const saveCollection = async (event) => {
    event.preventDefault();
    if (!details?.id) {
      setError(t('chooseCustomerFirstForCollection'));
      return;
    }

    setError('');
    try {
      await api.post(`/customers/${details.id}/collections`, {
        date: collectionForm.date,
        receivedSyp: Number(collectionForm.receivedSyp || 0),
        receivedUsd: Number(collectionForm.receivedUsd || 0),
        reference: collectionForm.reference || null,
        notes: collectionForm.notes || null
      });

      setCollectionForm({ ...initialCollectionForm, date: today });
      await Promise.all([load(search), loadAllCustomers()]);
      await openCustomerWorkspace(details.id, 'collections');
    } catch (err) {
      setError(err.response?.data?.error || t('customerCollectionSaveFailed'));
    }
  };

  const summaryCards = summary ? [
    { label: t('totalSalesMetric'), value: formatCommercialSyp(summary.total_sales, summary.currency, exchangeRateConfig?.activeRate) },
    { label: t('collectedFromInvoices'), value: formatCommercialSyp(summary.total_collections_from_invoices, summary.currency, exchangeRateConfig?.activeRate) },
    { label: t('currentBalance'), value: formatCommercialSyp(summary.current_balance, summary.currency, exchangeRateConfig?.activeRate) },
    { label: t('amountReceivableFromCustomer'), value: formatCommercialSyp(summary.amount_receivable_from_customer, summary.currency, exchangeRateConfig?.activeRate) },
    { label: t('customerCreditBalance'), value: formatCommercialSyp(summary.customer_credit_in_our_favor, summary.currency, exchangeRateConfig?.activeRate) },
    { label: t('openingBalance'), value: formatCommercialSyp(summary.opening_balance, summary.currency, exchangeRateConfig?.activeRate) },
    { label: t('invoiceCount'), value: summary.invoice_count },
    { label: t('lastTransaction'), value: summary.last_transaction_date || '-' }
  ] : [];

  const activeRate = Number(exchangeRateConfig?.activeRate || 0);
  const totalSettledSyp = Number(collectionForm.receivedSyp || 0) + (Number(collectionForm.receivedUsd || 0) * activeRate);
  const agingTotals = useMemo(() => {
    const grouped = new Map();
    for (const row of aging.rows || []) {
      const current = grouped.get(row.currency) || { outstanding: 0, credits: 0, count: 0 };
      current.outstanding += Number(row.totalOutstanding || 0);
      current.credits += Number(row.unappliedCredits || 0);
      current.count += 1;
      grouped.set(row.currency, current);
    }
    return Array.from(grouped.entries());
  }, [aging.rows]);

  const printStatement = () => {
    if (!statementRef.current || !details) return;
    printHtmlDocument({
      title: `${t('printCustomerStatement')} ${details.name}`,
      html: statementRef.current.innerHTML,
      lang: language,
      dir
    });
  };

  return (
    <main className="container customers-page">
      <div className="cash-tabs" role="tablist" aria-label={t('customersTitle')}>
        <button
          className={`cash-tab${activeCustomersPanel === 'form' ? ' active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeCustomersPanel === 'form'}
          onClick={() => setActiveCustomersPanel('form')}
        >
          {form.id ? t('editCustomer') : t('addCustomerTitle')}
        </button>
        <button
          className={`cash-tab${activeCustomersPanel === 'list' ? ' active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeCustomersPanel === 'list'}
          onClick={() => setActiveCustomersPanel('list')}
        >
          {t('customersTitle')}
        </button>
        <button
          className={`cash-tab${activeCustomersPanel === 'summary' ? ' active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeCustomersPanel === 'summary'}
          onClick={() => setActiveCustomersPanel('summary')}
        >
          {t('customerFinancialStatus')}
        </button>
        <button
          className={`cash-tab${activeCustomersPanel === 'aging' ? ' active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeCustomersPanel === 'aging'}
          onClick={() => setActiveCustomersPanel('aging')}
        >
          {t('agingReceivables')}
        </button>
        <button
          className={`cash-tab${activeCustomersPanel === 'collections' ? ' active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeCustomersPanel === 'collections'}
          onClick={() => setActiveCustomersPanel('collections')}
        >
          {t('customerCollectionsHistory')}
        </button>
      </div>

      {activeCustomersPanel === 'form' ? (
        <section className="card">
          <form className="form-grid" onSubmit={save}>
            <EntityPickerField
              className="customer-name-picker"
              value={form.name}
              options={savedCustomerOptions}
              placeholder={t('customer')}
              ariaLabel={t('customer')}
              required
              onInputChange={handleNameChange}
              onSelect={selectExistingCustomer}
            />
            <input placeholder={t('phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input placeholder={t('address')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            <input type="number" min="0" step="0.01" placeholder={t('openingBalance')} value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} />
            <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{getCurrencyLabel(c)}</option>)}
            </select>
            <input placeholder={t('notesField')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <button className="btn" type="submit">{t('save')}</button>
          </form>
          {error && <p className="error">{error}</p>}
        </section>
      ) : null}

      {activeCustomersPanel === 'list' ? (
        <section className="card cash-history-card">
          <div className="cash-history-meta customers-history-meta">
            <span>{t('customersTitle')}</span>
            <strong>{list.length}</strong>
          </div>

          <div className="header-actions customers-header-actions">
            <input placeholder={t('searchByNamePhone')} value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="btn" type="button" onClick={() => load(search)}>{t('searchAction')}</button>
          </div>

          <div className="cash-history-table-wrap cash-history-table-scroll">
            <table className="table cash-history-table">
              <thead>
                <tr>
                  <th>{t('customer')}</th>
                  <th>{t('phone')}</th>
                  <th>{t('currentCommercialBalance')}</th>
                  <th>{t('displayCurrency')}</th>
                  <th>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.phone || '-'}</td>
                    <td>{formatCommercialSyp(item.current_balance, item.currency, exchangeRateConfig?.activeRate)}</td>
                    <td>{getCurrencyLabel('SYP')}</td>
                    <td className="actions">
                      <button
                        className="btn"
                        type="button"
                        onClick={async () => {
                          setForm({
                            id: item.id,
                            name: item.name,
                            phone: item.phone || '',
                            address: item.address || '',
                            openingBalance: item.opening_balance,
                            currency: item.currency,
                            notes: item.notes || ''
                          });
                          await openCustomerWorkspace(item.id, 'form');
                        }}
                      >
                        {t('edit')}
                      </button>
                      <button className="btn" type="button" onClick={() => openCustomerWorkspace(item.id, 'summary')}>{t('details')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error && <p className="error">{error}</p>}
        </section>
      ) : null}

      {activeCustomersPanel === 'summary' ? (
        <section className="card customers-summary-card" ref={statementRef}>
          {details ? (
            <>
              {canPrintStatements ? (
                <div className="header-actions no-print customers-print-actions">
                  <button className="btn secondary" type="button" onClick={printStatement}>{t('printCustomerStatement')}</button>
                </div>
              ) : null}

              <div className="customers-details-grid">
                <article className="product-form-panel">
                  <div className="section-header compact">
                    <h3>{t('customerDetails')}</h3>
                  </div>
                  <div className="customers-details-list">
                    <p><strong>{t('customer')}:</strong> {details.name}</p>
                    <p><strong>{t('phone')}:</strong> {details.phone || '-'}</p>
                    <p><strong>{t('address')}:</strong> {details.address || '-'}</p>
                    <p><strong>{t('openingBalance')}:</strong> {formatCommercialSyp(details.opening_balance, details.currency, exchangeRateConfig?.activeRate)}</p>
                    <p><strong>{t('currentBalance')}:</strong> {formatCommercialSyp(details.current_balance, details.currency, exchangeRateConfig?.activeRate)}</p>
                    <p><strong>{t('notesField')}:</strong> {details.notes || '-'}</p>
                  </div>
                </article>

                <article className="product-form-panel">
                  <div className="section-header compact">
                    <h3>{t('customerFinancialStatus')}</h3>
                  </div>
                  {summary ? (
                    <div className="summary-grid">
                      {summaryCards.map((item) => (
                        <article key={item.label} className="summary-card">
                          <p className="summary-label">{item.label}</p>
                          <strong className="summary-value">{item.value}</strong>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="hint">{t('chooseCustomerToViewSummary')}</p>
                  )}
                </article>
              </div>
            </>
          ) : (
            <p className="hint">{t('chooseCustomerToViewSummary')}</p>
          )}
          {error && <p className="error">{error}</p>}
        </section>
      ) : null}

      {activeCustomersPanel === 'aging' ? (
        <section className="card cash-history-card">
          <div className="section-header customers-aging-header">
            <div>
              <h2>{t('agingReceivables')}</h2>
              <p className="hint">{t('agingReceivablesHint')}</p>
            </div>
            <div className="header-actions">
              <input type="date" value={aging.asOfDate || today} onChange={(e) => setAging((current) => ({ ...current, asOfDate: e.target.value }))} />
              <button className="btn" type="button" onClick={() => loadAging(aging.asOfDate || today)}>{t('refresh')}</button>
            </div>
          </div>

          <div className="summary-grid customers-aging-summary">
            <article className="summary-card">
              <p className="summary-label">{t('entitiesCount')}</p>
              <strong className="summary-value">{aging.rows?.length || 0}</strong>
            </article>
            {agingTotals.map(([currency, totals]) => (
              <article className="summary-card" key={currency}>
                <p className="summary-label">{t('amountReceivableFromCustomer')} {currency}</p>
                <strong className="summary-value">{formatCommercialSyp(totals.outstanding, currency, exchangeRateConfig?.activeRate)}</strong>
                <small>{t('customerCreditBalance')}: {formatCommercialSyp(totals.credits, currency, exchangeRateConfig?.activeRate)}</small>
              </article>
            ))}
          </div>

          <div className="cash-history-table-wrap cash-history-table-scroll">
            <table className="table cash-history-table">
              <thead>
                <tr>
                  <th>{t('customer')}</th>
                  <th>{t('currency')}</th>
                  <th>{t('agingBucketCurrent')}</th>
                  <th>{t('agingBucket31To60')}</th>
                  <th>{t('agingBucket61To90')}</th>
                  <th>{t('agingBucket90Plus')}</th>
                  <th>{t('totalOutstanding')}</th>
                  <th>{t('unappliedCredits')}</th>
                </tr>
              </thead>
              <tbody>
                {(aging.rows || []).map((row) => (
                  <tr key={row.customer_id}>
                    <td>{row.customer_name}</td>
                    <td>{getCurrencyLabel(row.currency)}</td>
                    <td>{formatCommercialSyp(row.current, row.currency, exchangeRateConfig?.activeRate)}</td>
                    <td>{formatCommercialSyp(row.days31To60, row.currency, exchangeRateConfig?.activeRate)}</td>
                    <td>{formatCommercialSyp(row.days61To90, row.currency, exchangeRateConfig?.activeRate)}</td>
                    <td>{formatCommercialSyp(row.days90Plus, row.currency, exchangeRateConfig?.activeRate)}</td>
                    <td>{formatCommercialSyp(row.totalOutstanding, row.currency, exchangeRateConfig?.activeRate)}</td>
                    <td>{formatCommercialSyp(row.unappliedCredits, row.currency, exchangeRateConfig?.activeRate)}</td>
                  </tr>
                ))}
                {(aging.rows || []).length === 0 ? (
                  <tr>
                    <td colSpan="8">{t('noAgingData')}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {error && <p className="error">{error}</p>}
        </section>
      ) : null}

      {activeCustomersPanel === 'collections' ? (
        <section className="card cash-history-card">
          {details ? (
            <>
              <div className="product-form-panel customers-collection-form-panel">
                <div className="section-header compact">
                  <h3>{t('collectCustomerDebt')}</h3>
                </div>
                <p className="hint">{t('currentReceivableBalance')}: {formatCommercialSyp(summary?.amount_receivable_from_customer ?? details.current_balance, details.currency, exchangeRateConfig?.activeRate)}</p>
                <form className="form-grid" onSubmit={saveCollection}>
                  <input value={details.name} readOnly />
                  <input type="date" value={collectionForm.date} onChange={(e) => setCollectionForm({ ...collectionForm, date: e.target.value })} required />
                  <input type="number" min="0" step="0.01" placeholder={t('receivedInSyp')} value={collectionForm.receivedSyp} onChange={(e) => setCollectionForm({ ...collectionForm, receivedSyp: e.target.value })} />
                  <input type="number" min="0" step="0.01" placeholder={t('receivedInUsd')} value={collectionForm.receivedUsd} onChange={(e) => setCollectionForm({ ...collectionForm, receivedUsd: e.target.value })} />
                  <input value={`1 ${getCurrencyLabel('USD')} = ${formatExchangeRate(activeRate, '0.00')} ${getCurrencyLabel('SYP')}`} readOnly />
                  <input value={`${t('totalReceived')}: ${totalSettledSyp.toFixed(2)} ${getCurrencyLabel('SYP')}`} readOnly />
                  <input placeholder={t('reference')} value={collectionForm.reference} onChange={(e) => setCollectionForm({ ...collectionForm, reference: e.target.value })} />
                  <input placeholder={t('notesCollection')} value={collectionForm.notes} onChange={(e) => setCollectionForm({ ...collectionForm, notes: e.target.value })} />
                  <button className="btn" type="submit">{t('collectCustomerDebt')}</button>
                </form>
              </div>

              <div className="cash-history-meta customers-history-meta">
                <span>{t('customerCollectionsHistory')}</span>
                <strong>{collections.length}</strong>
              </div>

              <div className="cash-history-table-wrap cash-history-table-scroll">
                <table className="table cash-history-table">
                  <thead>
                    <tr>
                      <th>{t('date')}</th>
                      <th>{t('customer')}</th>
                      <th>SYP</th>
                      <th>USD</th>
                      <th>{t('exchangeRate')}</th>
                      <th>{t('totalReceived')} SYP</th>
                      <th>{t('reference')}</th>
                      <th>{t('notesField')}</th>
                      <th>{t('currentBalance')}</th>
                      <th>{t('createdBy')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {collections.map((item) => (
                      <tr key={item.id}>
                        <td>{item.collection_date}</td>
                        <td>{details.name}</td>
                        <td>{item.received_syp ?? 0}</td>
                        <td>{item.received_usd ?? 0}</td>
                        <td>{formatExchangeRate(item.exchange_rate_used)}</td>
                        <td>{item.total_settled_syp ?? item.amount}</td>
                        <td>{item.reference || '-'}</td>
                        <td>{item.notes || '-'}</td>
                        <td>{item.balance_after}</td>
                        <td>{item.created_by_name || '-'}</td>
                      </tr>
                    ))}
                    {collections.length === 0 ? (
                      <tr>
                        <td colSpan="10">{t('noCustomerCollections')}</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="hint">{t('chooseCustomerToCollect')}</p>
          )}
          {error && <p className="error">{error}</p>}
        </section>
      ) : null}
    </main>
  );
}
