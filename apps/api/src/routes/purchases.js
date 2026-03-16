import express from 'express';
import { PERMISSIONS, SUPPORTED_CURRENCIES } from '@paint-shop/shared';
import db from '../db.js';
import { authRequired, requirePermission } from '../middleware/auth.js';
import { writeAuditLog } from '../utils/audit.js';
import { getRateForCurrency } from '../utils/exchangeRate.js';
import { resolveProductUnit } from '../utils/productCatalog.js';

const router = express.Router();
router.use(authRequired);
const TRANSACTION_LOCK_HOURS = 24;

function toNum(v) {
  return Number(v ?? 0);
}

function validateCreate(body) {
  if (!body.supplierId) return 'المورد مطلوب';
  if (!body.invoiceDate) return 'تاريخ الفاتورة مطلوب';
  if (!SUPPORTED_CURRENCIES.includes(body.currency)) return 'العملة غير مدعومة';
  if (getRateForCurrency(body.currency) <= 0) return 'سعر الصرف النشط غير صالح';
  if (!Array.isArray(body.items) || body.items.length === 0) return 'يجب إضافة عنصر واحد على الأقل';
  for (const item of body.items) {
    if (!item.productId) return 'معرف المنتج مطلوب';
    if (toNum(item.qty) <= 0) return 'الكمية يجب أن تكون أكبر من صفر';
    if (toNum(item.unitPrice) < 0) return 'سعر الوحدة لا يمكن أن يكون سالباً';
  }
  if (!['CASH', 'CREDIT', 'PARTIAL'].includes(body.paymentType)) return 'نوع الدفع غير صالح';
  return null;
}

function nextInvoiceNo() {
  const row = db.prepare("SELECT COUNT(*) AS c FROM purchase_invoices").get();
  return `PUR-${String(row.c + 1).padStart(6, '0')}`;
}

function canOverrideApproved(req) {
  return Array.isArray(req.user?.permissions) && req.user.permissions.includes(PERMISSIONS.PURCHASES_OVERRIDE_LOCK);
}

function isOutsideLockWindow(value) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return false;
  return ((Date.now() - timestamp) / (1000 * 60 * 60)) > TRANSACTION_LOCK_HOURS;
}

router.get('/', (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const sql = `
    SELECT p.id, p.invoice_no, p.invoice_date, p.status, p.approval_status, p.currency, p.exchange_rate,
           p.total_original, p.total_base, p.paid_original,
           (p.total_original - p.paid_original) AS remaining_original,
           p.payment_type, s.name AS supplier_name
    FROM purchase_invoices p
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    ${q ? 'WHERE p.invoice_no LIKE ? OR COALESCE(s.name,\'\') LIKE ?' : ''}
    ORDER BY p.id DESC
  `;

  const rows = q ? db.prepare(sql).all(`%${q}%`, `%${q}%`) : db.prepare(sql).all();
  return res.json({ success: true, data: rows });
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: 'معرف الفاتورة غير صالح' });

  const invoice = db.prepare(`
    SELECT p.*, s.name AS supplier_name, u.full_name AS approved_by_name
    FROM purchase_invoices p
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    LEFT JOIN users u ON u.id = p.approved_by_user_id
    WHERE p.id = ?
  `).get(id);

  if (!invoice) return res.status(404).json({ success: false, error: 'الفاتورة غير موجودة' });

  const items = db.prepare(`
    SELECT i.*, pr.name_ar AS product_name
    FROM purchase_invoice_items i
    JOIN products pr ON pr.id = i.product_id
    WHERE i.purchase_invoice_id = ?
    ORDER BY i.line_no
  `).all(id);

  return res.json({ success: true, data: { ...invoice, items } });
});

