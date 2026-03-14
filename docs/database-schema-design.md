# Paint Shop Accounting System - Database Schema Design (MVP)

This schema is designed for a single-store deployment using SQLite, with explicit support for:
- SYP and USD transactions
- per-transaction exchange rates
- average-cost inventory valuation
- invoice cancellation instead of hard deletion
- strong relational integrity and auditability

## 1) List of Tables

1. `users`
2. `categories`
3. `products`
4. `suppliers`
5. `customers`
6. `purchase_invoices`
7. `purchase_invoice_items`
8. `sales_invoices`
9. `sales_invoice_items`
10. `inventory_movements`
11. `cash_accounts`
12. `cash_movements`
13. `expenses`
14. `settings`
15. `audit_logs`

---

## 2) + 3) Fields and Data Types

> Notes for SQLite typing:
> - Use `INTEGER` for IDs and booleans (`0/1`).
> - Use `TEXT` for ISO dates/timestamps and enums.
> - Use `NUMERIC` for money/quantities (fixed precision handled at app layer).

### 1) `users`
- `id` INTEGER
- `username` TEXT NOT NULL UNIQUE
- `password_hash` TEXT NOT NULL
- `full_name` TEXT NOT NULL
- `role` TEXT NOT NULL CHECK (`role` IN ('OWNER','ADMIN','CASHIER','ACCOUNTANT'))
- `is_active` INTEGER NOT NULL DEFAULT 1 CHECK (`is_active` IN (0,1))
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

### 2) `categories`
- `id` INTEGER
- `name_ar` TEXT NOT NULL
- `name_en` TEXT
- `is_active` INTEGER NOT NULL DEFAULT 1 CHECK (`is_active` IN (0,1))
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

### 3) `products`
- `id` INTEGER
- `category_id` INTEGER NOT NULL
- `sku` TEXT NOT NULL UNIQUE
- `barcode` TEXT UNIQUE
- `name_ar` TEXT NOT NULL
- `name_en` TEXT
- `unit` TEXT NOT NULL DEFAULT 'piece'
- `default_sale_price` NUMERIC NOT NULL DEFAULT 0
- `min_stock_level` NUMERIC NOT NULL DEFAULT 0
- `is_active` INTEGER NOT NULL DEFAULT 1 CHECK (`is_active` IN (0,1))
- `current_qty` NUMERIC NOT NULL DEFAULT 0
- `avg_cost_base` NUMERIC NOT NULL DEFAULT 0
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

### 4) `suppliers`
- `id` INTEGER
- `name` TEXT NOT NULL
- `phone` TEXT
- `address` TEXT
- `notes` TEXT
- `is_active` INTEGER NOT NULL DEFAULT 1 CHECK (`is_active` IN (0,1))
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

### 5) `customers`
- `id` INTEGER
- `name` TEXT NOT NULL
- `phone` TEXT
- `address` TEXT
- `notes` TEXT
- `is_active` INTEGER NOT NULL DEFAULT 1 CHECK (`is_active` IN (0,1))
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

### 6) `purchase_invoices`
- `id` INTEGER
- `invoice_no` TEXT NOT NULL UNIQUE
- `supplier_id` INTEGER
- `invoice_date` TEXT NOT NULL
- `status` TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (`status` IN ('ACTIVE','CANCELLED'))
- `currency` TEXT NOT NULL CHECK (`currency` IN ('SYP','USD'))
- `exchange_rate` NUMERIC NOT NULL CHECK (`exchange_rate` > 0)
- `subtotal_original` NUMERIC NOT NULL DEFAULT 0
- `discount_original` NUMERIC NOT NULL DEFAULT 0
- `total_original` NUMERIC NOT NULL DEFAULT 0
- `total_base` NUMERIC NOT NULL DEFAULT 0
- `paid_original` NUMERIC NOT NULL DEFAULT 0
- `paid_base` NUMERIC NOT NULL DEFAULT 0
- `notes` TEXT
- `cancelled_at` TEXT
- `cancelled_by_user_id` INTEGER
- `cancel_reason` TEXT
- `created_by_user_id` INTEGER NOT NULL
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

