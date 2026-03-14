import db from '../db.js';

const EXCHANGE_RATE_DEFAULTS = {
  mode: 'MANUAL',
  manualRate: 1,
  activeRate: 1,
  source: 'MANUAL',
  lastUpdatedAt: null,
  autoStatus: 'IDLE',
  lastSyncAt: null,
  lastError: null
};

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function writeExchangeRateConfig(config) {
  const serialized = JSON.stringify(config);
  const existing = db.prepare('SELECT id FROM settings WHERE key = ?').get('EXCHANGE_RATE_CONFIG');

  if (existing) {
    db.prepare('UPDATE settings SET value = ?, value_type = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?')
      .run(serialized, 'JSON', 'EXCHANGE_RATE_CONFIG');
    return;
  }

  db.prepare('INSERT INTO settings (key, value, value_type) VALUES (?, ?, ?)')
    .run('EXCHANGE_RATE_CONFIG', serialized, 'JSON');
}

export function ensureExchangeRateConfig() {
  const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get('EXCHANGE_RATE_CONFIG');
  if (!existing) {
    writeExchangeRateConfig(EXCHANGE_RATE_DEFAULTS);
  }
}

export function getExchangeRateConfig() {
  ensureExchangeRateConfig();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('EXCHANGE_RATE_CONFIG');
  const parsed = safeJsonParse(row?.value, {});
  return { ...EXCHANGE_RATE_DEFAULTS, ...parsed };
}

export function saveExchangeRateConfig(partialConfig) {
  const current = getExchangeRateConfig();
  const next = { ...current, ...partialConfig };
  writeExchangeRateConfig(next);
  return next;
}

export function getRateForCurrency(currency) {
  if (currency === 'SYP') return 1;
  if (currency === 'USD') return Number(getExchangeRateConfig().activeRate || 0);
  return 0;
}

export async function refreshAutomaticExchangeRate() {
  const current = getExchangeRateConfig();
  const now = new Date().toISOString();

  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = await response.json();
    const nextRate = Number(payload?.rates?.SYP || 0);
    if (!(nextRate > 0)) throw new Error('تعذر قراءة سعر صرف صالح');

    return saveExchangeRateConfig({
      mode: 'AUTO',
      activeRate: nextRate,
      source: payload?.provider || 'open.er-api.com',
      lastUpdatedAt: now,
      autoStatus: 'SUCCESS',
      lastSyncAt: now,
      lastError: null
    });
  } catch (error) {
    return saveExchangeRateConfig({
      mode: current.mode === 'AUTO' ? 'AUTO' : current.mode,
      autoStatus: 'FAILED',
      lastError: error.message || 'فشل تحديث سعر الصرف',
      lastSyncAt: now
    });
  }
}
