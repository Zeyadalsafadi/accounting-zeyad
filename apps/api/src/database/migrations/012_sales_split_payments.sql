ALTER TABLE sales_invoices ADD COLUMN paid_syp NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE sales_invoices ADD COLUMN paid_usd NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE sales_invoices ADD COLUMN paid_total_syp NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE sales_invoices ADD COLUMN syp_cash_account_id INTEGER;
ALTER TABLE sales_invoices ADD COLUMN usd_cash_account_id INTEGER;
