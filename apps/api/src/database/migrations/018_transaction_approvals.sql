ALTER TABLE sales_invoices ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (approval_status IN ('DRAFT', 'APPROVED'));
ALTER TABLE sales_invoices ADD COLUMN approved_at TEXT;
ALTER TABLE sales_invoices ADD COLUMN approved_by_user_id INTEGER REFERENCES users(id);

ALTER TABLE purchase_invoices ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (approval_status IN ('DRAFT', 'APPROVED'));
ALTER TABLE purchase_invoices ADD COLUMN approved_at TEXT;
ALTER TABLE purchase_invoices ADD COLUMN approved_by_user_id INTEGER REFERENCES users(id);

ALTER TABLE expenses ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (approval_status IN ('DRAFT', 'APPROVED'));
ALTER TABLE expenses ADD COLUMN approved_at TEXT;
ALTER TABLE expenses ADD COLUMN approved_by_user_id INTEGER REFERENCES users(id);
