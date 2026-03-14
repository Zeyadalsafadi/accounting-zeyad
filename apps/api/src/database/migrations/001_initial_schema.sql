CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('OWNER','ADMIN','CASHIER','ACCOUNTANT')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_ar TEXT NOT NULL UNIQUE,
  name_en TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  barcode TEXT UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  unit TEXT NOT NULL DEFAULT 'قطعة',
  default_sale_price NUMERIC NOT NULL DEFAULT 0,
  min_stock_level NUMERIC NOT NULL DEFAULT 0,
  current_qty NUMERIC NOT NULL DEFAULT 0,
  avg_cost_base NUMERIC NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no TEXT NOT NULL UNIQUE,
  supplier_id INTEGER,
  invoice_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CANCELLED')),
  currency TEXT NOT NULL CHECK (currency IN ('SYP','USD')),
  exchange_rate NUMERIC NOT NULL CHECK (exchange_rate > 0),
  subtotal_original NUMERIC NOT NULL DEFAULT 0,
  discount_original NUMERIC NOT NULL DEFAULT 0,
  total_original NUMERIC NOT NULL DEFAULT 0,
  total_base NUMERIC NOT NULL DEFAULT 0,
  paid_original NUMERIC NOT NULL DEFAULT 0,
  paid_base NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  cancelled_at TEXT,
  cancelled_by_user_id INTEGER,
  cancel_reason TEXT,
  created_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
  FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS purchase_invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_invoice_id INTEGER NOT NULL,
  line_no INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  qty NUMERIC NOT NULL CHECK (qty > 0),
  unit_cost_original NUMERIC NOT NULL CHECK (unit_cost_original >= 0),
  line_total_original NUMERIC NOT NULL CHECK (line_total_original >= 0),
  line_total_base NUMERIC NOT NULL CHECK (line_total_base >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (purchase_invoice_id) REFERENCES purchase_invoices(id) ON DELETE RESTRICT,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS sales_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no TEXT NOT NULL UNIQUE,
  customer_id INTEGER,
  invoice_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CANCELLED')),
  currency TEXT NOT NULL CHECK (currency IN ('SYP','USD')),
  exchange_rate NUMERIC NOT NULL CHECK (exchange_rate > 0),
  subtotal_original NUMERIC NOT NULL DEFAULT 0,
  discount_original NUMERIC NOT NULL DEFAULT 0,
  total_original NUMERIC NOT NULL DEFAULT 0,
  total_base NUMERIC NOT NULL DEFAULT 0,
  received_original NUMERIC NOT NULL DEFAULT 0,
  received_base NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  cancelled_at TEXT,
  cancelled_by_user_id INTEGER,
  cancel_reason TEXT,
  created_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS sales_invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sales_invoice_id INTEGER NOT NULL,
  line_no INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  qty NUMERIC NOT NULL CHECK (qty > 0),
  unit_price_original NUMERIC NOT NULL CHECK (unit_price_original >= 0),
  line_total_original NUMERIC NOT NULL CHECK (line_total_original >= 0),
  line_total_base NUMERIC NOT NULL CHECK (line_total_base >= 0),
  unit_cost_base_at_sale NUMERIC NOT NULL CHECK (unit_cost_base_at_sale >= 0),
  line_cogs_base NUMERIC NOT NULL CHECK (line_cogs_base >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sales_invoice_id) REFERENCES sales_invoices(id) ON DELETE RESTRICT,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'PURCHASE_IN','SALE_OUT','ADJUSTMENT_IN','ADJUSTMENT_OUT',
    'PURCHASE_CANCEL_OUT','SALE_CANCEL_IN'
  )),
  movement_date TEXT NOT NULL,
  qty_in NUMERIC NOT NULL DEFAULT 0 CHECK (qty_in >= 0),
  qty_out NUMERIC NOT NULL DEFAULT 0 CHECK (qty_out >= 0),
  unit_cost_base NUMERIC NOT NULL DEFAULT 0 CHECK (unit_cost_base >= 0),
  total_cost_base NUMERIC NOT NULL DEFAULT 0 CHECK (total_cost_base >= 0),
  avg_cost_before_base NUMERIC NOT NULL DEFAULT 0,
  avg_cost_after_base NUMERIC NOT NULL DEFAULT 0,
  source_type TEXT NOT NULL CHECK (source_type IN ('PURCHASE_INVOICE','SALES_INVOICE','MANUAL_ADJUSTMENT')),
  source_id INTEGER NOT NULL,
  notes TEXT,
  created_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS cash_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  currency TEXT NOT NULL CHECK (currency IN ('SYP','USD')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cash_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cash_account_id INTEGER NOT NULL,
  movement_date TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'OPENING_BALANCE','SALES_RECEIPT','PURCHASE_PAYMENT','EXPENSE_PAYMENT',
    'MANUAL_IN','MANUAL_OUT','CLOSING_ADJUSTMENT','REFUND_OUT','REFUND_IN'
  )),
  direction TEXT NOT NULL CHECK (direction IN ('IN','OUT')),
  currency TEXT NOT NULL CHECK (currency IN ('SYP','USD')),
  original_amount NUMERIC NOT NULL CHECK (original_amount >= 0),
  exchange_rate NUMERIC NOT NULL CHECK (exchange_rate > 0),
  base_amount NUMERIC NOT NULL CHECK (base_amount >= 0),
  source_type TEXT CHECK (source_type IN ('SALES_INVOICE','PURCHASE_INVOICE','EXPENSE','MANUAL')),
  source_id INTEGER,
  notes TEXT,
  created_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cash_account_id) REFERENCES cash_accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_date TEXT NOT NULL,
  expense_category TEXT NOT NULL,
  description TEXT,
  currency TEXT NOT NULL CHECK (currency IN ('SYP','USD')),
  original_amount NUMERIC NOT NULL CHECK (original_amount >= 0),
  exchange_rate NUMERIC NOT NULL CHECK (exchange_rate > 0),
  base_amount NUMERIC NOT NULL CHECK (base_amount >= 0),
  paid_from_cash_account_id INTEGER,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CANCELLED')),
  cancelled_at TEXT,
  cancelled_by_user_id INTEGER,
  cancel_reason TEXT,
  created_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (paid_from_cash_account_id) REFERENCES cash_accounts(id) ON DELETE SET NULL,
  FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  value_type TEXT NOT NULL CHECK (value_type IN ('STRING','NUMBER','BOOLEAN','JSON')),
  updated_by_user_id INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER,
  entity_name TEXT NOT NULL,
  entity_id INTEGER,
  action TEXT NOT NULL CHECK (action IN ('CREATE','UPDATE','CANCEL','LOGIN','LOGOUT','MANUAL_ADJUSTMENT')),
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  metadata_json TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
