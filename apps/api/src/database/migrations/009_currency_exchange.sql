CREATE TABLE IF NOT EXISTS currency_exchange_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exchange_date TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('BUY_USD','SELL_USD')),
  usd_amount NUMERIC NOT NULL CHECK (usd_amount > 0),
  exchange_rate NUMERIC NOT NULL CHECK (exchange_rate > 0),
  syp_amount NUMERIC NOT NULL CHECK (syp_amount > 0),
  counterparty_name TEXT,
  notes TEXT,
  syp_cash_account_id INTEGER NOT NULL,
  usd_cash_account_id INTEGER NOT NULL,
  created_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (syp_cash_account_id) REFERENCES cash_accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (usd_cash_account_id) REFERENCES cash_accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_currency_exchange_date ON currency_exchange_transactions(exchange_date DESC);
CREATE INDEX IF NOT EXISTS idx_currency_exchange_type ON currency_exchange_transactions(transaction_type);
