# Paint Shop Accounting System - Business Workflows (Pre-Implementation Logic)

This document defines the operational logic before coding, aligned with the MVP schema and rules:
- SYP/USD dual currency with per-transaction exchange rate
- invoice cancellation instead of deletion
- average-cost inventory valuation
- mandatory audit trail for manual edits and critical events

## Global Workflow Rules (apply to all operations)

1. **No hard deletes on financial documents**
   - Invoices/expenses become `CANCELLED`; rows remain in DB.
2. **Currency completeness**
   - Every monetary transaction stores: `currency`, `original_amount`, `exchange_rate`, `base_amount`.
3. **Atomic posting**
   - Each business action runs in one DB transaction.
4. **Auditability**
   - Create audit events for create/cancel/manual-adjust operations.
   - Manual modifications must include reason.
5. **Stock policy**
   - Negative stock blocked by default unless setting explicitly allows it.
6. **Daily close discipline**
   - After closing, backdated or same-day edits require elevated permission + reason.

---

## 1) Creating a Purchase Invoice

### Step-by-step logic
1. User enters purchase header (supplier, date, currency, exchange rate, notes).
2. User adds invoice line items (product, qty, unit cost).
3. System validates header + lines.
4. System computes invoice totals (original + base).
5. On posting, system inserts invoice + items.
6. For each line, system creates inventory IN movement and recalculates product weighted average cost.
7. If any immediate payment is made, system creates cash OUT movement.
8. System writes audit log entries for creation.

### Data created
- Purchase invoice header (`purchase_invoices`)
- Purchase invoice lines (`purchase_invoice_items`)
- Inventory inflow records per line (`inventory_movements`)
- Optional payment record (`cash_movements`) if paid now
- Audit events (`audit_logs`)

### Tables affected
- `purchase_invoices`
- `purchase_invoice_items`
- `inventory_movements`
- `products` (update `current_qty`, `avg_cost_base` snapshot)
- `cash_movements` (optional)
- `audit_logs`

### Stock change
- For each line: `current_qty += qty`
- New weighted average cost in base currency:
  - `new_avg = ((old_qty * old_avg) + (in_qty * unit_cost_base)) / (old_qty + in_qty)`
- Movement type: `PURCHASE_IN`

### Cash change
- If fully/partially paid immediately:
  - Create `cash_movements` with `movement_type='PURCHASE_PAYMENT'`, `direction='OUT'`
  - Amount stored in original + base
- If unpaid: no immediate cash movement

### Audit logging
- `action='CREATE'` for invoice header
- `action='CREATE'` for inventory/cash side effects (or single summarized event)
- Log user, timestamp, entity, IDs, metadata (line count/totals)

### Important validations
- Invoice must have at least 1 item
- `qty > 0`, unit cost >= 0
- `currency in (SYP, USD)`
- `exchange_rate > 0`
- Invoice number unique
- Cancelled supplier/product cannot be used (or require override)

---

## 2) Creating a Sales Invoice

### Step-by-step logic
1. User enters sales header (customer optional, date, currency, exchange rate).
2. User adds item lines (product, qty, unit sale price).
3. System validates availability and pricing values.
4. System computes totals (original/base).
5. On posting, system inserts invoice + items.
6. System decreases stock via inventory OUT movements.
7. For each sales line, system captures COGS at current average cost (`unit_cost_base_at_sale`, `line_cogs_base`).
8. System records cash IN movement if paid.
9. System writes audit logs.

### Data created
- Sales invoice header (`sales_invoices`)
- Sales invoice lines (`sales_invoice_items`)
- Inventory outflow records (`inventory_movements`)
- Cash receipt (`cash_movements`) for paid amount
- Audit entries (`audit_logs`)

### Tables affected
- `sales_invoices`
- `sales_invoice_items`
- `inventory_movements`
- `products` (update `current_qty`; keep `avg_cost_base` unless policy recalculates on specific events)
- `cash_movements`
- `audit_logs`

### Stock change
- For each line: `current_qty -= qty`
- Movement type: `SALE_OUT`
- COGS uses current product `avg_cost_base` at sale time and is frozen in sales item

### Cash change
- If payment received: `cash_movements` with `movement_type='SALES_RECEIPT'`, `direction='IN'`
- Partial payment supported by storing received amount fields

