import { useEffect, useState } from 'react';
import { SUPPORTED_CURRENCIES } from '@paint-shop/shared';
import { Link } from 'react-router-dom';
import api from '../services/api.js';

const initialForm = {
  id: null,
  name: '',
  categoryId: '',
  sku: '',
  barcode: '',
  unit: 'قطعة',
  purchasePrice: 0,
  sellingPrice: 0,
  defaultCurrency: 'SYP',
  currentStock: 0,
  minStockAlert: 0,
  averageCost: 0,
  notes: ''
};

export default function ProductsPage() {
  const [categories, setCategories] = useState([]);
  const [list, setList] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const loadCategories = async () => {
    const res = await api.get('/categories');
    setCategories((res.data.data || []).filter((x) => x.is_active));
  };

  const loadProducts = async (q = '') => {
    const res = await api.get('/products', { params: q ? { q } : {} });
    setList(res.data.data || []);
  };

  useEffect(() => {
    Promise.all([loadCategories(), loadProducts()]).catch(() => setError('تعذر تحميل البيانات'));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (form.id) await api.patch(`/products/${form.id}`, form);
      else await api.post('/products', form);
      setForm(initialForm);
      await loadProducts(search);
    } catch (err) {
      setError(err.response?.data?.error || 'تعذر حفظ المنتج');
    }
  };

  const disableItem = async (id) => {
    await api.patch(`/products/${id}/disable`);
    await loadProducts(search);
  };

  return (
    <main className="container">
      <header className="header-row">
        <h1>إدارة المنتجات</h1>
        <Link className="btn" to="/">العودة</Link>
      </header>

      <section className="card">
        <h2>{form.id ? 'تعديل منتج' : 'إضافة منتج'}</h2>
        <form className="form-grid" onSubmit={save}>
          <input placeholder="اسم المنتج" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} required>
            <option value="">اختر التصنيف</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}
          </select>
          <input placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required />
          <input placeholder="Barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
          <input placeholder="الوحدة" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required />
          <input placeholder="سعر الشراء" type="number" min="0" step="0.01" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} />
          <input placeholder="سعر البيع" type="number" min="0" step="0.01" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} />
          <select value={form.defaultCurrency} onChange={(e) => setForm({ ...form, defaultCurrency: e.target.value })}>
            {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input placeholder="المخزون الحالي" type="number" min="0" step="0.01" value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: e.target.value })} />
          <input placeholder="حد التنبيه" type="number" min="0" step="0.01" value={form.minStockAlert} onChange={(e) => setForm({ ...form, minStockAlert: e.target.value })} />
          <input placeholder="متوسط التكلفة" type="number" min="0" step="0.01" value={form.averageCost} onChange={(e) => setForm({ ...form, averageCost: e.target.value })} />
          <input placeholder="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <button className="btn" type="submit">حفظ</button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="card">
        <div className="header-actions" style={{ marginBottom: 10 }}>
          <input placeholder="بحث بالاسم أو SKU أو باركود" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn" type="button" onClick={() => loadProducts(search)}>بحث</button>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>التصنيف</th>
              <th>SKU</th>
              <th>المخزون</th>
              <th>سعر البيع</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td>{p.name_ar}</td>
                <td>{p.category_name}</td>
                <td>{p.sku}</td>
                <td>{p.current_qty}</td>
                <td>{p.selling_price} {p.default_currency}</td>
                <td>{p.is_active ? 'نشط' : 'معطل'}</td>
                <td className="actions">
                  <button className="btn" type="button" onClick={() => setForm({
                    id: p.id,
                    name: p.name_ar,
                    categoryId: String(p.category_id),
                    sku: p.sku,
                    barcode: p.barcode || '',
                    unit: p.unit,
                    purchasePrice: p.purchase_price,
                    sellingPrice: p.selling_price,
                    defaultCurrency: p.default_currency,
                    currentStock: p.current_qty,
                    minStockAlert: p.min_stock_level,
                    averageCost: p.avg_cost_base,
                    notes: p.notes || ''
                  })}>تعديل</button>
                  {p.is_active ? <button className="btn danger" type="button" onClick={() => disableItem(p.id)}>تعطيل</button> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
