CREATE TABLE IF NOT EXISTS cash_daily_closings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cash_account_id INTEGER NOT NULL,
  closing_date TEXT NOT NULL,
  opening_balance REAL NOT NULL DEFAULT 0,
  total_in REAL NOT NULL DEFAULT 0,
  total_out REAL NOT NULL DEFAULT 0,
  expected_balance REAL NOT NULL DEFAULT 0,
  counted_amount REAL NOT NULL DEFAULT 0,
  variance REAL NOT NULL DEFAULT 0,
  adjustment_movement_id INTEGER,
  notes TEXT,
  closed_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (cash_account_id, closing_date),
  FOREIGN KEY (cash_account_id) REFERENCES cash_accounts(id),
  FOREIGN KEY (adjustment_movement_id) REFERENCES cash_movements(id),
  FOREIGN KEY (closed_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_cash_daily_closings_account_date
ON cash_daily_closings (cash_account_id, closing_date);
