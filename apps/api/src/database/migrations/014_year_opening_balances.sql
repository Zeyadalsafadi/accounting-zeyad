CREATE TABLE IF NOT EXISTS year_opening_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  archive_id TEXT NOT NULL,
  source_year TEXT NOT NULL,
  target_year TEXT NOT NULL,
  carry_mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SUCCESS',
  executed_by_user_id INTEGER NOT NULL,
  summary_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (archive_id, target_year, carry_mode),
  FOREIGN KEY (executed_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS opening_balance_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  balance_type TEXT NOT NULL CHECK (balance_type IN ('CUSTOMER','SUPPLIER','CASH_ACCOUNT','INVENTORY')),
  entity_key TEXT NOT NULL,
  entity_label TEXT NOT NULL,
  currency TEXT,
  amount_original NUMERIC NOT NULL DEFAULT 0,
  amount_base NUMERIC NOT NULL DEFAULT 0,
  quantity NUMERIC NOT NULL DEFAULT 0,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES year_opening_runs(id) ON DELETE CASCADE
);
