import { useEffect, useState } from 'react';
import { SUPPORTED_CURRENCIES } from '@paint-shop/shared';
import { Link } from 'react-router-dom';
import api from '../services/api.js';

const initialForm = {
  id: null,
  name: '',
  phone: '',
  address: '',
  openingBalance: 0,
  currency: 'SYP',
  notes: ''
};

export default function CustomersPage() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [details, setDetails] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const load = async (q = '') => {
    const res = await api.get('/customers', { params: q ? { q } : {} });
    setList(res.data.data || []);
  };

  useEffect(() => {
    load().catch(() => setError('تعذر تحميل العملاء'));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (form.id) await api.patch(`/customers/${form.id}`, form);
      else await api.post('/customers', form);
      setForm(initialForm);
      await load(search);
    } catch (err) {
      setError(err.response?.data?.error || 'تعذر حفظ العميل');
    }
  };

  const viewDetails = async (id) => {
    try {
      const res = await api.get(`/customers/${id}`);
      setDetails(res.data.data);
    } catch {
      setError('تعذر تحميل تفاصيل العميل');
    }
  };

  return (
    <main className="container">
      <header className="header-row">
        <h1>إدارة العملاء</h1>
        <Link className="btn" to="/">العودة</Link>
      </header>

      <section className="card">
        <h2>{form.id ? 'تعديل عميل' : 'إضافة عميل'}</h2>
        <form className="form-grid" onSubmit={save}>
          <input placeholder="اسم العميل" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input placeholder="الهاتف" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input placeholder="العنوان" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <input type="number" min="0" step="0.01" placeholder="الرصيد الافتتاحي" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} />
          <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
            {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input placeholder="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <button className="btn" type="submit">حفظ</button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="card">
        <div className="header-actions" style={{ marginBottom: 10 }}>
          <input placeholder="بحث بالاسم أو الهاتف" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn" type="button" onClick={() => load(search)}>بحث</button>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الهاتف</th>
              <th>الرصيد الحالي</th>
              <th>العملة</th>
              <th>إجراءات</th>
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
                  <button className="btn" type="button" onClick={() => setForm({
                    id: item.id,
                    name: item.name,
                    phone: item.phone || '',
                    address: item.address || '',
                    openingBalance: item.opening_balance,
                    currency: item.currency,
                    notes: item.notes || ''
                  })}>تعديل</button>
                  <button className="btn" type="button" onClick={() => viewDetails(item.id)}>تفاصيل</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {details ? (
        <section className="card">
          <h2>تفاصيل العميل</h2>
          <p><strong>الاسم:</strong> {details.name}</p>
          <p><strong>الهاتف:</strong> {details.phone || '-'}</p>
          <p><strong>العنوان:</strong> {details.address || '-'}</p>
          <p><strong>الرصيد الافتتاحي:</strong> {details.opening_balance} {details.currency}</p>
          <p><strong>الرصيد الحالي:</strong> {details.current_balance} {details.currency}</p>
          <p><strong>ملاحظات:</strong> {details.notes || '-'}</p>
        </section>
      ) : null}
    </main>
  );
}
