import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../services/api.js';
import { useI18n } from '../i18n/I18nProvider.jsx';

const today = new Date().toISOString().slice(0, 10);
const initialForm = {
  accountId: '',
  amount: '',
  countedAmount: '',
  date: today,
  notes: ''
};
const initialAccountForm = {
  name: '',
  currency: 'SYP'
};

export default function CashManagementPage() {
  const { t } = useI18n();
  const location = useLocation();
  const [activeCashPanel, setActiveCashPanel] = useState('balances');
  const [accounts, setAccounts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [closingHistory, setClosingHistory] = useState([]);
  const [dailySummary, setDailySummary] = useState(null);
  const [filters, setFilters] = useState({ accountId: '', from: '', to: '' });
  const [deposit, setDeposit] = useState(initialForm);
  const [withdraw, setWithdraw] = useState(initialForm);
  const [opening, setOpening] = useState(initialForm);
  const [closing, setClosing] = useState(initialForm);
  const [accountForm, setAccountForm] = useState(initialAccountForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const activeAccounts = useMemo(
    () => accounts.filter((account) => Number(account.is_active) === 1),
    [accounts]
  );

  const totalByCurrency = useMemo(() => accounts.reduce((acc, account) => {
    acc[account.currency] = (acc[account.currency] || 0) + Number(account.balance || 0);
    return acc;
  }, {}), [accounts]);

  const activeAccountCount = activeAccounts.length;
  const inactiveAccountCount = accounts.length - activeAccountCount;

  const closingVariance = useMemo(() => {
    if (!dailySummary) return 0;
    return Number(closing.countedAmount || 0) - Number(dailySummary.expectedBalance || 0);
  }, [closing.countedAmount, dailySummary]);

  const resetMessages = () => {
    setError('');
    setSuccess('');
  };

  const loadAccounts = async () => {
    const res = await api.get('/cash-management/accounts');
    const data = res.data.data || [];
    setAccounts(data);
  };

  const loadMovements = async () => {
    const params = {};
    if (filters.accountId) params.accountId = filters.accountId;
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    const [movementsRes, closingRes] = await Promise.all([
      api.get('/cash-management/movements', { params }),
      api.get('/cash-management/closing-history', { params })
    ]);
    setMovements(movementsRes.data.data || []);
    setClosingHistory(closingRes.data.data || []);
  };

  const loadDailySummary = async (accountId, date) => {
    if (!accountId || !date) {
      setDailySummary(null);
      return;
    }
    const res = await api.get('/cash-management/daily-summary', {
      params: { accountId, date }
    });
    setDailySummary(res.data.data || null);
  };

  useEffect(() => {
    Promise.all([loadAccounts(), loadMovements()]).catch(() => setError(t('loadingCashManagementFailed')));
  }, [t]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    const allowedTabs = new Set(['balances', 'deposit', 'withdraw', 'opening', 'closing', 'closing-history', 'movements', 'accounts']);
    if (tab && allowedTabs.has(tab)) {
      setActiveCashPanel(tab);
    }
  }, [location.search]);

  useEffect(() => {
    loadDailySummary(closing.accountId, closing.date).catch(() => setError(t('loadingCashClosingSummaryFailed')));
  }, [closing.accountId, closing.date, t]);

  const postAction = async (endpoint, payload, reset, successKey) => {
    resetMessages();
    try {
      await api.post(endpoint, payload);
      reset();
      setSuccess(t(successKey));
      await Promise.all([loadAccounts(), loadMovements()]);
    } catch (err) {
      setError(err.response?.data?.error || t('cashActionFailed'));
    }
  };

  const createAccount = async () => {
    resetMessages();
    try {
      await api.post('/cash-management/accounts', {
        name: accountForm.name.trim(),
        currency: accountForm.currency,
        isActive: 1
      });
      setAccountForm(initialAccountForm);
      setSuccess(t('cashAccountCreated'));
      await loadAccounts();
    } catch (err) {
      setError(err.response?.data?.error || t('cashAccountCreateFailed'));
    }
  };

  const toggleAccountStatus = async (account) => {
    resetMessages();
    try {
      await api.patch(`/cash-management/accounts/${account.id}/status`, {
        isActive: Number(account.is_active) === 1 ? 0 : 1
      });
      setSuccess(t('cashAccountStatusUpdated'));
      await loadAccounts();
    } catch (err) {
      setError(err.response?.data?.error || t('cashAccountStatusUpdateFailed'));
    }
  };

  const runClosing = async () => {
    resetMessages();
    try {
      const res = await api.post('/cash-management/closing-balance', {
        ...closing,
        accountId: Number(closing.accountId),
        countedAmount: Number(closing.countedAmount || 0)
      });
      setSuccess(`${t('cashClosingSaved')} ${res.data.data.delta?.toFixed?.(2) ?? res.data.data.delta}`);
      await Promise.all([loadAccounts(), loadMovements(), loadDailySummary(closing.accountId, closing.date)]);
    } catch (err) {
      setError(err.response?.data?.error || t('cashClosingFailed'));
    }
  };

  const renderNoActiveAccounts = () => (
    <div className="cash-empty-state cash-inline-empty">
      <strong>{t('noActiveCashAccounts')}</strong>
      <p>{t('createCashAccountFirstHint')}</p>
      <button type="button" className="btn" onClick={() => setActiveCashPanel('accounts')}>
        {t('goToCashAccounts')}
      </button>
    </div>
  );

  return (
    <main className="container cash-management-page">
      <div className="cash-tabs" role="tablist" aria-label={t('cashManagementTitle')}>
        {[
          { key: 'balances', label: t('currentBalances') },
          { key: 'deposit', label: t('recordDeposit') },
          { key: 'withdraw', label: t('recordWithdraw') },
          { key: 'opening', label: t('openingBalanceTitle') },
          { key: 'closing', label: t('dailyClosing') },
          { key: 'closing-history', label: t('closingHistory') },
          { key: 'movements', label: t('cashMovements') },
          { key: 'accounts', label: t('manageCashAccounts') }
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeCashPanel === tab.key}
            className={`cash-tab${activeCashPanel === tab.key ? ' active' : ''}`}
            onClick={() => setActiveCashPanel(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeCashPanel === 'accounts' ? (
        <div className="cash-account-layout">
          <section className="card cash-account-setup-card">
            <div className="section-header cash-account-setup-header">
              <div>
                <strong>{t('manageCashAccounts')}</strong>
                <p className="hint">{t('cashAccountsSetupHint')}</p>
              </div>
            </div>

            <div className="summary-grid cash-account-summary-grid">
              <div className="summary-card">
                <span>{t('manageCashAccounts')}</span>
                <strong>{accounts.length}</strong>
              </div>
              <div className="summary-card">
                <span>{t('activeCashAccounts')}</span>
                <strong>{activeAccountCount}</strong>
              </div>
              <div className="summary-card">
                <span>{t('inactiveCashAccounts')}</span>
                <strong>{inactiveAccountCount}</strong>
              </div>
            </div>

            <div className="form-grid cash-account-create-grid">
              <input
                className="cash-account-name-field"
                value={accountForm.name}
                onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                placeholder={t('cashAccountNamePlaceholder')}
              />
              <select
                value={accountForm.currency}
                onChange={(e) => setAccountForm({ ...accountForm, currency: e.target.value })}
              >
                <option value="SYP">SYP</option>
                <option value="USD">USD</option>
              </select>
              <button type="button" className="btn" onClick={createAccount}>
                {t('saveCashAccount')}
              </button>
            </div>
          </section>

          {accounts.length ? (
            <section className="card cash-history-card cash-accounts-list-card">
              <div className="cash-history-meta">
                <span>{t('manageCashAccounts')}</span>
                <strong>{accounts.length}</strong>
              </div>
              <div className="cash-history-table-wrap">
                <table className="table cash-history-table cash-accounts-table">
                  <thead>
                    <tr>
                      <th>{t('cashAccountName')}</th>
                      <th>{t('currency')}</th>
                      <th>{t('balance')}</th>
                      <th>{t('cashAccountStatus')}</th>
                      <th>{t('action')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((account) => (
                      <tr key={account.id}>
                        <td>{account.name}</td>
                        <td>{account.currency}</td>
                        <td>{account.balance}</td>
                        <td>
                          <span className={`cash-account-status-pill ${Number(account.is_active) === 1 ? 'active' : 'inactive'}`}>
                            {Number(account.is_active) === 1 ? t('cashAccountActive') : t('cashAccountInactive')}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={`btn cash-account-action${Number(account.is_active) === 1 ? ' danger' : ''}`}
                            onClick={() => toggleAccountStatus(account)}
                          >
                            {Number(account.is_active) === 1 ? t('deactivateCashAccount') : t('activateCashAccount')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <section className="card cash-accounts-list-card">
              <div className="cash-empty-state">
                <strong>{t('noCashAccountsYet')}</strong>
                <p>{t('createCashAccountFirstHint')}</p>
              </div>
            </section>
          )}
        </div>
      ) : null}

      {activeCashPanel === 'balances' ? (
        accounts.length ? (
          <section className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('account')}</th>
                  <th>{t('currency')}</th>
                  <th>{t('balance')}</th>
                  <th>{t('cashAccountStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td>{account.name}</td>
                    <td>{account.currency}</td>
                    <td>{account.balance}</td>
                    <td>{Number(account.is_active) === 1 ? t('cashAccountActive') : t('cashAccountInactive')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              <strong>{t('totalSyp')}:</strong> {totalByCurrency.SYP || 0}
              {' | '}
              <strong>{t('totalUsd')}:</strong> {totalByCurrency.USD || 0}
            </p>
          </section>
        ) : (
          <section className="card">
            <div className="cash-empty-state">
              <strong>{t('noCashAccountsYet')}</strong>
              <p>{t('createCashAccountFirstHint')}</p>
              <button type="button" className="btn" onClick={() => setActiveCashPanel('accounts')}>
                {t('goToCashAccounts')}
              </button>
            </div>
          </section>
        )
      ) : null}

      {activeCashPanel === 'deposit' ? (
        <section className="card">
          {activeAccounts.length ? (
            <div className="form-grid">
              <select value={deposit.accountId} onChange={(e) => setDeposit({ ...deposit, accountId: e.target.value })}>
                <option value="">{t('chooseAccount')}</option>
                {activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
              <input type="number" min="0.01" step="0.01" value={deposit.amount} onChange={(e) => setDeposit({ ...deposit, amount: e.target.value })} placeholder={t('amountPlaceholder')} />
              <input type="date" value={deposit.date} onChange={(e) => setDeposit({ ...deposit, date: e.target.value })} />
              <input value={deposit.notes} onChange={(e) => setDeposit({ ...deposit, notes: e.target.value })} placeholder={t('notesField')} />
              <button type="button" className="btn" onClick={() => postAction('/cash-management/deposit', { ...deposit, accountId: Number(deposit.accountId), amount: Number(deposit.amount || 0) }, () => setDeposit(initialForm), 'cashDepositSaved')}>{t('saveDeposit')}</button>
            </div>
          ) : renderNoActiveAccounts()}
        </section>
      ) : null}

      {activeCashPanel === 'withdraw' ? (
        <section className="card">
          {activeAccounts.length ? (
            <div className="form-grid">
              <select value={withdraw.accountId} onChange={(e) => setWithdraw({ ...withdraw, accountId: e.target.value })}>
                <option value="">{t('chooseAccount')}</option>
                {activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
              <input type="number" min="0.01" step="0.01" value={withdraw.amount} onChange={(e) => setWithdraw({ ...withdraw, amount: e.target.value })} placeholder={t('amountPlaceholder')} />
              <input type="date" value={withdraw.date} onChange={(e) => setWithdraw({ ...withdraw, date: e.target.value })} />
              <input value={withdraw.notes} onChange={(e) => setWithdraw({ ...withdraw, notes: e.target.value })} placeholder={t('notesField')} />
              <button type="button" className="btn danger" onClick={() => postAction('/cash-management/withdraw', { ...withdraw, accountId: Number(withdraw.accountId), amount: Number(withdraw.amount || 0) }, () => setWithdraw(initialForm), 'cashWithdrawSaved')}>{t('saveWithdraw')}</button>
            </div>
          ) : renderNoActiveAccounts()}
        </section>
      ) : null}

      {activeCashPanel === 'opening' ? (
        <section className="card">
          {activeAccounts.length ? (
            <div className="form-grid">
              <select value={opening.accountId} onChange={(e) => setOpening({ ...opening, accountId: e.target.value })}>
                <option value="">{t('chooseAccount')}</option>
                {activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
              <input type="number" min="0" step="0.01" value={opening.amount} onChange={(e) => setOpening({ ...opening, amount: e.target.value })} placeholder={t('amountPlaceholder')} />
              <input type="date" value={opening.date} onChange={(e) => setOpening({ ...opening, date: e.target.value })} />
              <input value={opening.notes} onChange={(e) => setOpening({ ...opening, notes: e.target.value })} placeholder={t('notesField')} />
              <button type="button" className="btn" onClick={() => postAction('/cash-management/opening-balance', { ...opening, accountId: Number(opening.accountId), amount: Number(opening.amount || 0) }, () => setOpening(initialForm), 'cashOpeningSaved')}>{t('saveOpeningBalance')}</button>
            </div>
          ) : renderNoActiveAccounts()}
        </section>
      ) : null}

      {activeCashPanel === 'closing' ? (
        <section className="card">
          <div className="section-header">
            <p className="hint">{t('dailyClosingHint')}</p>
          </div>

          {activeAccounts.length ? (
            <>
              <div className="form-grid">
                <select value={closing.accountId} onChange={(e) => setClosing({ ...closing, accountId: e.target.value })}>
                  <option value="">{t('chooseAccount')}</option>
                  {activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
                <input type="number" min="0" step="0.01" value={closing.countedAmount} onChange={(e) => setClosing({ ...closing, countedAmount: e.target.value })} placeholder={t('countedBalance')} />
                <input type="date" value={closing.date} onChange={(e) => setClosing({ ...closing, date: e.target.value })} />
                <input value={closing.notes} onChange={(e) => setClosing({ ...closing, notes: e.target.value })} placeholder={t('notesField')} />
                <button type="button" className="btn" onClick={runClosing}>{t('runClosing')}</button>
              </div>

              {dailySummary ? (
                <div className="summary-grid" style={{ marginTop: 12 }}>
                  <div className="summary-card">
                    <span>{t('openingBalance')}</span>
                    <strong>{dailySummary.openingBalance}</strong>
                    <small>{t('currency')}: {dailySummary.account?.currency}</small>
                  </div>
                  <div className="summary-card">
                    <span>{t('cashInToday')}</span>
                    <strong>{dailySummary.totalIn}</strong>
                  </div>
                  <div className="summary-card">
                    <span>{t('cashOutToday')}</span>
                    <strong>{dailySummary.totalOut}</strong>
                  </div>
                  <div className="summary-card">
                    <span>{t('expectedClosingBalance')}</span>
                    <strong>{dailySummary.expectedBalance}</strong>
                  </div>
                  <div className={`summary-card ${closingVariance === 0 ? '' : closingVariance > 0 ? 'summary-success' : 'summary-danger'}`}>
                    <span>{t('cashVariance')}</span>
                    <strong>{Number.isFinite(closingVariance) ? closingVariance.toFixed(2) : '0.00'}</strong>
                    <small>{dailySummary.existingClosing ? t('closingAlreadyRecorded') : t('closingNotRecordedYet')}</small>
                  </div>
                </div>
              ) : null}
            </>
          ) : renderNoActiveAccounts()}
        </section>
      ) : null}

      {activeCashPanel === 'closing-history' ? (
        <section className="card cash-history-card">
          <div className="cash-history-meta">
            <span>{t('closingHistory')}</span>
            <strong>{closingHistory.length}</strong>
          </div>
          <div className="cash-history-table-wrap cash-history-table-scroll closing-history-data-region">
            <table className="table cash-history-table">
              <thead>
                <tr>
                  <th>{t('date')}</th>
                  <th>{t('account')}</th>
                  <th>{t('openingBalance')}</th>
                  <th>{t('cashInToday')}</th>
                  <th>{t('cashOutToday')}</th>
                  <th>{t('expectedClosingBalance')}</th>
                  <th>{t('countedBalance')}</th>
                  <th>{t('cashVariance')}</th>
                  <th>{t('user')}</th>
                </tr>
              </thead>
              <tbody>
                {closingHistory.map((row) => (
                  <tr key={row.id}>
                    <td>{row.closing_date}</td>
                    <td>{row.account_name}</td>
                    <td>{row.opening_balance}</td>
                    <td>{row.total_in}</td>
                    <td>{row.total_out}</td>
                    <td>{row.expected_balance}</td>
                    <td>{row.counted_amount}</td>
                    <td>
                      <span className={`cash-variance-pill ${Number(row.variance || 0) === 0 ? 'neutral' : Number(row.variance || 0) > 0 ? 'positive' : 'negative'}`}>
                        {row.variance}
                      </span>
                    </td>
                    <td>{row.closed_by_name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeCashPanel === 'movements' ? (
        <section className="card cash-history-card">
          <div className="form-grid" style={{ marginBottom: 8 }}>
            <select value={filters.accountId} onChange={(e) => setFilters({ ...filters, accountId: e.target.value })}>
              <option value="">{t('allAccounts')}</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
            <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
            <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
            <button type="button" className="btn" onClick={loadMovements}>{t('refresh')}</button>
          </div>
          <div className="cash-history-meta">
            <span>{t('cashMovements')}</span>
            <strong>{movements.length}</strong>
          </div>
          <div className="cash-history-table-wrap">
            <table className="table cash-history-table">
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
                {movements.map((movement) => (
                  <tr key={movement.id}>
                    <td>{movement.movement_date}</td>
                    <td>{movement.account_name}</td>
                    <td>{movement.movement_type}</td>
                    <td>{movement.direction}</td>
                    <td>{movement.original_amount}</td>
                    <td>{movement.currency}</td>
                    <td>{movement.source_type || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {error && <p className="error">{error}</p>}
      {success && <p className="hint">{success}</p>}
    </main>
  );
}