### 7) `purchase_invoice_items`
- `id` INTEGER
- `purchase_invoice_id` INTEGER NOT NULL
- `line_no` INTEGER NOT NULL
- `product_id` INTEGER NOT NULL
- `qty` NUMERIC NOT NULL CHECK (`qty` > 0)
- `unit_cost_original` NUMERIC NOT NULL CHECK (`unit_cost_original` >= 0)
- `line_total_original` NUMERIC NOT NULL CHECK (`line_total_original` >= 0)
- `line_total_base` NUMERIC NOT NULL CHECK (`line_total_base` >= 0)
- `created_at` TEXT NOT NULL

### 8) `sales_invoices`
- `id` INTEGER
- `invoice_no` TEXT NOT NULL UNIQUE
- `customer_id` INTEGER
- `invoice_date` TEXT NOT NULL
- `status` TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (`status` IN ('ACTIVE','CANCELLED'))
- `currency` TEXT NOT NULL CHECK (`currency` IN ('SYP','USD'))
- `exchange_rate` NUMERIC NOT NULL CHECK (`exchange_rate` > 0)
- `subtotal_original` NUMERIC NOT NULL DEFAULT 0
- `discount_original` NUMERIC NOT NULL DEFAULT 0
- `total_original` NUMERIC NOT NULL DEFAULT 0
- `total_base` NUMERIC NOT NULL DEFAULT 0
- `received_original` NUMERIC NOT NULL DEFAULT 0
- `received_base` NUMERIC NOT NULL DEFAULT 0
- `notes` TEXT
- `cancelled_at` TEXT
- `cancelled_by_user_id` INTEGER
- `cancel_reason` TEXT
- `created_by_user_id` INTEGER NOT NULL
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

### 9) `sales_invoice_items`
- `id` INTEGER
- `sales_invoice_id` INTEGER NOT NULL
- `line_no` INTEGER NOT NULL
- `product_id` INTEGER NOT NULL
- `qty` NUMERIC NOT NULL CHECK (`qty` > 0)
- `unit_price_original` NUMERIC NOT NULL CHECK (`unit_price_original` >= 0)
- `line_total_original` NUMERIC NOT NULL CHECK (`line_total_original` >= 0)
- `line_total_base` NUMERIC NOT NULL CHECK (`line_total_base` >= 0)
- `unit_cost_base_at_sale` NUMERIC NOT NULL CHECK (`unit_cost_base_at_sale` >= 0)
- `line_cogs_base` NUMERIC NOT NULL CHECK (`line_cogs_base` >= 0)
- `created_at` TEXT NOT NULL

### 10) `inventory_movements`
- `id` INTEGER
- `product_id` INTEGER NOT NULL
- `movement_type` TEXT NOT NULL CHECK (`movement_type` IN (
  'PURCHASE_IN','SALE_OUT','ADJUSTMENT_IN','ADJUSTMENT_OUT',
  'PURCHASE_CANCEL_OUT','SALE_CANCEL_IN'
))
- `movement_date` TEXT NOT NULL
- `qty_in` NUMERIC NOT NULL DEFAULT 0 CHECK (`qty_in` >= 0)
- `qty_out` NUMERIC NOT NULL DEFAULT 0 CHECK (`qty_out` >= 0)
- `unit_cost_base` NUMERIC NOT NULL DEFAULT 0 CHECK (`unit_cost_base` >= 0)
- `total_cost_base` NUMERIC NOT NULL DEFAULT 0 CHECK (`total_cost_base` >= 0)
- `avg_cost_before_base` NUMERIC NOT NULL DEFAULT 0
- `avg_cost_after_base` NUMERIC NOT NULL DEFAULT 0
- `source_type` TEXT NOT NULL CHECK (`source_type` IN ('PURCHASE_INVOICE','SALES_INVOICE','MANUAL_ADJUSTMENT'))
- `source_id` INTEGER NOT NULL
- `notes` TEXT
- `created_by_user_id` INTEGER NOT NULL
- `created_at` TEXT NOT NULL

### 11) `cash_accounts`
- `id` INTEGER
- `name` TEXT NOT NULL UNIQUE
- `currency` TEXT NOT NULL CHECK (`currency` IN ('SYP','USD'))
- `is_active` INTEGER NOT NULL DEFAULT 1 CHECK (`is_active` IN (0,1))
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

