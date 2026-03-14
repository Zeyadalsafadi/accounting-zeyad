import express from 'express';
import db from '../db.js';
import { writeAuditLog } from '../utils/audit.js';

const router = express.Router();

router.get('/categories', (_req, res) => {
  const rows = db.prepare('SELECT * FROM categories ORDER BY id DESC').all();
  res.json({ success: true, data: rows });
});

router.post('/categories', (req, res) => {
  const { name_ar } = req.body;
  if (!name_ar) return res.status(400).json({ success: false, error: 'اسم التصنيف مطلوب' });

  const result = db.prepare('INSERT INTO categories (name_ar) VALUES (?)').run(name_ar);
  writeAuditLog({ userId: req.user.id, entityName: 'categories', entityId: result.lastInsertRowid, action: 'CREATE' });
  res.status(201).json({ success: true, data: { id: result.lastInsertRowid, name_ar } });
});

router.get('/products', (_req, res) => {
  const rows = db.prepare(`
    SELECT p.*, c.name_ar AS category_name
    FROM products p
    JOIN categories c ON c.id = p.category_id
    ORDER BY p.id DESC
  `).all();
  res.json({ success: true, data: rows });
});

router.post('/products', (req, res) => {
  const { category_id, sku, name_ar, unit = 'قطعة', default_sale_price = 0 } = req.body;
  if (!category_id || !sku || !name_ar) {
    return res.status(400).json({ success: false, error: 'البيانات الأساسية للمنتج مطلوبة' });
  }

  const result = db.prepare(`
    INSERT INTO products (category_id, sku, name_ar, unit, default_sale_price)
    VALUES (?, ?, ?, ?, ?)
  `).run(category_id, sku, name_ar, unit, default_sale_price);

  writeAuditLog({ userId: req.user.id, entityName: 'products', entityId: result.lastInsertRowid, action: 'CREATE' });
  res.status(201).json({ success: true, data: { id: result.lastInsertRowid } });
});

router.get('/suppliers', (_req, res) => {
  const rows = db.prepare('SELECT * FROM suppliers ORDER BY id DESC').all();
  res.json({ success: true, data: rows });
});

router.post('/suppliers', (req, res) => {
  const { name, phone, address } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'اسم المورد مطلوب' });
  const result = db.prepare('INSERT INTO suppliers (name, phone, address) VALUES (?, ?, ?)').run(name, phone || null, address || null);
  writeAuditLog({ userId: req.user.id, entityName: 'suppliers', entityId: result.lastInsertRowid, action: 'CREATE' });
  res.status(201).json({ success: true, data: { id: result.lastInsertRowid } });
});

router.get('/customers', (_req, res) => {
  const rows = db.prepare('SELECT * FROM customers ORDER BY id DESC').all();
  res.json({ success: true, data: rows });
});

router.post('/customers', (req, res) => {
  const { name, phone, address } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'اسم العميل مطلوب' });
  const result = db.prepare('INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)').run(name, phone || null, address || null);
  writeAuditLog({ userId: req.user.id, entityName: 'customers', entityId: result.lastInsertRowid, action: 'CREATE' });
  res.status(201).json({ success: true, data: { id: result.lastInsertRowid } });
});

export default router;
