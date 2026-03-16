CREATE TABLE IF NOT EXISTS product_customer_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_unit_id INTEGER NOT NULL REFERENCES product_units(id) ON DELETE CASCADE,
  price_syp REAL NOT NULL DEFAULT 0 CHECK (price_syp >= 0),
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, customer_id, product_unit_id)
);

CREATE INDEX IF NOT EXISTS idx_product_customer_prices_product
  ON product_customer_prices(product_id);

CREATE INDEX IF NOT EXISTS idx_product_customer_prices_customer
  ON product_customer_prices(customer_id);
