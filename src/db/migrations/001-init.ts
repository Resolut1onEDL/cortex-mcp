import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    -- Memories table
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

    -- FTS5 virtual table for full-text search on memories
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content,
      tags,
      project,
      content=memories,
      content_rowid=rowid
    );

    -- Triggers to keep FTS in sync
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

    -- Entities table
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

    -- Entity-Memory links
    CREATE TABLE IF NOT EXISTS entity_memory_links (
      entity_id     TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      memory_id     TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
      relation      TEXT NOT NULL DEFAULT 'related',
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (entity_id, memory_id)
    );

    -- Project context (key-value per project)
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

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project);
    CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
    CREATE INDEX IF NOT EXISTS idx_entities_project ON entities(project);
    CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
    CREATE INDEX IF NOT EXISTS idx_project_context_project ON project_context(project);
  `);
}
