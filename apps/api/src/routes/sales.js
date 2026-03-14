import express from 'express';
import { PERMISSIONS } from '@paint-shop/shared';
import db from '../db.js';
import { authRequired, requirePermission } from '../middleware/auth.js';
import { writeAuditLog } from '../utils/audit.js';
import { getRateForCurrency } from '../utils/exchangeRate.js';

const router = express.Router();
router.use(authRequired);

function toNum(v) {
  return Number(v ?? 0);
}

function validateCreate(body) {
  if (!body.invoiceDate) return 'تاريخ الفاتورة مطلوب';
  const paidTotalSyp = toNum(body.paidSyp) + (toNum(body.paidUsd) * toNum(body.exchangeRate));
  if ((!Array.isArray(body.items) || body.items.length === 0) && paidTotalSyp <= 0) {
    return 'يجب إضافة عنصر واحد على الأقل أو تسجيل قبض من العميل';
  }
  for (const item of body.items) {
    if (!item.productId) return 'معرف المنتج مطلوب';
    if (toNum(item.qty) <= 0) return 'الكمية يجب أن تكون أكبر من صفر';
    if (toNum(item.unitPrice) < 0) return 'سعر البيع لا يمكن أن يكون سالباً';
  }
  return null;
}

function nextInvoiceNo() {
  const row = db.prepare('SELECT COUNT(*) AS c FROM sales_invoices').get();
  return `SAL-${String(row.c + 1).padStart(6, '0')}`;
}

router.get('/', (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const sql = `
    SELECT s.id, s.invoice_no, s.invoice_date, s.status, s.currency, s.exchange_rate,
           s.total_original, s.total_base, s.received_original,
           s.paid_syp, s.paid_usd, s.paid_total_syp,
           (s.total_original - s.received_original) AS remaining_original,
           s.payment_type, c.name AS customer_name
    FROM sales_invoices s
    LEFT JOIN customers c ON c.id = s.customer_id
    ${q ? 'WHERE s.invoice_no LIKE ? OR COALESCE(c.name,\'\') LIKE ?' : ''}
    ORDER BY s.id DESC
  `;

  const rows = q ? db.prepare(sql).all(`%${q}%`, `%${q}%`) : db.prepare(sql).all();
  return res.json({ success: true, data: rows });
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: 'معرف الفاتورة غير صالح' });

  const invoice = db.prepare(`
    SELECT s.*, c.name AS customer_name
    FROM sales_invoices s
    LEFT JOIN customers c ON c.id = s.customer_id
    WHERE s.id = ?
  `).get(id);

  if (!invoice) return res.status(404).json({ success: false, error: 'الفاتورة غير موجودة' });

  const items = db.prepare(`
    SELECT i.*, p.name_ar AS product_name
    FROM sales_invoice_items i
    JOIN products p ON p.id = i.product_id
    WHERE i.sales_invoice_id = ?
    ORDER BY i.line_no
  `).all(id);

  return res.json({ success: true, data: { ...invoice, items } });
});