router.post('/', requirePermission(PERMISSIONS.PURCHASES_CREATE), (req, res) => {
  const activeUsdRate = getRateForCurrency('USD');
  const legacyPaidAmount = toNum(req.body.paidAmount);
  const payload = {
    supplierId: Number(req.body.supplierId),
    invoiceDate: req.body.invoiceDate,
    currency: req.body.currency,
    exchangeRate: getRateForCurrency(req.body.currency),
    items: req.body.items || [],
    discount: toNum(req.body.discount),
    paymentType: req.body.paymentType,
    paidSyp: req.body.paidSyp != null ? toNum(req.body.paidSyp) : (req.body.currency === 'SYP' ? legacyPaidAmount : 0),
    paidUsd: req.body.paidUsd != null ? toNum(req.body.paidUsd) : (req.body.currency === 'USD' ? legacyPaidAmount : 0),
    notes: req.body.notes || null
  };

  const validationError = validateCreate(payload);
  if (validationError) return res.status(400).json({ success: false, error: validationError });

  const supplier = db.prepare('SELECT id FROM suppliers WHERE id = ? AND is_active = 1').get(payload.supplierId);
  if (!supplier) return res.status(400).json({ success: false, error: 'المورد غير موجود أو معطل' });

  const rows = payload.items.map((item, index) => ({
    lineNo: index + 1,
    productId: Number(item.productId),
    qty: toNum(item.qty),
    unitPrice: toNum(item.unitPrice),
    unitName: item.unitName ? String(item.unitName) : null
  }));

  const subtotalOriginal = rows.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const totalOriginal = Math.max(0, subtotalOriginal - payload.discount);
  if (payload.paidSyp < 0 || payload.paidUsd < 0) {
    return res.status(400).json({ success: false, error: 'قيم الدفع لا يمكن أن تكون سالبة' });
  }
  if ((payload.paidUsd > 0 || (payload.currency === 'USD' && payload.paidSyp > 0)) && activeUsdRate <= 0) {
    return res.status(400).json({ success: false, error: 'سعر الصرف النشط غير صالح' });
  }

  const paidTotalSyp = payload.paidSyp + (payload.paidUsd * activeUsdRate);
  const paidOriginal = payload.currency === 'USD'
    ? payload.paidUsd + (activeUsdRate > 0 ? (payload.paidSyp / activeUsdRate) : 0)
    : paidTotalSyp;
  const settlementDelta = totalOriginal - paidOriginal;
  const resolvedPaymentType = settlementDelta === 0 ? 'CASH' : (paidTotalSyp === 0 ? 'CREDIT' : 'PARTIAL');

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
    const totalBase = totalOriginal * payload.exchangeRate;
    const paidBase = paidTotalSyp;

    const invResult = db.prepare(`
      INSERT INTO purchase_invoices (
        invoice_no, supplier_id, invoice_date, currency, exchange_rate,
        subtotal_original, discount_original, total_original, total_base,
        paid_original, paid_base, payment_type, cash_account_id, notes, created_by_user_id, approval_status,
        paid_syp, paid_usd, paid_total_syp, syp_cash_account_id, usd_cash_account_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      invoiceNo,
      payload.supplierId,
      payload.invoiceDate,
      payload.currency,
      payload.exchangeRate,
      subtotalOriginal,
      payload.discount,
      totalOriginal,
      totalBase,
      paidOriginal,
      paidBase,
      resolvedPaymentType,
      sypCashAccount?.id || usdCashAccount?.id || null,
      payload.notes,
      req.user.id,
      'DRAFT',
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
      const resolvedUnit = resolveProductUnit(row.productId, row.unitName);
      if (!resolvedUnit) throw new Error('وحدة الشراء غير معرفة لهذا المنتج');
      const baseQty = row.qty * toNum(resolvedUnit.conversion_factor);

      const lineOriginal = row.qty * row.unitPrice;
      const unitCostBase = (row.unitPrice / toNum(resolvedUnit.conversion_factor)) * payload.exchangeRate;
      const lineBase = lineOriginal * payload.exchangeRate;

      db.prepare(`
        INSERT INTO purchase_invoice_items (
          purchase_invoice_id, line_no, product_id, qty, unit_cost_original, line_total_original, line_total_base,
          selected_unit_name, selected_unit_factor
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(invoiceId, row.lineNo, row.productId, row.qty, row.unitPrice, lineOriginal, lineBase, resolvedUnit.unit_name, resolvedUnit.conversion_factor);

      const oldQty = toNum(product.current_qty);
      const oldAvg = toNum(product.avg_cost_base);
      const newQty = oldQty + baseQty;
      const newAvg = newQty > 0 ? (((oldQty * oldAvg) + (baseQty * unitCostBase)) / newQty) : 0;

      db.prepare('UPDATE products SET current_qty = ?, avg_cost_base = ?, purchase_price = ?, default_currency = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(newQty, newAvg, row.unitPrice / toNum(resolvedUnit.conversion_factor), payload.currency, row.productId);

      db.prepare(`
        INSERT INTO inventory_movements (
          product_id, movement_type, movement_date, qty_in, qty_out,
          unit_cost_base, total_cost_base, avg_cost_before_base, avg_cost_after_base,
          source_type, source_id, notes, created_by_user_id
        ) VALUES (?, 'PURCHASE_IN', ?, ?, 0, ?, ?, ?, ?, 'PURCHASE_INVOICE', ?, ?, ?)
      `).run(row.productId, payload.invoiceDate, baseQty, unitCostBase, lineBase, oldAvg, newAvg, invoiceId, payload.notes, req.user.id);
    }

    if (payload.paidSyp > 0 && sypCashAccount) {
      db.prepare(`
        INSERT INTO cash_movements (
          cash_account_id, movement_date, movement_type, direction,
          currency, original_amount, exchange_rate, base_amount,
          source_type, source_id, notes, created_by_user_id
        ) VALUES (?, ?, 'PURCHASE_PAYMENT', 'OUT', ?, ?, ?, ?, 'PURCHASE_INVOICE', ?, ?, ?)
      `).run(sypCashAccount.id, payload.invoiceDate, 'SYP', payload.paidSyp, 1, payload.paidSyp, invoiceId, payload.notes, req.user.id);
    }

    if (payload.paidUsd > 0 && usdCashAccount) {
      db.prepare(`
        INSERT INTO cash_movements (
          cash_account_id, movement_date, movement_type, direction,
          currency, original_amount, exchange_rate, base_amount,
          source_type, source_id, notes, created_by_user_id
        ) VALUES (?, ?, 'PURCHASE_PAYMENT', 'OUT', ?, ?, ?, ?, 'PURCHASE_INVOICE', ?, ?, ?)
      `).run(usdCashAccount.id, payload.invoiceDate, 'USD', payload.paidUsd, activeUsdRate, payload.paidUsd * activeUsdRate, invoiceId, payload.notes, req.user.id);
    }

    if (settlementDelta !== 0) {
      db.prepare('UPDATE suppliers SET current_balance = current_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(settlementDelta, payload.supplierId);
    }

    writeAuditLog({ userId: req.user.id, entityName: 'purchase_invoices', entityId: invoiceId, action: 'CREATE' });
    return invoiceId;
  });

  try {
    const invoiceId = trx();
    return res.status(201).json({ success: true, data: { id: invoiceId } });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message || 'فشل إنشاء فاتورة الشراء' });
  }
});

