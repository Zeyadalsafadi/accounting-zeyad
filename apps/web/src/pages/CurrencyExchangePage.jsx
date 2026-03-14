import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api.js';
import { useI18n } from '../i18n/I18nProvider.jsx';

const today = new Date().toISOString().slice(0, 10);
const initialForm = {
  type: 'BUY_USD',
  date: today,
  usdAmount: '',
  exchangeRate: '',
  counterparty: '',
  notes: ''
};

function formatAmount(value) {
  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export default function CurrencyExchangePage() {
  const { t } = useI18n();
  const [form, setForm] = useState(initialForm);
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const sypAmount = useMemo(() => (
    Number(form.usdAmount || 0) * Number(form.exchangeRate || 0)
  ), [form.usdAmount, form.exchangeRate]);

  const load = async () => {
    const response = await api.get('/currency-exchange');
    const data = response.data.data || {};
    setTransactions(data.transactions || []);
    setSummary(data.summary || null);
    setForm((current) => ({
      ...current,
      exchangeRate: current.exchangeRate || String(data.summary?.active_rate || '')
    }));
  };

  useEffect(() => {
    load().catch(() => setError(t('loadingCurrencyExchangeFailed')));
  }, [t]);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      await api.post('/currency-exchange', {
        type: form.type,
        date: form.date,
        usdAmount: Number(form.usdAmount),
        exchangeRate: Number(form.exchangeRate),
        sypAmount,
        counterparty: form.counterparty || null,
        notes: form.notes || null
      });

      setForm({
        ...initialForm,
        date: today,
        exchangeRate: String(summary?.active_rate || '')
      });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || t('currencyExchangeSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="container">
      <header className="header-row">
        <h1>{t('currencyExchangeTitle')}</h1>
        <Link className="btn" to="/">{t('back')}</Link>
      </header>

      <section className="card">
        <h2>{t('registerExchangeOperation')}</h2>
        <form onSubmit={save}>
          <div className="form-grid">
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="BUY_USD">{t('buyUsd')}</option>
              <option value="SELL_USD">{t('sellUsd')}</option>
            </select>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            <input type="number" min="0.01" step="0.01" placeholder={t('usdAmount')} value={form.usdAmount} onChange={(e) => setForm({ ...form, usdAmount: e.target.value })} required />
            <input type="number" min="0.01" step="0.01" placeholder={t('exchangeRate')} value={form.exchangeRate} onChange={(e) => setForm({ ...form, exchangeRate: e.target.value })} required />
            <input type="text" readOnly value={sypAmount ? formatAmount(sypAmount) : ''} placeholder={t('equivalentSypValue')} />
            <input placeholder={t('counterparty')} value={form.counterparty} onChange={(e) => setForm({ ...form, counterparty: e.target.value })} />
            <input placeholder={t('exchangeNotes')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <button className="btn" type="submit" disabled={saving}>{saving ? t('saving') : t('saveOperation')}</button>
          </div>
        </form>
        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="card">
        <h2>{t('exchangeSummary')}</h2>
        <div className="summary-grid">
          <article className="summary-card">
            <p className="summary-label">{t('totalUsdBought')}</p>
            <strong className="summary-value">{formatAmount(summary?.total_usd_bought)} USD</strong>
          </article>
          <article className="summary-card">
            <p className="summary-label">{t('totalUsdSold')}</p>
            <strong className="summary-value">{formatAmount(summary?.total_usd_sold)} USD</strong>
          </article>
          <article className="summary-card">
            <p className="summary-label">{t('netUsdMovement')}</p>
            <strong className="summary-value">{formatAmount(summary?.net_usd_movement)} USD</strong>
          </article>
          <article className="summary-card">
            <p className="summary-label">{t('todayActivity')}</p>
            <strong className="summary-value">{formatAmount(summary?.today_usd_activity)} USD</strong>
          </article>
          <article className="summary-card">
            <p className="summary-label">{t('activeExchangeRate')}</p>
            <strong className="summary-value">1 USD = {formatAmount(summary?.active_rate)} SYP</strong>
          </article>
        </div>
      </section>

      <section className="card">
        <h2>{t('exchangeTransactionsHistory')}</h2>
        <table className="table">
          <thead>
            <tr>
              <th>{t('date')}</th>
              <th>{t('transactionType')}</th>
              <th>{t('usdAmount')}</th>
              <th>{t('exchangeRate')}</th>
              <th>{t('equivalentSypValue')}</th>
              <th>{t('counterparty')}</th>
              <th>{t('notesField')}</th>
              <th>{t('createdBy')}</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((item) => (
              <tr key={item.id}>
                <td>{item.exchange_date}</td>
                <td>{item.transaction_type === 'BUY_USD' ? t('buyUsd') : t('sellUsd')}</td>
                <td>{formatAmount(item.usd_amount)}</td>
                <td>{formatAmount(item.exchange_rate)}</td>
                <td>{formatAmount(item.syp_amount)}</td>
                <td>{item.counterparty_name || '-'}</td>
                <td>{item.notes || '-'}</td>
                <td>{item.created_by_name || '-'}</td>
              </tr>
            ))}
            {transactions.length === 0 ? (
              <tr>
                <td colSpan="8">{t('noExchangeTransactions')}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </main>
  );
}
