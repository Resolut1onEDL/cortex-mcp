import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { up as migration001 } from './migrations/001-init.js';
import { up as migration002 } from './migrations/002-scheduler.js';
import { up as migration003 } from './migrations/003-intentions-states-sessions.js';
import { up as migration004 } from './migrations/004-memory-archive.js';

let db: Database.Database | null = null;

const DEFAULT_DB_DIR = join(homedir(), '.cortex-mcp');
const DEFAULT_DB_PATH = join(DEFAULT_DB_DIR, 'cortex.db');

export function getDbPath(customPath?: string): string {
  return customPath || DEFAULT_DB_PATH;
}

export function getDb(customPath?: string): Database.Database {
  if (db) return db;

  const dbPath = getDbPath(customPath);
  const dir = dirname(dbPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);

  return db;
}

function runMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const migrations = [
    { id: 1, name: '001-init', fn: migration001 },
    { id: 2, name: '002-scheduler', fn: migration002 },
    { id: 3, name: '003-intentions-states-sessions', fn: migration003 },
    { id: 4, name: '004-memory-archive', fn: migration004 },
  ];

  const applied = new Set(
    database.prepare('SELECT name FROM _migrations').all()
      .map((row) => (row as { name: string }).name)
  );

  for (const migration of migrations) {
    if (!applied.has(migration.name)) {
      migration.fn(database);
      database.prepare('INSERT INTO _migrations (id, name) VALUES (?, ?)').run(migration.id, migration.name);
    }
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
