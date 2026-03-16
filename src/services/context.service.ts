import type Database from 'better-sqlite3';
import type { ProjectContextRow, ContentType } from '../db/schema.js';
import { generateId } from '../utils/id.js';

export class ContextService {
  constructor(private db: Database.Database) {}

  set(params: {
    project: string;
    key: string;
    value: string;
    content_type?: ContentType;
  }): ProjectContextRow {
    const id = generateId('ctx');
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO project_context (id, project, key, value, content_type, created_at, updated_at)
      VALUES (@id, @project, @key, @value, @content_type, @created_at, @updated_at)
      ON CONFLICT(project, key) DO UPDATE SET
        value = @value,
        content_type = @content_type,
        updated_at = @updated_at
    `).run({
      id,
      project: params.project,
      key: params.key,
      value: params.value,
      content_type: params.content_type || 'text',
      created_at: now,
      updated_at: now,
    });

    return this.db.prepare(
      'SELECT * FROM project_context WHERE project = ? AND key = ?'
    ).get(params.project, params.key) as ProjectContextRow;
  }

  get(params: {
    project: string;
    key?: string;
  }): ProjectContextRow | ProjectContextRow[] {
    if (params.key) {
      return this.db.prepare(
        'SELECT * FROM project_context WHERE project = ? AND key = ?'
      ).get(params.project, params.key) as ProjectContextRow;
    }

    return this.db.prepare(
      'SELECT * FROM project_context WHERE project = ? ORDER BY key'
    ).all(params.project) as ProjectContextRow[];
  }
}
