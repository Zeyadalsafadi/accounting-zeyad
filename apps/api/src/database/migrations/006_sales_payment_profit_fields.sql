ALTER TABLE sales_invoices ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'CREDIT' CHECK (payment_type IN ('CASH','CREDIT','PARTIAL'));
ALTER TABLE sales_invoices ADD COLUMN cash_account_id INTEGER;
ALTER TABLE sales_invoice_items ADD COLUMN line_profit_base NUMERIC NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_sales_invoices_customer_date ON sales_invoices(customer_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_status ON sales_invoices(status);
