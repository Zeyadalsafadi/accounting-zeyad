import express from 'express';
import { PERMISSIONS, SUPPORTED_CURRENCIES } from '@paint-shop/shared';
import db from '../db.js';
import { authRequired, requirePermission } from '../middleware/auth.js';
import { writeAuditLog } from '../utils/audit.js';
import { enrichProducts } from '../utils/productCatalog.js';

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
  if (!Array.isArray(payload.units) || payload.units.length === 0) return 'يجب تعريف وحدة أساس واحدة على الأقل';
  const baseUnits = payload.units.filter((unit) => unit.isBase);
  if (baseUnits.length !== 1) return 'يجب تحديد وحدة أساس واحدة فقط';
  for (const unit of payload.units) {
    if (!unit.unitName) return 'اسم الوحدة مطلوب';
    if (Number(unit.conversionFactor) <= 0) return 'معامل التحويل يجب أن يكون أكبر من صفر';
  }
  for (const tier of payload.priceTiers || []) {
    if (!tier.tierCode || !tier.unitName) return 'بيانات شريحة السعر غير مكتملة';
    if (Number(tier.priceSyp) < 0) return 'سعر البيع ضمن الشريحة لا يمكن أن يكون سالباً';
  }
  for (const price of payload.customerPrices || []) {
    if (!Number(price.customerId) || !price.unitName) return 'بيانات السعر الخاص للعميل غير مكتملة';
    if (Number(price.priceSyp) < 0) return 'السعر الخاص للعميل لا يمكن أن يكون سالباً';
  }
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

  return res.json({ success: true, data: enrichProducts(rows) });
});

