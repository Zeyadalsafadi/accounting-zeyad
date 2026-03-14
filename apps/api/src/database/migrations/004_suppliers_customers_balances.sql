ALTER TABLE suppliers ADD COLUMN opening_balance NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN currency TEXT NOT NULL DEFAULT 'SYP' CHECK (currency IN ('SYP','USD'));
ALTER TABLE suppliers ADD COLUMN current_balance NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE customers ADD COLUMN opening_balance NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN currency TEXT NOT NULL DEFAULT 'SYP' CHECK (currency IN ('SYP','USD'));
ALTER TABLE customers ADD COLUMN current_balance NUMERIC NOT NULL DEFAULT 0;

UPDATE suppliers
SET
  opening_balance = COALESCE(opening_balance, 0),
  current_balance = COALESCE(current_balance, opening_balance),
  currency = COALESCE(currency, 'SYP');

UPDATE customers
SET
  opening_balance = COALESCE(opening_balance, 0),
  current_balance = COALESCE(current_balance, opening_balance),
  currency = COALESCE(currency, 'SYP');
