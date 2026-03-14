import { useEffect, useMemo, useState } from 'react';
import { SUPPORTED_CURRENCIES } from '@paint-shop/shared';
import { Link } from 'react-router-dom';
import api from '../services/api.js';
import { useI18n } from '../i18n/I18nProvider.jsx';

const initialItem = { productId: '', qty: 1, unitPrice: 0 };
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
  paymentType: 'CREDIT',
  paidAmount: 0,
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
  const { t } = useI18n();
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [cashAccounts, setCashAccounts] = useState([]);
  const [list, setList] = useState([]);
  const [details, setDetails] = useState(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(initialForm);
  const [showQuickSupplier, setShowQuickSupplier] = useState(false);
  const [quickSupplier, setQuickSupplier] = useState(initialQuickSupplier);
  const [error, setError] = useState('');

  const paidAmountValue = useMemo(() => (form.paymentType === 'CREDIT' ? 0 : Number(form.paidAmount || 0)), [form.paymentType, form.paidAmount]);
  const subtotal = useMemo(() => form.items.reduce((s, i) => s + (Number(i.qty || 0) * Number(i.unitPrice || 0)), 0), [form.items]);
  const total = useMemo(() => Math.max(0, subtotal - Number(form.discount || 0)), [subtotal, form.discount]);
  const transactionResult = useMemo(() => total - paidAmountValue, [total, paidAmountValue]);
  const selectedCashAccount = useMemo(() => cashAccounts.find((account) => account.currency === form.currency) || null, [cashAccounts, form.currency]);
  const resolvedPaymentType = useMemo(() => {
    if (form.paymentType === 'CREDIT') return 'CREDIT';
    if (paidAmountValue === 0) return 'CREDIT';
    return paidAmountValue === total ? 'CASH' : 'PARTIAL';
  }, [form.paymentType, paidAmountValue, total]);

  const transactionStatus = useMemo(() => {
    if (transactionResult > 0) return { tone: 'warning', title: t('supplierPayableTitle'), description: `${t('supplierPayableTitle')}: ${transactionResult.toFixed(2)} ${form.currency}` };
    if (transactionResult < 0) return { tone: 'success', title: t('supplierCreditTitle'), description: `${t('supplierCreditTitle')}: ${Math.abs(transactionResult).toFixed(2)} ${form.currency}` };
    return { tone: 'neutral', title: t('settled'), description: t('settledPurchaseDescription').replace('{currency}', form.currency) };
  }, [transactionResult, form.currency, t]);

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

  const addItem = () => setForm({ ...form, items: [...form.items, { ...initialItem }] });
  const removeItem = (idx) => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (form.paymentType === 'CASH' && paidAmountValue > 0 && !selectedCashAccount) {
        setError(`${t('cashbox')} ${form.currency}`);
        return;
      }

      await api.post('/purchases', {
        ...form,
        supplierId: Number(form.supplierId),
        discount: Number(form.discount),
        paymentType: resolvedPaymentType,
        paidAmount: paidAmountValue,
        cashAccountId: paidAmountValue > 0 ? selectedCashAccount?.id || null : null,
        items: form.items.map((i) => ({ productId: Number(i.productId), qty: Number(i.qty), unitPrice: Number(i.unitPrice) }))
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

  return (
    <main className="container">
      <header className="header-row">
        <h1>{t('purchasesInvoicesTitle')}</h1>
        <Link className="btn" to="/">{t('back')}</Link>
      </header>

      <section className="card">
        <h2>{t('createPurchaseInvoice')}</h2>
        <form onSubmit={save}>
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
                      <select value={item.productId} onChange={(e) => setItem(idx, 'productId', e.target.value)} required>
                        <option value="">{t('selectProduct')}</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name_ar}</option>)}
                      </select>
                    </FormField>
                    <FormField label={t('unit')}>
                      <input value={selectedProduct?.unit || '-'} readOnly />
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

          <section className="entry-section">
            <div className="section-header">
              <h3>{t('paymentAndResult')}</h3>
              <p className="hint">{t('paymentHint')}</p>
            </div>
            <div className="purchase-bottom-layout">
              <div className="payment-panel">
                <div className="form-grid">
                  <FormField label={t('payment')}>
                    <select value={form.paymentType} onChange={(e) => setForm({ ...form, paymentType: e.target.value, paidAmount: e.target.value === 'CREDIT' ? 0 : form.paidAmount })}>
                      <option value="CREDIT">Credit</option>
                      <option value="CASH">Cash</option>
                    </select>
                  </FormField>
                  <FormField label={t('payment')}>
                    <div className="inline-field-group">
                      <input type="number" min="0" step="0.01" value={form.paymentType === 'CREDIT' ? 0 : form.paidAmount} onChange={(e) => setForm({ ...form, paidAmount: e.target.value })} disabled={form.paymentType === 'CREDIT'} />
                      <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                        {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </FormField>
                  <FormField label={t('cashbox')}>
                    <input value={selectedCashAccount ? `${selectedCashAccount.name} (${selectedCashAccount.currency})` : `${t('cashbox')} ${form.currency}`} readOnly />
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
                <h3>{t('transactionResult')}</h3>
                <p className="status-title">{transactionStatus.title}</p>
                <p className="status-value">{transactionResult.toFixed(2)} {form.currency}</p>
                <p className="status-text">{transactionStatus.description}</p>
                <div className="status-meta">
                  <span>{t('total')}: {subtotal.toFixed(2)} {form.currency}</span>
                  <span>{t('totalAfterDiscount')}: {total.toFixed(2)} {form.currency}</span>
                  <span>{t('paid')}: {paidAmountValue.toFixed(2)} {form.currency}</span>
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
          <p><strong>{t('supplierName')}:</strong> {details.supplier_name || '-'}</p>
          <p><strong>{t('currency')}:</strong> {details.currency} | <strong>{t('exchangeRate')}:</strong> {details.exchange_rate}</p>
          <p><strong>{t('total')}:</strong> {details.total_original} | <strong>{t('paid')}:</strong> {details.paid_original}</p>
          <p><strong>{t('status')}:</strong> {details.status}</p>
          <table className="table">
            <thead><tr><th>{t('product')}</th><th>{t('quantity')}</th><th>{t('unitPrice')}</th><th>{t('total')}</th></tr></thead>
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
