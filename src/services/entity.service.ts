import type Database from 'better-sqlite3';
import type { EntityRow, EntityMemoryLinkRow, EntityType } from '../db/schema.js';
import { generateId } from '../utils/id.js';

export class EntityService {
  constructor(private db: Database.Database) {}

  store(params: {
    name: string;
    type: EntityType;
    description?: string;
    properties?: Record<string, string>;
    project?: string;
  }): EntityRow {
    const id = generateId('ent');
    const now = new Date().toISOString();
    const row = {
      id,
      name: params.name,
      type: params.type,
      description: params.description || '',
      properties: JSON.stringify(params.properties || {}),
      project: params.project || 'global',
      created_at: now,
      updated_at: now,
    };

    this.db.prepare(`
      INSERT INTO entities (id, name, type, description, properties, project, created_at, updated_at)
      VALUES (@id, @name, @type, @description, @properties, @project, @created_at, @updated_at)
    `).run(row);

    return row;
  }

  search(params: {
    query: string;
    type?: EntityType;
    project?: string;
    limit?: number;
  }): (EntityRow & { memory_count: number })[] {
    let sql = `
      SELECT e.*, COUNT(eml.memory_id) as memory_count
      FROM entities e
      LEFT JOIN entity_memory_links eml ON eml.entity_id = e.id
      WHERE (e.name LIKE ? OR e.description LIKE ?)
    `;
    const pattern = `%${params.query}%`;
    const bindings: unknown[] = [pattern, pattern];

    if (params.type) {
      sql += ' AND e.type = ?';
      bindings.push(params.type);
    }
    if (params.project) {
      sql += ' AND e.project = ?';
      bindings.push(params.project);
    }

    sql += ' GROUP BY e.id ORDER BY e.updated_at DESC LIMIT ?';
    bindings.push(params.limit || 10);

    return this.db.prepare(sql).all(...bindings) as (EntityRow & { memory_count: number })[];
  }

  linkMemory(params: {
    entity_id: string;
    memory_id: string;
    relation?: string;
  }): EntityMemoryLinkRow {
    const now = new Date().toISOString();
    const row = {
      entity_id: params.entity_id,
      memory_id: params.memory_id,
      relation: params.relation || 'related',
      created_at: now,
    };

    this.db.prepare(`
      INSERT OR REPLACE INTO entity_memory_links (entity_id, memory_id, relation, created_at)
      VALUES (@entity_id, @memory_id, @relation, @created_at)
    `).run(row);

    return row;
  }
}
