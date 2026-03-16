CREATE TABLE IF NOT EXISTS license_device_registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  device_name TEXT,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_user_id INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  UNIQUE (license_id, device_id),
  FOREIGN KEY (last_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_license_device_registrations_license
  ON license_device_registrations (license_id, is_active, last_seen_at DESC);
