import { useEffect, useMemo, useState } from 'react';
import { SUPPORTED_CURRENCIES } from '@paint-shop/shared';
import { Link } from 'react-router-dom';
import api from '../services/api.js';
import { useI18n } from '../i18n/I18nProvider.jsx';

const today = new Date().toISOString().slice(0, 10);
const initialForm = {
  id: null,
  expenseDate: today,
  type: '',
  amount: 0,
  currency: 'SYP',
  beneficiary: '',
  notes: ''
};

export default function ExpensesPage() {
  const { t } = useI18n();
  const [expenses, setExpenses] = useState([]);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [form, setForm] = useState(initialForm);
  const [exchangeRateConfig, setExchangeRateConfig] = useState(null);
  const [error, setError] = useState('');

  const activeExchangeRate = useMemo(() => (
    form.currency === 'USD'
      ? Number(exchangeRateConfig?.activeRate || 0)
      : 1
  ), [exchangeRateConfig, form.currency]);
  const baseAmount = useMemo(() => Number(form.amount || 0) * Number(activeExchangeRate || 0), [form.amount, activeExchangeRate]);

  const load = async () => {
    const [eRes, rateRes] = await Promise.all([
      api.get('/expenses', { params: { q: search || undefined, from: from || undefined, to: to || undefined } }),
      api.get('/exchange-rate')
    ]);
    setExpenses(eRes.data.data || []);
    setExchangeRateConfig(rateRes.data.data || null);
  };

  useEffect(() => {
    load().catch(() => setError(t('loadingExpensesFailed')));
  }, [t]);

  const save = async (e) => {
    e.preventDefault();
    setError('');

    const payload = {
      expenseDate: form.expenseDate,
      type: form.type,
      amount: Number(form.amount),
      currency: form.currency,
      beneficiary: form.beneficiary || null,
      notes: form.notes || null
    };

    try {
      if (form.id) {
        await api.patch(`/expenses/${form.id}`, payload);
      } else {
        await api.post('/expenses', payload);
      }
      setForm({ ...initialForm, expenseDate: today });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || t('expenseSaveFailed'));
    }
  };

  return (
    <main className="container">
      <header className="header-row">
        <h1>{t('expenseTitle')}</h1>
        <Link className="btn" to="/">{t('back')}</Link>
      </header>

      <section className="card">
        <h2>{form.id ? t('editExpense') : t('addExpenseTitle')}</h2>
        <form onSubmit={save}>
          <div className="form-grid">
            <input type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} required />
            <input placeholder={t('expenseType')} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} required />
            <input type="number" min="0.01" step="0.01" placeholder={t('amount')} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="text" readOnly value={baseAmount.toFixed(2)} placeholder={t('baseValue')} />
            <input placeholder={t('beneficiary')} value={form.beneficiary} onChange={(e) => setForm({ ...form, beneficiary: e.target.value })} />
            <input placeholder={t('notesField')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <button className="btn" type="submit">{t('save')}</button>
          </div>
        </form>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="card">
        <h2>{t('expensesList')}</h2>
        <div className="form-grid" style={{ marginBottom: 8 }}>
          <input placeholder={t('searchByTypeBeneficiaryNotes')} value={search} onChange={(e) => setSearch(e.target.value)} />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <button className="btn" type="button" onClick={load}>{t('refresh')}</button>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>{t('date')}</th>
              <th>{t('type')}</th>
              <th>{t('amount')}</th>
              <th>{t('currency')}</th>
              <th>{t('baseAmountHeader')}</th>
              <th>{t('beneficiaryHeader')}</th>
              <th>{t('status')}</th>
              <th>{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((item) => (
              <tr key={item.id}>
                <td>{item.expense_date}</td>
                <td>{item.expense_category}</td>
                <td>{item.original_amount}</td>
                <td>{item.currency}</td>
                <td>{item.base_amount}</td>
                <td>{item.beneficiary || '-'}</td>
                <td>{item.status === 'ACTIVE' ? t('active') : t('cancelled')}</td>
                <td>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => setForm({
                      id: item.id,
                      expenseDate: item.expense_date,
                      type: item.expense_category,
                      amount: item.original_amount,
                      currency: item.currency,
                      beneficiary: item.beneficiary || '',
                      notes: item.notes || ''
                    })}
                  >
                    {t('edit')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
