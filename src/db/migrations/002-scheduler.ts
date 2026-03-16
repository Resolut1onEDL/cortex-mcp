import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      description   TEXT NOT NULL DEFAULT '',
      schedule      TEXT NOT NULL,           -- cron expression or 'once'
      action        TEXT NOT NULL,            -- JSON: { type, params }
      project       TEXT NOT NULL DEFAULT 'global',
      enabled       INTEGER NOT NULL DEFAULT 1,
      last_run_at   TEXT,
      next_run_at   TEXT,
      run_count     INTEGER NOT NULL DEFAULT 0,
      last_result   TEXT,                     -- JSON: last execution result
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_project ON scheduled_tasks(project);
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_enabled ON scheduled_tasks(enabled);
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_run ON scheduled_tasks(next_run_at);
  `);
}