### Audit logging
- `action='CREATE'` for sales invoice
- Log important financial metadata (invoice total, received amount)
- Log any override (e.g., sell below configured minimum margin)

### Important validations
- At least 1 line item
- `qty > 0`; `unit_price >= 0`
- Product must be active
- Stock availability check (unless negative stock enabled)
- `exchange_rate > 0`
- Received amount cannot exceed total unless change/refund workflow exists

---

## 3) Cancelling a Purchase Invoice

### Step-by-step logic
1. User opens active purchase invoice and requests cancellation with reason.
2. System checks status is `ACTIVE` and user has permission.
3. System verifies stock can be reversed for each item (cannot go negative unless override setting).
4. System updates invoice status to `CANCELLED` with cancellation metadata.
5. System inserts reversing inventory movements per item.
6. System inserts reversing cash movement if payment existed.
7. System updates product stock and recalculates average cost as per reversal policy.
8. System records audit entries.

### Data created
- Status update in `purchase_invoices`
- Reversal inventory movements (`PURCHASE_CANCEL_OUT`)
- Optional reversal cash movement (`IN`) if purchase payment had been posted
- Audit entries

### Tables affected
- `purchase_invoices`
- `inventory_movements`
- `products`
- `cash_movements` (optional)
- `audit_logs`

### Stock change
- For each original line: subtract previously added quantity
- Ensure resulting stock is valid (or privileged override)
- Average cost treatment policy (recommended): recompute from movement history in chronological order for correctness; fallback to controlled formula only if performance demands

### Cash change
- If purchase payment existed, record counter-movement:
  - typically `direction='IN'`, `movement_type='REFUND_IN'` or dedicated cancel code
- If unpaid purchase: no cash effect

### Audit logging
- `action='CANCEL'` on `purchase_invoices`
- Include `cancel_reason`, user, timestamp
- Optionally log each generated reversal movement with metadata

### Important validations
- Only `ACTIVE` invoices can be cancelled
- Already cancelled invoice cannot be cancelled again
- Cancellation reason required
- Reverse stock must not violate stock policy
- Cancellation should not be allowed in closed day without privileged override

---

## 4) Cancelling a Sales Invoice

### Step-by-step logic
1. User selects active sales invoice and submits cancellation reason.
2. System checks invoice is cancellable and user is authorized.
3. System updates header status to `CANCELLED`.
4. System inserts inventory reversal movements to return stock.
5. System inserts cash reversal movement if payment was received.
6. System records audit entries.

### Data created
- Status update in `sales_invoices`
- Reversal inventory movements (`SALE_CANCEL_IN`)
- Optional cash reversal (`OUT`) for refunded amount
- Audit events

### Tables affected
- `sales_invoices`
- `inventory_movements`
- `products`
- `cash_movements`
- `audit_logs`

### Stock change
- For each original sold line: `current_qty += qty`
- Movement type: `SALE_CANCEL_IN`
- Average cost policy on sales cancel return:
  - recommended to reintroduce quantity at original sale cost captured in `sales_invoice_items.unit_cost_base_at_sale`

### Cash change
- If cash was received: record reversal cash OUT movement (`REFUND_OUT`)
- If invoice was unpaid: no cash movement

### Audit logging
- `action='CANCEL'` for sales invoice
- Include reason, affected totals, user, timestamp

### Important validations
- Invoice must be `ACTIVE`
- Refund cannot exceed amount actually received
- Cannot cancel in locked/closed day without privileged override
- Cancellation reason mandatory

---

## 5) Recording an Expense

### Step-by-step logic
1. User enters expense details (date, category, description, currency, amount, rate).
2. System validates amount and exchange rate.
3. System inserts expense row with converted base amount.
4. If paid from a cash account, system creates cash OUT movement.
5. System logs audit event.

### Data created
- Expense record (`expenses`)
- Optional related cash movement (`cash_movements`)
- Audit record (`audit_logs`)

### Tables affected
- `expenses`
- `cash_movements` (if paid now)
- `audit_logs`

### Stock change
- No stock impact

### Cash change
- If linked to cash account: `direction='OUT'`, `movement_type='EXPENSE_PAYMENT'`
- If accrued/unpaid flow exists, no immediate cash movement

### Audit logging
- `action='CREATE'` for expense entry
- Manual edits/cancellation logged with before/after and reason

