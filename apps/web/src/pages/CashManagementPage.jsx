import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api.js';
import { useI18n } from '../i18n/I18nProvider.jsx';

const today = new Date().toISOString().slice(0, 10);
const initialForm = {
  accountId: '',
  amount: 0,
  countedAmount: 0,
  date: today,
  notes: ''
};

export default function CashManagementPage() {
  const { t } = useI18n();
  const [accounts, setAccounts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [filters, setFilters] = useState({ accountId: '', from: '', to: '' });
  const [deposit, setDeposit] = useState(initialForm);
  const [withdraw, setWithdraw] = useState(initialForm);
  const [opening, setOpening] = useState(initialForm);
  const [closing, setClosing] = useState(initialForm);
  const [error, setError] = useState('');

  const totalByCurrency = useMemo(() => accounts.reduce((acc, a) => {
    acc[a.currency] = (acc[a.currency] || 0) + Number(a.balance || 0);
    return acc;
  }, {}), [accounts]);

  const loadAccounts = async () => {
    const res = await api.get('/cash-management/accounts');
    setAccounts(res.data.data || []);
  };

  const loadMovements = async () => {
    const params = {};
    if (filters.accountId) params.accountId = filters.accountId;
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    const res = await api.get('/cash-management/movements', { params });
    setMovements(res.data.data || []);
  };

  useEffect(() => {
    Promise.all([loadAccounts(), loadMovements()]).catch(() => setError(t('loadingCashManagementFailed')));
  }, [t]);

  const postAction = async (endpoint, payload, reset) => {
    setError('');
    try {
      await api.post(endpoint, payload);
      reset();
      await Promise.all([loadAccounts(), loadMovements()]);
    } catch (err) {
      setError(err.response?.data?.error || t('cashActionFailed'));
    }
  };

  return (
    <main className="container">
      <header className="header-row">
        <h1>{t('cashManagementTitle')}</h1>
        <Link className="btn" to="/">{t('back')}</Link>
      </header>

      <section className="card">
        <h2>{t('currentBalances')}</h2>
        <table className="table">
          <thead>
            <tr><th>{t('account')}</th><th>{t('currency')}</th><th>{t('balance')}</th></tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}><td>{a.name}</td><td>{a.currency}</td><td>{a.balance}</td></tr>
            ))}
          </tbody>
        </table>
        <p><strong>{t('totalSyp')}:</strong> {totalByCurrency.SYP || 0} | <strong>{t('totalUsd')}:</strong> {totalByCurrency.USD || 0}</p>
      </section>

      <section className="card">
        <h2>{t('recordDeposit')}</h2>
        <div className="form-grid">
          <select value={deposit.accountId} onChange={(e) => setDeposit({ ...deposit, accountId: e.target.value })}>
            <option value="">{t('chooseAccount')}</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input type="number" min="0.01" step="0.01" value={deposit.amount} onChange={(e) => setDeposit({ ...deposit, amount: e.target.value })} placeholder={t('amountPlaceholder')} />
          <input type="date" value={deposit.date} onChange={(e) => setDeposit({ ...deposit, date: e.target.value })} />
          <input value={deposit.notes} onChange={(e) => setDeposit({ ...deposit, notes: e.target.value })} placeholder={t('notesField')} />
          <button className="btn" onClick={() => postAction('/cash-management/deposit', { ...deposit, accountId: Number(deposit.accountId), amount: Number(deposit.amount) }, () => setDeposit(initialForm))}>{t('saveDeposit')}</button>
        </div>
      </section>

      <section className="card">
        <h2>{t('recordWithdraw')}</h2>
        <div className="form-grid">
          <select value={withdraw.accountId} onChange={(e) => setWithdraw({ ...withdraw, accountId: e.target.value })}>
            <option value="">{t('chooseAccount')}</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input type="number" min="0.01" step="0.01" value={withdraw.amount} onChange={(e) => setWithdraw({ ...withdraw, amount: e.target.value })} placeholder={t('amountPlaceholder')} />
          <input type="date" value={withdraw.date} onChange={(e) => setWithdraw({ ...withdraw, date: e.target.value })} />
          <input value={withdraw.notes} onChange={(e) => setWithdraw({ ...withdraw, notes: e.target.value })} placeholder={t('notesField')} />
          <button className="btn danger" onClick={() => postAction('/cash-management/withdraw', { ...withdraw, accountId: Number(withdraw.accountId), amount: Number(withdraw.amount) }, () => setWithdraw(initialForm))}>{t('saveWithdraw')}</button>
        </div>
      </section>

      <section className="card">
        <h2>{t('openingBalanceTitle')}</h2>
        <div className="form-grid">
          <select value={opening.accountId} onChange={(e) => setOpening({ ...opening, accountId: e.target.value })}>
            <option value="">{t('chooseAccount')}</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input type="number" min="0" step="0.01" value={opening.amount} onChange={(e) => setOpening({ ...opening, amount: e.target.value })} placeholder={t('amountPlaceholder')} />
          <input type="date" value={opening.date} onChange={(e) => setOpening({ ...opening, date: e.target.value })} />
          <input value={opening.notes} onChange={(e) => setOpening({ ...opening, notes: e.target.value })} placeholder={t('notesField')} />
          <button className="btn" onClick={() => postAction('/cash-management/opening-balance', { ...opening, accountId: Number(opening.accountId), amount: Number(opening.amount) }, () => setOpening(initialForm))}>{t('saveOpeningBalance')}</button>
        </div>
      </section>

      <section className="card">
        <h2>{t('dailyClosing')}</h2>
        <div className="form-grid">
          <select value={closing.accountId} onChange={(e) => setClosing({ ...closing, accountId: e.target.value })}>
            <option value="">{t('chooseAccount')}</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input type="number" min="0" step="0.01" value={closing.countedAmount} onChange={(e) => setClosing({ ...closing, countedAmount: e.target.value })} placeholder={t('countedBalance')} />
          <input type="date" value={closing.date} onChange={(e) => setClosing({ ...closing, date: e.target.value })} />
          <input value={closing.notes} onChange={(e) => setClosing({ ...closing, notes: e.target.value })} placeholder={t('notesField')} />
          <button className="btn" onClick={() => postAction('/cash-management/closing-balance', { ...closing, accountId: Number(closing.accountId), countedAmount: Number(closing.countedAmount) }, () => setClosing(initialForm))}>{t('runClosing')}</button>
        </div>
      </section>

      <section className="card">
        <h2>{t('cashMovements')}</h2>
        <div className="form-grid" style={{ marginBottom: 8 }}>
          <select value={filters.accountId} onChange={(e) => setFilters({ ...filters, accountId: e.target.value })}>
            <option value="">{t('allAccounts')}</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
          <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
          <button className="btn" onClick={loadMovements}>{t('refresh')}</button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>{t('date')}</th>
              <th>{t('account')}</th>
              <th>{t('type')}</th>
              <th>{t('direction')}</th>
              <th>{t('amount')}</th>
              <th>{t('currency')}</th>
              <th>{t('movementSource')}</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id}>
                <td>{m.movement_date}</td>
                <td>{m.account_name}</td>
                <td>{m.movement_type}</td>
                <td>{m.direction}</td>
                <td>{m.original_amount}</td>
                <td>{m.currency}</td>
                <td>{m.source_type || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {error && <p className="error">{error}</p>}
    </main>
  );
}
