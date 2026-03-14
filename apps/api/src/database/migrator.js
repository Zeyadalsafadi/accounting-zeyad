import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

function listMigrationFiles(migrationsDir) {
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
}

function hasColumn(tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().some((column) => column.name === columnName);
}

function runCompatibilityGuards() {
  const userColumns = [
    { name: 'access_role', sql: 'ALTER TABLE users ADD COLUMN access_role TEXT' },
    { name: 'phone', sql: 'ALTER TABLE users ADD COLUMN phone TEXT' },
    { name: 'email', sql: 'ALTER TABLE users ADD COLUMN email TEXT' },
    { name: 'notes', sql: 'ALTER TABLE users ADD COLUMN notes TEXT' },
    { name: 'last_login_at', sql: 'ALTER TABLE users ADD COLUMN last_login_at TEXT' },
    { name: 'last_login_ip', sql: 'ALTER TABLE users ADD COLUMN last_login_ip TEXT' }
  ];

  for (const column of userColumns) {
    if (!hasColumn('users', column.name)) {
      db.exec(column.sql);
      console.log(`Applied compatibility guard: users.${column.name}`);
    }
  }

  const expenseColumns = [
    { name: 'beneficiary', sql: 'ALTER TABLE expenses ADD COLUMN beneficiary TEXT' },
    { name: 'notes', sql: 'ALTER TABLE expenses ADD COLUMN notes TEXT' }
  ];

  for (const column of expenseColumns) {
    if (!hasColumn('expenses', column.name)) {
      db.exec(column.sql);
      console.log(`Applied compatibility guard: expenses.${column.name}`);
    }
  }

  const customerCollectionColumns = [
    { name: 'received_syp', sql: 'ALTER TABLE customer_collections ADD COLUMN received_syp NUMERIC NOT NULL DEFAULT 0' },
    { name: 'received_usd', sql: 'ALTER TABLE customer_collections ADD COLUMN received_usd NUMERIC NOT NULL DEFAULT 0' },
    { name: 'exchange_rate_used', sql: 'ALTER TABLE customer_collections ADD COLUMN exchange_rate_used NUMERIC NOT NULL DEFAULT 1' },
    { name: 'total_settled_syp', sql: 'ALTER TABLE customer_collections ADD COLUMN total_settled_syp NUMERIC NOT NULL DEFAULT 0' },
    { name: 'syp_cash_account_id', sql: 'ALTER TABLE customer_collections ADD COLUMN syp_cash_account_id INTEGER' },
    { name: 'usd_cash_account_id', sql: 'ALTER TABLE customer_collections ADD COLUMN usd_cash_account_id INTEGER' }
  ];

  const customerCollectionsExists = db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'customer_collections'
  `).get();

  if (customerCollectionsExists) {
    for (const column of customerCollectionColumns) {
      if (!hasColumn('customer_collections', column.name)) {
        db.exec(column.sql);
        console.log(`Applied compatibility guard: customer_collections.${column.name}`);
      }
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      permission_key TEXT NOT NULL UNIQUE,
      module_name TEXT NOT NULL,
      action_name TEXT NOT NULL,
      label TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_key TEXT NOT NULL,
      permission_key TEXT NOT NULL,
      is_allowed INTEGER NOT NULL DEFAULT 1 CHECK (is_allowed IN (0,1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (role_key, permission_key),
      FOREIGN KEY (permission_key) REFERENCES permissions(permission_key) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_permission_overrides (
      user_id INTEGER NOT NULL,
      permission_key TEXT NOT NULL,
      is_allowed INTEGER NOT NULL CHECK (is_allowed IN (0,1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, permission_key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (permission_key) REFERENCES permissions(permission_key) ON DELETE CASCADE
    );
  `);
}

export function runMigrations() {
  db.exec(MIGRATIONS_TABLE_SQL);

  const migrationsDir = path.join(__dirname, 'migrations');
  const migrationFiles = listMigrationFiles(migrationsDir);

  const appliedNames = new Set(
    db.prepare('SELECT name FROM schema_migrations ORDER BY id').all().map((row) => row.name)
  );

  for (const fileName of migrationFiles) {
    if (appliedNames.has(fileName)) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, fileName), 'utf8');

    const applyMigration = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(fileName);
    });

    applyMigration();
    console.log(`Applied migration: ${fileName}`);
  }

  runCompatibilityGuards();
}
