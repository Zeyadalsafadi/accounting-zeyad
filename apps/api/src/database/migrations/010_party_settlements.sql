CREATE TABLE IF NOT EXISTS supplier_settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL,
  settlement_date TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL CHECK (currency IN ('SYP','USD')),
  cash_account_id INTEGER NOT NULL,
  reference TEXT,
  notes TEXT,
  balance_after NUMERIC NOT NULL DEFAULT 0,
  created_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
  FOREIGN KEY (cash_account_id) REFERENCES cash_accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS customer_collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  collection_date TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL CHECK (currency IN ('SYP','USD')),
  cash_account_id INTEGER NOT NULL,
  reference TEXT,
  notes TEXT,
  balance_after NUMERIC NOT NULL DEFAULT 0,
  created_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  FOREIGN KEY (cash_account_id) REFERENCES cash_accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_supplier_settlements_supplier_date ON supplier_settlements(supplier_id, settlement_date DESC);
CREATE INDEX IF NOT EXISTS idx_customer_collections_customer_date ON customer_collections(customer_id, collection_date DESC);
