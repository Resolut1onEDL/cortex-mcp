import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { EntityService } from '../src/services/entity.service.js';
import { MemoryService } from '../src/services/memory.service.js';
import { up as migration001 } from '../src/db/migrations/001-init.js';
import { up as migration003 } from '../src/db/migrations/003-intentions-states-sessions.js';

let db: Database.Database;
let service: EntityService;
let memoryService: MemoryService;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migration001(db);
  migration003(db);
  service = new EntityService(db);
  memoryService = new MemoryService(db);
});

afterEach(() => { db.close(); });

describe('EntityService - Enhanced', () => {
  it('should link two entities with a relationship', () => {
    const roman = service.store({ name: 'Roman', type: 'person' });
    const timehub = service.store({ name: 'TimeHUB', type: 'project' });

    const link = service.linkEntity({
      source_entity_id: roman.id,
      target_entity_id: timehub.id,
      relation: 'owns',
      properties: { share: '29%' },
    });

    expect(link.id).toMatch(/^elink_/);
    expect(link.relation).toBe('owns');
    expect(JSON.parse(link.properties)).toEqual({ share: '29%' });
  });

  it('should add timeline events', () => {
    const timehub = service.store({ name: 'TimeHUB', type: 'project' });

    service.addTimelineEvent({
      entity_id: timehub.id,
      event: 'Founded',
      event_date: '2024-01-15',
    });
    service.addTimelineEvent({
      entity_id: timehub.id,
      event: 'Revenue drop',
      event_date: '2026-01-01',
    });

    const timeline = service.getTimeline(timehub.id);
    expect(timeline).toHaveLength(2);
    expect(timeline[0].event).toBe('Revenue drop'); // most recent first
    expect(timeline[1].event).toBe('Founded');
  });

  it('should get full entity with all relations', () => {
    const roman = service.store({ name: 'Roman', type: 'person' });
    const timehub = service.store({ name: 'TimeHUB', type: 'project' });
    const memory = memoryService.store({ content: 'Revenue discussion', type: 'note' });

    service.linkMemory({ entity_id: roman.id, memory_id: memory.id, relation: 'authored' });
    service.linkEntity({
      source_entity_id: roman.id,
      target_entity_id: timehub.id,
      relation: 'owns',
    });
    service.addTimelineEvent({
      entity_id: roman.id,
      event: 'Started discussing restructuring',
      event_date: '2026-03-16',
    });

    const full = service.getFull(roman.id);
    expect(full).toBeDefined();
    expect(full!.entity.name).toBe('Roman');
    expect(full!.memories).toHaveLength(1);
    expect(full!.memories[0].relation).toBe('authored');
    expect(full!.outgoing_links).toHaveLength(1);
    expect(full!.outgoing_links[0].target_name).toBe('TimeHUB');
    expect(full!.outgoing_links[0].relation).toBe('owns');
    expect(full!.timeline).toHaveLength(1);
  });

  it('should show incoming links on target entity', () => {
    const roman = service.store({ name: 'Roman', type: 'person' });
    const timehub = service.store({ name: 'TimeHUB', type: 'project' });

    service.linkEntity({
      source_entity_id: roman.id,
      target_entity_id: timehub.id,
      relation: 'owns',
    });

    const full = service.getFull(timehub.id);
    expect(full!.incoming_links).toHaveLength(1);
    expect(full!.incoming_links[0].source_name).toBe('Roman');
    expect(full!.incoming_links[0].relation).toBe('owns');
  });
});
