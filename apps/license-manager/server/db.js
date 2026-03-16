import Database from 'better-sqlite3';
import { DEFAULT_SETTINGS } from './defaults.js';
import { getDatabasePath } from './storage.js';

const db = new Database(getDatabasePath());
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS key_store (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    public_key_pem TEXT NOT NULL,
    public_key_path TEXT NOT NULL,
    private_key_path TEXT,
    public_key_fingerprint TEXT NOT NULL,
    private_key_fingerprint TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    license_id TEXT NOT NULL,
    plan_code TEXT NOT NULL,
    issued_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    grace_days INTEGER NOT NULL DEFAULT 0,
    max_devices INTEGER,
    enabled_modules_json TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    final_token TEXT NOT NULL,
    signing_key_fingerprint TEXT NOT NULL,
    status_tag TEXT NOT NULL DEFAULT 'active',
    relation_type TEXT NOT NULL DEFAULT 'issued',
    parent_license_record_id INTEGER,
    replaced_by_license_record_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (parent_license_record_id) REFERENCES licenses(id),
    FOREIGN KEY (replaced_by_license_record_id) REFERENCES licenses(id)
  );

  CREATE TABLE IF NOT EXISTS license_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_record_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    event_data_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (license_record_id) REFERENCES licenses(id)
  );

  CREATE INDEX IF NOT EXISTS idx_key_store_active ON key_store(is_active, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(customer_name);
  CREATE INDEX IF NOT EXISTS idx_licenses_license_id ON licenses(license_id);
  CREATE INDEX IF NOT EXISTS idx_licenses_expires_at ON licenses(expires_at);
  CREATE INDEX IF NOT EXISTS idx_licenses_status_tag ON licenses(status_tag);
`);

const upsertSetting = db.prepare(`
  INSERT OR IGNORE INTO app_settings (key, value, updated_at)
  VALUES (?, ?, CURRENT_TIMESTAMP)
`);

upsertSetting.run('keyStoragePath', DEFAULT_SETTINGS.keyStoragePath);
upsertSetting.run('defaultGraceDays', String(DEFAULT_SETTINGS.defaultGraceDays));
upsertSetting.run('expiringSoonDays', String(DEFAULT_SETTINGS.expiringSoonDays));
upsertSetting.run('licenseIdPrefix', DEFAULT_SETTINGS.licenseIdPrefix);
upsertSetting.run('planTemplates', JSON.stringify(DEFAULT_SETTINGS.planTemplates));

export default db;
