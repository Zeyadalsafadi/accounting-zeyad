import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api.js';
import { formatCommercialSyp } from '../utils/commercialCurrency.js';
import { SUPPORTED_CURRENCIES } from '@paint-shop/shared';
import { useI18n } from '../i18n/I18nProvider.jsx';

const initialItem = { productId: '', qty: 1, lineTotal: 0 };
const initialQuickCustomer = {
  name: '',
  phone: '',
  address: '',
  openingBalance: 0,
  currency: 'SYP',
  notes: ''
};
const initialForm = {
  customerId: '',
  invoiceDate: new Date().toISOString().slice(0, 10),
  items: [],
  discount: 0,
  paidSyp: 0,
  paidUsd: 0,
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

export default function SalesPage() {
  const { t } = useI18n();
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [cashAccounts, setCashAccounts] = useState([]);
  const [exchangeRateConfig, setExchangeRateConfig] = useState(null);
  const [list, setList] = useState([]);
  const [details, setDetails] = useState(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(initialForm);
  const [showQuickCustomer, setShowQuickCustomer] = useState(false);
  const [quickCustomer, setQuickCustomer] = useState(initialQuickCustomer);
  const [error, setError] = useState('');

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
        description: `${t('customerDebtTitle')}: ${transactionResult.toFixed(2)} SYP`
      };
    }
    if (transactionResult < 0) {
      return {
        tone: 'success',
        title: t('customerCreditTitle'),
        description: `${t('customerCreditTitle')}: ${Math.abs(transactionResult).toFixed(2)} SYP`
      };
    }
    return {
      tone: 'neutral',
      title: t('settled'),
      description: t('settledInvoiceDescription')
    };
  }, [transactionResult, t]);

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
    const avgCostBase = Number(product.avg_cost_base || 0);
    if (avgCostBase > 0) return avgCostBase;
    if (product.default_currency === 'SYP') return Number(product.purchase_price || product.selling_price || 0);
    if (Number(product.purchase_price || 0) > 0 && activeRate > 0) return Number(product.purchase_price) * activeRate;
    return 0;
  };

  const setSuggestedPriceForItem = (idx, overrides = {}) => {
    const items = [...form.items];
    const currentItem = { ...items[idx], ...overrides };
    const qty = Number(currentItem.qty || 0);
    const suggestedLineTotal = getSuggestedUnitPrice(currentItem.productId) * qty;
    items[idx] = { ...currentItem, lineTotal: Number(suggestedLineTotal.toFixed(2)) };
    setForm({ ...form, items });
  };

  const handleProductChange = (idx, productId) => setSuggestedPriceForItem(idx, { productId });
  const handleQtyChange = (idx, qty) => setSuggestedPriceForItem(idx, { qty });
  const addItem = () => setForm({ ...form, items: [...form.items, { ...initialItem }] });
  const removeItem = (idx) => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });

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
          unitPrice: Number(item.qty || 0) > 0 ? (Number(item.lineTotal || 0) / Number(item.qty || 0)) : 0
        }))
      });

      setForm({ ...initialForm, invoiceDate: new Date().toISOString().slice(0, 10) });
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

  return (
    <main className="container">
      <header className="header-row">
        <h1>{t('salesInvoicesTitle')}</h1>
        <Link className="btn" to="/">{t('back')}</Link>
      </header>

      <section className="card">
        <h2>{t('createSalesInvoice')}</h2>
        <form onSubmit={save}>
          <section className="entry-section">
            <div className="section-header">
              <h3>{t('salesData')}</h3>
              <p className="hint">{t('soldItemsHint')}</p>
            </div>

            <div className="form-grid">
              <FormField label={t('customer')}>
                <>
                  <select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
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
                <button className="btn" type="button" onClick={addItem}>{t('addItem')}</button>
              </div>

              {form.items.length === 0 ? <p className="hint">{t('noItemsYetSales')}</p> : null}

              {form.items.map((item, idx) => {
                const selectedProduct = products.find((product) => String(product.id) === String(item.productId));
                return (
                  <div key={idx} className="item-row">
                    <FormField label={t('product')}>
                      <select value={item.productId} onChange={(e) => handleProductChange(idx, e.target.value)}>
                        <option value="">{t('selectProduct')}</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name_ar} ({t('availableQty').replace('{qty}', product.current_qty)})
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label={t('unit')}>
                      <input value={selectedProduct?.unit || '-'} readOnly />
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

          <section className="entry-section">
            <div className="section-header">
              <h3>{t('receiptAndResult')}</h3>
              <p className="hint">{t('receiptHint')}</p>
            </div>

            <div className="purchase-bottom-layout">
              <div className="payment-panel">
                <div className="form-grid">
                  <FormField label={t('receipt')}>
                    <div className="form-grid">
                      <input type="number" min="0" step="0.01" placeholder={t('paidInSyp')} value={form.paidSyp} onChange={(e) => setForm({ ...form, paidSyp: e.target.value })} />
                      <input type="number" min="0" step="0.01" placeholder={t('paidInUsd')} value={form.paidUsd} onChange={(e) => setForm({ ...form, paidUsd: e.target.value })} />
                      <input value={`1 USD = ${activeRate || 0} SYP`} readOnly />
                      <input value={`${t('totalReceived')}: ${paidTotalSyp.toFixed(2)} SYP`} readOnly />
                    </div>
                  </FormField>
                  <FormField label={t('approvedCashboxes')}>
                    <input value={selectedSypCashAccount ? `${selectedSypCashAccount.name} (SYP)` : t('missingSypCashbox')} readOnly />
                    <input value={selectedUsdCashAccount ? `${selectedUsdCashAccount.name} (USD)` : t('missingUsdCashbox')} readOnly />
                  </FormField>
                  <FormField label={t('discount')}>
                    <input type="number" min="0" step="0.01" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
                  </FormField>
                  <FormField label={t('notesField')}>
                    <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  </FormField>
                </div>
              </div>

              <aside className={`status-box ${transactionStatus.tone}`}>
                <h3>{t('invoiceResult')}</h3>
                <p className="status-title">{transactionStatus.title}</p>
                <p className="status-value">{transactionResult.toFixed(2)} SYP</p>
                <p className="status-text">{transactionStatus.description}</p>
                <div className="status-meta">
                  <span>{t('total')}: {subtotal.toFixed(2)} SYP</span>
                  <span>{t('totalAfterDiscount')}: {total.toFixed(2)} SYP</span>
                  <span>{t('paidEquivalent')}: {paidTotalSyp.toFixed(2)} SYP</span>
                  <span>{t('paymentBreakdown')}: {Number(form.paidSyp || 0).toFixed(2)} SYP + {Number(form.paidUsd || 0).toFixed(2)} USD</span>
                </div>
              </aside>
            </div>
          </section>

          <button className="btn" type="submit">{t('saveInvoice')}</button>
          {error && <p className="error">{error}</p>}
        </form>
      </section>

      <section className="card">
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
                <td className="actions">
                  <button className="btn" type="button" onClick={() => showDetails(inv.id)}>{t('details')}</button>
                  {inv.status === 'ACTIVE' && <button className="btn danger" type="button" onClick={() => cancelInvoice(inv.id)}>{t('cancelInvoice')}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {details && (
        <section className="card">
          <h2>{t('details')} {details.invoice_no}</h2>
          <p><strong>{t('customer')}:</strong> {details.customer_name || t('cashCustomer')}</p>
          <p><strong>{t('commercialCurrency')}:</strong> SYP | <strong>{t('activeExchangeRate')}:</strong> {exchangeRateConfig?.activeRate || details.exchange_rate}</p>
          <p><strong>{t('totalSales')}:</strong> {formatCommercialSyp(details.total_original, details.currency, exchangeRateConfig?.activeRate)} | <strong>{t('received')}:</strong> {Number(details.paid_syp || 0).toFixed(2)} SYP + {Number(details.paid_usd || 0).toFixed(2)} USD</p>
          <p><strong>{t('status')}:</strong> {details.status}</p>
          <table className="table">
            <thead><tr><th>{t('product')}</th><th>{t('quantity')}</th><th>{t('sellingPrice')}</th><th>{t('total')}</th><th>{t('totalCogs')}</th><th>{t('grossProfit')}</th></tr></thead>
            <tbody>
              {(details.items || []).map((it) => (
                <tr key={it.id}>
                  <td>{it.product_name}</td>
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
