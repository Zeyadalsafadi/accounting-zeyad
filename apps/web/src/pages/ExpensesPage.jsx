import { useEffect, useMemo, useState } from 'react';
import { SUPPORTED_CURRENCIES } from '@paint-shop/shared';
import { Link } from 'react-router-dom';
import api from '../services/api.js';

const today = new Date().toISOString().slice(0, 10);
const initialForm = {
  id: null,
  expenseDate: today,
  type: '',
  amount: 0,
  currency: 'SYP',
  exchangeRate: 1,
  beneficiary: '',
  notes: '',
  cashAccountId: ''
};

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState([]);
  const [cashAccounts, setCashAccounts] = useState([]);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');

  const baseAmount = useMemo(() => Number(form.amount || 0) * Number(form.exchangeRate || 0), [form.amount, form.exchangeRate]);

  const load = async () => {
    const [eRes, cRes] = await Promise.all([
      api.get('/expenses', { params: { q: search || undefined, from: from || undefined, to: to || undefined } }),
      api.get('/cash-accounts')
    ]);
    setExpenses(eRes.data.data || []);
    setCashAccounts(cRes.data.data || []);
  };

  useEffect(() => {
    load().catch(() => setError('تعذر تحميل المصروفات'));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setError('');

    const payload = {
      expenseDate: form.expenseDate,
      type: form.type,
      amount: Number(form.amount),
      currency: form.currency,
      exchangeRate: Number(form.exchangeRate),
      beneficiary: form.beneficiary || null,
      notes: form.notes || null,
      cashAccountId: Number(form.cashAccountId)
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
      setError(err.response?.data?.error || 'تعذر حفظ المصروف');
    }
  };

  return (
    <main className="container">
      <header className="header-row">
        <h1>إدارة المصروفات</h1>
        <Link className="btn" to="/">العودة</Link>
      </header>

      <section className="card">
        <h2>{form.id ? 'تعديل مصروف' : 'إضافة مصروف'}</h2>
        <form onSubmit={save}>
          <div className="form-grid">
            <input type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} required />
            <input placeholder="نوع المصروف" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} required />
            <input type="number" min="0.01" step="0.01" placeholder="المبلغ" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="number" min="0.0001" step="0.0001" placeholder="سعر الصرف" value={form.exchangeRate} onChange={(e) => setForm({ ...form, exchangeRate: e.target.value })} required />
            <input type="text" readOnly value={baseAmount.toFixed(2)} placeholder="القيمة بالعملة الأساسية" />
            <select value={form.cashAccountId} onChange={(e) => setForm({ ...form, cashAccountId: e.target.value })} required>
              <option value="">اختر حساب الصندوق</option>
              {cashAccounts.filter((a) => a.currency === form.currency).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input placeholder="الجهة المستفيدة" value={form.beneficiary} onChange={(e) => setForm({ ...form, beneficiary: e.target.value })} />
            <input placeholder="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <button className="btn" type="submit">حفظ</button>
          </div>
        </form>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="card">
        <h2>قائمة المصروفات</h2>
        <div className="form-grid" style={{ marginBottom: 8 }}>
          <input placeholder="بحث بالنوع/المستفيد/ملاحظات" value={search} onChange={(e) => setSearch(e.target.value)} />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <button className="btn" type="button" onClick={load}>تحديث</button>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>النوع</th>
              <th>المبلغ</th>
              <th>العملة</th>
              <th>بالأساسي</th>
              <th>المستفيد</th>
              <th>الحالة</th>
              <th>إجراءات</th>
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
                <td>{item.status === 'ACTIVE' ? 'نشط' : 'ملغى'}</td>
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
                      exchangeRate: item.exchange_rate,
                      beneficiary: item.beneficiary || '',
                      notes: item.notes || '',
                      cashAccountId: cashAccounts.find((a) => a.name === item.cash_account_name)?.id?.toString() || ''
                    })}
                  >
                    تعديل
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
