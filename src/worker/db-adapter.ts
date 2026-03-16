/**
 * Adapter that makes Cloudflare Durable Object SQLite API
 * look like better-sqlite3's Database interface.
 *
 * Services use:
 *   db.prepare(sql).run(obj | ...args)   → { changes: number }
 *   db.prepare(sql).get(...args)          → row | undefined
 *   db.prepare(sql).all(...args)          → row[]
 *   db.exec(sql)                          → void
 *   db.pragma(str)                        → void (no-op in DO)
 */

interface SqlStorage {
  exec<T = Record<string, unknown>>(query: string, ...bindings: unknown[]): SqlStorageCursor<T>;
}

interface SqlStorageCursor<T = Record<string, unknown>> {
  toArray(): T[];
  one(): T;
  readonly rowsRead: number;
  readonly rowsWritten: number;
  readonly columnNames: string[];
  [Symbol.iterator](): IterableIterator<T>;
}

interface RunResult {
  changes: number;
  lastInsertRowid?: number | bigint;
}

interface Statement {
  run(...args: unknown[]): RunResult;
  get(...args: unknown[]): unknown;
  all(...args: unknown[]): unknown[];
}

/** Parse @name placeholders → ? and return ordered param names */
function parseNamedParams(sql: string): { sql: string; names: string[] } {
  const names: string[] = [];
  const converted = sql.replace(/@(\w+)/g, (_, name: string) => {
    names.push(name);
    return '?';
  });
  return { sql: converted, names };
}

/** Resolve arguments: if SQL has @name params and first arg is an object, extract values in order */
function resolveArgs(names: string[], args: unknown[]): unknown[] {
  if (names.length > 0 && args.length === 1 && typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0])) {
    const obj = args[0] as Record<string, unknown>;
    return names.map((name) => obj[name]);
  }
  return args;
}

export function createDOAdapter(sql: SqlStorage) {
  return {
    prepare(query: string): Statement {
      const { sql: convertedSql, names } = parseNamedParams(query);

      return {
        run(...args: unknown[]): RunResult {
          const resolved = resolveArgs(names, args);
          const cursor = sql.exec(convertedSql, ...resolved);
          return { changes: cursor.rowsWritten };
        },

        get(...args: unknown[]): unknown {
          const resolved = resolveArgs(names, args);
          const rows = sql.exec(convertedSql, ...resolved).toArray();
          return rows.length > 0 ? rows[0] : undefined;
        },

        all(...args: unknown[]): unknown[] {
          const resolved = resolveArgs(names, args);
          return sql.exec(convertedSql, ...resolved).toArray();
        },
      };
    },

    exec(query: string): void {
      sql.exec(query);
    },

    pragma(_str: string): void {
      // DO SQLite manages WAL/journal internally.
      // Foreign keys: we enable via exec below.
    },
  };
}

/** Initialize DB schema using the same migrations as the Node.js version */
export function initSchema(sql: SqlStorage): void {
  const db = createDOAdapter(sql);

  // Enable foreign keys
  sql.exec('PRAGMA foreign_keys = ON');

  // Create migrations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Check which migrations have been applied
  const applied = new Set(
    db.prepare('SELECT name FROM _migrations').all()
      .map((row) => (row as { name: string }).name)
  );

  // Run migrations inline (same DDL as the migration files)
  const migrations = [
    { id: 1, name: '001-init', fn: migration001 },
    { id: 2, name: '002-scheduler', fn: migration002 },
    { id: 3, name: '003-intentions-states-sessions', fn: migration003 },
  ];

  for (const migration of migrations) {
    if (!applied.has(migration.name)) {
      migration.fn(db);
      db.prepare('INSERT INTO _migrations (id, name) VALUES (?, ?)').run(migration.id, migration.name);
    }
  }
}

// Inline migration functions (same SQL as src/db/migrations/)
// Using inline to avoid importing Node.js-dependent modules

function migration001(db: { exec: (sql: string) => void }): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id            TEXT PRIMARY KEY,
      content       TEXT NOT NULL,
      type          TEXT NOT NULL CHECK(type IN ('note','feedback','project','reference','decision','snippet')),
      tags          TEXT NOT NULL DEFAULT '[]',
      project       TEXT NOT NULL DEFAULT 'global',
      metadata      TEXT NOT NULL DEFAULT '{}',
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content, tags, project,
      content=memories, content_rowid=rowid
    );

    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, content, tags, project)
      VALUES (new.rowid, new.content, new.tags, new.project);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, tags, project)
      VALUES ('delete', old.rowid, old.content, old.tags, old.project);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, tags, project)
      VALUES ('delete', old.rowid, old.content, old.tags, old.project);
      INSERT INTO memories_fts(rowid, content, tags, project)
      VALUES (new.rowid, new.content, new.tags, new.project);
    END;

    CREATE TABLE IF NOT EXISTS entities (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      type          TEXT NOT NULL CHECK(type IN ('person','project','organization','tool','concept')),
      description   TEXT NOT NULL DEFAULT '',
      properties    TEXT NOT NULL DEFAULT '{}',
      project       TEXT NOT NULL DEFAULT 'global',
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS entity_memory_links (
      entity_id     TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      memory_id     TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
      relation      TEXT NOT NULL DEFAULT 'related',
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (entity_id, memory_id)
    );

    CREATE TABLE IF NOT EXISTS project_context (
      id            TEXT PRIMARY KEY,
      project       TEXT NOT NULL,
      key           TEXT NOT NULL,
      value         TEXT NOT NULL,
      content_type  TEXT NOT NULL DEFAULT 'text',
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project, key)
    );

    CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project);
    CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
    CREATE INDEX IF NOT EXISTS idx_entities_project ON entities(project);
    CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
    CREATE INDEX IF NOT EXISTS idx_project_context_project ON project_context(project);
  `);
}

function migration002(db: { exec: (sql: string) => void }): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      description   TEXT NOT NULL DEFAULT '',
      schedule      TEXT NOT NULL,
      action        TEXT NOT NULL,
      project       TEXT NOT NULL DEFAULT 'global',
      enabled       INTEGER NOT NULL DEFAULT 1,
      last_run_at   TEXT,
      next_run_at   TEXT,
      run_count     INTEGER NOT NULL DEFAULT 0,
      last_result   TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_project ON scheduled_tasks(project);
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_enabled ON scheduled_tasks(enabled);
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_run ON scheduled_tasks(next_run_at);
  `);
}

