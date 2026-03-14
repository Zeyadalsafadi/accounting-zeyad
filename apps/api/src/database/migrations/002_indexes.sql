CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_categories_name_ar ON categories(name_ar);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);

CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_invoice_date ON purchase_invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_status_date ON purchase_invoices(status, invoice_date);
CREATE INDEX IF NOT EXISTS idx_purchase_items_invoice_line ON purchase_invoice_items(purchase_invoice_id, line_no);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product_id ON purchase_invoice_items(product_id);

CREATE INDEX IF NOT EXISTS idx_sales_invoices_invoice_date ON sales_invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_status_date ON sales_invoices(status, invoice_date);
CREATE INDEX IF NOT EXISTS idx_sales_items_invoice_line ON sales_invoice_items(sales_invoice_id, line_no);
CREATE INDEX IF NOT EXISTS idx_sales_items_product_id ON sales_invoice_items(product_id);

CREATE INDEX IF NOT EXISTS idx_inventory_product_date ON inventory_movements(product_id, movement_date);
CREATE INDEX IF NOT EXISTS idx_inventory_source ON inventory_movements(source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_cash_movements_account_date ON cash_movements(cash_account_id, movement_date);
CREATE INDEX IF NOT EXISTS idx_cash_movements_source ON cash_movements(source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_status_date ON expenses(status, expense_date);

CREATE INDEX IF NOT EXISTS idx_audit_event_time ON audit_logs(event_time);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_name, entity_id, event_time);
