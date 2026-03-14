ALTER TABLE customer_collections ADD COLUMN received_syp NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE customer_collections ADD COLUMN received_usd NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE customer_collections ADD COLUMN exchange_rate_used NUMERIC NOT NULL DEFAULT 1;
ALTER TABLE customer_collections ADD COLUMN total_settled_syp NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE customer_collections ADD COLUMN syp_cash_account_id INTEGER;
ALTER TABLE customer_collections ADD COLUMN usd_cash_account_id INTEGER;
