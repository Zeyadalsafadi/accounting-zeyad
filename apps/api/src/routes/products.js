import express from 'express';
import { SUPPORTED_CURRENCIES, USER_ROLES } from '@paint-shop/shared';
import db from '../db.js';
import { authRequired, requireRoles } from '../middleware/auth.js';
import { writeAuditLog } from '../utils/audit.js';

const router = express.Router();
router.use(authRequired);

function validatePayload(payload) {
  const required = ['name', 'categoryId', 'sku', 'unit'];
  for (const key of required) {
    if (!payload[key]) return `${key} مطلوب`;
  }
  if (!SUPPORTED_CURRENCIES.includes(payload.defaultCurrency)) return 'العملة الافتراضية غير مدعومة';
  if (Number(payload.purchasePrice) < 0) return 'سعر الشراء يجب أن يكون 0 أو أكثر';
  if (Number(payload.sellingPrice) < 0) return 'سعر البيع يجب أن يكون 0 أو أكثر';
  if (Number(payload.currentStock) < 0) return 'المخزون الحالي لا يمكن أن يكون سالباً';
  if (Number(payload.minStockAlert) < 0) return 'حد التنبيه للمخزون لا يمكن أن يكون سالباً';
  if (Number(payload.averageCost) < 0) return 'متوسط التكلفة لا يمكن أن يكون سالباً';
  return null;
}

router.get('/', (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const sql = `
    SELECT
      p.id,
      p.name_ar,
      p.name_en,
      p.sku,
      p.barcode,
      p.unit,
      p.purchase_price,
      p.selling_price,
      p.default_currency,
      p.current_qty,
      p.min_stock_level,
      p.avg_cost_base,
      p.notes,
      p.is_active,
      p.updated_at,
      c.id AS category_id,
      c.name_ar AS category_name
    FROM products p
    JOIN categories c ON c.id = p.category_id
    ${q ? 'WHERE p.name_ar LIKE ? OR p.sku LIKE ? OR COALESCE(p.barcode,\'\') LIKE ?' : ''}
    ORDER BY p.id DESC
  `;

  const rows = q
    ? db.prepare(sql).all(`%${q}%`, `%${q}%`, `%${q}%`)
    : db.prepare(sql).all();

  return res.json({ success: true, data: rows });
});

router.post('/', requireRoles(USER_ROLES.ADMIN), (req, res) => {
  const payload = {
    name: req.body.name,
    nameEn: req.body.nameEn || null,
    categoryId: Number(req.body.categoryId),
    sku: req.body.sku,
    barcode: req.body.barcode || null,
    unit: req.body.unit,
    purchasePrice: Number(req.body.purchasePrice ?? 0),
    sellingPrice: Number(req.body.sellingPrice ?? 0),
    defaultCurrency: req.body.defaultCurrency,
    currentStock: Number(req.body.currentStock ?? 0),
    minStockAlert: Number(req.body.minStockAlert ?? 0),
    averageCost: Number(req.body.averageCost ?? 0),
    notes: req.body.notes || null
  };

  const validationError = validatePayload(payload);
  if (validationError) return res.status(400).json({ success: false, error: validationError });

  const category = db.prepare('SELECT id, is_active FROM categories WHERE id = ?').get(payload.categoryId);
  if (!category || category.is_active !== 1) {
    return res.status(400).json({ success: false, error: 'التصنيف غير موجود أو غير نشط' });
  }

  const duplicateSku = db.prepare('SELECT id FROM products WHERE sku = ?').get(payload.sku);
  if (duplicateSku) return res.status(409).json({ success: false, error: 'SKU مستخدم مسبقاً' });

  const result = db.prepare(`
    INSERT INTO products (
      category_id, sku, barcode, name_ar, name_en, unit,
      purchase_price, selling_price, default_currency,
      current_qty, min_stock_level, avg_cost_base, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    payload.categoryId,
    payload.sku,
    payload.barcode,
    payload.name,
    payload.nameEn,
    payload.unit,
    payload.purchasePrice,
    payload.sellingPrice,
    payload.defaultCurrency,
    payload.currentStock,
    payload.minStockAlert,
    payload.averageCost,
    payload.notes
  );

  writeAuditLog({ userId: req.user.id, entityName: 'products', entityId: result.lastInsertRowid, action: 'CREATE' });
  return res.status(201).json({ success: true, data: { id: result.lastInsertRowid } });
});

router.patch('/:id', requireRoles(USER_ROLES.ADMIN), (req, res) => {
  const id = Number(req.params.id);
  const payload = {
    name: req.body.name,
    nameEn: req.body.nameEn || null,
    categoryId: Number(req.body.categoryId),
    sku: req.body.sku,
    barcode: req.body.barcode || null,
    unit: req.body.unit,
    purchasePrice: Number(req.body.purchasePrice ?? 0),
    sellingPrice: Number(req.body.sellingPrice ?? 0),
    defaultCurrency: req.body.defaultCurrency,
    currentStock: Number(req.body.currentStock ?? 0),
    minStockAlert: Number(req.body.minStockAlert ?? 0),
    averageCost: Number(req.body.averageCost ?? 0),
    notes: req.body.notes || null
  };

  if (!id) return res.status(400).json({ success: false, error: 'معرف المنتج غير صالح' });
  const validationError = validatePayload(payload);
  if (validationError) return res.status(400).json({ success: false, error: validationError });

  const exists = db.prepare('SELECT id FROM products WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ success: false, error: 'المنتج غير موجود' });

  db.prepare(`
    UPDATE products
    SET category_id = ?, sku = ?, barcode = ?, name_ar = ?, name_en = ?, unit = ?,
        purchase_price = ?, selling_price = ?, default_currency = ?,
        current_qty = ?, min_stock_level = ?, avg_cost_base = ?, notes = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    payload.categoryId,
    payload.sku,
    payload.barcode,
    payload.name,
    payload.nameEn,
    payload.unit,
    payload.purchasePrice,
    payload.sellingPrice,
    payload.defaultCurrency,
    payload.currentStock,
    payload.minStockAlert,
    payload.averageCost,
    payload.notes,
    id
  );

  writeAuditLog({ userId: req.user.id, entityName: 'products', entityId: id, action: 'UPDATE' });
  return res.json({ success: true });
});

router.patch('/:id/disable', requireRoles(USER_ROLES.ADMIN), (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: 'معرف المنتج غير صالح' });

  db.prepare('UPDATE products SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  writeAuditLog({ userId: req.user.id, entityName: 'products', entityId: id, action: 'UPDATE', reason: 'DISABLE' });

  return res.json({ success: true });
});

export default router;
