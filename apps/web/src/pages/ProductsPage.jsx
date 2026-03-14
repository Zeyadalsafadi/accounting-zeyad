import { useEffect, useState } from 'react';
import { PRODUCT_UNITS, SUPPORTED_CURRENCIES } from '@paint-shop/shared';
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

const FIELD_HELP = {
  name: 'استخدم اسماً موجوداً إذا كان المنتج مضافاً سابقاً، أو اكتب اسماً جديداً عند الحاجة.',
  category: 'اختر التصنيف النشط الذي ينتمي إليه المنتج.',
  sku: 'أدخل رمزاً فريداً للمنتج لتسهيل البحث والمتابعة.',
  barcode: 'أدخل الباركود إذا كان متوفراً على العبوة.',
  unit: 'اختر وحدة البيع أو التخزين المستخدمة لهذا المنتج.',
  purchasePrice: 'أدخل تكلفة شراء وحدة واحدة من هذا المنتج.',
  sellingPrice: 'أدخل سعر بيع وحدة واحدة من هذا المنتج.',
  currency: 'اختر العملة الافتراضية المستخدمة لتسعير المنتج.',
  currentStock: 'أدخل الكمية المتوفرة حالياً بناءً على الوحدة المختارة.',
  minStockAlert: 'حدد الحد الأدنى الذي يبدأ عنده تنبيه نقص المخزون.',
  averageCost: 'أدخل متوسط تكلفة الوحدة إذا كان معروفاً حالياً.',
  notes: 'أضف أي ملاحظات تشغيلية أو وصف مختصر عند الحاجة.'
};

function FieldLabel({ label, help }) {
  return (
    <label className="field-label">
      <span>{label}</span>
      {help ? (
        <span className="help-icon" title={help} aria-label={help}>
          ?
        </span>
      ) : null}
    </label>
  );
}

function FormField({ label, help, hint, children }) {
  return (
    <div className="form-field">
      <FieldLabel label={label} help={help} />
      {children}
      {hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}

export default function ProductsPage() {
  const [categories, setCategories] = useState([]);
  const [list, setList] = useState([]);
  const [productNames, setProductNames] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const loadCategories = async () => {
    const res = await api.get('/categories', { params: { status: 'active' } });
    setCategories(res.data.data || []);
  };

  const loadProducts = async (q = '') => {
    const res = await api.get('/products', { params: q ? { q } : {} });
    setList(res.data.data || []);
  };

  const loadProductNames = async () => {
    const res = await api.get('/products');
    const names = [...new Set((res.data.data || []).map((item) => (item.name_ar || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
    setProductNames(names);
  };

  useEffect(() => {
    Promise.all([loadCategories(), loadProducts(), loadProductNames()]).catch(() => setError('تعذر تحميل البيانات'));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (form.id) await api.patch(`/products/${form.id}`, form);
      else await api.post('/products', form);
      setForm(initialForm);
      await Promise.all([loadProducts(search), loadProductNames()]);
    } catch (err) {
      setError(err.response?.data?.error || 'تعذر حفظ المنتج');
    }
  };

  const disableItem = async (id) => {
    await api.patch(`/products/${id}/disable`);
    await loadProducts(search);
  };

  const unitOptions = form.unit && !PRODUCT_UNITS.some((unit) => unit.value === form.unit)
    ? [{ value: form.unit, label: `${form.unit} (حالي)` }, ...PRODUCT_UNITS]
    : PRODUCT_UNITS;

  return (
    <main className="container">
      <header className="header-row">
        <h1>إدارة المنتجات</h1>
        <Link className="btn" to="/">العودة</Link>
      </header>

      <section className="card">
        <h2>{form.id ? 'تعديل منتج' : 'إضافة منتج'}</h2>
        <form className="form-grid" onSubmit={save}>
          <FormField label="اسم المنتج" help={FIELD_HELP.name} hint="ابدأ بالكتابة لاختيار اسم سابق أو إدخال اسم جديد.">
            <input list="product-name-options" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <datalist id="product-name-options">
              {productNames.map((name) => <option key={name} value={name} />)}
            </datalist>
          </FormField>
          <FormField label="التصنيف" help={FIELD_HELP.category} hint="تظهر هنا التصنيفات النشطة فقط.">
            <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} required>
              <option value="">اختر التصنيف</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}
            </select>
          </FormField>
          <FormField label="SKU" help={FIELD_HELP.sku} hint="يجب أن يكون الرمز فريداً لكل منتج.">
            <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required />
          </FormField>
          <FormField label="Barcode" help={FIELD_HELP.barcode} hint="اختياري.">
            <input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
          </FormField>
          <FormField label="الوحدة" help={FIELD_HELP.unit} hint="اختر وحدة موحّدة لتجنب اختلاف التسمية بين المنتجات.">
            <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required>
              {unitOptions.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
            </select>
          </FormField>
          <FormField label="سعر الشراء" help={FIELD_HELP.purchasePrice} hint="القيمة تخص وحدة واحدة.">
            <input type="number" min="0" step="0.01" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} />
          </FormField>
          <FormField label="سعر البيع" help={FIELD_HELP.sellingPrice} hint="القيمة تخص وحدة واحدة.">
            <input type="number" min="0" step="0.01" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} />
          </FormField>
          <FormField label="العملة الافتراضية" help={FIELD_HELP.currency} hint="تستخدم في عرض أسعار المنتج بشكل افتراضي.">
            <select value={form.defaultCurrency} onChange={(e) => setForm({ ...form, defaultCurrency: e.target.value })}>
              {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </FormField>
          <FormField label="المخزون الحالي" help={FIELD_HELP.currentStock} hint="يبقى الشرح ظاهراً حتى عند وجود قيمة 0.">
            <input type="number" min="0" step="0.01" value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: e.target.value })} />
          </FormField>
          <FormField label="حد التنبيه" help={FIELD_HELP.minStockAlert} hint="استخدم 0 إذا لم ترغب بتنبيه مخزون لهذا المنتج.">
            <input type="number" min="0" step="0.01" value={form.minStockAlert} onChange={(e) => setForm({ ...form, minStockAlert: e.target.value })} />
          </FormField>
          <FormField label="متوسط التكلفة" help={FIELD_HELP.averageCost} hint="يمكن تركها 0 إذا لم يتم احتساب المتوسط بعد.">
            <input type="number" min="0" step="0.01" value={form.averageCost} onChange={(e) => setForm({ ...form, averageCost: e.target.value })} />
          </FormField>
          <FormField label="ملاحظات" help={FIELD_HELP.notes} hint="اختياري.">
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </FormField>
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
