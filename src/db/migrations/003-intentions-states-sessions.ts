import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    -- Intentions: open loops with lifecycle
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

    -- Intention trigger conditions
    CREATE TABLE IF NOT EXISTS intention_triggers (
      id                TEXT PRIMARY KEY,
      intention_id      TEXT NOT NULL REFERENCES intentions(id) ON DELETE CASCADE,
      condition_type    TEXT NOT NULL CHECK(condition_type IN ('keyword','date','entity_update','time_elapsed','custom')),
      condition_value   TEXT NOT NULL,
      last_checked_at   TEXT,
      last_triggered_at TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Intention to entity links
    CREATE TABLE IF NOT EXISTS intention_entity_links (
      intention_id      TEXT NOT NULL REFERENCES intentions(id) ON DELETE CASCADE,
      entity_id         TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (intention_id, entity_id)
    );

    -- Intention to memory links
    CREATE TABLE IF NOT EXISTS intention_memory_links (
      intention_id      TEXT NOT NULL REFERENCES intentions(id) ON DELETE CASCADE,
      memory_id         TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (intention_id, memory_id)
    );

    -- Structured project state (current snapshot)
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

    -- Project state history (append-only)
    CREATE TABLE IF NOT EXISTS project_state_history (
      id                TEXT PRIMARY KEY,
      project           TEXT NOT NULL,
      snapshot          TEXT NOT NULL,
      change_summary    TEXT NOT NULL DEFAULT '',
      session_id        TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Sessions (handoff protocol)
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

    -- Entity-to-entity relationships
    CREATE TABLE IF NOT EXISTS entity_links (
      id                TEXT PRIMARY KEY,
      source_entity_id  TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      target_entity_id  TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      relation          TEXT NOT NULL,
      properties        TEXT NOT NULL DEFAULT '{}',
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(source_entity_id, target_entity_id, relation)
    );

    -- Entity timeline (chronological events)
    CREATE TABLE IF NOT EXISTS entity_timeline (
      id                TEXT PRIMARY KEY,
      entity_id         TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      event             TEXT NOT NULL,
      event_date        TEXT NOT NULL,
      metadata          TEXT NOT NULL DEFAULT '{}',
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Indexes
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
