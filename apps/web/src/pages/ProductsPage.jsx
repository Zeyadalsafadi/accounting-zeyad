import { useEffect, useMemo, useState } from 'react';
import { PRICE_TIER_CODES, PRODUCT_UNITS, SUPPORTED_CURRENCIES } from '@paint-shop/shared';
import api from '../services/api.js';
import { formatCommercialSyp } from '../utils/commercialCurrency.js';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { printHtmlDocument } from '../utils/print.js';
import { canRenderCode39, generateBarcodeValue, renderCode39Svg } from '../utils/barcode.js';

const baseInitialForm = {
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
  notes: '',
  units: [
    { unitName: 'قطعة', conversionFactor: 1, isBase: true, sortOrder: 0 }
  ],
  priceTiers: [
    { tierCode: 'RETAIL', tierName: 'مفرق', unitName: 'قطعة', priceSyp: 0 }
  ],
  customerPrices: []
};

export default function ProductsPage() {
  const { t, language, dir } = useI18n();
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [list, setList] = useState([]);
  const [productNames, setProductNames] = useState([]);
  const [search, setSearch] = useState('');
  const [exchangeRateConfig, setExchangeRateConfig] = useState(null);
  const [error, setError] = useState('');
  const [activeProductsPanel, setActiveProductsPanel] = useState('form');
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [barcodeCopies, setBarcodeCopies] = useState(1);
  const getLocalizedName = (record, arabicKey = 'name_ar', englishKey = 'name_en', fallbackKey = 'name') => {
    if (!record) return '';
    if (language === 'en') {
      return record[englishKey] || record[fallbackKey] || record[arabicKey] || '';
    }
    return record[arabicKey] || record[fallbackKey] || record[englishKey] || '';
  };
  const getPlaceholderNumberValue = (value) => (value === 0 ? '' : value);

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

  const priceTierLabelMap = useMemo(() => ({
    RETAIL: t('priceTierRetail'),
    WHOLESALE: t('priceTierWholesale'),
    SPECIAL: t('priceTierSpecial')
  }), [t]);

  const createInitialFormState = () => ({
    ...baseInitialForm,
    units: baseInitialForm.units.map((unit) => ({ ...unit })),
    priceTiers: baseInitialForm.priceTiers.map((tier) => ({
      ...tier,
      tierName: priceTierLabelMap[tier.tierCode] || tier.tierName
    })),
    customerPrices: []
  });

  const [form, setForm] = useState(createInitialFormState);

  const loadCategories = async () => {
    const res = await api.get('/categories', { params: { status: 'active' } });
    setCategories(res.data.data || []);
  };

  const loadCustomers = async () => {
    const res = await api.get('/customers');
    setCustomers((res.data.data || []).filter((item) => item.is_active));
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
      loadCustomers(),
      loadProducts(),
      loadProductNames(),
      api.get('/exchange-rate').then((res) => setExchangeRateConfig(res.data.data || null))
    ]).catch(() => setError(t('loadingProductsFailed')));
  }, [t]);

  const setUnitRow = (index, key, value) => {
    const units = [...form.units];
    units[index] = { ...units[index], [key]: value };
    if (key === 'isBase' && value) {
      for (let i = 0; i < units.length; i += 1) {
        if (i !== index) units[i].isBase = false;
      }
      setForm((current) => ({ ...current, units, unit: units[index].unitName || current.unit }));
      return;
    }
    setForm((current) => ({ ...current, units }));
  };

  const addUnitRow = () => {
    setForm((current) => ({
      ...current,
      units: [...current.units, { unitName: '', conversionFactor: 1, isBase: false, sortOrder: current.units.length }]
    }));
  };

  const removeUnitRow = (index) => {
    if (form.units.length === 1) return;
    const units = form.units.filter((_, i) => i !== index).map((unit, i) => ({ ...unit, sortOrder: i }));
    if (!units.some((unit) => unit.isBase)) units[0].isBase = true;
    setForm((current) => ({
      ...current,
      units,
      unit: units.find((unit) => unit.isBase)?.unitName || current.unit,
      priceTiers: current.priceTiers.filter((tier) => units.some((unit) => unit.unitName === tier.unitName))
    }));
  };

  const setPriceTierRow = (index, key, value) => {
    const priceTiers = [...form.priceTiers];
    priceTiers[index] = { ...priceTiers[index], [key]: value };
    setForm((current) => ({ ...current, priceTiers }));
  };

  const addPriceTierRow = () => {
    const fallbackUnit = form.units[0]?.unitName || 'قطعة';
    setForm((current) => ({
      ...current,
      priceTiers: [...current.priceTiers, { tierCode: 'WHOLESALE', tierName: priceTierLabelMap.WHOLESALE, unitName: fallbackUnit, priceSyp: 0 }]
    }));
  };

  const removePriceTierRow = (index) => {
    if (form.priceTiers.length === 1) return;
    setForm((current) => ({
      ...current,
      priceTiers: current.priceTiers.filter((_, i) => i !== index)
    }));
  };

  const setCustomerPriceRow = (index, key, value) => {
    const customerPrices = [...form.customerPrices];
    customerPrices[index] = { ...customerPrices[index], [key]: value };
    setForm((current) => ({ ...current, customerPrices }));
  };

  const addCustomerPriceRow = () => {
    const fallbackUnit = form.units[0]?.unitName || 'قطعة';
    setForm((current) => ({
      ...current,
      customerPrices: [...current.customerPrices, { customerId: '', unitName: fallbackUnit, priceSyp: 0, notes: '' }]
    }));
  };

  const removeCustomerPriceRow = (index) => {
    setForm((current) => ({
      ...current,
      customerPrices: current.customerPrices.filter((_, i) => i !== index)
    }));
  };

  const normalizePayload = () => {
    const units = form.units.map((unit, index) => ({
      unitName: unit.unitName,
      conversionFactor: Number(unit.conversionFactor || 0),
      isBase: !!unit.isBase,
      sortOrder: index
    }));
    const baseUnit = units.find((unit) => unit.isBase) || units[0];

    return {
      ...form,
      unit: baseUnit?.unitName || form.unit,
      purchasePrice: Number(form.purchasePrice || 0),
      sellingPrice: Number(form.sellingPrice || 0),
      currentStock: Number(form.currentStock || 0),
      minStockAlert: Number(form.minStockAlert || 0),
      averageCost: Number(form.averageCost || 0),
      units,
      priceTiers: form.priceTiers.map((tier) => ({
        tierCode: tier.tierCode,
        tierName: tier.tierName || priceTierLabelMap[tier.tierCode] || tier.tierCode,
        unitName: tier.unitName,
        priceSyp: Number(tier.priceSyp || 0)
      })),
      customerPrices: form.customerPrices.map((price) => ({
        customerId: Number(price.customerId),
        unitName: price.unitName,
        priceSyp: Number(price.priceSyp || 0),
        notes: price.notes || null
      }))
    };
  };

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = normalizePayload();
      if (form.id) await api.patch(`/products/${form.id}`, payload);
      else await api.post('/products', payload);
      setForm(createInitialFormState());
      setActiveProductsPanel('list');
      await Promise.all([loadProducts(search), loadProductNames()]);
    } catch (err) {
      setError(err.response?.data?.error || t('productSaveFailed'));
    }
  };

  const disableItem = async (id) => {
    await api.patch(`/products/${id}/disable`);
    await loadProducts(search);
  };

  const toggleProductSelection = (productId) => {
    setSelectedProductIds((current) => (
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    ));
  };

  const toggleSelectAllVisible = () => {
    const visibleIds = list.map((item) => item.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedProductIds.includes(id));
    setSelectedProductIds(allSelected ? [] : visibleIds);
  };

  const fillGeneratedBarcode = () => {
    if (form.barcode) return;
    setForm((current) => ({ ...current, barcode: generateBarcodeValue() }));
  };

  const printBarcodeLabel = (product) => {
    const barcodeValue = product.barcode || product.sku;
    const svg = renderCode39Svg(barcodeValue);
    if (!svg) {
      setError(t('barcodePrintUnsupported'));
      return;
    }
    printHtmlDocument({
      title: `${t('printBarcodeLabel')} ${product.name_ar}`,
      lang: language,
      dir,
      html: `
        <section style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:12px">
          ${Array.from({ length: Math.max(1, Number(barcodeCopies || 1)) }).map(() => `
            <article style="break-inside:avoid;border:1px solid #d1d5db;border-radius:10px;padding:12px;text-align:center">
              <h2 style="margin:0 0 8px">${product.name_ar}</h2>
              <p style="margin:0 0 8px">${product.sku}</p>
              <div style="display:flex;justify-content:center;margin:8px 0">${svg}</div>
              <p style="font-size:18px;letter-spacing:3px;margin:8px 0 0">${barcodeValue}</p>
            </article>
          `).join('')}
        </section>
      `
    });
  };

  const printSelectedBarcodeLabels = () => {
    const selectedProducts = list.filter((product) => selectedProductIds.includes(product.id));
    const printableProducts = selectedProducts.filter((product) => canRenderCode39(product.barcode || product.sku));
    if (printableProducts.length === 0) {
      setError(t('barcodeBatchNoPrintable'));
      return;
    }

    const html = printableProducts.flatMap((product) => {
      const barcodeValue = product.barcode || product.sku;
      const svg = renderCode39Svg(barcodeValue, { height: 64, narrow: 2, wide: 4, margin: 8 });
      return Array.from({ length: Math.max(1, Number(barcodeCopies || 1)) }).map(() => `
          <article style="break-inside:avoid;border:1px solid #d1d5db;border-radius:10px;padding:12px;text-align:center">
            <h3 style="margin:0 0 6px;font-size:18px">${product.name_ar}</h3>
            <p style="margin:0 0 6px;font-size:13px">${product.sku}</p>
            <div style="display:flex;justify-content:center;margin:4px 0">${svg}</div>
            <p style="margin:6px 0 0;font-size:16px;letter-spacing:2px">${barcodeValue}</p>
          </article>
        `);
    }).join('');

    printHtmlDocument({
      title: t('printBarcodeBatch'),
      lang: language,
      dir,
      html: `<section style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:12px">${html}</section>`
    });
  };

  const unitOptions = useMemo(() => PRODUCT_UNITS.map((unit) => ({
    ...unit,
    localizedLabel: unitLabelMap[unit.value] || unit.label
  })), [unitLabelMap]);
  const isLowStock = (product) => Number(product.current_qty ?? 0) <= Number(product.min_stock_level ?? 0);

  return (
    <main className="container products-page">
      <div className="cash-tabs" role="tablist" aria-label={t('productsTitle')}>
        <button
          className={`cash-tab${activeProductsPanel === 'form' ? ' active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeProductsPanel === 'form'}
          onClick={() => setActiveProductsPanel('form')}
        >
          {form.id ? t('editProduct') : t('addProductTitle')}
        </button>
        <button
          className={`cash-tab${activeProductsPanel === 'list' ? ' active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeProductsPanel === 'list'}
          onClick={() => setActiveProductsPanel('list')}
        >
          {t('productsTitle')}
        </button>
      </div>

      {activeProductsPanel === 'form' ? (
        <section className="card">
          <form className="product-form-shell" onSubmit={save}>
            <section className="product-form-panel">
              <div className="section-header compact">
                <h3>{t('productBasicsTitle')}</h3>
              </div>
              <div className="product-fields-grid product-fields-grid-primary">
                <div className="product-field product-field-wide">
                  <input
                    aria-label={t('productName')}
                    list="product-name-options"
                    value={form.name}
                    placeholder={t('productName')}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                  <datalist id="product-name-options">
                    {productNames.map((name) => <option key={name} value={name} />)}
                  </datalist>
                </div>

                <div className="product-field">
                  <select aria-label={t('categoryField')} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} required>
                    <option value="">{t('categoryField')}</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{getLocalizedName(c)}</option>)}
                  </select>
                </div>

                <div className="product-field">
                  <input aria-label="SKU" value={form.sku} placeholder="SKU" onChange={(e) => setForm({ ...form, sku: e.target.value })} required />
                </div>

                <div className="product-field product-field-wide">
                  <div className="product-inline-field">
                    <input
                      aria-label="Barcode"
                      value={form.barcode}
                      placeholder="Barcode"
                      onChange={(e) => setForm({ ...form, barcode: e.target.value.toUpperCase() })}
                    />
                    <button className="btn secondary product-inline-action" type="button" onClick={fillGeneratedBarcode}>{t('generateBarcode')}</button>
                  </div>
                </div>
              </div>
            </section>

            <section className="product-form-panel">
              <div className="section-header compact">
                <h3>{t('productInventoryPricingTitle')}</h3>
              </div>
              <div className="product-fields-grid product-fields-grid-secondary">
                <div className="product-field">
                  <select aria-label={t('unit')} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required>
                    {unitOptions.map((unit) => <option key={unit.value} value={unit.value}>{unit.localizedLabel}</option>)}
                  </select>
                </div>

                <div className="product-field">
                  <select aria-label={t('defaultCurrency')} value={form.defaultCurrency} onChange={(e) => setForm({ ...form, defaultCurrency: e.target.value })}>
                    {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="product-field">
                  <input type="number" min="0" step="0.01" aria-label={t('purchasePrice')} value={getPlaceholderNumberValue(form.purchasePrice)} placeholder={t('purchasePrice')} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} />
                </div>

                <div className="product-field">
                  <input type="number" min="0" step="0.01" aria-label={t('sellingPrice')} value={getPlaceholderNumberValue(form.sellingPrice)} placeholder={t('sellingPrice')} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} />
                </div>

                <div className="product-field">
                  <input type="number" min="0" step="0.01" aria-label={t('currentStock')} value={getPlaceholderNumberValue(form.currentStock)} placeholder={t('currentStock')} onChange={(e) => setForm({ ...form, currentStock: e.target.value })} />
                </div>

                <div className="product-field">
                  <input type="number" min="0" step="0.01" aria-label={t('stockAlertLimit')} value={getPlaceholderNumberValue(form.minStockAlert)} placeholder={t('stockAlertLimit')} onChange={(e) => setForm({ ...form, minStockAlert: e.target.value })} />
                </div>

                <div className="product-field">
                  <input type="number" min="0" step="0.01" aria-label={t('averageCost')} value={getPlaceholderNumberValue(form.averageCost)} placeholder={t('averageCost')} onChange={(e) => setForm({ ...form, averageCost: e.target.value })} />
                </div>

                <div className="product-field product-field-wide">
                  <input aria-label={t('notesField')} value={form.notes} placeholder={t('notesField')} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
            </section>

            <div className="product-config-grid">
              <section className="product-form-panel product-config-panel">
                <div className="section-header compact">
                  <h3>{t('productUnitsTitle')}</h3>
                  <button className="btn secondary product-panel-action" type="button" onClick={addUnitRow}>{t('addUnitRow')}</button>
                </div>
                <div className="product-config-list">
                  {form.units.map((unitRow, index) => (
                    <div key={`unit-${index}`} className="product-config-row product-config-row-units">
                      <input list="product-unit-options" value={unitRow.unitName} onChange={(e) => setUnitRow(index, 'unitName', e.target.value)} placeholder={t('unit')} aria-label={t('unit')} />
                      <input type="number" min="0.0001" step="0.0001" value={unitRow.conversionFactor} onChange={(e) => setUnitRow(index, 'conversionFactor', e.target.value)} placeholder={t('conversionFactor')} aria-label={t('conversionFactor')} />
                      <label className="product-checkbox-field">
                        <input type="checkbox" checked={!!unitRow.isBase} onChange={(e) => setUnitRow(index, 'isBase', e.target.checked)} />
                        <span>{t('baseUnit')}</span>
                      </label>
                      <button className="btn danger product-row-action" type="button" onClick={() => removeUnitRow(index)} disabled={form.units.length === 1}>{t('delete')}</button>
                    </div>
                  ))}
                </div>
                <datalist id="product-unit-options">
                  {unitOptions.map((unit) => <option key={unit.value} value={unit.value} />)}
                </datalist>
              </section>

              <section className="product-form-panel product-config-panel">
                <div className="section-header compact">
                  <h3>{t('pricingTiersTitle')}</h3>
                  <button className="btn secondary product-panel-action" type="button" onClick={addPriceTierRow}>{t('addPriceTierRow')}</button>
                </div>
                <div className="product-config-list">
                  {form.priceTiers.map((tierRow, index) => (
                    <div key={`tier-${index}`} className="product-config-row product-config-row-tiers">
                      <select
                        aria-label={t('pricingTiersTitle')}
                        value={tierRow.tierCode}
                        onChange={(e) => {
                          const tierCode = e.target.value;
                          setPriceTierRow(index, 'tierCode', tierCode);
                          setPriceTierRow(index, 'tierName', priceTierLabelMap[tierCode] || tierCode);
                        }}
                      >
                        {PRICE_TIER_CODES.map((tier) => <option key={tier.value} value={tier.value}>{priceTierLabelMap[tier.value] || tier.label}</option>)}
                      </select>
                      <input value={tierRow.tierName} onChange={(e) => setPriceTierRow(index, 'tierName', e.target.value)} placeholder={t('priceTierName')} aria-label={t('priceTierName')} />
                      <select value={tierRow.unitName} onChange={(e) => setPriceTierRow(index, 'unitName', e.target.value)} aria-label={t('unit')}>
                        {form.units.map((unit) => <option key={`${tierRow.tierCode}-${unit.unitName}`} value={unit.unitName}>{unitLabelMap[unit.unitName] || unit.unitName}</option>)}
                      </select>
                      <input type="number" min="0" step="0.01" value={getPlaceholderNumberValue(tierRow.priceSyp)} onChange={(e) => setPriceTierRow(index, 'priceSyp', e.target.value)} placeholder={t('priceSyp')} aria-label={t('priceSyp')} />
                      <button className="btn danger product-row-action" type="button" onClick={() => removePriceTierRow(index)} disabled={form.priceTiers.length === 1}>{t('delete')}</button>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section className="product-form-panel">
              <div className="section-header compact">
                <h3>{t('customerSpecialPricesTitle')}</h3>
                <button className="btn secondary product-panel-action" type="button" onClick={addCustomerPriceRow}>{t('addCustomerPriceRow')}</button>
              </div>
              <div className="product-config-list">
                {form.customerPrices.map((priceRow, index) => (
                  <div key={`customer-price-${index}`} className="product-config-row product-config-row-customers">
                    <select value={priceRow.customerId} onChange={(e) => setCustomerPriceRow(index, 'customerId', e.target.value)} aria-label={t('customer')}>
                      <option value="">{t('customer')}</option>
                      {customers.map((customer) => <option key={customer.id} value={customer.id}>{getLocalizedName(customer, 'name_ar', 'name_en', 'name')}</option>)}
                    </select>
                    <select value={priceRow.unitName} onChange={(e) => setCustomerPriceRow(index, 'unitName', e.target.value)} aria-label={t('unit')}>
                      {form.units.map((unit) => <option key={`customer-price-unit-${unit.unitName}`} value={unit.unitName}>{unitLabelMap[unit.unitName] || unit.unitName}</option>)}
                    </select>
                    <input type="number" min="0" step="0.01" value={getPlaceholderNumberValue(priceRow.priceSyp)} onChange={(e) => setCustomerPriceRow(index, 'priceSyp', e.target.value)} placeholder={t('priceSyp')} aria-label={t('priceSyp')} />
                    <input value={priceRow.notes || ''} onChange={(e) => setCustomerPriceRow(index, 'notes', e.target.value)} placeholder={t('notesField')} aria-label={t('notesField')} />
                    <button className="btn danger product-row-action" type="button" onClick={() => removeCustomerPriceRow(index)}>{t('delete')}</button>
                  </div>
                ))}
              </div>
            </section>

            <div className="product-form-actions">
              <button className="btn" type="submit">{t('save')}</button>
            </div>
          </form>
          {error && <p className="error">{error}</p>}
        </section>
      ) : (
        <section className="card cash-history-card">
          <div className="cash-history-meta products-history-meta">
            <span>{t('productsTitle')}</span>
            <strong>{list.length}</strong>
          </div>

          <div className="header-actions products-header-actions">
            <input placeholder={t('searchByNameSkuBarcode')} value={search} onChange={(e) => setSearch(e.target.value)} />
            <input type="number" min="1" step="1" value={barcodeCopies} onChange={(e) => setBarcodeCopies(e.target.value)} placeholder={t('barcodeCopies')} />
            <button className="btn" type="button" onClick={() => loadProducts(search)}>{t('searchAction')}</button>
            <button className="btn secondary" type="button" onClick={printSelectedBarcodeLabels}>{t('printBarcodeBatch')}</button>
          </div>

          <div className="cash-history-table-wrap cash-history-table-scroll">
            <table className="table cash-history-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={list.length > 0 && list.every((item) => selectedProductIds.includes(item.id))}
                      onChange={toggleSelectAllVisible}
                    />
                  </th>
                  <th>{t('productName')}</th>
                  <th>{t('categoryField')}</th>
                  <th>SKU</th>
                  <th>Barcode</th>
                  <th>{t('currentStock')}</th>
                  <th>{t('productUnitsTitle')}</th>
                  <th>{t('commercialSellingPriceSyp')}</th>
                  <th>{t('status')}</th>
                  <th>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id} className={isLowStock(p) ? 'product-row-low-stock' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedProductIds.includes(p.id)}
                        onChange={() => toggleProductSelection(p.id)}
                      />
                    </td>
                    <td>{getLocalizedName(p, 'name_ar', 'name_en', 'name')}</td>
                    <td>{language === 'en' ? (p.category_name_en || p.category_name) : (p.category_name || p.category_name_en || '-')}</td>
                    <td>{p.sku}</td>
                    <td>{p.barcode || '-'}</td>
                    <td>
                      <div className="product-stock-cell">
                        <strong>{p.current_qty}</strong>
                        {isLowStock(p) ? (
                          <>
                            <span className="product-stock-pill low">{t('lowStockReached')}</span>
                            <small className="product-stock-limit">{t('stockAlertLimit')}: {p.min_stock_level}</small>
                          </>
                        ) : null}
                      </div>
                    </td>
                    <td>{(p.units || []).map((unit) => `${unit.unit_name} × ${unit.conversion_factor}`).join(' | ') || '-'}</td>
                    <td>{formatCommercialSyp(p.selling_price, p.default_currency, exchangeRateConfig?.activeRate)}</td>
                    <td>{p.is_active ? t('active') : t('inactive')}</td>
                    <td className="actions">
                      <button
                        className="btn"
                        type="button"
                        onClick={() => {
                          setForm({
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
                            notes: p.notes || '',
                            units: (p.units || []).map((unit, index) => ({
                              unitName: unit.unit_name,
                              conversionFactor: unit.conversion_factor,
                              isBase: !!unit.is_base,
                              sortOrder: index
                            })),
                            priceTiers: (p.price_tiers || []).map((tier) => ({
                              tierCode: tier.tier_code,
                              tierName: tier.tier_name,
                              unitName: tier.unit_name,
                              priceSyp: tier.price_syp
                            })),
                            customerPrices: (p.customer_prices || []).map((price) => ({
                              customerId: String(price.customer_id),
                              unitName: price.unit_name,
                              priceSyp: price.price_syp,
                              notes: price.notes || ''
                            }))
                          });
                          setActiveProductsPanel('form');
                        }}
                      >
                        {t('edit')}
                      </button>
                      {canRenderCode39(p.barcode || p.sku) ? (
                        <button className="btn secondary" type="button" onClick={() => printBarcodeLabel(p)}>{t('printBarcodeLabel')}</button>
                      ) : null}
                      {p.is_active ? <button className="btn danger" type="button" onClick={() => disableItem(p.id)}>{t('disable')}</button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
