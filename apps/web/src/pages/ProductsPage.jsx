import { useEffect, useMemo, useState } from 'react';
import { PRODUCT_UNITS, SUPPORTED_CURRENCIES } from '@paint-shop/shared';
import { Link } from 'react-router-dom';
import api from '../services/api.js';
import { formatCommercialSyp } from '../utils/commercialCurrency.js';
import { useI18n } from '../i18n/I18nProvider.jsx';

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

function FieldLabel({ label, help }) {
  return (
    <label className="field-label">
      <span>{label}</span>
      {help ? (
        <span className="help-icon" title={help} aria-label={help}>?</span>
      ) : null}
    </label>
  );
}

function FormField({ label, help, children }) {
  return (
    <div className="form-field">
      <FieldLabel label={label} help={help} />
      {children}
    </div>
  );
}

export default function ProductsPage() {
  const { t } = useI18n();
  const [categories, setCategories] = useState([]);
  const [list, setList] = useState([]);
  const [productNames, setProductNames] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [search, setSearch] = useState('');
  const [exchangeRateConfig, setExchangeRateConfig] = useState(null);
  const [error, setError] = useState('');

  const unitLabelMap = useMemo(() => ({
    قطعة: t('unitPiece'),
    كيلوغرام: t('unitKilogram'),
    غرام: t('unitGram'),
    لتر: t('unitLiter'),
    متر: t('unitMeter'),
    صندوق: t('unitBox'),
    عبوة: t('unitPack'),
    حبة: t('unitItem')
  }), [t]);

  const fieldHelp = useMemo(() => ({
    name: t('helpProductName'),
    category: t('helpProductCategory'),
    sku: t('helpProductSku'),
    barcode: t('helpProductBarcode'),
    unit: t('helpProductUnit'),
    purchasePrice: t('helpProductPurchasePrice'),
    sellingPrice: t('helpProductSellingPrice'),
    currency: t('helpProductCurrency'),
    currentStock: t('helpProductCurrentStock'),
    minStockAlert: t('helpProductMinStock'),
    averageCost: t('helpProductAverageCost'),
    notes: t('helpProductNotes')
  }), [t]);

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
    Promise.all([
      loadCategories(),
      loadProducts(),
      loadProductNames(),
      api.get('/exchange-rate').then((res) => setExchangeRateConfig(res.data.data || null))
    ]).catch(() => setError(t('loadingProductsFailed')));
  }, [t]);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (form.id) await api.patch(`/products/${form.id}`, form);
      else await api.post('/products', form);
      setForm(initialForm);
      await Promise.all([loadProducts(search), loadProductNames()]);
    } catch (err) {
      setError(err.response?.data?.error || t('productSaveFailed'));
    }
  };

  const disableItem = async (id) => {
    await api.patch(`/products/${id}/disable`);
    await loadProducts(search);
  };

  const unitOptions = form.unit && !PRODUCT_UNITS.some((unit) => unit.value === form.unit)
    ? [{ value: form.unit, label: unitLabelMap[form.unit] || form.unit }, ...PRODUCT_UNITS]
    : PRODUCT_UNITS;

  return (
    <main className="container">
      <header className="header-row">
        <h1>{t('productsTitle')}</h1>
        <Link className="btn" to="/">{t('back')}</Link>
      </header>

      <section className="card">
        <h2>{form.id ? t('editProduct') : t('addProductTitle')}</h2>
        <form className="form-grid" onSubmit={save}>
          <FormField label={t('productName')} help={fieldHelp.name}>
            <input list="product-name-options" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <datalist id="product-name-options">
              {productNames.map((name) => <option key={name} value={name} />)}
            </datalist>
          </FormField>
          <FormField label={t('categoryField')} help={fieldHelp.category}>
            <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} required>
              <option value="">{t('selectCategory')}</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}
            </select>
          </FormField>
          <FormField label="SKU" help={fieldHelp.sku}>
            <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required />
          </FormField>
          <FormField label="Barcode" help={fieldHelp.barcode}>
            <input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
          </FormField>
          <FormField label={t('unit')} help={fieldHelp.unit}>
            <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required>
              {unitOptions.map((unit) => <option key={unit.value} value={unit.value}>{unitLabelMap[unit.value] || unit.label}</option>)}
            </select>
          </FormField>
          <FormField label={t('purchasePrice')} help={fieldHelp.purchasePrice}>
            <input type="number" min="0" step="0.01" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} />
          </FormField>
          <FormField label={t('sellingPrice')} help={fieldHelp.sellingPrice}>
            <input type="number" min="0" step="0.01" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} />
          </FormField>
          <FormField label={t('defaultCurrency')} help={fieldHelp.currency}>
            <select value={form.defaultCurrency} onChange={(e) => setForm({ ...form, defaultCurrency: e.target.value })}>
              {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </FormField>
          <FormField label={t('currentStock')} help={fieldHelp.currentStock}>
            <input type="number" min="0" step="0.01" value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: e.target.value })} />
          </FormField>
          <FormField label={t('stockAlertLimit')} help={fieldHelp.minStockAlert}>
            <input type="number" min="0" step="0.01" value={form.minStockAlert} onChange={(e) => setForm({ ...form, minStockAlert: e.target.value })} />
          </FormField>
          <FormField label={t('averageCost')} help={fieldHelp.averageCost}>
            <input type="number" min="0" step="0.01" value={form.averageCost} onChange={(e) => setForm({ ...form, averageCost: e.target.value })} />
          </FormField>
          <FormField label={t('notesField')} help={fieldHelp.notes}>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </FormField>
          <button className="btn" type="submit">{t('save')}</button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="card">
        <div className="header-actions" style={{ marginBottom: 10 }}>
          <input placeholder={t('searchByNameSkuBarcode')} value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn" type="button" onClick={() => loadProducts(search)}>{t('searchAction')}</button>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>{t('productName')}</th>
              <th>{t('categoryField')}</th>
              <th>SKU</th>
              <th>{t('currentStock')}</th>
              <th>{t('commercialSellingPriceSyp')}</th>
              <th>{t('status')}</th>
              <th>{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td>{p.name_ar}</td>
                <td>{p.category_name}</td>
                <td>{p.sku}</td>
                <td>{p.current_qty}</td>
                <td>{formatCommercialSyp(p.selling_price, p.default_currency, exchangeRateConfig?.activeRate)}</td>
                <td>{p.is_active ? t('active') : t('inactive')}</td>
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
                  })}>{t('edit')}</button>
                  {p.is_active ? <button className="btn danger" type="button" onClick={() => disableItem(p.id)}>{t('disable')}</button> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
