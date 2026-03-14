ALTER TABLE users ADD COLUMN access_role TEXT;
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN notes TEXT;
ALTER TABLE users ADD COLUMN last_login_at TEXT;
ALTER TABLE users ADD COLUMN last_login_ip TEXT;

UPDATE users
SET access_role = role
WHERE access_role IS NULL OR access_role = '';

CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  permission_key TEXT NOT NULL UNIQUE,
  module_name TEXT NOT NULL,
  action_name TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_key TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  is_allowed INTEGER NOT NULL DEFAULT 1 CHECK (is_allowed IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role_key, permission_key),
  FOREIGN KEY (permission_key) REFERENCES permissions(permission_key) ON DELETE CASCADE
);

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
