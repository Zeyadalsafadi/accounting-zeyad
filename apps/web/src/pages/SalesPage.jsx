import { useEffect, useMemo, useRef, useState } from 'react';
import { PERMISSIONS } from '@paint-shop/shared';
import api from '../services/api.js';
import { formatCommercialSyp } from '../utils/commercialCurrency.js';
import { formatExchangeRate } from '../utils/exchangeRate.js';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { SUPPORTED_CURRENCIES } from '@paint-shop/shared';
import { getCurrentUser, hasPermission } from '../utils/auth.js';
import { printHtmlDocument } from '../utils/print.js';
import { playScanTone } from '../utils/barcode.js';

const createInitialItem = () => ({ productId: '', unitName: '', priceTierCode: 'RETAIL', qty: 1, lineTotal: 0 });
const initialQuickCustomer = {
  name: '',
  phone: '',
  address: '',
  openingBalance: 0,
  currency: 'SYP',
  notes: ''
};
const createInitialForm = () => ({
  customerId: '',
  invoiceDate: new Date().toISOString().slice(0, 10),
  items: [createInitialItem()],
  discount: 0,
  paidSyp: 0,
  paidUsd: 0,
  notes: ''
});

function FieldLabel({ label }) {
  return <label className="field-label">{label}</label>;
}

function FormField({ label, children, className = '' }) {
  return (
    <div className={`form-field ${className}`.trim()}>
      <FieldLabel label={label} />
      {children}
    </div>
  );
}

