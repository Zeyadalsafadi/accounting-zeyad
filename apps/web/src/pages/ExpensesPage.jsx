import { useEffect, useMemo, useState } from 'react';
import { PERMISSIONS, SUPPORTED_CURRENCIES } from '@paint-shop/shared';
import api from '../services/api.js';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { getCurrentUser, hasPermission } from '../utils/auth.js';

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
  const [activeExpensesPanel, setActiveExpensesPanel] = useState('form');
  const [expenses, setExpenses] = useState([]);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [form, setForm] = useState(initialForm);
  const [exchangeRateConfig, setExchangeRateConfig] = useState(null);
  const [error, setError] = useState('');
  const currentUser = getCurrentUser();
  const canApproveExpenses = hasPermission(currentUser, PERMISSIONS.EXPENSES_APPROVE);
  const canEditExpenses = hasPermission(currentUser, PERMISSIONS.EXPENSES_EDIT);
  const canOverrideExpensesLock = hasPermission(currentUser, PERMISSIONS.EXPENSES_OVERRIDE_LOCK);
  const lockWindowHours = 24;

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

  const approveExpense = async (id) => {
    setError('');
    try {
      await api.post(`/expenses/${id}/approve`);
      if (form.id === id) {
        setForm({ ...initialForm, expenseDate: today });
      }
      await load();
    } catch (err) {
      setError(err.response?.data?.error || t('expenseApproveFailed'));
    }
  };

  const unapproveExpense = async (id) => {
    const reason = window.prompt(t('unapproveReasonPrompt'));
    if (!reason) return;
    setError('');
    try {
      await api.post(`/expenses/${id}/unapprove`, { reason });
      if (form.id === id) {
        setForm({ ...initialForm, expenseDate: today });
      }
      await load();
    } catch (err) {
      setError(err.response?.data?.error || t('expenseUnapproveFailed'));
    }
  };

  const getApprovalLabel = (status) => (
    status === 'APPROVED' ? t('approvedStatus') : t('draftStatus')
  );

  const canApproveExpense = (expense) => (
    canApproveExpenses
    && expense.status === 'ACTIVE'
    && expense.approval_status !== 'APPROVED'
  );

  const canEditExpense = (expense) => (
    canEditExpenses
    && expense.status === 'ACTIVE'
    && ((() => {
      const timestamp = new Date(expense.created_at || expense.expense_date).getTime();
      return Number.isNaN(timestamp) || ((Date.now() - timestamp) / (1000 * 60 * 60)) <= lockWindowHours || canOverrideExpensesLock;
    })())
    && (expense.approval_status !== 'APPROVED' || canOverrideExpensesLock)
  );

  const canUnapproveExpense = (expense) => (
    canApproveExpenses
    && canOverrideExpensesLock
    && expense.status === 'ACTIVE'
    && expense.approval_status === 'APPROVED'
  );

  return (
    <main className="container expenses-page">
      <div className="cash-tabs" role="tablist" aria-label={t('expenseTitle')}>
        <button
          className={`cash-tab${activeExpensesPanel === 'form' ? ' active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeExpensesPanel === 'form'}
          onClick={() => setActiveExpensesPanel('form')}
        >
          {form.id ? t('editExpense') : t('addExpenseTitle')}
        </button>
        <button
          className={`cash-tab${activeExpensesPanel === 'list' ? ' active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeExpensesPanel === 'list'}
          onClick={() => setActiveExpensesPanel('list')}
        >
          {t('expensesList')}
        </button>
      </div>

      {activeExpensesPanel === 'form' ? (
        <section className="card">
          <form onSubmit={save}>
            {form.id ? (
              <div className="header-actions" style={{ marginBottom: 12 }}>
                <span className="hint">
                  {t('approvalStatus')}: {getApprovalLabel(expenses.find((item) => item.id === form.id)?.approval_status)}
                </span>
                {expenses.find((item) => item.id === form.id)?.approval_status === 'APPROVED' ? (
                  <span className="hint">{t('approvalLocked')}</span>
                ) : null}
                <span className="hint">{t('timeLockHint').replace('{hours}', String(lockWindowHours))}</span>
              </div>
            ) : null}
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
              <button
                className="btn"
                type="submit"
                disabled={Boolean(form.id && expenses.find((item) => item.id === form.id)?.approval_status === 'APPROVED' && !canOverrideExpensesLock)}
              >
                {t('save')}
              </button>
            </div>
          </form>
          {error && <p className="error">{error}</p>}
        </section>
      ) : null}

      {activeExpensesPanel === 'list' ? (
        <section className="card cash-history-card">
          <div className="form-grid" style={{ marginBottom: 8 }}>
            <input placeholder={t('searchByTypeBeneficiaryNotes')} value={search} onChange={(e) => setSearch(e.target.value)} />
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <button className="btn" type="button" onClick={load}>{t('refresh')}</button>
          </div>

          <div className="cash-history-meta">
            <span>{t('expensesList')}</span>
            <strong>{expenses.length}</strong>
          </div>

          <div className="cash-history-table-wrap cash-history-table-scroll">
            <table className="table cash-history-table">
              <thead>
                <tr>
                  <th>{t('date')}</th>
                  <th>{t('type')}</th>
                  <th>{t('amount')}</th>
                  <th>{t('currency')}</th>
                  <th>{t('baseAmountHeader')}</th>
                  <th>{t('beneficiaryHeader')}</th>
                  <th>{t('status')}</th>
                  <th>{t('approvalStatus')}</th>
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
                    <td>{getApprovalLabel(item.approval_status)}</td>
                    <td>
                      <div className="actions">
                        {canEditExpense(item) ? (
                          <button
                            className="btn"
                            type="button"
                            onClick={() => {
                              setForm({
                                id: item.id,
                                expenseDate: item.expense_date,
                                type: item.expense_category,
                                amount: item.original_amount,
                                currency: item.currency,
                                beneficiary: item.beneficiary || '',
                                notes: item.notes || ''
                              });
                              setActiveExpensesPanel('form');
                            }}
                          >
                            {t('edit')}
                          </button>
                        ) : null}
                        {canApproveExpense(item) ? (
                          <button className="btn secondary" type="button" onClick={() => approveExpense(item.id)}>
                            {t('approve')}
                          </button>
                        ) : null}
                        {canUnapproveExpense(item) ? (
                          <button className="btn danger" type="button" onClick={() => unapproveExpense(item.id)}>
                            {t('unapprove')}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}