router.post('/', requirePermission(PERMISSIONS.SALES_CREATE), (req, res) => {
  const activeRate = getRateForCurrency('USD');
  const payload = {
    customerId: req.body.customerId ? Number(req.body.customerId) : null,
    invoiceDate: req.body.invoiceDate,
    currency: 'SYP',
    exchangeRate: activeRate,
    items: (req.body.items || []).filter((item) => Number(item?.productId) && toNum(item?.qty) > 0),
    discount: toNum(req.body.discount),
    paymentType: req.body.paymentType,
    paidSyp: toNum(req.body.paidSyp),
    paidUsd: toNum(req.body.paidUsd),
    notes: req.body.notes || null
  };

  const validationError = validateCreate(payload);
  if (validationError) return res.status(400).json({ success: false, error: validationError });
  if (payload.paidSyp < 0 || payload.paidUsd < 0) {
    return res.status(400).json({ success: false, error: 'قيم الدفع لا يمكن أن تكون سالبة' });
  }
  if (payload.paidUsd > 0 && activeRate <= 0) {
    return res.status(400).json({ success: false, error: 'سعر الصرف النشط غير صالح' });
  }

  if (payload.customerId) {
    const customer = db.prepare('SELECT id, is_active FROM customers WHERE id = ?').get(payload.customerId);
    if (!customer || customer.is_active !== 1) return res.status(400).json({ success: false, error: 'العميل غير موجود أو معطل' });
  }
  if (payload.items.length === 0 && !payload.customerId) {
    return res.status(400).json({ success: false, error: 'يجب اختيار عميل عند تسجيل قبض بدون بيع منتجات' });
  }

  const rows = payload.items.map((item, index) => ({
    lineNo: index + 1,
    productId: Number(item.productId),
    qty: toNum(item.qty),
    unitPrice: toNum(item.unitPrice)
  }));

  const subtotalOriginal = rows.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const totalOriginal = Math.max(0, subtotalOriginal - payload.discount);
  const paidTotalSyp = payload.paidSyp + (payload.paidUsd * activeRate);
  const settlementDelta = totalOriginal - paidTotalSyp;
  if (settlementDelta !== 0 && !payload.customerId) {
    return res.status(400).json({ success: false, error: 'يجب اختيار عميل عند وجود رصيد غير مسوّى على الفاتورة' });
  }

  const resolvedPaymentType = settlementDelta === 0
    ? 'CASH'
    : (paidTotalSyp === 0 ? 'CREDIT' : 'PARTIAL');

  const trx = db.transaction(() => {
    const sypCashAccount = payload.paidSyp > 0
      ? db.prepare('SELECT id, currency FROM cash_accounts WHERE currency = ? AND is_active = 1 ORDER BY id LIMIT 1').get('SYP')
      : null;
    const usdCashAccount = payload.paidUsd > 0
      ? db.prepare('SELECT id, currency FROM cash_accounts WHERE currency = ? AND is_active = 1 ORDER BY id LIMIT 1').get('USD')
      : null;

    if (payload.paidSyp > 0 && !sypCashAccount) throw new Error('لا يوجد صندوق نشط بعملة SYP');
    if (payload.paidUsd > 0 && !usdCashAccount) throw new Error('لا يوجد صندوق نشط بعملة USD');

    const invoiceNo = nextInvoiceNo();
    const totalBase = totalOriginal;
    const paidBase = paidTotalSyp;

    const invResult = db.prepare(`
      INSERT INTO sales_invoices (
        invoice_no, customer_id, invoice_date, currency, exchange_rate,
        subtotal_original, discount_original, total_original, total_base,
        received_original, received_base, payment_type, cash_account_id, notes, created_by_user_id,
        paid_syp, paid_usd, paid_total_syp, syp_cash_account_id, usd_cash_account_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      invoiceNo,
      payload.customerId,
      payload.invoiceDate,
      payload.currency,
      payload.exchangeRate,
      subtotalOriginal,
      payload.discount,
      totalOriginal,
      totalBase,
      paidTotalSyp,
      paidBase,
      resolvedPaymentType,
      sypCashAccount?.id || usdCashAccount?.id || null,
      payload.notes,
      req.user.id,
      payload.paidSyp,
      payload.paidUsd,
      paidTotalSyp,
      sypCashAccount?.id || null,
      usdCashAccount?.id || null
    );

    const invoiceId = invResult.lastInsertRowid;

    for (const row of rows) {
      const product = db.prepare('SELECT id, current_qty, avg_cost_base FROM products WHERE id = ? AND is_active = 1').get(row.productId);
      if (!product) throw new Error('أحد المنتجات غير موجود أو معطل');

      const currentQty = toNum(product.current_qty);
      if (currentQty < row.qty) throw new Error('المخزون غير كافٍ لإتمام البيع');

      const unitCostBase = toNum(product.avg_cost_base);
      const lineOriginal = row.qty * row.unitPrice;
      const lineBase = lineOriginal;
      const lineCogsBase = row.qty * unitCostBase;
      const lineProfitBase = lineBase - lineCogsBase;

      db.prepare(`
        INSERT INTO sales_invoice_items (
          sales_invoice_id, line_no, product_id, qty,
          unit_price_original, line_total_original, line_total_base,
          unit_cost_base_at_sale, line_cogs_base, line_profit_base
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        invoiceId,
        row.lineNo,
        row.productId,
        row.qty,
        row.unitPrice,
        lineOriginal,
        lineBase,
        unitCostBase,
        lineCogsBase,
        lineProfitBase
      );

      const newQty = currentQty - row.qty;

      db.prepare('UPDATE products SET current_qty = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newQty, row.productId);

      db.prepare(`
        INSERT INTO inventory_movements (
          product_id, movement_type, movement_date, qty_in, qty_out,
          unit_cost_base, total_cost_base, avg_cost_before_base, avg_cost_after_base,
          source_type, source_id, notes, created_by_user_id
        ) VALUES (?, 'SALE_OUT', ?, 0, ?, ?, ?, ?, ?, 'SALES_INVOICE', ?, ?, ?)
      `).run(
        row.productId,
        payload.invoiceDate,
        row.qty,
        unitCostBase,
        lineCogsBase,
        unitCostBase,
        unitCostBase,
        invoiceId,
        payload.notes,
        req.user.id
      );
    }

    if (payload.paidSyp > 0 && sypCashAccount) {
      db.prepare(`
        INSERT INTO cash_movements (
          cash_account_id, movement_date, movement_type, direction,
          currency, original_amount, exchange_rate, base_amount,
          source_type, source_id, notes, created_by_user_id
        ) VALUES (?, ?, 'SALES_RECEIPT', 'IN', ?, ?, ?, ?, 'SALES_INVOICE', ?, ?, ?)
      `).run(sypCashAccount.id, payload.invoiceDate, 'SYP', payload.paidSyp, 1, payload.paidSyp, invoiceId, payload.notes, req.user.id);
    }

    if (payload.paidUsd > 0 && usdCashAccount) {
      db.prepare(`
        INSERT INTO cash_movements (
          cash_account_id, movement_date, movement_type, direction,
          currency, original_amount, exchange_rate, base_amount,
          source_type, source_id, notes, created_by_user_id
        ) VALUES (?, ?, 'SALES_RECEIPT', 'IN', ?, ?, ?, ?, 'SALES_INVOICE', ?, ?, ?)
      `).run(usdCashAccount.id, payload.invoiceDate, 'USD', payload.paidUsd, activeRate, payload.paidUsd * activeRate, invoiceId, payload.notes, req.user.id);
    }

    if (settlementDelta !== 0 && payload.customerId) {
      db.prepare('UPDATE customers SET current_balance = current_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(settlementDelta, payload.customerId);
    }

    writeAuditLog({ userId: req.user.id, entityName: 'sales_invoices', entityId: invoiceId, action: 'CREATE' });
    return invoiceId;
  });

  try {
    const invoiceId = trx();
    return res.status(201).json({ success: true, data: { id: invoiceId } });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message || 'فشل إنشاء فاتورة البيع' });
  }
});

