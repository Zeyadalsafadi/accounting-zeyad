import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';

const dbDirectory = path.dirname(env.dbPath);
fs.mkdirSync(dbDirectory, { recursive: true });

const client = new Database(env.dbPath);
client.pragma('journal_mode = WAL');
client.pragma('foreign_keys = ON');

export default client;