function migration003(db: { exec: (sql: string) => void }): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS intentions (
      id                TEXT PRIMARY KEY,
      title             TEXT NOT NULL,
      status            TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','waiting','blocked','resolved','abandoned')),
      context           TEXT NOT NULL DEFAULT '',
      next_action       TEXT NOT NULL DEFAULT '',
      priority          TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high','medium','low')),
      project           TEXT NOT NULL DEFAULT 'global',
      resolve_reason    TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS intention_triggers (
      id                TEXT PRIMARY KEY,
      intention_id      TEXT NOT NULL REFERENCES intentions(id) ON DELETE CASCADE,
      condition_type    TEXT NOT NULL CHECK(condition_type IN ('keyword','date','entity_update','time_elapsed','custom')),
      condition_value   TEXT NOT NULL,
      last_checked_at   TEXT,
      last_triggered_at TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS intention_entity_links (
      intention_id      TEXT NOT NULL REFERENCES intentions(id) ON DELETE CASCADE,
      entity_id         TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (intention_id, entity_id)
    );

    CREATE TABLE IF NOT EXISTS intention_memory_links (
      intention_id      TEXT NOT NULL REFERENCES intentions(id) ON DELETE CASCADE,
      memory_id         TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (intention_id, memory_id)
    );

    CREATE TABLE IF NOT EXISTS project_states (
      id                TEXT PRIMARY KEY,
      project           TEXT NOT NULL UNIQUE,
      phase             TEXT NOT NULL DEFAULT '',
      phase_status      TEXT NOT NULL DEFAULT 'not_started' CHECK(phase_status IN ('not_started','in_progress','completed','paused')),
      started_at        TEXT,
      target_end        TEXT,
      milestones        TEXT NOT NULL DEFAULT '[]',
      blockers          TEXT NOT NULL DEFAULT '[]',
      current_focus     TEXT NOT NULL DEFAULT '',
      anti_patterns     TEXT NOT NULL DEFAULT '[]',
      metadata          TEXT NOT NULL DEFAULT '{}',
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS project_state_history (
      id                TEXT PRIMARY KEY,
      project           TEXT NOT NULL,
      snapshot          TEXT NOT NULL,
      change_summary    TEXT NOT NULL DEFAULT '',
      session_id        TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id                TEXT PRIMARY KEY,
      project           TEXT NOT NULL DEFAULT 'global',
      started_at        TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at          TEXT,
      summary           TEXT,
      next_session_notes TEXT,
      open_items        TEXT NOT NULL DEFAULT '[]',
      intentions_updated TEXT NOT NULL DEFAULT '[]',
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS entity_links (
      id                TEXT PRIMARY KEY,
      source_entity_id  TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      target_entity_id  TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      relation          TEXT NOT NULL,
      properties        TEXT NOT NULL DEFAULT '{}',
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(source_entity_id, target_entity_id, relation)
    );

    CREATE TABLE IF NOT EXISTS entity_timeline (
      id                TEXT PRIMARY KEY,
      entity_id         TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      event             TEXT NOT NULL,
      event_date        TEXT NOT NULL,
      metadata          TEXT NOT NULL DEFAULT '{}',
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_intentions_status ON intentions(status);
    CREATE INDEX IF NOT EXISTS idx_intentions_project ON intentions(project);
    CREATE INDEX IF NOT EXISTS idx_intentions_priority ON intentions(priority);
    CREATE INDEX IF NOT EXISTS idx_intention_triggers_intention ON intention_triggers(intention_id);
    CREATE INDEX IF NOT EXISTS idx_project_states_project ON project_states(project);
    CREATE INDEX IF NOT EXISTS idx_project_state_history_project ON project_state_history(project);
    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project);
    CREATE INDEX IF NOT EXISTS idx_entity_links_source ON entity_links(source_entity_id);
    CREATE INDEX IF NOT EXISTS idx_entity_links_target ON entity_links(target_entity_id);
    CREATE INDEX IF NOT EXISTS idx_entity_timeline_entity ON entity_timeline(entity_id);
    CREATE INDEX IF NOT EXISTS idx_entity_timeline_date ON entity_timeline(event_date);
  `);
}