### 12) `cash_movements`
- `id` INTEGER
- `cash_account_id` INTEGER NOT NULL
- `movement_date` TEXT NOT NULL
- `movement_type` TEXT NOT NULL CHECK (`movement_type` IN (
  'OPENING_BALANCE','SALES_RECEIPT','PURCHASE_PAYMENT','EXPENSE_PAYMENT',
  'MANUAL_IN','MANUAL_OUT','CLOSING_ADJUSTMENT','REFUND_OUT','REFUND_IN'
))
- `direction` TEXT NOT NULL CHECK (`direction` IN ('IN','OUT'))
- `currency` TEXT NOT NULL CHECK (`currency` IN ('SYP','USD'))
- `original_amount` NUMERIC NOT NULL CHECK (`original_amount` >= 0)
- `exchange_rate` NUMERIC NOT NULL CHECK (`exchange_rate` > 0)
- `base_amount` NUMERIC NOT NULL CHECK (`base_amount` >= 0)
- `source_type` TEXT CHECK (`source_type` IN ('SALES_INVOICE','PURCHASE_INVOICE','EXPENSE','MANUAL'))
- `source_id` INTEGER
- `notes` TEXT
- `created_by_user_id` INTEGER NOT NULL
- `created_at` TEXT NOT NULL

### 13) `expenses`
- `id` INTEGER
- `expense_date` TEXT NOT NULL
- `expense_category` TEXT NOT NULL
- `description` TEXT
- `currency` TEXT NOT NULL CHECK (`currency` IN ('SYP','USD'))
- `original_amount` NUMERIC NOT NULL CHECK (`original_amount` >= 0)
- `exchange_rate` NUMERIC NOT NULL CHECK (`exchange_rate` > 0)
- `base_amount` NUMERIC NOT NULL CHECK (`base_amount` >= 0)
- `paid_from_cash_account_id` INTEGER
- `status` TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (`status` IN ('ACTIVE','CANCELLED'))
- `cancelled_at` TEXT
- `cancelled_by_user_id` INTEGER
- `cancel_reason` TEXT
- `created_by_user_id` INTEGER NOT NULL
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

### 14) `settings`
- `id` INTEGER
- `key` TEXT NOT NULL UNIQUE
- `value` TEXT NOT NULL
- `value_type` TEXT NOT NULL CHECK (`value_type` IN ('STRING','NUMBER','BOOLEAN','JSON'))
- `updated_by_user_id` INTEGER
- `updated_at` TEXT NOT NULL

### 15) `audit_logs`
- `id` INTEGER
- `event_time` TEXT NOT NULL
- `user_id` INTEGER
- `entity_name` TEXT NOT NULL
- `entity_id` INTEGER
- `action` TEXT NOT NULL CHECK (`action` IN ('CREATE','UPDATE','CANCEL','LOGIN','LOGOUT','MANUAL_ADJUSTMENT'))
- `field_name` TEXT
- `old_value` TEXT
- `new_value` TEXT
- `reason` TEXT
- `ip_address` TEXT
- `metadata_json` TEXT

---

## 4) Primary Keys and Foreign Keys

### Primary Keys
- All tables use single-column surrogate PK: `id INTEGER PRIMARY KEY`.

### Foreign Keys
- `products.category_id` → `categories.id`
- `purchase_invoices.supplier_id` → `suppliers.id`
- `purchase_invoices.created_by_user_id` → `users.id`
- `purchase_invoices.cancelled_by_user_id` → `users.id`
- `purchase_invoice_items.purchase_invoice_id` → `purchase_invoices.id`
- `purchase_invoice_items.product_id` → `products.id`
- `sales_invoices.customer_id` → `customers.id`
- `sales_invoices.created_by_user_id` → `users.id`
- `sales_invoices.cancelled_by_user_id` → `users.id`
- `sales_invoice_items.sales_invoice_id` → `sales_invoices.id`
- `sales_invoice_items.product_id` → `products.id`
- `inventory_movements.product_id` → `products.id`
- `inventory_movements.created_by_user_id` → `users.id`
- `cash_movements.cash_account_id` → `cash_accounts.id`
- `cash_movements.created_by_user_id` → `users.id`
- `expenses.paid_from_cash_account_id` → `cash_accounts.id`
- `expenses.created_by_user_id` → `users.id`
- `expenses.cancelled_by_user_id` → `users.id`
- `settings.updated_by_user_id` → `users.id`
- `audit_logs.user_id` → `users.id`

### FK Behavior Recommendations
- Use `ON UPDATE CASCADE` broadly.
- Use `ON DELETE RESTRICT` for master and transaction relations (to prevent accidental data loss).
- Optional refs (`customer_id`, `supplier_id`, `paid_from_cash_account_id`) can use `ON DELETE SET NULL`.

