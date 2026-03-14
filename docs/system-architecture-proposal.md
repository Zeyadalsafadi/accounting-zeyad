# Paint Shop Accounting System - Recommended Architecture (MVP)

## 1) Recommended Architecture

### Architecture Style
Use a **modular monolith** with three deployable parts for MVP:

1. **React Frontend** (Arabic RTL UI)
2. **Node.js Backend API** (business rules + validation + reporting)
3. **SQLite Database** (single local-store data file)

This gives the best balance for a small local store:
- Easy setup and maintenance (single backend process + single database file)
- Low cost and low operational complexity
- Strong enough domain boundaries to split into microservices later if needed

### Deployment Topology (Single Store)
- One local machine acts as the main server (or desktop app host)
- Backend runs as a local service (`localhost` or LAN IP)
- Frontend is served by backend (or separate static build)
- Cashier/admin access via browser on same machine (or local LAN)

### Why This Fits Your Requirements
- **Small local store:** minimal infrastructure, fast onboarding
- **Simple maintenance:** SQLite backup is easy; no DB server administration
- **Arabic interface:** React + RTL libraries support Arabic UX well
- **Preferred stack:** React + Node.js + SQLite directly satisfied

---

## 2) Folder Structure

```text
paint-shop-accounting-system/
  apps/
    web/                            # React app (Arabic RTL)
      src/
        app/
          routes/
          layout/
          providers/
        features/
          products/
          purchases/
          sales/
          inventory/
          cash-register/
          expenses/
          reports/
          audit/
          settings/
        shared/
          components/
          hooks/
          utils/
          i18n/
      public/
      package.json

    api/                            # Node.js backend (modular monolith)
      src/
        main.ts
        config/
        common/
          middleware/
          errors/
          dto/
          utils/
        modules/
          auth/
          users/
          products/
          purchases/
          sales/
          inventory/
          cash-register/
          expenses/
          reports/
          exchange-rates/
          audit-log/
          settings/
        database/
          migrations/
          seeds/
          sqlite/
      package.json

  packages/
    shared-types/                   # Shared TS types between web/api
    business-rules/                 # Optional reusable valuation/currency logic

  docs/
    system-architecture-proposal.md
    api-contract.md
    data-dictionary.md

  scripts/
    backup-db.sh
    restore-db.sh
    start-local.sh

  .env.example
  docker-compose.local.yml          # optional for reproducible local setup
  README.md
```

---

## 3) Frontend Pages (React, Arabic-first)

### Core Pages
1. **تسجيل الدخول (Login)**
2. **لوحة التحكم (Dashboard)**
   - Today's sales, expenses, cash, low-stock, quick actions
3. **المنتجات (Products)**
   - List, create, edit, deactivate, stock summary
4. **المشتريات (Purchases)**
   - Create purchase invoice, list invoices, cancel invoice
5. **المبيعات / نقطة البيع (Sales / POS)**
   - Fast item search/barcode, cart, payment, print invoice
6. **المخزون (Inventory)**
   - Stock ledger, adjustments (with reason), low-stock alerts
7. **الصندوق (Cash Register)**
   - Open day, cash in/out, close day, balance by currency
8. **المصاريف اليومية (Daily Expenses)**
   - Create/list expenses by category and currency
9. **التقارير (Reports)**
   - Daily P&L, inventory valuation, sales summary, cash movement
10. **سجل التدقيق (Audit Log)**
    - Manual edits with before/after, user, timestamp, reason
11. **الإعدادات (Settings)**
    - Store profile, base currency, users/roles, exchange-rate defaults

### UI Guidelines
- RTL layout by default
- Arabic labels and date/currency formatting
- Consistent keyboard-friendly flows for cashier speed

---

## 4) Backend Modules

Use domain modules with clear boundaries:

1. **Auth & Users**
   - Login, permissions, roles (owner/cashier/accountant)
2. **Products**
   - Product CRUD, SKU rules, active/inactive states
3. **Purchases**
   - Purchase invoices, cancellation, supplier references
4. **Sales**
   - Sales invoices/POS, cancellation, payment registration
5. **Inventory**
   - Stock ledger, average-cost engine, adjustments
6. **Cash Register**
   - Session open/close, cash movements, drawer balance
7. **Expenses**
   - Expense categories and daily expense records
8. **Reports**
   - Daily P&L, inventory valuation, sales and cash summaries
9. **Exchange Rates**
   - Daily rates (SYP/USD), locked rate per transaction
