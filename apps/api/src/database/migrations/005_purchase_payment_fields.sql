ALTER TABLE purchase_invoices ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'CREDIT' CHECK (payment_type IN ('CASH','CREDIT','PARTIAL'));
ALTER TABLE purchase_invoices ADD COLUMN cash_account_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_supplier_date ON purchase_invoices(supplier_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_status ON purchase_invoices(status);
