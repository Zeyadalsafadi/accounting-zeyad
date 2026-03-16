CREATE TABLE IF NOT EXISTS product_units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  unit_name TEXT NOT NULL,
  conversion_factor REAL NOT NULL DEFAULT 1,
  is_base INTEGER NOT NULL DEFAULT 0 CHECK (is_base IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (product_id, unit_name),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_price_tiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  product_unit_id INTEGER NOT NULL,
  tier_code TEXT NOT NULL,
  tier_name TEXT NOT NULL,
  price_syp REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (product_id, product_unit_id, tier_code),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (product_unit_id) REFERENCES product_units(id) ON DELETE CASCADE
);

ALTER TABLE sales_invoice_items ADD COLUMN selected_unit_name TEXT;
ALTER TABLE sales_invoice_items ADD COLUMN selected_unit_factor REAL NOT NULL DEFAULT 1;
ALTER TABLE sales_invoice_items ADD COLUMN selected_price_tier_code TEXT;
ALTER TABLE sales_invoice_items ADD COLUMN selected_price_tier_name TEXT;

ALTER TABLE purchase_invoice_items ADD COLUMN selected_unit_name TEXT;
ALTER TABLE purchase_invoice_items ADD COLUMN selected_unit_factor REAL NOT NULL DEFAULT 1;

INSERT INTO product_units (product_id, unit_name, conversion_factor, is_base, sort_order)
SELECT p.id, p.unit, 1, 1, 0
FROM products p
WHERE NOT EXISTS (
  SELECT 1 FROM product_units pu WHERE pu.product_id = p.id
);

INSERT INTO product_price_tiers (product_id, product_unit_id, tier_code, tier_name, price_syp)
SELECT
  p.id,
  pu.id,
  'RETAIL',
  'مفرق',
  CASE
    WHEN p.default_currency = 'SYP' THEN COALESCE(p.selling_price, 0)
    ELSE 0
  END
FROM products p
JOIN product_units pu ON pu.product_id = p.id AND pu.is_base = 1
WHERE NOT EXISTS (
  SELECT 1 FROM product_price_tiers pt WHERE pt.product_id = p.id
);