router.post('/', requirePermission(PERMISSIONS.INVENTORY_CREATE), (req, res) => {
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
    notes: req.body.notes || null,
    units: (req.body.units || []).map((unit, index) => ({
      unitName: String(unit.unitName || '').trim(),
      conversionFactor: Number(unit.conversionFactor ?? 0),
      isBase: !!unit.isBase,
      sortOrder: Number(unit.sortOrder ?? index)
    })),
    priceTiers: (req.body.priceTiers || []).map((tier) => ({
      tierCode: String(tier.tierCode || '').trim(),
      tierName: String(tier.tierName || '').trim(),
      unitName: String(tier.unitName || '').trim(),
      priceSyp: Number(tier.priceSyp ?? 0)
    })),
    customerPrices: (req.body.customerPrices || []).map((price) => ({
      customerId: Number(price.customerId),
      unitName: String(price.unitName || '').trim(),
      priceSyp: Number(price.priceSyp ?? 0),
      notes: price.notes ? String(price.notes).trim() : null
    }))
  };

  const validationError = validatePayload(payload);
  if (validationError) return res.status(400).json({ success: false, error: validationError });

  const category = db.prepare('SELECT id, is_active FROM categories WHERE id = ?').get(payload.categoryId);
  if (!category || category.is_active !== 1) {
    return res.status(400).json({ success: false, error: 'التصنيف غير موجود أو غير نشط' });
  }

    const duplicateSku = db.prepare('SELECT id FROM products WHERE sku = ?').get(payload.sku);
  if (duplicateSku) return res.status(409).json({ success: false, error: 'SKU مستخدم مسبقاً' });

  const result = db.transaction(() => {
    const insertResult = db.prepare(`
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

    const productId = Number(insertResult.lastInsertRowid);
    const unitStmt = db.prepare(`
      INSERT INTO product_units (product_id, unit_name, conversion_factor, is_base, sort_order, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const unitsMap = new Map();
    for (const unit of payload.units) {
      const unitResult = unitStmt.run(productId, unit.unitName, unit.conversionFactor, unit.isBase ? 1 : 0, unit.sortOrder);
      unitsMap.set(unit.unitName, Number(unitResult.lastInsertRowid));
    }

    const tierStmt = db.prepare(`
      INSERT INTO product_price_tiers (product_id, product_unit_id, tier_code, tier_name, price_syp, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    for (const tier of payload.priceTiers) {
      const unitId = unitsMap.get(tier.unitName);
      if (!unitId) throw new Error('الوحدة المرتبطة بشريحة السعر غير معرفة');
      tierStmt.run(productId, unitId, tier.tierCode, tier.tierName || tier.tierCode, tier.priceSyp);
    }

    const customerPriceStmt = db.prepare(`
      INSERT INTO product_customer_prices (product_id, customer_id, product_unit_id, price_syp, notes, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    for (const price of payload.customerPrices) {
      const customer = db.prepare('SELECT id, is_active FROM customers WHERE id = ?').get(price.customerId);
      if (!customer || customer.is_active !== 1) throw new Error('العميل المرتبط بالسعر الخاص غير موجود أو غير نشط');
      const unitId = unitsMap.get(price.unitName);
      if (!unitId) throw new Error('الوحدة المرتبطة بالسعر الخاص غير معرفة');
      customerPriceStmt.run(productId, price.customerId, unitId, price.priceSyp, price.notes);
    }

    return insertResult;
  })();

  writeAuditLog({ userId: req.user.id, entityName: 'products', entityId: result.lastInsertRowid, action: 'CREATE' });
  return res.status(201).json({ success: true, data: { id: result.lastInsertRowid } });
});

router.patch('/:id', requirePermission(PERMISSIONS.INVENTORY_EDIT), (req, res) => {
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
    notes: req.body.notes || null,
    units: (req.body.units || []).map((unit, index) => ({
      unitName: String(unit.unitName || '').trim(),
      conversionFactor: Number(unit.conversionFactor ?? 0),
      isBase: !!unit.isBase,
      sortOrder: Number(unit.sortOrder ?? index)
    })),
    priceTiers: (req.body.priceTiers || []).map((tier) => ({
      tierCode: String(tier.tierCode || '').trim(),
      tierName: String(tier.tierName || '').trim(),
      unitName: String(tier.unitName || '').trim(),
      priceSyp: Number(tier.priceSyp ?? 0)
    })),
    customerPrices: (req.body.customerPrices || []).map((price) => ({
      customerId: Number(price.customerId),
      unitName: String(price.unitName || '').trim(),
      priceSyp: Number(price.priceSyp ?? 0),
      notes: price.notes ? String(price.notes).trim() : null
    }))
  };

  if (!id) return res.status(400).json({ success: false, error: 'معرف المنتج غير صالح' });
  const validationError = validatePayload(payload);
  if (validationError) return res.status(400).json({ success: false, error: validationError });

  const exists = db.prepare('SELECT id FROM products WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ success: false, error: 'المنتج غير موجود' });

  db.transaction(() => {
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

    db.prepare('DELETE FROM product_customer_prices WHERE product_id = ?').run(id);
    db.prepare('DELETE FROM product_price_tiers WHERE product_id = ?').run(id);
    db.prepare('DELETE FROM product_units WHERE product_id = ?').run(id);

    const unitStmt = db.prepare(`
      INSERT INTO product_units (product_id, unit_name, conversion_factor, is_base, sort_order, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    const unitsMap = new Map();
    for (const unit of payload.units) {
      const unitResult = unitStmt.run(id, unit.unitName, unit.conversionFactor, unit.isBase ? 1 : 0, unit.sortOrder);
      unitsMap.set(unit.unitName, Number(unitResult.lastInsertRowid));
    }

    const tierStmt = db.prepare(`
      INSERT INTO product_price_tiers (product_id, product_unit_id, tier_code, tier_name, price_syp, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    for (const tier of payload.priceTiers) {
      const unitId = unitsMap.get(tier.unitName);
      if (!unitId) throw new Error('الوحدة المرتبطة بشريحة السعر غير معرفة');
      tierStmt.run(id, unitId, tier.tierCode, tier.tierName || tier.tierCode, tier.priceSyp);
    }

    const customerPriceStmt = db.prepare(`
      INSERT INTO product_customer_prices (product_id, customer_id, product_unit_id, price_syp, notes, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    for (const price of payload.customerPrices) {
      const customer = db.prepare('SELECT id, is_active FROM customers WHERE id = ?').get(price.customerId);
      if (!customer || customer.is_active !== 1) throw new Error('العميل المرتبط بالسعر الخاص غير موجود أو غير نشط');
      const unitId = unitsMap.get(price.unitName);
      if (!unitId) throw new Error('الوحدة المرتبطة بالسعر الخاص غير معرفة');
      customerPriceStmt.run(id, price.customerId, unitId, price.priceSyp, price.notes);
    }
  })();

  writeAuditLog({ userId: req.user.id, entityName: 'products', entityId: id, action: 'UPDATE' });
  return res.json({ success: true });
});

router.patch('/:id/disable', requirePermission(PERMISSIONS.INVENTORY_DELETE), (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: 'معرف المنتج غير صالح' });

  db.prepare('UPDATE products SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  writeAuditLog({ userId: req.user.id, entityName: 'products', entityId: id, action: 'UPDATE', reason: 'DISABLE' });

  return res.json({ success: true });
});

export default router;
