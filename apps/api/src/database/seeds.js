import bcrypt from 'bcryptjs';
import { USER_ROLES } from '@paint-shop/shared';
import db from './client.js';
import { env } from '../config/env.js';
import { ensureAccessControlData, getLegacyRoleForAccessRole } from '../utils/accessControl.js';
import { ensureExchangeRateConfig } from '../utils/exchangeRate.js';

const BASIC_CATEGORIES = [
  { name_ar: 'دهانات داخلية', name_en: 'Interior Paints' },
  { name_ar: 'دهانات خارجية', name_en: 'Exterior Paints' },
  { name_ar: 'معاجين', name_en: 'Fillers' },
  { name_ar: 'فراشي ورولات', name_en: 'Brushes and Rollers' },
  { name_ar: 'مواد عزل', name_en: 'Waterproofing Materials' }
];

function upsertUser({ username, password, fullName, role }) {
  const existing = db.prepare('SELECT id, access_role FROM users WHERE username = ?').get(username);
  if (existing) {
    db.prepare(`
      UPDATE users
      SET access_role = COALESCE(access_role, ?), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(role, existing.id);
    return existing.id;
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare('INSERT INTO users (username, password_hash, full_name, role, access_role) VALUES (?, ?, ?, ?, ?)')
    .run(username, hash, fullName, getLegacyRoleForAccessRole(role), role);

  return result.lastInsertRowid;
}

export function seedUsers() {
  upsertUser({ username: 'admin', password: 'admin123', fullName: 'مدير النظام', role: USER_ROLES.ADMIN });
  upsertUser({ username: 'cashier', password: 'cashier123', fullName: 'موظف الكاشير', role: USER_ROLES.CASHIER });
}

export function seedSettings() {
  const baseCurrency = db.prepare('SELECT id FROM settings WHERE key = ?').get('BASE_CURRENCY');
  if (!baseCurrency) {
    db.prepare('INSERT INTO settings (key, value, value_type) VALUES (?, ?, ?)').run('BASE_CURRENCY', env.baseCurrency, 'STRING');
  }

  const allowNegativeCash = db.prepare('SELECT id FROM settings WHERE key = ?').get('ALLOW_NEGATIVE_CASH');
  if (!allowNegativeCash) {
    db.prepare('INSERT INTO settings (key, value, value_type) VALUES (?, ?, ?)').run('ALLOW_NEGATIVE_CASH', 'false', 'BOOLEAN');
  }

  ensureExchangeRateConfig();
  ensureAccessControlData();
}

export function seedBasicCategories() {
  const stmt = db.prepare('INSERT OR IGNORE INTO categories (name_ar, name_en) VALUES (?, ?)');

  const insertAll = db.transaction(() => {
    for (const item of BASIC_CATEGORIES) {
      stmt.run(item.name_ar, item.name_en);
    }
  });

  insertAll();
}

export function seedCashAccounts() {
  const stmt = db.prepare('INSERT OR IGNORE INTO cash_accounts (name, currency) VALUES (?, ?)');
  const addAll = db.transaction(() => {
    stmt.run('صندوق رئيسي - ليرة', 'SYP');
    stmt.run('صندوق رئيسي - دولار', 'USD');
  });
  addAll();
}

export function runSeeds() {
  seedUsers();
  seedSettings();
  console.log('Seed data applied.');
}