### Important validations
- `original_amount >= 0`
- `exchange_rate > 0`
- `currency` valid
- Expense date not in closed period unless override
- Cash account must match currency or have explicit conversion policy

---

## 6) Manual Inventory Adjustment

### Step-by-step logic
1. Authorized user selects product and adjustment type (IN/OUT) with reason.
2. System validates reason and quantity.
3. System creates inventory movement entry.
4. System updates product quantity and (if IN with cost) average cost.
5. System records detailed audit log including before/after quantities.

### Data created
- Inventory movement (`inventory_movements`) with `source_type='MANUAL_ADJUSTMENT'`
- Product snapshot updates (`products.current_qty`, maybe `avg_cost_base`)
- Audit event (`audit_logs`) with field-level before/after

### Tables affected
- `inventory_movements`
- `products`
- `audit_logs`

### Stock change
- Adjustment IN: `current_qty += qty`
- Adjustment OUT: `current_qty -= qty`
- Movement type: `ADJUSTMENT_IN` or `ADJUSTMENT_OUT`

### Cash change
- No direct cash effect

### Audit logging
- `action='MANUAL_ADJUSTMENT'`
- Must include reason, operator, prior qty, new qty, and approval marker if required

### Important validations
- Only privileged roles can adjust stock manually
- Reason is mandatory
- Qty must be > 0
- OUT adjustment cannot cause negative stock unless setting allows
- If IN includes value, unit cost must be provided for average-cost correctness

---

## 7) Daily Cash Closing

### Step-by-step logic
1. User (cashier/accountant) starts close procedure for selected business date/session.
2. System aggregates expected balances from opening + movements per cash account/currency.
3. User enters counted physical cash.
4. System computes variance (short/excess).
5. If variance exists, system posts `CLOSING_ADJUSTMENT` movement (with reason/approval).
6. System marks session/day as closed in operational settings/session table (implementation choice).
7. System writes audit logs and optional closure report snapshot.

### Data created
- Cash closing movement(s) for differences (`cash_movements`)
- Setting/session marker for closed date (stored in `settings` for MVP if no dedicated session table yet)
- Audit entries

### Tables affected
- `cash_movements`
- `settings` (or future `cash_sessions` table)
- `audit_logs`

### Stock change
- No stock impact

### Cash change
- Variance adjustment moves cash in/out to align book with physical count
- After closure, day’s balances become baseline for next opening

### Audit logging
- `action='UPDATE'` or dedicated close action metadata
- Include expected vs counted amounts and variance by account/currency

### Important validations
- Cannot close day twice
- Only authorized role can close
- All mandatory postings (or explicit pending exceptions) must be resolved first
- Any post-close edits require override and audit reason

---

## 8) Daily Profit and Loss (P&L) Calculation

### Calculation logic (for a specific date)
1. Sum **net sales revenue (base currency)** from active sales invoices for date.
2. Sum **COGS (base currency)** from active sales invoice items (`line_cogs_base`).
3. Sum **operating expenses (base currency)** from active expense records for date.
4. Compute:
   - `Gross Profit = Net Sales - COGS`
   - `Net Profit = Gross Profit - Operating Expenses`
5. Optionally display cash vs non-cash view if receivable/payable introduced later.

### Data created
- Usually no mandatory new transaction rows.
- Optional: store report snapshot in a report cache table (future enhancement).
- Audit log for report generation/export (optional but recommended).

### Tables affected (read-heavy)
- `sales_invoices` (filter `status='ACTIVE'`)
- `sales_invoice_items`
- `expenses` (filter `status='ACTIVE'`)
- Optional `audit_logs` if report access tracked

### Stock change
- None during report calculation

### Cash change
- None during report calculation (report is analytical)

### Audit logging
- Optional `action='CREATE'` or `VIEW_REPORT` metadata in `audit_logs` when report exported/printed

### Important validations
- Exclude `CANCELLED` documents from all report totals
- Use stored base amounts and stored COGS (do not recompute historical currency with latest rate)
- Ensure report date boundaries are explicit (`00:00:00` to `23:59:59` local time)
- If day is not closed, clearly mark report as provisional

---

## Recommended Transaction Boundaries (Implementation Note)

For data integrity, execute each posting/cancellation in one transaction:
1. Write header/items
2. Write stock/cash movements
3. Update product snapshot quantities/costs
4. Write audit logs
5. Commit

If any step fails, rollback all changes.
