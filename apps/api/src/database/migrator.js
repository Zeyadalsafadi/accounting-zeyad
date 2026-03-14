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
}