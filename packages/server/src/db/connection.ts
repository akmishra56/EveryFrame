import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { runMigrations } from './schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = join(__dirname, '..', '..', 'data', 'everyframe.db');
const DB_PATH = process.env.EVERYFRAME_DB_PATH ?? DEFAULT_DB_PATH;

const dataDir = dirname(DB_PATH);
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

export const db = new Database(DB_PATH);
runMigrations(db);
