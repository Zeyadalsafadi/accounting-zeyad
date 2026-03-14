import db from '../db.js';

export function writeAuditLog({ userId = null, entityName, entityId = null, action, reason = null, metadata = null }) {
  db.prepare(`
    INSERT INTO audit_logs (user_id, entity_name, entity_id, action, reason, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, entityName, entityId, action, reason, metadata ? JSON.stringify(metadata) : null);
}
