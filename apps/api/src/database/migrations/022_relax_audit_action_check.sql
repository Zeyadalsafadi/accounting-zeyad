PRAGMA foreign_keys = OFF;

ALTER TABLE audit_logs RENAME TO audit_logs_legacy;

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER,
  entity_name TEXT NOT NULL,
  entity_id INTEGER,
  action TEXT NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  metadata_json TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO audit_logs (
  id,
  event_time,
  user_id,
  entity_name,
  entity_id,
  action,
  field_name,
  old_value,
  new_value,
  reason,
  metadata_json
)
SELECT
  id,
  event_time,
  user_id,
  entity_name,
  entity_id,
  action,
  field_name,
  old_value,
  new_value,
  reason,
  metadata_json
FROM audit_logs_legacy;

DROP TABLE audit_logs_legacy;

CREATE INDEX IF NOT EXISTS idx_audit_event_time ON audit_logs(event_time);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_name, entity_id, event_time);

PRAGMA foreign_keys = ON;