---

## 5) Relationship Explanation

1. **Category → Products (1:N)**
   - Each product belongs to one category.

2. **Supplier → Purchase Invoices (1:N)**
   - A supplier can have many purchase invoices.

3. **Purchase Invoice → Purchase Items (1:N)**
   - Header/item design supports multiple lines per invoice.

4. **Customer → Sales Invoices (1:N, optional customer)**
   - Sales can be to walk-in customers (`NULL`) or registered customers.

5. **Sales Invoice → Sales Items (1:N)**
   - Item-level pricing and item-level COGS are stored for reporting accuracy.

6. **Product → Inventory Movements (1:N)**
   - Every stock-affecting event creates a movement row.
   - Average cost is maintained using movement data and product snapshot fields (`current_qty`, `avg_cost_base`).

7. **Cash Account → Cash Movements (1:N)**
   - Each cash movement occurs in one cash account (e.g., SYP drawer, USD drawer).

8. **Expenses ↔ Cash Accounts (N:1 optional)**
   - Expense can be linked to paying cash account.

9. **Users referenced across transactional tables (1:N)**
   - Tracks who created/cancelled records.

10. **Audit Logs as cross-entity trail**
   - Logs manual edits and lifecycle operations for compliance.

### Cancellation Model
- Invoices and expenses are never deleted.
- `status='CANCELLED'` with cancellation metadata.
- Cancellation triggers compensating entries in:
  - `inventory_movements` (reverse stock effect)
  - `cash_movements` (reverse financial effect when relevant)

### Currency & Exchange-Rate Model
- Transactional tables store `currency`, `exchange_rate`, and converted base amounts.
- Guarantees traceability of historical rates per transaction.
- Recommended base currency setting in `settings` (e.g., `BASE_CURRENCY=SYP`).

### Average Cost Model
- Purchase inflow updates product average cost.
- Sales item captures `unit_cost_base_at_sale` and `line_cogs_base` at posting time.
- Historical COGS remains stable even if average cost changes later.

---

## 6) Indexing and Performance Notes

### Essential Indexes

#### Master/Data lookup
- `users(username)` UNIQUE
- `products(sku)` UNIQUE
- `products(barcode)` UNIQUE (nullable)
- `categories(name_ar)`
- `suppliers(name)`
- `customers(name)`

#### Transaction retrieval
- `purchase_invoices(invoice_no)` UNIQUE
- `purchase_invoices(invoice_date)`
- `purchase_invoices(status, invoice_date)`
- `purchase_invoice_items(purchase_invoice_id, line_no)` UNIQUE
- `purchase_invoice_items(product_id)`

- `sales_invoices(invoice_no)` UNIQUE
- `sales_invoices(invoice_date)`
- `sales_invoices(status, invoice_date)`
- `sales_invoice_items(sales_invoice_id, line_no)` UNIQUE
- `sales_invoice_items(product_id)`

- `inventory_movements(product_id, movement_date)`
- `inventory_movements(source_type, source_id)`

- `cash_movements(cash_account_id, movement_date)`
- `cash_movements(source_type, source_id)`

- `expenses(expense_date)`
- `expenses(status, expense_date)`

- `audit_logs(event_time)`
- `audit_logs(entity_name, entity_id, event_time)`

### SQLite-specific Performance Practices
1. Enable WAL mode (`PRAGMA journal_mode=WAL;`).
2. Enable foreign keys (`PRAGMA foreign_keys=ON;`).
3. Wrap invoice posting/cancellation in single DB transactions.
4. Keep write operations short to reduce lock times.
5. Use pagination for list screens (sales, purchases, audit logs).
6. Add periodic `VACUUM`/`ANALYZE` in maintenance windows.

### Integrity and Consistency Guardrails
- CHECK constraints for currency, statuses, and non-negative amounts.
- Unique invoice numbers per invoice type.
- Optional trigger-based guards:
  - prevent status flip from `CANCELLED` back to `ACTIVE` without privileged process
  - enforce non-negative resulting stock unless setting allows negative stock

---

## Optional Future Extensions (Non-MVP)
- `stores` table for multi-branch future.
- `currencies` table if more than SYP/USD is needed.
- `journal_entries` + `journal_entry_lines` for full double-entry accounting.
- `price_history` for retail pricing timeline.

