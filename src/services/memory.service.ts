import type Database from 'better-sqlite3';
import type { MemoryRow, MemoryType } from '../db/schema.js';
import { generateId } from '../utils/id.js';

export class MemoryService {
  constructor(private db: Database.Database) {}

  store(params: {
    content: string;
    type?: MemoryType;
    tags?: string[];
    project?: string;
    metadata?: Record<string, string>;
  }): MemoryRow {
    const id = generateId('mem');
    const now = new Date().toISOString();
    const row: MemoryRow = {
      id,
      content: params.content,
      type: params.type || 'note',
      tags: JSON.stringify(params.tags || []),
      project: params.project || 'global',
      metadata: JSON.stringify(params.metadata || {}),
      archived_at: null,
      created_at: now,
      updated_at: now,
    };

    this.db.prepare(`
      INSERT INTO memories (id, content, type, tags, project, metadata, created_at, updated_at)
      VALUES (@id, @content, @type, @tags, @project, @metadata, @created_at, @updated_at)
    `).run(row);

    return row;
  }

  search(params: {
    query: string;
    project?: string;
    type?: MemoryType;
    tags?: string[];
    limit?: number;
    include_archived?: boolean;
  }): MemoryRow[] {
    let sql = `
      SELECT m.*, bm25(memories_fts) as rank
      FROM memories m
      JOIN memories_fts ON memories_fts.rowid = m.rowid
      WHERE memories_fts MATCH ?
    `;
    const bindings: unknown[] = [params.query];

    if (!params.include_archived) {
      sql += ' AND m.archived_at IS NULL';
    }

    if (params.project) {
      sql += ' AND m.project = ?';
      bindings.push(params.project);
    }
    if (params.type) {
      sql += ' AND m.type = ?';
      bindings.push(params.type);
    }

    sql += ' ORDER BY rank LIMIT ?';
    bindings.push(params.limit || 10);

    let results = this.db.prepare(sql).all(...bindings) as MemoryRow[];

    if (params.tags && params.tags.length > 0) {
      results = results.filter((row) => {
        const rowTags: string[] = JSON.parse(row.tags);
        return params.tags!.every((t) => rowTags.includes(t));
      });
    }

    return results;
  }

  list(params: {
    project?: string;
    type?: MemoryType;
    limit?: number;
    offset?: number;
    include_archived?: boolean;
  }): MemoryRow[] {
    let sql = 'SELECT * FROM memories WHERE 1=1';
    const bindings: unknown[] = [];

    if (!params.include_archived) {
      sql += ' AND archived_at IS NULL';
    }

    if (params.project) {
      sql += ' AND project = ?';
      bindings.push(params.project);
    }
    if (params.type) {
      sql += ' AND type = ?';
      bindings.push(params.type);
    }

    sql += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    bindings.push(params.limit || 20);
    bindings.push(params.offset || 0);

    return this.db.prepare(sql).all(...bindings) as MemoryRow[];
  }

  get(id: string): MemoryRow | undefined {
    return this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as MemoryRow | undefined;
  }

  update(params: {
    id: string;
    content?: string;
    type?: MemoryType;
    tags?: string[];
    metadata?: Record<string, string>;
  }): MemoryRow | undefined {
    const existing = this.get(params.id);
    if (!existing) return undefined;

    const updated = {
      content: params.content ?? existing.content,
      type: params.type ?? existing.type,
      tags: params.tags ? JSON.stringify(params.tags) : existing.tags,
      metadata: params.metadata ? JSON.stringify(params.metadata) : existing.metadata,
      updated_at: new Date().toISOString(),
      id: params.id,
    };

    this.db.prepare(`
      UPDATE memories
      SET content = @content, type = @type, tags = @tags, metadata = @metadata, updated_at = @updated_at
      WHERE id = @id
    `).run(updated);

    return this.get(params.id);
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);
    return result.changes > 0;
  }

  archive(params: {
    older_than_days?: number;
    ids?: string[];
    project?: string;
  }): { archived_count: number; archived_ids: string[] } {
    const ids: string[] = [];

    if (params.ids && params.ids.length > 0) {
      // Archive specific memories
      for (const id of params.ids) {
        const result = this.db.prepare(
          "UPDATE memories SET archived_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND archived_at IS NULL"
        ).run(id);
        if (result.changes > 0) ids.push(id);
      }
    } else if (params.older_than_days) {
      // Archive memories older than N days
      let sql = `
        UPDATE memories SET archived_at = datetime('now'), updated_at = datetime('now')
        WHERE archived_at IS NULL
        AND updated_at < datetime('now', ?)
      `;
      const bindings: unknown[] = [`-${params.older_than_days} days`];

      if (params.project) {
        sql += ' AND project = ?';
        bindings.push(params.project);
      }

      // Get IDs first
      let selectSql = `
        SELECT id FROM memories
        WHERE archived_at IS NULL
        AND updated_at < datetime('now', ?)
      `;
      const selectBindings: unknown[] = [`-${params.older_than_days} days`];
      if (params.project) {
        selectSql += ' AND project = ?';
        selectBindings.push(params.project);
      }

      const rows = this.db.prepare(selectSql).all(...selectBindings) as Array<{ id: string }>;
      ids.push(...rows.map(r => r.id));

      this.db.prepare(sql).run(...bindings);
    }

    return { archived_count: ids.length, archived_ids: ids };
  }

  unarchive(id: string): MemoryRow | undefined {
    const result = this.db.prepare(
      "UPDATE memories SET archived_at = NULL, updated_at = datetime('now') WHERE id = ?"
    ).run(id);
    if (result.changes === 0) return undefined;
    return this.get(id);
  }

  findDuplicates(content: string, project?: string, threshold?: number): MemoryRow[] {
    // Use FTS5 to find similar content
    try {
      // Extract key words (3+ chars) for matching
      const words = content.split(/\s+/).filter(w => w.length >= 3).slice(0, 10);
      if (words.length === 0) return [];

      const query = words.join(' OR ');
      let sql = `
        SELECT m.*, bm25(memories_fts) as rank
        FROM memories m
        JOIN memories_fts ON memories_fts.rowid = m.rowid
        WHERE memories_fts MATCH ? AND m.archived_at IS NULL
      `;
      const bindings: unknown[] = [query];

      if (project) {
        sql += ' AND m.project = ?';
        bindings.push(project);
      }

      sql += ' ORDER BY rank LIMIT ?';
      bindings.push(threshold || 5);

      return this.db.prepare(sql).all(...bindings) as MemoryRow[];
    } catch {
      return [];
    }
  }
}
