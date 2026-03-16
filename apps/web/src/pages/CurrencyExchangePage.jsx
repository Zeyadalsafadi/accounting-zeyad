import { useEffect, useMemo, useState } from 'react';
import api from '../services/api.js';
import { useI18n } from '../i18n/I18nProvider.jsx';
import EntityPickerField from '../components/EntityPickerField.jsx';
import { formatExchangeRate } from '../utils/exchangeRate.js';

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
  const [activeExchangePanel, setActiveExchangePanel] = useState('register');
  const [form, setForm] = useState(initialForm);
  const [transactions, setTransactions] = useState([]);
  const [allCustomers, setAllCustomers] = useState([]);
  const [allSuppliers, setAllSuppliers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const formatRateInputValue = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return '';
    }
    return formatExchangeRate(parsed, '');
  };

  const sypAmount = useMemo(() => (
    Number(form.usdAmount || 0) * Number(form.exchangeRate || 0)
  ), [form.usdAmount, form.exchangeRate]);

  const counterpartyOptions = useMemo(() => {
    const names = new Map();

    allCustomers.forEach((customer) => {
      if (customer?.name) names.set(`customer-${customer.id}`, customer.name);
    });

    allSuppliers.forEach((supplier) => {
      if (supplier?.name) names.set(`supplier-${supplier.id}`, supplier.name);
    });

    transactions.forEach((transaction, index) => {
      const name = transaction.counterparty_name || transaction.counterparty || '';
      if (name) names.set(`exchange-${index}-${name}`, name);
    });

    return Array.from(names.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [allCustomers, allSuppliers, transactions]);

  const load = async () => {
    const [exchangeRes, customersRes, suppliersRes] = await Promise.allSettled([
      api.get('/currency-exchange'),
      api.get('/customers'),
      api.get('/suppliers')
    ]);

    if (exchangeRes.status !== 'fulfilled') {
      throw exchangeRes.reason;
    }

    const data = exchangeRes.value.data.data || {};
    setTransactions(data.transactions || []);
    setSummary(data.summary || null);
    setAllCustomers(customersRes.status === 'fulfilled' ? customersRes.value.data.data || [] : []);
    setAllSuppliers(suppliersRes.status === 'fulfilled' ? suppliersRes.value.data.data || [] : []);
    setForm((current) => ({
      ...current,
      exchangeRate: current.exchangeRate || formatRateInputValue(data.summary?.active_rate)
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
        exchangeRate: formatRateInputValue(summary?.active_rate)
      });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || t('currencyExchangeSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="container currency-exchange-page">
      <div className="cash-tabs" role="tablist" aria-label={t('currencyExchangeTitle')}>
        <button
          className={`cash-tab${activeExchangePanel === 'register' ? ' active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeExchangePanel === 'register'}
          onClick={() => setActiveExchangePanel('register')}
        >
          {t('registerExchangeOperation')}
        </button>
        <button
          className={`cash-tab${activeExchangePanel === 'summary' ? ' active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeExchangePanel === 'summary'}
          onClick={() => setActiveExchangePanel('summary')}
        >
          {t('exchangeSummary')}
        </button>
        <button
          className={`cash-tab${activeExchangePanel === 'history' ? ' active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeExchangePanel === 'history'}
          onClick={() => setActiveExchangePanel('history')}
        >
          {t('exchangeTransactionsHistory')}
        </button>
      </div>

      {activeExchangePanel === 'register' ? (
        <section className="card">
          <form onSubmit={save}>
            <div className="form-grid">
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="BUY_USD">{t('buyUsd')}</option>
                <option value="SELL_USD">{t('sellUsd')}</option>
              </select>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              <input type="number" min="0.01" step="0.01" placeholder={t('usdAmount')} value={form.usdAmount} onChange={(e) => setForm({ ...form, usdAmount: e.target.value })} required />
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder={t('exchangeRate')}
                value={form.exchangeRate}
                onChange={(e) => setForm({ ...form, exchangeRate: e.target.value })}
                onBlur={(e) => setForm((current) => ({ ...current, exchangeRate: formatRateInputValue(e.target.value) }))}
                required
              />
              <input type="text" readOnly value={sypAmount ? formatAmount(sypAmount) : ''} placeholder={t('equivalentSypValue')} />
              <EntityPickerField
                value={form.counterparty}
                options={counterpartyOptions}
                placeholder={t('counterparty')}
                ariaLabel={t('counterparty')}
                onInputChange={(value) => setForm({ ...form, counterparty: value })}
                onSelect={(option) => setForm({ ...form, counterparty: option.name })}
              />
              <input placeholder={t('exchangeNotes')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              <button className="btn" type="submit" disabled={saving}>{saving ? t('saving') : t('saveOperation')}</button>
            </div>
          </form>
          {error ? <p className="error">{error}</p> : null}
        </section>
      ) : null}

      {activeExchangePanel === 'summary' ? (
        <section className="card">
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
              <strong className="summary-value">1 USD = {formatExchangeRate(summary?.active_rate, '0.00')} SYP</strong>
            </article>
          </div>
        </section>
      ) : null}

      {activeExchangePanel === 'history' ? (
        <section className="card cash-history-card">
          <div className="cash-history-meta">
            <span>{t('exchangeTransactionsHistory')}</span>
            <strong>{transactions.length}</strong>
          </div>
          <div className="cash-history-table-wrap cash-history-table-scroll">
            <table className="table cash-history-table">
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
                    <td>{formatExchangeRate(item.exchange_rate)}</td>
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
          </div>
        </section>
      ) : null}
    </main>
  );
}