10. **Audit Log**
    - Track manual edits and critical lifecycle events
11. **Settings**
    - Base settings and business-rule toggles

### Cross-cutting Rules Layer
A shared business-rules layer should enforce:
- weighted average cost calculations
- currency conversion integrity
- no hard delete for invoices
- cancellation reversal logic
- stock guardrails (no negative stock unless explicitly enabled)

---

## 5) API Structure

Prefer REST for MVP simplicity.

### API Versioning
- Prefix all routes with `/api/v1`

### Sample Route Design
- `POST /api/v1/auth/login`
- `GET /api/v1/products`
- `POST /api/v1/products`
- `PATCH /api/v1/products/:id`

- `POST /api/v1/purchases`
- `GET /api/v1/purchases`
- `POST /api/v1/purchases/:id/cancel`

- `POST /api/v1/sales`
- `GET /api/v1/sales`
- `POST /api/v1/sales/:id/cancel`

- `GET /api/v1/inventory/stock`
- `GET /api/v1/inventory/movements`
- `POST /api/v1/inventory/adjustments`

- `POST /api/v1/cash-register/open`
- `POST /api/v1/cash-register/close`
- `POST /api/v1/cash-register/transactions`

- `POST /api/v1/expenses`
- `GET /api/v1/expenses`

- `GET /api/v1/reports/daily-pnl?date=YYYY-MM-DD`
- `GET /api/v1/reports/inventory-valuation?date=YYYY-MM-DD`

- `GET /api/v1/audit-log`

### Response Convention
Use consistent envelope:

```json
{
  "success": true,
  "data": {},
  "meta": {},
  "error": null
}
```

### Validation & Transaction Safety
- DTO validation for all writes
- DB transactions for invoice create/cancel operations
- Idempotency key for critical POSTs (recommended)

---

## 6) Database Strategy (SQLite-First)

### Core Approach
- Use **SQLite** for MVP with migration-based schema control
- Use Write-Ahead Logging (WAL) mode for better concurrency
- Enforce foreign keys and constraints

### Data Modeling Principles
1. **Immutable financial history**
   - Never hard-delete invoices
   - Keep status (`ACTIVE`, `CANCELLED`)
2. **Ledger-style movements**
   - Inventory and cash should be append-only movement tables
3. **Currency completeness per transaction**
   - Store:
     - `original_currency`
     - `original_amount`
     - `exchange_rate`
     - `base_amount`
4. **Auditability**
   - Track `created_by`, `updated_by`, timestamps
   - Manual edit events in `audit_log`

### Suggested Core Tables
- `users`, `roles`
- `products`, `product_categories`
- `purchase_invoices`, `purchase_invoice_lines`
- `sales_invoices`, `sales_invoice_lines`
- `inventory_movements`
- `cash_sessions`, `cash_transactions`
- `expenses`, `expense_categories`
- `exchange_rates`
- `audit_log`
- `settings`

### Backup Strategy
- Automated daily DB snapshot (`.db` + WAL-safe backup process)
- On-demand backup before closing day
- Optional encrypted backup copy to external drive

---

## 7) Keeping It Modular for Future Expansion

1. **Module boundaries from day one**
   - Keep each domain in its own folder/service/repository layer
   - No direct cross-module table updates without service interfaces

2. **Use ports/adapters pattern lightly**
   - Domain services depend on interfaces, not concrete DB libs
   - Makes migration from SQLite to PostgreSQL easier later

3. **Centralize critical business rules**
   - Average cost and currency math in dedicated shared services
   - Avoid duplicated formulas across controllers

4. **Event-ready architecture (without overengineering)**
   - Emit internal domain events (e.g., `sale.created`, `invoice.cancelled`)
   - Start in-process now, can move to message broker later

5. **API versioning discipline**
   - Keep `/api/v1` contract stable
   - Introduce `/api/v2` for breaking changes

6. **Feature flags/configuration table**
   - Toggle future behavior (multi-branch, receivables workflow) safely

7. **Migration path for growth**
   - Phase 1: single store + SQLite
   - Phase 2: multi-terminal local network + SQLite/PostgreSQL option
   - Phase 3: multi-branch cloud sync with central PostgreSQL

---

## Recommended Implementation Order
1. Product + Inventory movement foundation
2. Purchase flow + average cost updates
3. Sales/POS flow + COGS
4. Cash register and expense tracking
5. Daily P&L report
6. Audit log and role permissions
7. Backup/restore and operational hardening

This order ensures financial correctness first, then usability and controls.