router.post('/:id/cancel', requirePermission(PERMISSIONS.SALES_CANCEL), (req, res) => {
  const id = Number(req.params.id);
  const reason = String(req.body.reason || '').trim();

  if (!id) return res.status(400).json({ success: false, error: 'معرف الفاتورة غير صالح' });
  if (!reason) return res.status(400).json({ success: false, error: 'سبب الإلغاء مطلوب' });

  const trx = db.transaction(() => {
    const invoice = db.prepare('SELECT * FROM sales_invoices WHERE id = ?').get(id);
    if (!invoice) throw new Error('الفاتورة غير موجودة');
    if (invoice.status === 'CANCELLED') throw new Error('الفاتورة ملغاة مسبقاً');

    const items = db.prepare('SELECT * FROM sales_invoice_items WHERE sales_invoice_id = ? ORDER BY line_no').all(id);

    for (const item of items) {
      const product = db.prepare('SELECT id, current_qty, avg_cost_base FROM products WHERE id = ?').get(item.product_id);
      if (!product) throw new Error('منتج غير موجود أثناء الإلغاء');

      const oldQty = toNum(product.current_qty);
      const oldAvg = toNum(product.avg_cost_base);
      const inQty = toNum(item.qty);
      const unitCostBase = toNum(item.unit_cost_base_at_sale);
      const newQty = oldQty + inQty;
      const newAvg = newQty > 0 ? (((oldQty * oldAvg) + (inQty * unitCostBase)) / newQty) : 0;

      db.prepare('UPDATE products SET current_qty = ?, avg_cost_base = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(newQty, newAvg, item.product_id);

      db.prepare(`
        INSERT INTO inventory_movements (
          product_id, movement_type, movement_date, qty_in, qty_out,
          unit_cost_base, total_cost_base, avg_cost_before_base, avg_cost_after_base,
          source_type, source_id, notes, created_by_user_id
        ) VALUES (?, 'SALE_CANCEL_IN', DATE('now'), ?, 0, ?, ?, ?, ?, 'SALES_INVOICE', ?, ?, ?)
      `).run(item.product_id, inQty, unitCostBase, toNum(item.line_cogs_base), oldAvg, newAvg, id, reason, req.user.id);
    }

    if (toNum(invoice.received_original) > 0) {
      const movements = db.prepare(`
        SELECT cash_account_id, currency, original_amount, exchange_rate, base_amount
        FROM cash_movements
        WHERE source_type = 'SALES_INVOICE' AND source_id = ? AND movement_type = 'SALES_RECEIPT'
        ORDER BY id DESC
      `).all(id);

      for (const movement of movements) {
        db.prepare(`
          INSERT INTO cash_movements (
            cash_account_id, movement_date, movement_type, direction,
            currency, original_amount, exchange_rate, base_amount,
            source_type, source_id, notes, created_by_user_id
          ) VALUES (?, DATE('now'), 'REFUND_OUT', 'OUT', ?, ?, ?, ?, 'SALES_INVOICE', ?, ?, ?)
        `).run(movement.cash_account_id, movement.currency, movement.original_amount, movement.exchange_rate, movement.base_amount, id, `إلغاء فاتورة بيع ${invoice.invoice_no}`, req.user.id);
      }
    }

    const settlementDelta = toNum(invoice.total_original) - toNum(invoice.received_original);
    if (settlementDelta !== 0 && invoice.customer_id) {
      db.prepare('UPDATE customers SET current_balance = current_balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(settlementDelta, invoice.customer_id);
    }

    db.prepare(`
      UPDATE sales_invoices
      SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP, cancelled_by_user_id = ?, cancel_reason = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(req.user.id, reason, id);

    writeAuditLog({ userId: req.user.id, entityName: 'sales_invoices', entityId: id, action: 'CANCEL', reason });
  });

  try {
    trx();
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message || 'فشل إلغاء فاتورة البيع' });
  }
});

export default router;
