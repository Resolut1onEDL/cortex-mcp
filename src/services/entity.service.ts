import type Database from 'better-sqlite3';
import type { EntityRow, EntityMemoryLinkRow, EntityLinkRow, EntityTimelineRow, EntityType } from '../db/schema.js';
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

  linkEntity(params: {
    source_entity_id: string;
    target_entity_id: string;
    relation: string;
    properties?: Record<string, string>;
  }): EntityLinkRow {
    const id = generateId('elink');
    const row: EntityLinkRow = {
      id,
      source_entity_id: params.source_entity_id,
      target_entity_id: params.target_entity_id,
      relation: params.relation,
      properties: JSON.stringify(params.properties || {}),
      created_at: new Date().toISOString(),
    };

    this.db.prepare(`
      INSERT OR REPLACE INTO entity_links (id, source_entity_id, target_entity_id, relation, properties, created_at)
      VALUES (@id, @source_entity_id, @target_entity_id, @relation, @properties, @created_at)
    `).run(row);

    return row;
  }

  addTimelineEvent(params: {
    entity_id: string;
    event: string;
    event_date: string;
    metadata?: Record<string, unknown>;
  }): EntityTimelineRow {
    const id = generateId('evt');
    const row: EntityTimelineRow = {
      id,
      entity_id: params.entity_id,
      event: params.event,
      event_date: params.event_date,
      metadata: JSON.stringify(params.metadata || {}),
      created_at: new Date().toISOString(),
    };

    this.db.prepare(`
      INSERT INTO entity_timeline (id, entity_id, event, event_date, metadata, created_at)
      VALUES (@id, @entity_id, @event, @event_date, @metadata, @created_at)
    `).run(row);

    return row;
  }

  getTimeline(entityId: string, limit: number = 50): EntityTimelineRow[] {
    return this.db.prepare(
      'SELECT * FROM entity_timeline WHERE entity_id = ? ORDER BY event_date DESC LIMIT ?'
    ).all(entityId, limit) as EntityTimelineRow[];
  }

  getFull(entityId: string): {
    entity: EntityRow;
    memories: Array<{ id: string; content: string; type: string; relation: string }>;
    outgoing_links: Array<EntityLinkRow & { target_name: string; target_type: string }>;
    incoming_links: Array<EntityLinkRow & { source_name: string; source_type: string }>;
    timeline: EntityTimelineRow[];
  } | undefined {
    const entity = this.db.prepare('SELECT * FROM entities WHERE id = ?').get(entityId) as EntityRow | undefined;
    if (!entity) return undefined;

    const memories = this.db.prepare(`
      SELECT m.id, m.content, m.type, l.relation FROM memories m
      JOIN entity_memory_links l ON l.memory_id = m.id
      WHERE l.entity_id = ?
      ORDER BY m.updated_at DESC
    `).all(entityId) as Array<{ id: string; content: string; type: string; relation: string }>;

    const outgoing_links = this.db.prepare(`
      SELECT el.*, e.name as target_name, e.type as target_type
      FROM entity_links el
      JOIN entities e ON e.id = el.target_entity_id
      WHERE el.source_entity_id = ?
    `).all(entityId) as Array<EntityLinkRow & { target_name: string; target_type: string }>;

    const incoming_links = this.db.prepare(`
      SELECT el.*, e.name as source_name, e.type as source_type
      FROM entity_links el
      JOIN entities e ON e.id = el.source_entity_id
      WHERE el.target_entity_id = ?
    `).all(entityId) as Array<EntityLinkRow & { source_name: string; source_type: string }>;

    const timeline = this.getTimeline(entityId);

    return { entity, memories, outgoing_links, incoming_links, timeline };
  }
}
