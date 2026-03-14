ALTER TABLE categories ADD COLUMN notes TEXT;

ALTER TABLE products ADD COLUMN purchase_price NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN selling_price NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN default_currency TEXT NOT NULL DEFAULT 'SYP' CHECK (default_currency IN ('SYP','USD'));
ALTER TABLE products ADD COLUMN notes TEXT;

UPDATE products
SET
  purchase_price = COALESCE(purchase_price, 0),
  selling_price = COALESCE(selling_price, default_sale_price),
  default_currency = COALESCE(default_currency, 'SYP');
