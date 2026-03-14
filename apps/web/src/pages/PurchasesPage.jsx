import { useEffect, useMemo, useState } from 'react';
import { SUPPORTED_CURRENCIES } from '@paint-shop/shared';
import { Link } from 'react-router-dom';
import api from '../services/api.js';

const initialItem = { productId: '', qty: 1, unitPrice: 0 };
const initialForm = {
  supplierId: '',
  invoiceDate: new Date().toISOString().slice(0, 10),
  currency: 'SYP',
  exchangeRate: 1,
  items: [initialItem],
  discount: 0,
  paymentType: 'CREDIT',
  paidAmount: 0,
  cashAccountId: '',
  notes: ''
};

export default function PurchasesPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [cashAccounts, setCashAccounts] = useState([]);
  const [list, setList] = useState([]);
  const [details, setDetails] = useState(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');

  const subtotal = useMemo(() => form.items.reduce((s, i) => s + (Number(i.qty || 0) * Number(i.unitPrice || 0)), 0), [form.items]);
  const total = useMemo(() => Math.max(0, subtotal - Number(form.discount || 0)), [subtotal, form.discount]);
  const remaining = useMemo(() => Math.max(0, total - Number(form.paidAmount || 0)), [total, form.paidAmount]);

  const loadInitial = async () => {
    const [s, p, c, inv] = await Promise.all([
      api.get('/suppliers'),
      api.get('/products'),
      api.get('/cash-accounts'),
      api.get('/purchases')
    ]);
    setSuppliers((s.data.data || []).filter((x) => x.is_active));
    setProducts((p.data.data || []).filter((x) => x.is_active));
    setCashAccounts(c.data.data || []);
    setList(inv.data.data || []);
  };

  useEffect(() => {
    loadInitial().catch(() => setError('تعذر تحميل بيانات المشتريات'));
  }, []);

  const searchInvoices = async () => {
    const res = await api.get('/purchases', { params: search ? { q: search } : {} });
    setList(res.data.data || []);
  };

  const setItem = (idx, key, value) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [key]: value };
    setForm({ ...form, items });
  };

  const addItem = () => setForm({ ...form, items: [...form.items, { ...initialItem }] });
  const removeItem = (idx) => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/purchases', {
        ...form,
        supplierId: Number(form.supplierId),
        exchangeRate: Number(form.exchangeRate),
        discount: Number(form.discount),
        paidAmount: Number(form.paidAmount),
        cashAccountId: form.cashAccountId ? Number(form.cashAccountId) : null,
        items: form.items.map((i) => ({ productId: Number(i.productId), qty: Number(i.qty), unitPrice: Number(i.unitPrice) }))
      });

      setForm({ ...initialForm, invoiceDate: new Date().toISOString().slice(0, 10) });
      await searchInvoices();
    } catch (err) {
      setError(err.response?.data?.error || 'تعذر حفظ فاتورة الشراء');
    }
  };

  const showDetails = async (id) => {
    const res = await api.get(`/purchases/${id}`);
    setDetails(res.data.data);
  };

  const cancelInvoice = async (id) => {
    const reason = window.prompt('سبب الإلغاء:');
    if (!reason) return;
    try {
      await api.post(`/purchases/${id}/cancel`, { reason });
      await searchInvoices();
      if (details?.id === id) setDetails(null);
    } catch (err) {
      setError(err.response?.data?.error || 'تعذر إلغاء الفاتورة');
    }
  };

  return (
    <main className="container">
      <header className="header-row">
        <h1>فواتير المشتريات</h1>
        <Link className="btn" to="/">العودة</Link>
      </header>

      <section className="card">
        <h2>إنشاء فاتورة شراء</h2>
        <form onSubmit={save}>
          <div className="form-grid">
            <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} required>
              <option value="">اختر المورد</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input type="date" value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} required />
            <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="number" min="0.0001" step="0.0001" placeholder="سعر الصرف" value={form.exchangeRate} onChange={(e) => setForm({ ...form, exchangeRate: e.target.value })} required />
            <select value={form.paymentType} onChange={(e) => setForm({ ...form, paymentType: e.target.value })}>
              <option value="CREDIT">آجل</option>
              <option value="CASH">نقدي</option>
              <option value="PARTIAL">جزئي</option>
            </select>
            <input type="number" min="0" step="0.01" placeholder="المبلغ المدفوع" value={form.paidAmount} onChange={(e) => setForm({ ...form, paidAmount: e.target.value })} />
            <select value={form.cashAccountId} onChange={(e) => setForm({ ...form, cashAccountId: e.target.value })}>
              <option value="">حساب الصندوق (اختياري)</option>
              {cashAccounts.filter((a) => a.currency === form.currency).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input type="number" min="0" step="0.01" placeholder="الخصم" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
            <input placeholder="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          <h3>العناصر</h3>
          {form.items.map((item, idx) => (
            <div key={idx} className="form-grid" style={{ marginBottom: 8 }}>
              <select value={item.productId} onChange={(e) => setItem(idx, 'productId', e.target.value)} required>
                <option value="">اختر المنتج</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name_ar}</option>)}
              </select>
              <input type="number" min="0.01" step="0.01" placeholder="الكمية" value={item.qty} onChange={(e) => setItem(idx, 'qty', e.target.value)} required />
              <input type="number" min="0" step="0.01" placeholder="سعر الوحدة" value={item.unitPrice} onChange={(e) => setItem(idx, 'unitPrice', e.target.value)} required />
              <button className="btn danger" type="button" onClick={() => removeItem(idx)} disabled={form.items.length === 1}>حذف</button>
            </div>
          ))}
          <button className="btn" type="button" onClick={addItem}>إضافة عنصر</button>

          <p><strong>المجموع:</strong> {subtotal.toFixed(2)} {form.currency}</p>
          <p><strong>الإجمالي بعد الخصم:</strong> {total.toFixed(2)} {form.currency}</p>
          <p><strong>المتبقي:</strong> {remaining.toFixed(2)} {form.currency}</p>

          <button className="btn" type="submit">حفظ الفاتورة</button>
          {error && <p className="error">{error}</p>}
        </form>
      </section>

      <section className="card">
        <div className="header-actions" style={{ marginBottom: 10 }}>
          <input placeholder="بحث برقم الفاتورة أو المورد" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn" type="button" onClick={searchInvoices}>بحث</button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>الرقم</th>
              <th>التاريخ</th>
              <th>المورد</th>
              <th>الإجمالي</th>
              <th>المدفوع</th>
              <th>المتبقي</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {list.map((inv) => (
              <tr key={inv.id}>
                <td>{inv.invoice_no}</td>
                <td>{inv.invoice_date}</td>
                <td>{inv.supplier_name || '-'}</td>
                <td>{inv.total_original}</td>
                <td>{inv.paid_original}</td>
                <td>{inv.remaining_original}</td>
                <td>{inv.status === 'ACTIVE' ? 'نشطة' : 'ملغاة'}</td>
                <td className="actions">
                  <button className="btn" type="button" onClick={() => showDetails(inv.id)}>تفاصيل</button>
                  {inv.status === 'ACTIVE' && <button className="btn danger" type="button" onClick={() => cancelInvoice(inv.id)}>إلغاء</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {details && (
        <section className="card">
          <h2>تفاصيل الفاتورة {details.invoice_no}</h2>
          <p><strong>المورد:</strong> {details.supplier_name || '-'}</p>
          <p><strong>العملة:</strong> {details.currency} | <strong>الصرف:</strong> {details.exchange_rate}</p>
          <p><strong>الإجمالي:</strong> {details.total_original} | <strong>المدفوع:</strong> {details.paid_original}</p>
          <p><strong>الحالة:</strong> {details.status}</p>
          <table className="table">
            <thead><tr><th>المنتج</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
            <tbody>
              {(details.items || []).map((it) => (
                <tr key={it.id}>
                  <td>{it.product_name}</td>
                  <td>{it.qty}</td>
                  <td>{it.unit_cost_original}</td>
                  <td>{it.line_total_original}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
