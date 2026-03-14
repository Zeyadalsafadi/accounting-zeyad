import { useEffect, useMemo, useState } from 'react';
import { SUPPORTED_CURRENCIES } from '@paint-shop/shared';
import { Link } from 'react-router-dom';
import api from '../services/api.js';
import { formatCommercialSyp } from '../utils/commercialCurrency.js';
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

const initialCollectionForm = {
  date: today,
  receivedSyp: '',
  receivedUsd: '',
  reference: '',
  notes: ''
};

export default function CustomersPage() {
  const { t } = useI18n();
  const [list, setList] = useState([]);
  const [allCustomers, setAllCustomers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [details, setDetails] = useState(null);
  const [summary, setSummary] = useState(null);
  const [collections, setCollections] = useState([]);
  const [collectionForm, setCollectionForm] = useState(initialCollectionForm);
  const [exchangeRateConfig, setExchangeRateConfig] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const load = async (q = '') => {
    const res = await api.get('/customers', { params: q ? { q } : {} });
    setList(res.data.data || []);
  };

  const loadAllCustomers = async () => {
    const res = await api.get('/customers');
    setAllCustomers(res.data.data || []);
  };

  useEffect(() => {
    Promise.all([
      load(),
      loadAllCustomers(),
      api.get('/exchange-rate').then((res) => setExchangeRateConfig(res.data.data || null))
    ]).catch(() => setError(t('loadingCustomersFailed')));
  }, [t]);

  const loadSummary = async (id) => {
    const res = await api.get(`/customers/${id}/summary`);
    setSummary(res.data.data);
  };

  const loadCollections = async (id) => {
    const res = await api.get(`/customers/${id}/collections`);
    setCollections(res.data.data || []);
  };

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (form.id) await api.patch(`/customers/${form.id}`, form);
      else await api.post('/customers', form);
      setForm(initialForm);
      await Promise.all([load(search), loadAllCustomers()]);
    } catch (err) {
      setError(err.response?.data?.error || t('customerSaveFailed'));
    }
  };

  const viewDetails = async (id) => {
    try {
      const res = await api.get(`/customers/${id}`);
      setDetails(res.data.data);
    } catch {
      setError(t('customerDetailsFailed'));
    }
  };

  const selectExistingCustomer = async (customer) => {
    setForm({
      id: customer.id,
      name: customer.name,
      phone: customer.phone || '',
      address: customer.address || '',
      openingBalance: customer.opening_balance,
      currency: customer.currency,
      notes: customer.notes || ''
    });
    await Promise.all([viewDetails(customer.id), loadSummary(customer.id), loadCollections(customer.id)]);
  };

  const handleNameChange = async (value) => {
    setForm((current) => ({ ...current, name: value }));
    const match = allCustomers.find((customer) => customer.name.trim().toLowerCase() === value.trim().toLowerCase());
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
      await Promise.all([load(search), viewDetails(details.id), loadSummary(details.id), loadCollections(details.id)]);
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

  return (
    <main className="container">
      <header className="header-row">
        <h1>{t('customersTitle')}</h1>
        <Link className="btn" to="/">{t('back')}</Link>
      </header>

      <section className="card">
        <h2>{form.id ? t('editCustomer') : t('addCustomerTitle')}</h2>
        <form className="form-grid" onSubmit={save}>
          <input list="customer-name-options" placeholder={t('customer')} value={form.name} onChange={(e) => handleNameChange(e.target.value)} required />
          <datalist id="customer-name-options">
            {[...new Set(allCustomers.map((customer) => customer.name).filter(Boolean))].map((name) => <option key={name} value={name} />)}
          </datalist>
          <input placeholder={t('phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input placeholder={t('address')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <input type="number" min="0" step="0.01" placeholder={t('openingBalance')} value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} />
          <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
            {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input placeholder={t('notesField')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
                <td>SYP</td>
                <td className="actions">
                  <button className="btn" type="button" onClick={() => setForm({
                    id: item.id,
                    name: item.name,
                    phone: item.phone || '',
                    address: item.address || '',
                    openingBalance: item.opening_balance,
                    currency: item.currency,
                    notes: item.notes || ''
                  })}>{t('edit')}</button>
                  <button className="btn" type="button" onClick={async () => {
                    await Promise.all([viewDetails(item.id), loadSummary(item.id), loadCollections(item.id)]);
                  }}>{t('details')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {details ? (
        <section className="card">
          <h2>{t('customerDetails')}</h2>
          <p><strong>{t('customer')}:</strong> {details.name}</p>
          <p><strong>{t('phone')}:</strong> {details.phone || '-'}</p>
          <p><strong>{t('address')}:</strong> {details.address || '-'}</p>
          <p><strong>{t('openingBalance')}:</strong> {formatCommercialSyp(details.opening_balance, details.currency, exchangeRateConfig?.activeRate)}</p>
          <p><strong>{t('currentBalance')}:</strong> {formatCommercialSyp(details.current_balance, details.currency, exchangeRateConfig?.activeRate)}</p>
          <p><strong>{t('notesField')}:</strong> {details.notes || '-'}</p>
        </section>
      ) : null}

      <section className="card">
        <h2>{t('customerFinancialStatus')}</h2>
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
      </section>

      <section className="card">
        <h2>{t('collectCustomerDebt')}</h2>
        {details ? (
          <>
            <p className="hint">{t('currentReceivableBalance')}: {formatCommercialSyp(summary?.amount_receivable_from_customer ?? details.current_balance, details.currency, exchangeRateConfig?.activeRate)}</p>
            <form className="form-grid" onSubmit={saveCollection}>
              <input value={details.name} readOnly />
              <input type="date" value={collectionForm.date} onChange={(e) => setCollectionForm({ ...collectionForm, date: e.target.value })} required />
              <input type="number" min="0" step="0.01" placeholder={t('receivedInSyp')} value={collectionForm.receivedSyp} onChange={(e) => setCollectionForm({ ...collectionForm, receivedSyp: e.target.value })} />
              <input type="number" min="0" step="0.01" placeholder={t('receivedInUsd')} value={collectionForm.receivedUsd} onChange={(e) => setCollectionForm({ ...collectionForm, receivedUsd: e.target.value })} />
              <input value={`1 USD = ${activeRate || 0} SYP`} readOnly />
              <input value={`${t('totalReceived')}: ${totalSettledSyp.toFixed(2)} SYP`} readOnly />
              <input placeholder={t('reference')} value={collectionForm.reference} onChange={(e) => setCollectionForm({ ...collectionForm, reference: e.target.value })} />
              <input placeholder={t('notesCollection')} value={collectionForm.notes} onChange={(e) => setCollectionForm({ ...collectionForm, notes: e.target.value })} />
              <button className="btn" type="submit">{t('collectCustomerDebt')}</button>
            </form>
          </>
        ) : (
          <p className="hint">{t('chooseCustomerToCollect')}</p>
        )}
      </section>

      <section className="card">
        <h2>{t('customerCollectionsHistory')}</h2>
        {details ? (
          <table className="table">
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
                  <td>{item.exchange_rate_used ?? '-'}</td>
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
        ) : (
          <p className="hint">{t('chooseCustomerToViewCollections')}</p>
        )}
      </section>
    </main>
  );
}