router.post('/:id/cancel', requirePermission(PERMISSIONS.PURCHASES_CANCEL), (req, res) => {
  const id = Number(req.params.id);
  const cancelReason = String(req.body.reason || '').trim();

  if (!id) return res.status(400).json({ success: false, error: 'معرف الفاتورة غير صالح' });
  if (!cancelReason) return res.status(400).json({ success: false, error: 'سبب الإلغاء مطلوب' });

  const trx = db.transaction(() => {
    const invoice = db.prepare('SELECT * FROM purchase_invoices WHERE id = ?').get(id);
    if (!invoice) throw new Error('الفاتورة غير موجودة');
    if (invoice.status === 'CANCELLED') throw new Error('الفاتورة ملغاة مسبقاً');
    if (invoice.approval_status === 'APPROVED' && !canOverrideApproved(req)) {
      throw new Error('لا يمكن إلغاء فاتورة مشتريات معتمدة بدون صلاحية تجاوز');
    }
    if (!canOverrideApproved(req) && isOutsideLockWindow(invoice.created_at || invoice.invoice_date)) {
      throw new Error('انتهت نافذة تعديل/إلغاء فاتورة المشتريات');
    }

    const items = db.prepare('SELECT * FROM purchase_invoice_items WHERE purchase_invoice_id = ? ORDER BY line_no').all(id);

    for (const item of items) {
      const product = db.prepare('SELECT id, current_qty, avg_cost_base FROM products WHERE id = ?').get(item.product_id);
      if (!product) throw new Error('منتج غير موجود أثناء الإلغاء');
      if (toNum(product.current_qty) < toNum(item.qty)) {
        throw new Error('لا يمكن إلغاء الفاتورة لأن المخزون الحالي أقل من الكمية المطلوبة للعكس');
      }

      const oldQty = toNum(product.current_qty);
      const oldAvg = toNum(product.avg_cost_base);
      const outQty = toNum(item.qty);
      const unitCostBase = outQty > 0 ? toNum(item.line_total_base) / outQty : 0;
      const newQty = oldQty - outQty;
      const newAvg = newQty > 0 ? Math.max(0, ((oldQty * oldAvg) - (outQty * unitCostBase)) / newQty) : 0;

      db.prepare('UPDATE products SET current_qty = ?, avg_cost_base = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(newQty, newAvg, item.product_id);

      db.prepare(`
        INSERT INTO inventory_movements (
          product_id, movement_type, movement_date, qty_in, qty_out,
          unit_cost_base, total_cost_base, avg_cost_before_base, avg_cost_after_base,
          source_type, source_id, notes, created_by_user_id
        ) VALUES (?, 'PURCHASE_CANCEL_OUT', DATE('now'), 0, ?, ?, ?, ?, ?, 'PURCHASE_INVOICE', ?, ?, ?)
      `).run(item.product_id, outQty, unitCostBase, toNum(item.line_total_base), oldAvg, newAvg, id, cancelReason, req.user.id);
    }

    if (toNum(invoice.paid_syp || 0) > 0 && invoice.syp_cash_account_id) {
      db.prepare(`
        INSERT INTO cash_movements (
          cash_account_id, movement_date, movement_type, direction,
          currency, original_amount, exchange_rate, base_amount,
          source_type, source_id, notes, created_by_user_id
        ) VALUES (?, DATE('now'), 'REFUND_IN', 'IN', ?, ?, ?, ?, 'PURCHASE_INVOICE', ?, ?, ?)
      `).run(invoice.syp_cash_account_id, 'SYP', toNum(invoice.paid_syp), 1, toNum(invoice.paid_syp), id, `إلغاء فاتورة شراء ${invoice.invoice_no}`, req.user.id);
    }

    if (toNum(invoice.paid_usd || 0) > 0 && invoice.usd_cash_account_id) {
      const paidUsdBase = Math.max(0, toNum(invoice.paid_total_syp || 0) - toNum(invoice.paid_syp || 0));
      const paidUsdRate = toNum(invoice.paid_usd || 0) > 0 ? (paidUsdBase / toNum(invoice.paid_usd || 0)) : getRateForCurrency('USD');
      db.prepare(`
        INSERT INTO cash_movements (
          cash_account_id, movement_date, movement_type, direction,
          currency, original_amount, exchange_rate, base_amount,
          source_type, source_id, notes, created_by_user_id
        ) VALUES (?, DATE('now'), 'REFUND_IN', 'IN', ?, ?, ?, ?, 'PURCHASE_INVOICE', ?, ?, ?)
      `).run(invoice.usd_cash_account_id, 'USD', toNum(invoice.paid_usd), paidUsdRate, paidUsdBase, id, `إلغاء فاتورة شراء ${invoice.invoice_no}`, req.user.id);
    } else if (toNum(invoice.paid_original) > 0) {
      const pay = db.prepare(`
        SELECT cash_account_id FROM cash_movements
        WHERE source_type = 'PURCHASE_INVOICE' AND source_id = ?
        ORDER BY id DESC LIMIT 1
      `).get(id);

      if (pay?.cash_account_id) {
        db.prepare(`
          INSERT INTO cash_movements (
            cash_account_id, movement_date, movement_type, direction,
            currency, original_amount, exchange_rate, base_amount,
            source_type, source_id, notes, created_by_user_id
          ) VALUES (?, DATE('now'), 'REFUND_IN', 'IN', ?, ?, ?, ?, 'PURCHASE_INVOICE', ?, ?, ?)
        `).run(pay.cash_account_id, invoice.currency, invoice.paid_original, invoice.exchange_rate, invoice.paid_base, id, `إلغاء فاتورة شراء ${invoice.invoice_no}`, req.user.id);
      }
    }

    const settlementDelta = toNum(invoice.total_original) - toNum(invoice.paid_original);
    if (settlementDelta !== 0) {
      db.prepare('UPDATE suppliers SET current_balance = current_balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(settlementDelta, invoice.supplier_id);
    }

    db.prepare(`
      UPDATE purchase_invoices
      SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP, cancelled_by_user_id = ?, cancel_reason = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(req.user.id, cancelReason, id);

    writeAuditLog({ userId: req.user.id, entityName: 'purchase_invoices', entityId: id, action: 'CANCEL', reason: cancelReason });
  });

  try {
    trx();
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message || 'فشل إلغاء الفاتورة' });
  }
});

router.post('/:id/approve', requirePermission(PERMISSIONS.PURCHASES_APPROVE), (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: 'معرف الفاتورة غير صالح' });

  const invoice = db.prepare('SELECT id, status, approval_status FROM purchase_invoices WHERE id = ?').get(id);
  if (!invoice) return res.status(404).json({ success: false, error: 'الفاتورة غير موجودة' });
  if (invoice.status === 'CANCELLED') {
    return res.status(400).json({ success: false, error: 'لا يمكن اعتماد فاتورة ملغاة' });
  }
  if (invoice.approval_status === 'APPROVED') {
    return res.status(400).json({ success: false, error: 'الفاتورة معتمدة مسبقاً' });
  }

  db.prepare(`
    UPDATE purchase_invoices
    SET approval_status = 'APPROVED', approved_at = CURRENT_TIMESTAMP, approved_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(req.user.id, id);

  writeAuditLog({ userId: req.user.id, entityName: 'purchase_invoices', entityId: id, action: 'APPROVE' });
  return res.json({ success: true });
});

router.post('/:id/unapprove', requirePermission(PERMISSIONS.PURCHASES_APPROVE), (req, res) => {
  const id = Number(req.params.id);
  const reason = String(req.body.reason || '').trim();
  if (!id) return res.status(400).json({ success: false, error: 'معرف الفاتورة غير صالح' });
  if (!reason) return res.status(400).json({ success: false, error: 'سبب إلغاء الاعتماد مطلوب' });
  if (!canOverrideApproved(req)) {
    return res.status(403).json({ success: false, error: 'لا توجد صلاحية لإلغاء اعتماد فاتورة المشتريات' });
  }

  const invoice = db.prepare('SELECT id, status, approval_status FROM purchase_invoices WHERE id = ?').get(id);
  if (!invoice) return res.status(404).json({ success: false, error: 'الفاتورة غير موجودة' });
  if (invoice.status === 'CANCELLED') {
    return res.status(400).json({ success: false, error: 'لا يمكن إلغاء اعتماد فاتورة ملغاة' });
  }
  if (invoice.approval_status !== 'APPROVED') {
    return res.status(400).json({ success: false, error: 'الفاتورة ليست معتمدة' });
  }

  db.prepare(`
    UPDATE purchase_invoices
    SET approval_status = 'DRAFT', approved_at = NULL, approved_by_user_id = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);

  writeAuditLog({ userId: req.user.id, entityName: 'purchase_invoices', entityId: id, action: 'UNAPPROVE', reason });
  return res.json({ success: true });
});

export default router;
