# paint-shop-accounting-system

Clean foundation for the Paint Shop Accounting System MVP (Arabic-first, local-store focused).

## What is initialized
- Backend setup (Node.js + Express)
- Frontend setup (React + Vite, RTL Arabic)
- SQLite configuration (WAL + foreign keys)
- Environment configuration (`.env.example`)
- Shared constants package for currencies and roles
- Migration-based database layer with seed data
- Authentication and users module (RBAC: admin/cashier)
- Categories and products modules (create/edit/list/disable + product search)
- Suppliers and customers modules (create/edit/list/details + account balance support)
- Purchases module (create/list/details/cancel + stock/cost/cash/supplier effects)
- Sales module (create/list/details/cancel + stock/cost/cash/customer effects)
- Cash management module (balances, deposits, withdrawals, opening/closing, movement log)
- Expenses module (create/edit/list + cash posting + P&L input)

## Project structure
- `apps/api` → backend API foundation and database layer
- `apps/web` → frontend foundation
- `packages/shared` → reusable constants/types across backend/frontend
- `docs` → architecture, schema, and workflow design docs

## Authentication module
- Login with username/password
- Passwords hashed using `bcryptjs`
- JWT-based authentication
- Role-based access control:
  - `ADMIN`: full user management
  - `CASHIER`: operational access only
- Arabic login interface with protected frontend routes

## Default seed users
- Admin: `admin / admin123`
- Cashier: `cashier / cashier123`

## Database layer
- Migrations folder: `apps/api/src/database/migrations`
- Migration runner: `apps/api/src/database/migrator.js`
- Seed scripts: `apps/api/src/database/seeds.js`
- DB helpers: `apps/api/src/database/helpers.js`

### Migration strategy
1. Add incremental SQL files in `migrations/` with ordered prefixes (`001_`, `002_`, ...).
2. `schema_migrations` table tracks applied files.
3. `npm run db:init` applies pending migrations and seeds idempotently.

## Environment
Copy `.env.example` to `.env` and adjust as needed:
- `PORT`
- `JWT_SECRET`
- `DB_PATH`
- `BASE_CURRENCY`
- `VITE_API_BASE_URL`

## Run locally
1. Install dependencies: `npm install`
2. Initialize database: `npm run db:init`
3. Start backend + frontend: `npm run dev`


## Categories & Products
- Categories: create, edit, list, disable
- Products: create, edit, list, disable
- Product fields: name, category, sku, barcode, unit, purchase price, selling price, default currency, current stock, min stock alert, average cost, notes
- Product list supports search by name / SKU / barcode


## Suppliers & Customers
- Create, edit, list, and view details
- Fields: name, phone, address, opening balance, currency, notes
- Account balance support via opening/current balance fields


## Purchases Module
- Create purchase invoice with supplier, date, currency, exchange rate, items, discount, payment type, paid amount, remaining amount, notes
- Auto effects on posting: stock increase, average cost update, inventory movement records, cash movement (for paid), supplier balance update (for remaining)
- Supports safe cancellation that reverses inventory/cash/supplier impacts and marks invoice as cancelled


## Sales Module
- Create sales invoice with customer, date, currency, exchange rate, items, discount, payment type, paid amount, remaining amount, notes
- Auto effects on posting: stock decrease, cost by average cost, profit per item, inventory movement, cash receipt (if paid), customer balance update (if remaining)
- Supports safe cancellation that reverses inventory/cash/customer impacts and marks invoice as cancelled


## Cash Management Module
- Separate SYP and USD cash accounts
- List balances by account and currency
- Manual deposit and withdrawal
- Opening balance and closing adjustment support
- Cash movement log with filters
- Blocks negative cash operations by default unless `ALLOW_NEGATIVE_CASH=true`


## Expenses Module
- Create, edit, and list expenses
- Fields: date, type, amount, currency, exchange rate, base amount, beneficiary, notes
- On create/edit, writes corresponding cash movement entries
- Stored base amounts support P&L reporting
- Writes audit logs for create/update operations
