import { useEffect, useMemo, useRef, useState } from 'react';
import { PERMISSIONS, SUPPORTED_CURRENCIES } from '@paint-shop/shared';
import api from '../services/api.js';
import { formatExchangeRate } from '../utils/exchangeRate.js';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { getCurrentUser, hasPermission } from '../utils/auth.js';
import { printHtmlDocument } from '../utils/print.js';

const initialItem = { productId: '', unitName: '', qty: 1, unitPrice: 0 };
const initialQuickSupplier = {
  name: '',
  phone: '',
  address: '',
  openingBalance: 0,
  currency: 'SYP',
  notes: ''
};
const initialForm = {
  supplierId: '',
  invoiceDate: new Date().toISOString().slice(0, 10),
  currency: 'SYP',
  items: [initialItem],
  discount: 0,
  paidSyp: '',
  paidUsd: '',
  notes: ''
};

function FieldLabel({ label }) {
  return <label className="field-label">{label}</label>;
}

function FormField({ label, children }) {
  return (
    <div className="form-field">
      <FieldLabel label={label} />
      {children}
    </div>
  );
}

export default function PurchasesPage() {
  const { t, language, dir } = useI18n();
  const detailsRef = useRef(null);
  const [activePurchasesPanel, setActivePurchasesPanel] = useState('invoice');
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [cashAccounts, setCashAccounts] = useState([]);
  const [exchangeRateConfig, setExchangeRateConfig] = useState(null);
  const [list, setList] = useState([]);
  const [details, setDetails] = useState(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(initialForm);
  const [showQuickSupplier, setShowQuickSupplier] = useState(false);
  const [quickSupplier, setQuickSupplier] = useState(initialQuickSupplier);
  const [error, setError] = useState('');
  const currentUser = getCurrentUser();
  const canPrintPurchases = hasPermission(currentUser, PERMISSIONS.PURCHASES_PRINT);
  const canCancelPurchases = hasPermission(currentUser, PERMISSIONS.PURCHASES_CANCEL);
  const canApprovePurchases = hasPermission(currentUser, PERMISSIONS.PURCHASES_APPROVE);
  const canOverridePurchasesLock = hasPermission(currentUser, PERMISSIONS.PURCHASES_OVERRIDE_LOCK);
  const lockWindowHours = 24;
  const currencyLabels = useMemo(() => ({
    SYP: t('sypCurrencyLabel'),
    USD: t('usdCurrencyLabel')
  }), [t]);

  const activeRate = Number(exchangeRateConfig?.activeRate || 0);
  const subtotal = useMemo(() => form.items.reduce((s, i) => s + (Number(i.qty || 0) * Number(i.unitPrice || 0)), 0), [form.items]);
  const total = useMemo(() => Math.max(0, subtotal - Number(form.discount || 0)), [subtotal, form.discount]);
  const paidTotalSyp = useMemo(() => Number(form.paidSyp || 0) + (Number(form.paidUsd || 0) * activeRate), [form.paidSyp, form.paidUsd, activeRate]);
  const paidEquivalentOriginal = useMemo(() => {
    if (form.currency === 'USD') {
      return Number(form.paidUsd || 0) + (activeRate > 0 ? (Number(form.paidSyp || 0) / activeRate) : 0);
    }
    return paidTotalSyp;
  }, [form.currency, form.paidUsd, form.paidSyp, paidTotalSyp, activeRate]);
  const transactionResult = useMemo(() => total - paidEquivalentOriginal, [total, paidEquivalentOriginal]);
  const selectedSypCashAccount = useMemo(() => cashAccounts.find((account) => account.currency === 'SYP') || null, [cashAccounts]);
  const selectedUsdCashAccount = useMemo(() => cashAccounts.find((account) => account.currency === 'USD') || null, [cashAccounts]);
  const resolvedPaymentType = useMemo(() => {
    if (transactionResult === 0) return 'CASH';
    if (paidTotalSyp === 0) return 'CREDIT';
    return 'PARTIAL';
  }, [transactionResult, paidTotalSyp]);

  const transactionStatus = useMemo(() => {
    if (transactionResult > 0) return { tone: 'warning', title: t('supplierPayableTitle'), description: `${t('supplierOutstandingTransferHint')}: ${transactionResult.toFixed(2)} ${form.currency}` };
    if (transactionResult < 0) return { tone: 'success', title: t('supplierCreditTitle'), description: `${t('supplierCreditTransferHint')}: ${Math.abs(transactionResult).toFixed(2)} ${form.currency}` };
    return { tone: 'neutral', title: t('settled'), description: t('settledPurchaseDescription').replace('{currency}', form.currency) };
  }, [transactionResult, form.currency, t]);

  const loadInitial = async () => {
    const [s, p, c, inv, rate] = await Promise.all([
      api.get('/suppliers'),
      api.get('/products'),
      api.get('/cash-accounts'),
      api.get('/purchases'),
      api.get('/exchange-rate')
    ]);
    setSuppliers((s.data.data || []).filter((x) => x.is_active));
    setProducts((p.data.data || []).filter((x) => x.is_active));
    setCashAccounts(c.data.data || []);
    setList(inv.data.data || []);
    setExchangeRateConfig(rate.data.data || null);
  };

  useEffect(() => {
    loadInitial().catch(() => setError(t('loadingPurchasesFailed')));
  }, [t]);

  const searchInvoices = async () => {
    const res = await api.get('/purchases', { params: search ? { q: search } : {} });
    setList(res.data.data || []);
  };

  const setItem = (idx, key, value) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [key]: value };
    setForm({ ...form, items });
  };

  const handleProductChange = (idx, productId) => {
    const product = products.find((item) => String(item.id) === String(productId));
    const defaultUnit = product?.units?.find((unit) => unit.is_base)?.unit_name || product?.unit || '';
    const items = [...form.items];
    items[idx] = { ...items[idx], productId, unitName: defaultUnit };
    setForm({ ...form, items });
  };

  const addItem = () => setForm({ ...form, items: [...form.items, { ...initialItem }] });
  const removeItem = (idx) => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (Number(form.paidSyp || 0) > 0 && !selectedSypCashAccount) {
        setError(t('missingSypCashbox'));
        return;
      }
      if (Number(form.paidUsd || 0) > 0 && !selectedUsdCashAccount) {
        setError(t('missingUsdCashbox'));
        return;
      }

      await api.post('/purchases', {
        ...form,
        supplierId: Number(form.supplierId),
        discount: Number(form.discount),
        paymentType: resolvedPaymentType,
        paidSyp: Number(form.paidSyp || 0),
        paidUsd: Number(form.paidUsd || 0),
        items: form.items.map((item) => ({
          productId: Number(item.productId),
          qty: Number(item.qty),
          unitPrice: Number(item.unitPrice),
          unitName: item.unitName || null
        }))
      });

      setForm({ ...initialForm, invoiceDate: new Date().toISOString().slice(0, 10) });
      await searchInvoices();
    } catch (err) {
      setError(err.response?.data?.error || t('purchaseSaveFailed'));
    }
  };

  const showDetails = async (id) => {
    const res = await api.get(`/purchases/${id}`);
    setDetails(res.data.data);
  };

  const cancelInvoice = async (id) => {
    const reason = window.prompt(t('cancelReasonPrompt'));
    if (!reason) return;
    try {
      await api.post(`/purchases/${id}/cancel`, { reason });
      await searchInvoices();
      if (details?.id === id) setDetails(null);
    } catch (err) {
      setError(err.response?.data?.error || t('purchasesCancelFailed'));
    }
  };

  const approveInvoice = async (id) => {
    setError('');
    try {
      await api.post(`/purchases/${id}/approve`);
      await searchInvoices();
      if (details?.id === id) {
        await showDetails(id);
      }
    } catch (err) {
      setError(err.response?.data?.error || t('purchasesApproveFailed'));
    }
  };

  const unapproveInvoice = async (id) => {
    const reason = window.prompt(t('unapproveReasonPrompt'));
    if (!reason) return;
    setError('');
    try {
      await api.post(`/purchases/${id}/unapprove`, { reason });
      await searchInvoices();
      if (details?.id === id) {
        await showDetails(id);
      }
    } catch (err) {
      setError(err.response?.data?.error || t('purchasesUnapproveFailed'));
    }
  };

  const createSupplierQuick = async () => {
    setError('');
    try {
      const response = await api.post('/suppliers', { ...quickSupplier, openingBalance: Number(quickSupplier.openingBalance || 0) });
      const createdId = response.data.data?.id;
      const suppliersRes = await api.get('/suppliers');
      const nextSuppliers = (suppliersRes.data.data || []).filter((item) => item.is_active);
      setSuppliers(nextSuppliers);
      setForm((current) => ({ ...current, supplierId: createdId ? String(createdId) : current.supplierId }));
      setQuickSupplier({ ...initialQuickSupplier, currency: form.currency || 'SYP' });
      setShowQuickSupplier(false);
    } catch (err) {
      setError(err.response?.data?.error || t('supplierCreateQuickFailed'));
    }
  };

  const printDetails = () => {
    if (!detailsRef.current || !details) return;
    printHtmlDocument({
      title: `${t('printPurchaseInvoice')} ${details.invoice_no}`,
      html: detailsRef.current.innerHTML,
      lang: language,
      dir
    });
  };

  const getApprovalLabel = (status) => (
    status === 'APPROVED' ? t('approvedStatus') : t('draftStatus')
  );

  const canApproveInvoice = (invoice) => (
    canApprovePurchases
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
    canCancelPurchases
    && invoice.status === 'ACTIVE'
    && (isWithinLockWindow(invoice.created_at || invoice.invoice_date) || canOverridePurchasesLock)
    && (invoice.approval_status !== 'APPROVED' || canOverridePurchasesLock)
  );

  const canUnapproveInvoice = (invoice) => (
    canApprovePurchases
    && canOverridePurchasesLock
    && invoice.status === 'ACTIVE'
    && invoice.approval_status === 'APPROVED'
  );

  return (
    <main className="container purchases-page">
      <div className="purchases-page-shell">
        <div className="cash-tabs transaction-page-tabs" role="tablist" aria-label={t('purchasesInvoicesTitle')}>
          <button
            className={`cash-tab${activePurchasesPanel === 'invoice' ? ' active' : ''}`}
            type="button"
            role="tab"
            aria-selected={activePurchasesPanel === 'invoice'}
            onClick={() => setActivePurchasesPanel('invoice')}
          >
            {t('createPurchaseInvoice')}
          </button>
          <button
            className={`cash-tab${activePurchasesPanel === 'payment' ? ' active' : ''}`}
            type="button"
            role="tab"
            aria-selected={activePurchasesPanel === 'payment'}
            onClick={() => setActivePurchasesPanel('payment')}
          >
            {t('paymentAndResult')}
          </button>
          <button
            className={`cash-tab${activePurchasesPanel === 'search' ? ' active' : ''}`}
            type="button"
            role="tab"
            aria-selected={activePurchasesPanel === 'search'}
            onClick={() => setActivePurchasesPanel('search')}
          >
            {t('searchAction')}
          </button>
        </div>
      <section className="card purchases-page-primary-card">
        {activePurchasesPanel !== 'search' ? (
        <form onSubmit={save}>
          {activePurchasesPanel === 'invoice' ? (
            <section className="entry-section">
            <div className="section-header">
              <h3>{t('purchaseData')}</h3>
              <p className="hint">{t('purchasedItemsHint')}</p>
            </div>
            <div className="form-grid">
              <FormField label={t('supplierName')}>
                <>
                  <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} required>
                    <option value="">{t('supplierName')}</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <button className="btn secondary inline-create-toggle" type="button" onClick={() => setShowQuickSupplier((current) => !current)}>
                    {showQuickSupplier ? t('closeQuickCreate') : t('newSupplierQuick')}
                  </button>
                  {showQuickSupplier ? (
                    <div className="quick-create-panel">
                      <div className="form-grid">
                        <input placeholder={t('supplierName')} value={quickSupplier.name} onChange={(e) => setQuickSupplier({ ...quickSupplier, name: e.target.value })} />
                        <input placeholder={t('phone')} value={quickSupplier.phone} onChange={(e) => setQuickSupplier({ ...quickSupplier, phone: e.target.value })} />
                        <input placeholder={t('address')} value={quickSupplier.address} onChange={(e) => setQuickSupplier({ ...quickSupplier, address: e.target.value })} />
                        <input type="number" min="0" step="0.01" placeholder={t('openingBalance')} value={quickSupplier.openingBalance} onChange={(e) => setQuickSupplier({ ...quickSupplier, openingBalance: e.target.value })} />
                        <select value={quickSupplier.currency} onChange={(e) => setQuickSupplier({ ...quickSupplier, currency: e.target.value })}>
                          {SUPPORTED_CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                        </select>
                        <input placeholder={t('notesField')} value={quickSupplier.notes} onChange={(e) => setQuickSupplier({ ...quickSupplier, notes: e.target.value })} />
                      </div>
                      <div className="header-actions">
                        <button className="btn" type="button" onClick={createSupplierQuick}>{t('saveAndSelectSupplier')}</button>
                        <button className="btn secondary" type="button" onClick={() => setShowQuickSupplier(false)}>{t('cancel')}</button>
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
                <button className="btn" type="button" onClick={addItem}>{t('addItem')}</button>
              </div>
              {form.items.map((item, idx) => {
                const selectedProduct = products.find((product) => String(product.id) === String(item.productId));
                return (
                  <div key={idx} className="item-row">
                    <FormField label={t('product')}>
                      <select value={item.productId} onChange={(e) => handleProductChange(idx, e.target.value)} required>
                        <option value="">{t('selectProduct')}</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name_ar}</option>)}
                      </select>
                    </FormField>
                    <FormField label={t('unit')}>
                      <select value={item.unitName} onChange={(e) => setItem(idx, 'unitName', e.target.value)} disabled={!selectedProduct}>
                        <option value="">{t('unit')}</option>
                        {(selectedProduct?.units || []).map((unit) => (
                          <option key={`${selectedProduct.id}-${unit.id}`} value={unit.unit_name}>
                            {unit.unit_name} × {unit.conversion_factor}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label={t('quantity')}>
                      <input type="number" min="0.01" step="0.01" value={item.qty} onChange={(e) => setItem(idx, 'qty', e.target.value)} required />
                    </FormField>
                    <FormField label={t('unitPrice')}>
                      <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => setItem(idx, 'unitPrice', e.target.value)} required />
                    </FormField>
                    <button className="btn danger item-remove" type="button" onClick={() => removeItem(idx)} disabled={form.items.length === 1}>{t('delete')}</button>
                  </div>
                );
              })}
            </div>
          </section>
          ) : null}

          {activePurchasesPanel === 'payment' ? (
            <section className="entry-section">
            <div className="section-header">
              <h3>{t('paymentAndResult')}</h3>
              <p className="hint">{t('paymentHint')}</p>
            </div>
            <div className="purchase-bottom-layout">
              <div className="payment-panel">
                <div className="sales-payment-layout">
                  <section className="sales-payment-card sales-payment-card-primary">
                    <div className="sales-payment-paired-grid">
                      <div className="sales-payment-paired-column">
                        <FieldLabel label={t('purchasePaidInSyp')} />
                        <input type="number" min="0" step="0.01" placeholder={t('purchasePaidInSyp')} value={form.paidSyp} onChange={(e) => setForm({ ...form, paidSyp: e.target.value })} />
                        <FieldLabel label={t('approvedCashboxes')} />
                        <input className="sales-receipt-readonly" value={selectedSypCashAccount ? `${selectedSypCashAccount.name} (${currencyLabels.SYP})` : t('missingSypCashbox')} readOnly />
                      </div>

                      <div className="sales-payment-paired-column">
                        <FieldLabel label={t('purchasePaidInUsd')} />
                        <input type="number" min="0" step="0.01" placeholder={t('purchasePaidInUsd')} value={form.paidUsd} onChange={(e) => setForm({ ...form, paidUsd: e.target.value })} />
                        <FieldLabel label={t('approvedCashboxes')} />
                        <input className="sales-receipt-readonly" value={selectedUsdCashAccount ? `${selectedUsdCashAccount.name} (${currencyLabels.USD})` : t('missingUsdCashbox')} readOnly />
                      </div>
                    </div>
                  </section>

                  <section className="sales-payment-card">
                    <div className="form-grid">
                      <FormField label={t('currency')}>
                        <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                          {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </FormField>
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

              <aside className={`status-box ${transactionStatus.tone}`}>
                <h3>{t('invoiceResult')}</h3>
                <p className="status-title">{transactionStatus.title}</p>
                <p className="status-value">{transactionResult.toFixed(2)} {form.currency}</p>
                <p className="status-text">{transactionStatus.description}</p>
                <div className="status-meta">
                  <span>{t('total')}: {subtotal.toFixed(2)} {form.currency}</span>
                  <span>{t('totalAfterDiscount')}: {total.toFixed(2)} {form.currency}</span>
                  <span>{t('totalPaidEquivalent')}: {paidEquivalentOriginal.toFixed(2)} {form.currency}</span>
                  <span>{t('purchasePaymentBreakdown')}: {Number(form.paidSyp || 0).toFixed(2)} {currencyLabels.SYP} + {Number(form.paidUsd || 0).toFixed(2)} {currencyLabels.USD}</span>
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
              <p className="hint">{t('purchasesInvoicesTitle')}</p>
            </div>
            <div className="header-actions" style={{ marginBottom: 10 }}>
              <input placeholder={t('searchByInvoiceSupplier')} value={search} onChange={(e) => setSearch(e.target.value)} />
              <button className="btn" type="button" onClick={searchInvoices}>{t('searchAction')}</button>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('invoiceNumberShort')}</th>
                  <th>{t('date')}</th>
                  <th>{t('supplierName')}</th>
                  <th>{t('total')}</th>
                  <th>{t('paid')}</th>
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
                    <td>{inv.supplier_name || '-'}</td>
                    <td>{inv.total_original}</td>
                    <td>{inv.paid_original}</td>
                    <td>{inv.remaining_original}</td>
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
          {canPrintPurchases && details.approval_status === 'APPROVED' ? (
            <div className="header-actions no-print" style={{ marginBottom: 12 }}>
              <button className="btn secondary" type="button" onClick={printDetails}>{t('printPurchaseInvoice')}</button>
            </div>
          ) : null}
          {details.approval_status !== 'APPROVED' ? (
            <p className="hint no-print">{t('printRequiresApproval')}</p>
          ) : null}
          <h2>{t('details')} {details.invoice_no}</h2>
          <p><strong>{t('supplierName')}:</strong> {details.supplier_name || '-'}</p>
          <p><strong>{t('currency')}:</strong> {details.currency} | <strong>{t('exchangeRate')}:</strong> {formatExchangeRate(details.exchange_rate, '0.00')}</p>
          <p><strong>{t('total')}:</strong> {details.total_original} | <strong>{t('paid')}:</strong> {details.paid_original}</p>
          <p><strong>{t('printInvoiceUnitPricingHint')}:</strong> {t('printInvoiceUnitPricingPurchaseDescription')}</p>
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
            <thead><tr><th>{t('product')}</th><th>{t('unit')}</th><th>{t('quantity')}</th><th>{t('unitPrice')}</th><th>{t('total')}</th></tr></thead>
            <tbody>
              {(details.items || []).map((it) => (
                <tr key={it.id}>
                  <td>{it.product_name}</td>
                  <td>{it.selected_unit_name || '-'}</td>
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
