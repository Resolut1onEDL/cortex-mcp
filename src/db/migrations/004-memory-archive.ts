import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    ALTER TABLE memories ADD COLUMN archived_at TEXT DEFAULT NULL;
    CREATE INDEX IF NOT EXISTS idx_memories_archived ON memories(archived_at);
  `);
}