export default function SalesPage() {
  const { t, language, dir } = useI18n();
  const detailsRef = useRef(null);
  const barcodeInputRef = useRef(null);
  const [activeSalesPanel, setActiveSalesPanel] = useState('invoice');
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [cashAccounts, setCashAccounts] = useState([]);
  const [exchangeRateConfig, setExchangeRateConfig] = useState(null);
  const [list, setList] = useState([]);
  const [details, setDetails] = useState(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(createInitialForm);
  const [showQuickCustomer, setShowQuickCustomer] = useState(false);
  const [quickCustomer, setQuickCustomer] = useState(initialQuickCustomer);
  const [barcodeSearch, setBarcodeSearch] = useState('');
  const [quickMode, setQuickMode] = useState(true);
  const [error, setError] = useState('');
  const currentUser = getCurrentUser();
  const canPrintSales = hasPermission(currentUser, PERMISSIONS.SALES_PRINT);
  const canCancelSales = hasPermission(currentUser, PERMISSIONS.SALES_CANCEL);
  const canApproveSales = hasPermission(currentUser, PERMISSIONS.SALES_APPROVE);
  const canOverrideSalesLock = hasPermission(currentUser, PERMISSIONS.SALES_OVERRIDE_LOCK);
  const lockWindowHours = 24;
  const currencyLabels = useMemo(() => ({
    SYP: t('sypCurrencyLabel'),
    USD: t('usdCurrencyLabel')
  }), [t]);

  const activeRate = Number(exchangeRateConfig?.activeRate || 0);
  const subtotal = useMemo(() => form.items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0), [form.items]);
  const total = useMemo(() => Math.max(0, subtotal - Number(form.discount || 0)), [subtotal, form.discount]);
  const paidTotalSyp = useMemo(() => Number(form.paidSyp || 0) + (Number(form.paidUsd || 0) * activeRate), [form.paidSyp, form.paidUsd, activeRate]);
  const transactionResult = useMemo(() => total - paidTotalSyp, [total, paidTotalSyp]);
  const selectedSypCashAccount = useMemo(() => cashAccounts.find((account) => account.currency === 'SYP') || null, [cashAccounts]);
  const selectedUsdCashAccount = useMemo(() => cashAccounts.find((account) => account.currency === 'USD') || null, [cashAccounts]);
  const resolvedPaymentType = useMemo(() => {
    if (transactionResult === 0) return 'CASH';
    if (paidTotalSyp === 0) return 'CREDIT';
    return 'PARTIAL';
  }, [transactionResult, paidTotalSyp]);
  const transactionStatus = useMemo(() => {
    if (transactionResult > 0) {
      return {
        tone: 'danger',
        title: t('customerDebtTitle'),
        description: `${t('customerDebtTitle')}: ${transactionResult.toFixed(2)} ${currencyLabels.SYP}`
      };
    }
    if (transactionResult < 0) {
      return {
        tone: 'success',
        title: t('customerCreditTitle'),
        description: `${t('customerCreditTitle')}: ${Math.abs(transactionResult).toFixed(2)} ${currencyLabels.SYP}`
      };
    }
    return {
      tone: 'neutral',
      title: t('settled'),
      description: t('settledInvoiceDescription')
    };
  }, [currencyLabels.SYP, transactionResult, t]);

  const loadInitial = async () => {
    const [customersRes, productsRes, cashRes, salesRes, rateRes] = await Promise.all([
      api.get('/customers'),
      api.get('/products'),
      api.get('/cash-accounts'),
      api.get('/sales'),
      api.get('/exchange-rate')
    ]);

    setCustomers((customersRes.data.data || []).filter((item) => item.is_active));
    setProducts((productsRes.data.data || []).filter((item) => item.is_active));
    setCashAccounts(cashRes.data.data || []);
    setList(salesRes.data.data || []);
    setExchangeRateConfig(rateRes.data.data || null);
  };

  useEffect(() => {
    loadInitial().catch(() => setError(t('loadingSalesFailed')));
  }, [t]);

  useEffect(() => {
    const timer = setTimeout(() => barcodeInputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.ctrlKey && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        barcodeInputRef.current?.focus();
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'i') {
        event.preventDefault();
        addItem();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [form.items.length]);

  const searchInvoices = async () => {
    const res = await api.get('/sales', { params: search ? { q: search } : {} });
    setList(res.data.data || []);
  };

  const setItem = (idx, key, value) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [key]: value };
    setForm({ ...form, items });
  };

  const getSuggestedUnitPrice = (productId) => {
    const product = products.find((item) => String(item.id) === String(productId));
    if (!product) return 0;
    const selectedUnitName = product.units?.find((unit) => unit.is_base)?.unit_name || product.unit;
    const selectedTier = product.price_tiers?.find((tier) => tier.unit_name === selectedUnitName && tier.tier_code === 'RETAIL')
      || product.price_tiers?.[0];
    return Number(selectedTier?.price_syp || product.selling_price || 0);
  };

  const getAvailablePriceOptions = (product, unitName, customerId) => {
    if (!product) return [];
    const options = (product.price_tiers || [])
      .filter((tier) => !unitName || tier.unit_name === unitName)
      .map((tier) => ({
        code: tier.tier_code,
        name: tier.tier_name,
        priceSyp: Number(tier.price_syp || 0)
      }));

    const customerPrice = (product.customer_prices || []).find((price) => (
      String(price.customer_id) === String(customerId || '')
      && (!unitName || price.unit_name === unitName)
    ));

    if (customerPrice) {
      options.unshift({
        code: 'SPECIAL',
        name: `${t('specialCustomerPrice')} - ${customerPrice.customer_name}`,
        priceSyp: Number(customerPrice.price_syp || 0)
      });
    }

    return options;
  };

  const setSuggestedPriceForItem = (idx, overrides = {}) => {
    const items = [...form.items];
    const currentItem = { ...items[idx], ...overrides };
    const product = products.find((item) => String(item.id) === String(currentItem.productId));
    const resolvedUnitName = currentItem.unitName || product?.units?.find((unit) => unit.is_base)?.unit_name || product?.unit || '';
    const availableOptions = getAvailablePriceOptions(product, resolvedUnitName, form.customerId);
    const selectedTier = availableOptions.find((tier) => tier.code === (currentItem.priceTierCode || 'RETAIL'))
      || availableOptions[0]
      || null;
    const qty = Number(currentItem.qty || 0);
    const suggestedLineTotal = Number(selectedTier?.price_syp || getSuggestedUnitPrice(currentItem.productId)) * qty;
    items[idx] = {
      ...currentItem,
      unitName: resolvedUnitName,
      priceTierCode: selectedTier?.code || currentItem.priceTierCode || 'RETAIL',
      lineTotal: Number(suggestedLineTotal.toFixed(2))
    };
    setForm({ ...form, items });
  };

  const handleProductChange = (idx, productId) => setSuggestedPriceForItem(idx, {
    productId,
    unitName: '',
    priceTierCode: 'RETAIL',
    qty: form.items[idx]?.qty || 1
  });
  const handleQtyChange = (idx, qty) => setSuggestedPriceForItem(idx, { qty });
  const handleCustomerChange = (customerId) => {
    const nextForm = { ...form, customerId };
    const nextItems = form.items.map((item) => {
      const product = products.find((productItem) => String(productItem.id) === String(item.productId));
      const unitName = item.unitName || product?.units?.find((unit) => unit.is_base)?.unit_name || product?.unit || '';
      const options = getAvailablePriceOptions(product, unitName, customerId);
      const selectedOption = options.find((option) => option.code === item.priceTierCode)
        || options[0]
        || null;
      const qty = Number(item.qty || 0);
      return {
        ...item,
        unitName,
        priceTierCode: selectedOption?.code || item.priceTierCode || 'RETAIL',
        lineTotal: Number(((selectedOption?.priceSyp || 0) * qty).toFixed(2))
      };
    });
    setForm({ ...nextForm, items: nextItems });
  };

  const addProductByBarcode = () => {
    const code = barcodeSearch.trim().toUpperCase();
    if (!code) return;

    const product = products.find((item) => (
      String(item.barcode || '').trim().toUpperCase() === code
      || String(item.sku || '').trim().toUpperCase() === code
    ));

    if (!product) {
      setError(t('barcodeProductNotFound'));
      playScanTone('error');
      return;
    }

    const existingIndex = form.items.findIndex((item) => String(item.productId) === String(product.id));
    setError('');

    if (existingIndex >= 0) {
      handleQtyChange(existingIndex, Number(form.items[existingIndex].qty || 0) + 1);
    } else {
      const nextIndex = form.items.length;
      const nextItems = [...form.items, createInitialItem()];
      setForm((current) => ({ ...current, items: nextItems }));
      setTimeout(() => {
        setSuggestedPriceForItem(nextIndex, {
          productId: String(product.id),
          unitName: product.units?.find((unit) => unit.is_base)?.unit_name || product.unit || '',
          priceTierCode: 'RETAIL',
          qty: 1
        });
      }, 0);
    }

    setBarcodeSearch('');
    playScanTone('success');
    setTimeout(() => barcodeInputRef.current?.focus(), 0);
  };

  const barcodeMatches = useMemo(() => {
    const code = barcodeSearch.trim().toUpperCase();
    if (!code) return [];
    return products
      .filter((item) => {
        const barcode = String(item.barcode || '').trim().toUpperCase();
        const sku = String(item.sku || '').trim().toUpperCase();
        return barcode.includes(code) || sku.includes(code) || String(item.name_ar || '').includes(barcodeSearch.trim());
      })
      .slice(0, 8);
  }, [products, barcodeSearch]);

  const selectBarcodeMatch = (productId) => {
    const product = products.find((item) => String(item.id) === String(productId));
    if (!product) return;
    setBarcodeSearch(product.barcode || product.sku || '');
    setTimeout(() => addProductByBarcode(), 0);
  };

  const addItem = () => setForm({ ...form, items: [...form.items, createInitialItem()] });
  const removeItem = (idx) => {
    const nextItems = form.items.filter((_, i) => i !== idx);
    setForm({ ...form, items: nextItems.length > 0 ? nextItems : [createInitialItem()] });
  };

  const save = async (e) => {
    e.preventDefault();
    setError('');
    const validItems = form.items.filter((item) => Number(item.productId) && Number(item.qty || 0) > 0);

    if (validItems.length === 0 && paidTotalSyp <= 0) {
      setError(t('salesNeedItemOrReceipt'));
      return;
    }
    if ((transactionResult !== 0 || validItems.length === 0) && !form.customerId) {
      setError(t('salesNeedCustomerForUnsettled'));
      return;
    }
    if (Number(form.paidSyp || 0) > 0 && !selectedSypCashAccount) {
      setError(t('missingSypCashbox'));
      return;
    }
    if (Number(form.paidUsd || 0) > 0 && !selectedUsdCashAccount) {
      setError(t('missingUsdCashbox'));
      return;
    }

    try {
      await api.post('/sales', {
        ...form,
        customerId: form.customerId ? Number(form.customerId) : null,
        discount: Number(form.discount),
        paidSyp: Number(form.paidSyp || 0),
        paidUsd: Number(form.paidUsd || 0),
        paymentType: resolvedPaymentType,
        items: validItems.map((item) => ({
          productId: Number(item.productId),
          qty: Number(item.qty),
          unitName: item.unitName || null,
          priceTierCode: item.priceTierCode || null,
          unitPrice: Number(item.qty || 0) > 0 ? (Number(item.lineTotal || 0) / Number(item.qty || 0)) : 0
        }))
      });

      setForm(createInitialForm());
      await searchInvoices();
    } catch (err) {
      setError(err.response?.data?.error || t('salesSaveFailed'));
    }
  };

  const showDetails = async (id) => {
    const res = await api.get(`/sales/${id}`);
    setDetails(res.data.data);
  };

  const cancelInvoice = async (id) => {
    const reason = window.prompt(t('cancelReasonPrompt'));
    if (!reason) return;
    try {
      await api.post(`/sales/${id}/cancel`, { reason });
      await searchInvoices();
      if (details?.id === id) setDetails(null);
    } catch (err) {
      setError(err.response?.data?.error || t('salesCancelFailed'));
    }
  };

  const approveInvoice = async (id) => {
    setError('');
    try {
      await api.post(`/sales/${id}/approve`);
      await searchInvoices();
      if (details?.id === id) {
        await showDetails(id);
      }
    } catch (err) {
      setError(err.response?.data?.error || t('salesApproveFailed'));
    }
  };

  const unapproveInvoice = async (id) => {
    const reason = window.prompt(t('unapproveReasonPrompt'));
    if (!reason) return;
    setError('');
    try {
      await api.post(`/sales/${id}/unapprove`, { reason });
      await searchInvoices();
      if (details?.id === id) {
        await showDetails(id);
      }
    } catch (err) {
      setError(err.response?.data?.error || t('salesUnapproveFailed'));
    }
  };

  const createCustomerQuick = async () => {
    setError('');
    try {
      const response = await api.post('/customers', { ...quickCustomer, openingBalance: Number(quickCustomer.openingBalance || 0) });
      const createdId = response.data.data?.id;
      const customersRes = await api.get('/customers');
      const nextCustomers = (customersRes.data.data || []).filter((item) => item.is_active);
      setCustomers(nextCustomers);
      setForm((current) => ({ ...current, customerId: createdId ? String(createdId) : current.customerId }));
      setQuickCustomer(initialQuickCustomer);
      setShowQuickCustomer(false);
    } catch (err) {
      setError(err.response?.data?.error || t('customerCreateQuickFailed'));
    }
  };

  const printDetails = () => {
    if (!detailsRef.current || !details) return;
    printHtmlDocument({
      title: `${t('printSalesInvoice')} ${details.invoice_no}`,
      html: detailsRef.current.innerHTML,
      lang: language,
      dir
    });
  };

  const getApprovalLabel = (status) => (
    status === 'APPROVED' ? t('approvedStatus') : t('draftStatus')
  );

  const canApproveInvoice = (invoice) => (
    canApproveSales
    && invoice.status === 'ACTIVE'
    && invoice.approval_status !== 'APPROVED'
  );

  const isWithinLockWindow = (value) => {
    if (!value) return true;
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) return true;
    return ((Date.now() - timestamp) / (1000 * 60 * 60)) <= lockWindowHours;
  };

  const canCancelInvoice = (invoice) => (
    canCancelSales
    && invoice.status === 'ACTIVE'
    && (isWithinLockWindow(invoice.created_at || invoice.invoice_date) || canOverrideSalesLock)
    && (invoice.approval_status !== 'APPROVED' || canOverrideSalesLock)
  );

  const canUnapproveInvoice = (invoice) => (
    canApproveSales
    && canOverrideSalesLock
    && invoice.status === 'ACTIVE'
    && invoice.approval_status === 'APPROVED'
  );

  const formatCurrencyAmount = (amount, currencyCode) => (
    `${Number(amount || 0).toFixed(2)} ${currencyLabels[currencyCode] || currencyCode}`
  );

  const exchangeRateReceiptText = language === 'ar'
    ? `1 ${currencyLabels.USD} = ${formatExchangeRate(activeRate, '0.00')} ${currencyLabels.SYP}`
    : `1 USD = ${formatExchangeRate(activeRate, '0.00')} SYP`;

  return (
    <main className="container sales-page">
      <div className="sales-page-shell">
        <div className="cash-tabs transaction-page-tabs" role="tablist" aria-label={t('salesInvoicesTitle')}>
          <button
            className={`cash-tab${activeSalesPanel === 'invoice' ? ' active' : ''}`}
            type="button"
            role="tab"
            aria-selected={activeSalesPanel === 'invoice'}
            onClick={() => setActiveSalesPanel('invoice')}
          >
            {t('createSalesInvoice')}
          </button>
          <button
            className={`cash-tab${activeSalesPanel === 'receipt' ? ' active' : ''}`}
            type="button"
            role="tab"
            aria-selected={activeSalesPanel === 'receipt'}
            onClick={() => setActiveSalesPanel('receipt')}
          >
            {t('receiptAndResult')}
          </button>
          <button
            className={`cash-tab${activeSalesPanel === 'search' ? ' active' : ''}`}
            type="button"
            role="tab"
            aria-selected={activeSalesPanel === 'search'}
            onClick={() => setActiveSalesPanel('search')}
          >
            {t('searchAction')}
          </button>
        </div>
      <section className="card sales-page-primary-card">
        {activeSalesPanel !== 'search' ? (
        <form onSubmit={save}>
          {activeSalesPanel === 'invoice' ? (
            <section className="entry-section">
            <div className="section-header">
              <h3>{t('salesData')}</h3>
              <p className="hint">{t('soldItemsHint')}</p>
            </div>

            <div className="header-actions" style={{ marginBottom: 12 }}>
              <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={quickMode} onChange={(e) => setQuickMode(e.target.checked)} />
                {t('quickCashierMode')}
              </label>
              <span className="hint">{t('quickCashierHint')}</span>
            </div>

            <div className="form-grid">
              <FormField label={t('customer')}>
                <>
                  <select value={form.customerId} onChange={(e) => handleCustomerChange(e.target.value)}>
                    <option value="">{t('cashCustomerOption')}</option>
                    {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                  </select>
                  <button className="btn secondary inline-create-toggle" type="button" onClick={() => setShowQuickCustomer((current) => !current)}>
                    {showQuickCustomer ? t('closeQuickCreate') : t('newCustomerQuick')}
                  </button>
                  {showQuickCustomer ? (
                    <div className="quick-create-panel">
                      <div className="form-grid">
                        <input placeholder={t('customer')} value={quickCustomer.name} onChange={(e) => setQuickCustomer({ ...quickCustomer, name: e.target.value })} />
                        <input placeholder={t('phone')} value={quickCustomer.phone} onChange={(e) => setQuickCustomer({ ...quickCustomer, phone: e.target.value })} />
                        <input placeholder={t('address')} value={quickCustomer.address} onChange={(e) => setQuickCustomer({ ...quickCustomer, address: e.target.value })} />
                        <input type="number" min="0" step="0.01" placeholder={t('openingBalance')} value={quickCustomer.openingBalance} onChange={(e) => setQuickCustomer({ ...quickCustomer, openingBalance: e.target.value })} />
                        <select value={quickCustomer.currency} onChange={(e) => setQuickCustomer({ ...quickCustomer, currency: e.target.value })}>
                          {SUPPORTED_CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                        </select>
                        <input placeholder={t('notesField')} value={quickCustomer.notes} onChange={(e) => setQuickCustomer({ ...quickCustomer, notes: e.target.value })} />
                      </div>
                      <div className="header-actions">
                        <button className="btn" type="button" onClick={createCustomerQuick}>{t('saveAndSelectCustomer')}</button>
                        <button className="btn secondary" type="button" onClick={() => setShowQuickCustomer(false)}>{t('cancel')}</button>
                      </div>
                    </div>
                  ) : null}
                </>
              </FormField>
              <FormField label={t('invoiceDate')}>
                <input type="date" value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} required />
              </FormField>
            </div>

            <div className="items-section">
              <div className="section-header compact">
                <h3>{t('items')}</h3>
              </div>

              <div className="sales-items-toolbar">
                <div className="sales-barcode-controls">
                  <input
                    ref={barcodeInputRef}
                    className="sales-barcode-input"
                    placeholder={t('barcodeQuickAddPlaceholder')}
                    value={barcodeSearch}
                    onChange={(e) => setBarcodeSearch(e.target.value.toUpperCase())}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addProductByBarcode();
                      }
                      if (event.key === 'ArrowDown' && barcodeMatches.length > 0) {
                        event.preventDefault();
                        const firstMatch = document.querySelector('[data-barcode-match="true"]');
                        firstMatch?.focus();
                      }
                    }}
                  />
                  <button className="btn secondary sales-toolbar-button" type="button" onClick={addProductByBarcode}>{t('addByBarcode')}</button>
                  <button className="btn sales-toolbar-button" type="button" onClick={addItem}>{t('addItem')}</button>
                </div>
                <span className="hint sales-items-toolbar-hint">{t('barcodeShortcutsHint')}</span>
              </div>

              {barcodeMatches.length > 0 ? (
                <div className="card" style={{ marginBottom: 12, padding: 8 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('product')}</th>
                        <th>SKU</th>
                        <th>Barcode</th>
                        <th>{t('currentStock')}</th>
                        <th>{t('actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {barcodeMatches.map((product) => (
                        <tr key={`barcode-match-${product.id}`}>
                          <td>{product.name_ar}</td>
                          <td>{product.sku}</td>
                          <td>{product.barcode || '-'}</td>
                          <td>{product.current_qty}</td>
                          <td className="actions">
                            <button
                              className="btn secondary"
                              type="button"
                              data-barcode-match="true"
                              onClick={() => selectBarcodeMatch(product.id)}
                            >
                              {t('addByBarcode')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {form.items.map((item, idx) => {
                const selectedProduct = products.find((product) => String(product.id) === String(item.productId));
                return (
                  <div
                    key={idx}
                    className="item-row"
                    style={quickMode ? { gridTemplateColumns: 'minmax(220px, 2fr) minmax(120px, 0.9fr) minmax(120px, 0.9fr) minmax(110px, 0.8fr) minmax(150px, 1fr) auto' } : undefined}
                  >
                    <FormField label={t('product')}>
                      <select value={item.productId} onChange={(e) => handleProductChange(idx, e.target.value)}>
                        <option value="">{t('selectProduct')}</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name_ar} [{product.barcode || product.sku}] ({t('availableQty').replace('{qty}', product.current_qty)})
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label={t('unit')}>
                      <select value={item.unitName} onChange={(e) => setSuggestedPriceForItem(idx, { unitName: e.target.value })} disabled={!selectedProduct}>
                        <option value="">{t('unit')}</option>
                        {(selectedProduct?.units || []).map((unit) => (
                          <option key={`${selectedProduct.id}-${unit.id}`} value={unit.unit_name}>
                            {unit.unit_name} ({t('availableQty').replace('{qty}', (Number(selectedProduct.current_qty || 0) / Number(unit.conversion_factor || 1)).toFixed(2))})
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label={t('priceTier')}>
                      <select value={item.priceTierCode} onChange={(e) => setSuggestedPriceForItem(idx, { priceTierCode: e.target.value })} disabled={!selectedProduct}>
                        {getAvailablePriceOptions(selectedProduct, item.unitName, form.customerId).map((tier, index) => (
                          <option key={`${selectedProduct.id}-${tier.code}-${index}`} value={tier.code}>
                            {tier.name} - {tier.priceSyp} SYP
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label={t('quantity')}>
                      <input type="number" min="0.01" step="0.01" value={item.qty} onChange={(e) => handleQtyChange(idx, e.target.value)} />
                    </FormField>
                    <FormField label={t('lineTotalSyp')}>
                      <input type="number" min="0" step="0.01" value={item.lineTotal} onChange={(e) => setItem(idx, 'lineTotal', e.target.value)} />
                    </FormField>
                    <button className="btn danger item-remove" type="button" onClick={() => removeItem(idx)}>{t('delete')}</button>
                  </div>
                );
              })}
            </div>
          </section>
          ) : null}

          {activeSalesPanel === 'receipt' ? (
            <section className="entry-section">
            <div className="section-header">
              <h3>{t('receiptAndResult')}</h3>
              <p className="hint">{t('receiptHint')}</p>
            </div>

              <div className="purchase-bottom-layout">
              <div className="payment-panel">
                <div className="sales-payment-layout">
                  <section className="sales-payment-card sales-payment-card-primary">
                    <div className="sales-payment-paired-grid">
                      <div className="sales-payment-paired-column">
                        <FieldLabel label={t('paidInSyp')} />
                        <input type="number" min="0" step="0.01" placeholder={t('paidInSyp')} value={form.paidSyp} onChange={(e) => setForm({ ...form, paidSyp: e.target.value })} />
                        <FieldLabel label={t('approvedCashboxes')} />
                        <input className="sales-receipt-readonly" value={selectedSypCashAccount ? `${selectedSypCashAccount.name} (${currencyLabels.SYP})` : t('missingSypCashbox')} readOnly />
                      </div>

                      <div className="sales-payment-paired-column">
                        <FieldLabel label={t('paidInUsd')} />
                        <input type="number" min="0" step="0.01" placeholder={t('paidInUsd')} value={form.paidUsd} onChange={(e) => setForm({ ...form, paidUsd: e.target.value })} />
                        <FieldLabel label={t('approvedCashboxes')} />
                        <input className="sales-receipt-readonly" value={selectedUsdCashAccount ? `${selectedUsdCashAccount.name} (${currencyLabels.USD})` : t('missingUsdCashbox')} readOnly />
                      </div>
                    </div>

                    <div className="form-grid sales-receipt-summary-grid">
                      <input className="sales-receipt-readonly" value={exchangeRateReceiptText} readOnly />
                      <input className="sales-receipt-readonly" value={`${t('totalReceived')}: ${formatCurrencyAmount(paidTotalSyp, 'SYP')}`} readOnly />
                    </div>
                  </section>

                  <div className="sales-payment-secondary-grid">
                    <section className="sales-payment-card">
                      <div className="sales-adjustments-grid">
                        <FormField label={t('discount')}>
                          <input type="number" min="0" step="0.01" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
                        </FormField>
                        <FormField label={t('notesField')}>
                          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                        </FormField>
                      </div>
                    </section>
                  </div>
                </div>
              </div>

              <aside className={`status-box ${transactionStatus.tone}`}>
                <h3>{t('invoiceResult')}</h3>
                <p className="status-title">{transactionStatus.title}</p>
                <p className="status-value">{formatCurrencyAmount(transactionResult, 'SYP')}</p>
                <p className="status-text">{transactionStatus.description}</p>
                <div className="status-meta">
                  <span>{t('total')}: {formatCurrencyAmount(subtotal, 'SYP')}</span>
                  <span>{t('totalAfterDiscount')}: {formatCurrencyAmount(total, 'SYP')}</span>
                  <span>{t('paidEquivalent')}: {formatCurrencyAmount(paidTotalSyp, 'SYP')}</span>
                  <span>{t('paymentBreakdown')}: {formatCurrencyAmount(form.paidSyp, 'SYP')} + {formatCurrencyAmount(form.paidUsd, 'USD')}</span>
                </div>
              </aside>
            </div>
          </section>
          ) : null}

          <button className="btn" type="submit">{t('saveInvoice')}</button>
          {error && <p className="error">{error}</p>}
        </form>
        ) : (
          <section className="entry-section">
            <div className="section-header">
              <h3>{t('searchAction')}</h3>
              <p className="hint">{t('salesInvoicesTitle')}</p>
            </div>
            <div className="header-actions" style={{ marginBottom: 10 }}>
              <input placeholder={t('searchByInvoiceCustomer')} value={search} onChange={(e) => setSearch(e.target.value)} />
              <button className="btn" type="button" onClick={searchInvoices}>{t('searchAction')}</button>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('invoiceNumberShort')}</th>
                  <th>{t('date')}</th>
                  <th>{t('type')}</th>
                  <th>{t('customer')}</th>
                  <th>{t('totalSales')}</th>
                  <th>{t('received')}</th>
                  <th>{t('remaining')}</th>
                  <th>{t('status')}</th>
                  <th>{t('approvalStatus')}</th>
                  <th>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.invoice_no}</td>
                    <td>{inv.invoice_date}</td>
                    <td>{Number(inv.total_original || 0) === 0 && (Number(inv.paid_syp || 0) > 0 || Number(inv.paid_usd || 0) > 0) ? t('salesListTypeCollectionOnly') : t('salesListTypeSale')}</td>
                    <td>{inv.customer_name || t('cashCustomer')}</td>
                    <td>{formatCommercialSyp(inv.total_original, inv.currency, exchangeRateConfig?.activeRate)}</td>
                    <td>{Number(inv.paid_syp || 0).toFixed(2)} SYP + {Number(inv.paid_usd || 0).toFixed(2)} USD</td>
                    <td>{formatCommercialSyp(inv.remaining_original, inv.currency, exchangeRateConfig?.activeRate)}</td>
                    <td>{inv.status === 'ACTIVE' ? t('activeStatus') : t('cancelledStatus')}</td>
                    <td>{getApprovalLabel(inv.approval_status)}</td>
                    <td className="actions">
                      <button className="btn" type="button" onClick={() => showDetails(inv.id)}>{t('details')}</button>
                      {canApproveInvoice(inv) ? <button className="btn secondary" type="button" onClick={() => approveInvoice(inv.id)}>{t('approve')}</button> : null}
                      {canCancelInvoice(inv) ? <button className="btn danger" type="button" onClick={() => cancelInvoice(inv.id)}>{t('cancelInvoice')}</button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {error && <p className="error">{error}</p>}
          </section>
        )}
      </section>
      </div>

      {details && (
        <section className="card" ref={detailsRef}>
          {canPrintSales && details.approval_status === 'APPROVED' ? (
            <div className="header-actions no-print" style={{ marginBottom: 12 }}>
              <button className="btn secondary" type="button" onClick={printDetails}>{t('printSalesInvoice')}</button>
            </div>
          ) : null}
          {details.approval_status !== 'APPROVED' ? (
            <p className="hint no-print">{t('printRequiresApproval')}</p>
          ) : null}
          <h2>{t('details')} {details.invoice_no}</h2>
          <p><strong>{t('customer')}:</strong> {details.customer_name || t('cashCustomer')}</p>
          <p><strong>{t('commercialCurrency')}:</strong> SYP | <strong>{t('activeExchangeRate')}:</strong> {formatExchangeRate(exchangeRateConfig?.activeRate ?? details.exchange_rate, '0.00')}</p>
          <p><strong>{t('totalSales')}:</strong> {formatCommercialSyp(details.total_original, details.currency, exchangeRateConfig?.activeRate)} | <strong>{t('received')}:</strong> {Number(details.paid_syp || 0).toFixed(2)} SYP + {Number(details.paid_usd || 0).toFixed(2)} USD</p>
          <p><strong>{t('printInvoiceUnitPricingHint')}:</strong> {t('printInvoiceUnitPricingSalesDescription')}</p>
          <p><strong>{t('status')}:</strong> {details.status}</p>
          <p><strong>{t('approvalStatus')}:</strong> {getApprovalLabel(details.approval_status)}</p>
          {details.approval_status === 'APPROVED' ? (
            <p><strong>{t('approvedBy')}:</strong> {details.approved_by_name || '-'} | <strong>{t('approvedAt')}:</strong> {details.approved_at || '-'}</p>
          ) : null}
          {canUnapproveInvoice(details) ? (
            <div className="header-actions no-print" style={{ marginBottom: 12 }}>
              <button className="btn danger" type="button" onClick={() => unapproveInvoice(details.id)}>{t('unapprove')}</button>
            </div>
          ) : null}
          <table className="table">
            <thead><tr><th>{t('product')}</th><th>{t('unit')}</th><th>{t('priceTier')}</th><th>{t('quantity')}</th><th>{t('sellingPrice')}</th><th>{t('total')}</th><th>{t('totalCogs')}</th><th>{t('grossProfit')}</th></tr></thead>
            <tbody>
              {(details.items || []).map((it) => (
                <tr key={it.id}>
                  <td>{it.product_name}</td>
                  <td>{it.selected_unit_name || '-'}</td>
                  <td>{it.selected_price_tier_name || it.selected_price_tier_code || '-'}</td>
                  <td>{it.qty}</td>
                  <td>{formatCommercialSyp(it.unit_price_original, details.currency, exchangeRateConfig?.activeRate)}</td>
                  <td>{formatCommercialSyp(it.line_total_original, details.currency, exchangeRateConfig?.activeRate)}</td>
                  <td>{formatCommercialSyp(it.line_cogs_base, 'SYP', exchangeRateConfig?.activeRate)}</td>
                  <td>{formatCommercialSyp(it.line_profit_base, 'SYP', exchangeRateConfig?.activeRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p><strong>{t('salesOperationType')}:</strong> {Number(details.total_original || 0) === 0 && (Number(details.paid_syp || 0) > 0 || Number(details.paid_usd || 0) > 0) ? t('salesOperationCollectionOnly') : t('salesOperationInvoice')}</p>
        </section>
      )}
    </main>
  );
}
