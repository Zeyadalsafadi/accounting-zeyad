import { useEffect, useMemo, useRef, useState } from 'react';
import { PERMISSIONS, SUPPORTED_CURRENCIES } from '@paint-shop/shared';
import api from '../services/api.js';
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

const initialSettlementForm = {
  date: today,
  amount: '',
  currency: 'SYP',
  reference: '',
  notes: ''
};

function FieldLabel({ label, help }) {
  return (
    <label className="field-label">
      <span>{label}</span>
      {help ? <span className="help-icon" title={help} aria-label={help}>?</span> : null}
    </label>
  );
}

function FormField({ label, help, children, className = '' }) {
  return (
    <div className={`form-field ${className}`.trim()}>
      <FieldLabel label={label} help={help} />
      {children}
    </div>
  );
}

export default function SuppliersPage() {
  const { t, language, dir } = useI18n();
  const statementRef = useRef(null);
  const [list, setList] = useState([]);
  const [allSuppliers, setAllSuppliers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [details, setDetails] = useState(null);
  const [summary, setSummary] = useState(null);
  const [aging, setAging] = useState({ asOfDate: today, rows: [] });
  const [settlements, setSettlements] = useState([]);
  const [settlementForm, setSettlementForm] = useState(initialSettlementForm);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [activeSuppliersPanel, setActiveSuppliersPanel] = useState('form');
  const currentUser = getCurrentUser();
  const canPrintStatements = hasPermission(currentUser, PERMISSIONS.REPORTS_PRINT) || hasPermission(currentUser, PERMISSIONS.SUPPLIERS_VIEW);
  const currencyLabelMap = useMemo(() => ({
    SYP: t('sypCurrencyLabel'),
    USD: t('usdCurrencyLabel')
  }), [t]);
  const getCurrencyLabel = (currency) => currencyLabelMap[currency] || currency;
  const savedSupplierOptions = useMemo(() => (
    [...allSuppliers]
      .filter((supplier) => supplier?.id && supplier?.name)
      .sort((a, b) => a.name.localeCompare(b.name, language === 'en' ? 'en' : 'ar'))
  ), [allSuppliers, language]);

  const openingBalanceHelp = useMemo(() => t('supplierOpeningBalanceHelp'), [t]);

  const load = async (q = '') => {
    const res = await api.get('/suppliers', { params: q ? { q } : {} });
    setList(res.data.data || []);
  };

  const loadAllSuppliers = async () => {
    const res = await api.get('/suppliers');
    setAllSuppliers(res.data.data || []);
  };

  const loadSummary = async (id) => {
    const res = await api.get(`/suppliers/${id}/summary`);
    setSummary(res.data.data);
  };

  const loadSettlements = async (id) => {
    const res = await api.get(`/suppliers/${id}/settlements`);
    setSettlements(res.data.data || []);
  };

  const loadAging = async (asOfDate = today) => {
    const res = await api.get('/suppliers/reports/aging', { params: { asOfDate } });
    setAging(res.data.data || { asOfDate, rows: [] });
  };

  const mapSupplierToForm = (supplier) => ({
    id: supplier.id,
    name: supplier.name,
    phone: supplier.phone || '',
    address: supplier.address || '',
    openingBalance: supplier.opening_balance ?? '',
    currency: supplier.currency,
    notes: supplier.notes || ''
  });

  useEffect(() => {
    Promise.all([load(), loadAllSuppliers(), loadAging(today)]).catch(() => setError(t('loadingSuppliersFailed')));
  }, [t]);

  const openSupplierWorkspace = async (id, panel = null) => {
    setError('');
    try {
      const [detailsRes, summaryRes, settlementsRes] = await Promise.all([
        api.get(`/suppliers/${id}`),
        api.get(`/suppliers/${id}/summary`),
        api.get(`/suppliers/${id}/settlements`)
      ]);
      setDetails(detailsRes.data.data);
      setSummary(summaryRes.data.data);
      setSettlements(settlementsRes.data.data || []);
      setSettlementForm((current) => ({
        ...current,
        currency: detailsRes.data.data.currency || 'SYP'
      }));
      if (panel) setActiveSuppliersPanel(panel);
    } catch {
      setError(t('supplierDetailsFailed'));
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        ...form,
        openingBalance: Number(form.openingBalance || 0)
      };
      const res = form.id ? await api.patch(`/suppliers/${form.id}`, payload) : await api.post('/suppliers', payload);
      const supplierId = form.id || res.data.data?.id;
      setForm(initialForm);
      setActiveSuppliersPanel('list');
      await Promise.all([load(search), loadAllSuppliers()]);
      if (supplierId) {
        await openSupplierWorkspace(supplierId);
      }
    } catch (err) {
      setError(err.response?.data?.error || t('supplierSaveFailed'));
    }
  };

  const viewDetails = async (id, resetError = true) => {
    try {
      if (resetError) setError('');
      const res = await api.get(`/suppliers/${id}`);
      setDetails(res.data.data);
      setSettlementForm((current) => ({
        ...current,
        currency: res.data.data.currency || 'SYP'
      }));
    } catch {
      setError(t('supplierDetailsFailed'));
    }
  };

  const selectExistingSupplier = async (supplier) => {
    setForm(mapSupplierToForm(supplier));
    await openSupplierWorkspace(supplier.id);
  };

  const handleNameChange = async (value) => {
    const normalizedValue = value.trim().toLowerCase();
    const leavingCurrentSelection = Boolean(form.id) && form.name.trim().toLowerCase() !== normalizedValue;
    setForm((current) => ({
      ...current,
      id: leavingCurrentSelection ? null : current.id,
      name: value
    }));
    const match = savedSupplierOptions.find((supplier) => supplier.name.trim().toLowerCase() === normalizedValue);
    if (!match && leavingCurrentSelection) {
      setDetails(null);
      setSummary(null);
      setSettlements([]);
    }
    if (!match || match.id === form.id) return;
    try {
      await selectExistingSupplier(match);
    } catch {
      setError(t('supplierSelectedLoadFailed'));
    }
  };

  const summaryCards = summary ? [
    { label: t('totalPurchasesMetric'), value: `${summary.total_purchases} ${summary.currency}` },
    { label: t('totalPaymentsMetric'), value: `${summary.total_payments} ${summary.currency}` },
    { label: t('currentBalance'), value: `${summary.current_balance} ${summary.currency}` },
    { label: t('amountOwedToSupplier'), value: `${summary.amount_owed_to_supplier} ${summary.currency}` },
    { label: t('amountReceivableFromSupplier'), value: `${summary.amount_receivable_from_supplier} ${summary.currency}` },
    { label: t('openingBalance'), value: `${summary.opening_balance} ${summary.currency}` },
    { label: t('invoiceCount'), value: summary.invoice_count },
    { label: t('lastTransaction'), value: summary.last_transaction_date || '-' }
  ] : [];
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
      title: `${t('printSupplierStatement')} ${details.name}`,
      html: statementRef.current.innerHTML,
      lang: language,
      dir
    });
  };

  const saveSettlement = async (event) => {
    event.preventDefault();
    if (!details?.id) {
      setError(t('chooseSupplierFirstForSettlement'));
      return;
    }

    setError('');
    try {
      await api.post(`/suppliers/${details.id}/settlements`, {
        date: settlementForm.date,
        amount: Number(settlementForm.amount),
        currency: settlementForm.currency,
        reference: settlementForm.reference || null,
        notes: settlementForm.notes || null
      });

      setSettlementForm({
        ...initialSettlementForm,
        date: today,
        currency: details.currency || 'SYP'
      });
      await Promise.all([load(search), viewDetails(details.id, false), loadSummary(details.id), loadSettlements(details.id)]);
      setActiveSuppliersPanel('settlements');
    } catch (err) {
      setError(err.response?.data?.error || t('supplierSettlementSaveFailed'));
    }
  };

  return (
    <main className="container suppliers-page">
      <div className="cash-tabs" role="tablist" aria-label={t('suppliersTitle')}>
        <button
          className={`cash-tab${activeSuppliersPanel === 'form' ? ' active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeSuppliersPanel === 'form'}
          onClick={() => setActiveSuppliersPanel('form')}
        >
          {form.id ? t('editSupplier') : t('addSupplierTitle')}
        </button>
        <button
          className={`cash-tab${activeSuppliersPanel === 'list' ? ' active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeSuppliersPanel === 'list'}
          onClick={() => setActiveSuppliersPanel('list')}
        >
          {t('suppliersTitle')}
        </button>
        <button
          className={`cash-tab${activeSuppliersPanel === 'summary' ? ' active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeSuppliersPanel === 'summary'}
          onClick={() => setActiveSuppliersPanel('summary')}
        >
          {t('supplierFinancialStatus')}
        </button>
        <button
          className={`cash-tab${activeSuppliersPanel === 'aging' ? ' active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeSuppliersPanel === 'aging'}
          onClick={() => setActiveSuppliersPanel('aging')}
        >
          {t('agingPayables')}
        </button>
        <button
          className={`cash-tab${activeSuppliersPanel === 'settlements' ? ' active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeSuppliersPanel === 'settlements'}
          onClick={() => setActiveSuppliersPanel('settlements')}
        >
          {t('supplierSettlementHistory')}
        </button>
      </div>

      {activeSuppliersPanel === 'form' ? (
        <section className="card">
          <form className="form-grid suppliers-inline-hints-form" onSubmit={save}>
          <FormField label={t('supplierName')} className="suppliers-form-field-name">
            <EntityPickerField
              value={form.name}
              options={savedSupplierOptions}
              placeholder={t('supplierName')}
              ariaLabel={t('supplierName')}
              required
              onInputChange={handleNameChange}
              onSelect={selectExistingSupplier}
            />
          </FormField>
          <FormField label={t('phone')}>
            <input placeholder={t('phone')} aria-label={t('phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </FormField>
          <FormField label={t('address')}>
            <input placeholder={t('address')} aria-label={t('address')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </FormField>
          <FormField label={t('openingBalance')} help={openingBalanceHelp}>
            <input type="number" min="0" step="0.01" placeholder={t('openingBalance')} aria-label={t('openingBalance')} value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} />
          </FormField>
          <FormField label={t('currency')}>
            <select aria-label={t('currency')} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{getCurrencyLabel(c)}</option>)}
            </select>
          </FormField>
          <FormField label={t('notesField')}>
            <input placeholder={t('notesField')} aria-label={t('notesField')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </FormField>
          <button className="btn" type="submit">{t('save')}</button>
        </form>
        {error && <p className="error">{error}</p>}
        </section>
      ) : null}

      {activeSuppliersPanel === 'list' ? (
        <section className="card">
          <div className="header-actions" style={{ marginBottom: 10 }}>
          <input placeholder={t('searchByNamePhone')} value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn" type="button" onClick={() => load(search)}>{t('searchAction')}</button>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>{t('supplierName')}</th>
              <th>{t('phone')}</th>
              <th>{t('currentBalance')}</th>
              <th>{t('currency')}</th>
              <th>{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.phone || '-'}</td>
                <td>{item.current_balance}</td>
                <td>{getCurrencyLabel(item.currency)}</td>
                <td className="actions">
                  <button className="btn" type="button" onClick={async () => {
                    setForm({ ...mapSupplierToForm(item) });
                    await openSupplierWorkspace(item.id, 'form');
                  }}>{t('edit')}</button>
                  <button className="btn" type="button" onClick={async () => {
                    await openSupplierWorkspace(item.id, 'summary');
                  }}>{t('details')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </section>
      ) : null}

      {activeSuppliersPanel === 'summary' ? (
        <section className="card suppliers-summary-card" ref={statementRef}>
        {details && canPrintStatements ? (
          <div className="header-actions no-print" style={{ marginBottom: 12 }}>
            <button className="btn secondary" type="button" onClick={printStatement}>{t('printSupplierStatement')}</button>
          </div>
        ) : null}
        {details ? (
          <div className="suppliers-details-grid">
            <div className="suppliers-details-list">
              <p><strong>{t('supplierName')}:</strong> {details.name}</p>
              <p><strong>{t('phone')}:</strong> {details.phone || '-'}</p>
              <p><strong>{t('address')}:</strong> {details.address || '-'}</p>
              <p><strong>{t('openingBalance')}:</strong> {details.opening_balance} {getCurrencyLabel(details.currency)}</p>
              <p><strong>{t('currentBalance')}:</strong> {details.current_balance} {getCurrencyLabel(details.currency)}</p>
              <p><strong>{t('notesField')}:</strong> {details.notes || '-'}</p>
            </div>
          </div>
        ) : null}
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
          <p className="hint">{t('chooseSupplierToViewSummary')}</p>
        )}
        </section>
      ) : null}

      {activeSuppliersPanel === 'aging' ? (
        <section className="card">
        <div className="section-header">
          <div>
            <h2>{t('agingPayables')}</h2>
            <p className="hint">{t('agingPayablesHint')}</p>
          </div>
          <div className="header-actions">
            <input type="date" value={aging.asOfDate || today} onChange={(e) => setAging((current) => ({ ...current, asOfDate: e.target.value }))} />
            <button className="btn" type="button" onClick={() => loadAging(aging.asOfDate || today)}>{t('refresh')}</button>
          </div>
        </div>

        <div className="summary-grid" style={{ marginBottom: 12 }}>
          <article className="summary-card">
            <p className="summary-label">{t('entitiesCount')}</p>
            <strong className="summary-value">{aging.rows?.length || 0}</strong>
          </article>
          {agingTotals.map(([currency, totals]) => (
            <article className="summary-card" key={currency}>
              <p className="summary-label">{t('amountOwedToSupplier')} {getCurrencyLabel(currency)}</p>
              <strong className="summary-value">{totals.outstanding.toFixed(2)} {getCurrencyLabel(currency)}</strong>
              <small>{t('amountReceivableFromSupplier')}: {totals.credits.toFixed(2)} {getCurrencyLabel(currency)}</small>
            </article>
          ))}
        </div>

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
              <th>{t('unappliedCredits')}</th>
            </tr>
          </thead>
          <tbody>
            {(aging.rows || []).map((row) => (
              <tr key={row.supplier_id}>
                <td>{row.supplier_name}</td>
                <td>{getCurrencyLabel(row.currency)}</td>
                <td>{Number(row.current || 0).toFixed(2)}</td>
                <td>{Number(row.days31To60 || 0).toFixed(2)}</td>
                <td>{Number(row.days61To90 || 0).toFixed(2)}</td>
                <td>{Number(row.days90Plus || 0).toFixed(2)}</td>
                <td>{Number(row.totalOutstanding || 0).toFixed(2)}</td>
                <td>{Number(row.unappliedCredits || 0).toFixed(2)}</td>
              </tr>
            ))}
            {(aging.rows || []).length === 0 ? (
              <tr>
                <td colSpan="8">{t('noAgingData')}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        </section>
      ) : null}

      {activeSuppliersPanel === 'settlements' ? (
        <>
      <section className="card">
        {details ? (
          <>
            <p className="hint">{t('currentPayableBalance')}: {summary?.amount_owed_to_supplier ?? details.current_balance} {getCurrencyLabel(details.currency)}</p>
            <form className="form-grid" onSubmit={saveSettlement}>
              <FormField label={t('supplierName')}>
                <input value={details.name} readOnly />
              </FormField>
              <FormField label={t('date')}>
                <input type="date" value={settlementForm.date} onChange={(e) => setSettlementForm({ ...settlementForm, date: e.target.value })} required />
              </FormField>
              <FormField label={t('amount')}>
                <input type="number" min="0.01" step="0.01" value={settlementForm.amount} onChange={(e) => setSettlementForm({ ...settlementForm, amount: e.target.value })} required />
              </FormField>
              <FormField label={t('currency')}>
                <select value={settlementForm.currency} onChange={(e) => setSettlementForm({ ...settlementForm, currency: e.target.value })}>
                  {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{getCurrencyLabel(c)}</option>)}
                </select>
              </FormField>
              <FormField label={t('reference')}>
                <input value={settlementForm.reference} onChange={(e) => setSettlementForm({ ...settlementForm, reference: e.target.value })} />
              </FormField>
              <FormField label={t('notesField')}>
                <input value={settlementForm.notes} onChange={(e) => setSettlementForm({ ...settlementForm, notes: e.target.value })} />
              </FormField>
              <button className="btn" type="submit">{t('saveSettlement')}</button>
            </form>
          </>
        ) : (
          <p className="hint">{t('chooseSupplierToSettle')}</p>
        )}
      </section>

      <section className="card">
        {details ? (
          <table className="table">
            <thead>
              <tr>
                <th>{t('date')}</th>
                <th>{t('supplierName')}</th>
                <th>{t('amount')}</th>
                <th>{t('currency')}</th>
                <th>{t('reference')}</th>
                <th>{t('notesField')}</th>
                <th>{t('currentBalance')}</th>
                <th>{t('createdBy')}</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((item) => (
                <tr key={item.id}>
                  <td>{item.settlement_date}</td>
                  <td>{details.name}</td>
                  <td>{item.amount}</td>
                  <td>{getCurrencyLabel(item.currency)}</td>
                  <td>{item.reference || '-'}</td>
                  <td>{item.notes || '-'}</td>
                  <td>{item.balance_after}</td>
                  <td>{item.created_by_name || '-'}</td>
                </tr>
              ))}
              {settlements.length === 0 ? (
                <tr>
                  <td colSpan="8">{t('noSupplierSettlements')}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        ) : (
          <p className="hint">{t('chooseSupplierToViewSettlements')}</p>
        )}
      </section>
        </>
      ) : null}
    </main>
  );
}
