import { useEffect, useMemo, useState } from 'react';
import { SUPPORTED_CURRENCIES } from '@paint-shop/shared';
import { Link } from 'react-router-dom';
import api from '../services/api.js';
import { useI18n } from '../i18n/I18nProvider.jsx';

const today = new Date().toISOString().slice(0, 10);
const initialForm = {
  id: null,
  name: '',
  phone: '',
  address: '',
  openingBalance: 0,
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

function FormField({ label, help, children }) {
  return (
    <div className="form-field">
      <FieldLabel label={label} help={help} />
      {children}
    </div>
  );
}

export default function SuppliersPage() {
  const { t } = useI18n();
  const [list, setList] = useState([]);
  const [allSuppliers, setAllSuppliers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [details, setDetails] = useState(null);
  const [summary, setSummary] = useState(null);
  const [settlements, setSettlements] = useState([]);
  const [settlementForm, setSettlementForm] = useState(initialSettlementForm);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

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

  const mapSupplierToForm = (supplier) => ({
    id: supplier.id,
    name: supplier.name,
    phone: supplier.phone || '',
    address: supplier.address || '',
    openingBalance: supplier.opening_balance,
    currency: supplier.currency,
    notes: supplier.notes || ''
  });

  useEffect(() => {
    Promise.all([load(), loadAllSuppliers()]).catch(() => setError(t('loadingSuppliersFailed')));
  }, [t]);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = form.id ? await api.patch(`/suppliers/${form.id}`, form) : await api.post('/suppliers', form);
      const supplierId = form.id || res.data.data?.id;
      setForm(initialForm);
      await Promise.all([load(search), loadAllSuppliers()]);
      if (supplierId) {
        await Promise.all([viewDetails(supplierId, false), loadSummary(supplierId)]);
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
    await Promise.all([viewDetails(supplier.id, false), loadSummary(supplier.id), loadSettlements(supplier.id)]);
  };

  const handleNameChange = async (value) => {
    setForm((current) => ({ ...current, name: value }));
    const match = allSuppliers.find((supplier) => supplier.name.trim().toLowerCase() === value.trim().toLowerCase());
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
    } catch (err) {
      setError(err.response?.data?.error || t('supplierSettlementSaveFailed'));
    }
  };

  return (
    <main className="container">
      <header className="header-row">
        <h1>{t('suppliersTitle')}</h1>
        <Link className="btn" to="/">{t('back')}</Link>
      </header>

      <section className="card">
        <h2>{form.id ? t('editSupplier') : t('addSupplierTitle')}</h2>
        <form className="form-grid" onSubmit={save}>
          <FormField label={t('supplierName')}>
            <input list="supplier-name-options" value={form.name} onChange={(e) => handleNameChange(e.target.value)} required />
            <datalist id="supplier-name-options">
              {[...new Set(allSuppliers.map((supplier) => supplier.name).filter(Boolean))].map((name) => <option key={name} value={name} />)}
            </datalist>
          </FormField>
          <FormField label={t('phone')}>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </FormField>
          <FormField label={t('address')}>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </FormField>
          <FormField label={t('openingBalance')} help={openingBalanceHelp}>
            <input type="number" min="0" step="0.01" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} />
          </FormField>
          <FormField label={t('currency')}>
            <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </FormField>
          <FormField label={t('notesField')}>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </FormField>
          <button className="btn" type="submit">{t('save')}</button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>

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
                <td>{item.currency}</td>
                <td className="actions">
                  <button className="btn" type="button" onClick={async () => {
                    setForm({ ...mapSupplierToForm(item) });
                    await Promise.all([viewDetails(item.id), loadSummary(item.id), loadSettlements(item.id)]);
                  }}>{t('edit')}</button>
                  <button className="btn" type="button" onClick={async () => {
                    await Promise.all([viewDetails(item.id), loadSummary(item.id), loadSettlements(item.id)]);
                  }}>{t('details')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {details ? (
        <section className="card">
          <h2>{t('details')}</h2>
          <p><strong>{t('supplierName')}:</strong> {details.name}</p>
          <p><strong>{t('phone')}:</strong> {details.phone || '-'}</p>
          <p><strong>{t('address')}:</strong> {details.address || '-'}</p>
          <p><strong>{t('openingBalance')}:</strong> {details.opening_balance} {details.currency}</p>
          <p><strong>{t('currentBalance')}:</strong> {details.current_balance} {details.currency}</p>
          <p><strong>{t('notesField')}:</strong> {details.notes || '-'}</p>
        </section>
      ) : null}

      <section className="card">
        <h2>{t('supplierFinancialStatus')}</h2>
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

      <section className="card">
        <h2>{t('settleSupplierDebt')}</h2>
        {details ? (
          <>
            <p className="hint">{t('currentPayableBalance')}: {summary?.amount_owed_to_supplier ?? details.current_balance} {details.currency}</p>
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
                  {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
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
        <h2>{t('supplierSettlementHistory')}</h2>
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
                  <td>{item.currency}</td>
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
    </main>
  );
}
