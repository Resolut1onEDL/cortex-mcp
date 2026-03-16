import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { IntentionService } from '../src/services/intention.service.js';
import { MemoryService } from '../src/services/memory.service.js';
import { EntityService } from '../src/services/entity.service.js';
import { up as migration001 } from '../src/db/migrations/001-init.js';
import { up as migration003 } from '../src/db/migrations/003-intentions-states-sessions.js';

let db: Database.Database;
let service: IntentionService;
let memoryService: MemoryService;
let entityService: EntityService;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migration001(db);
  migration003(db);
  service = new IntentionService(db);
  memoryService = new MemoryService(db);
  entityService = new EntityService(db);
});

afterEach(() => { db.close(); });

describe('IntentionService', () => {
  it('should create and retrieve an intention', () => {
    const int = service.create({
      title: 'Decide on database migration',
      context: 'Need to move from SQLite to PostgreSQL',
      next_action: 'Research PostgreSQL hosting options',
      priority: 'high',
      project: 'my-project',
    });

    expect(int.id).toMatch(/^int_/);
    expect(int.title).toBe('Decide on database migration');
    expect(int.status).toBe('open');
    expect(int.priority).toBe('high');
    expect(int.triggers).toEqual([]);

    const retrieved = service.getFull(int.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.title).toBe('Decide on database migration');
  });

  it('should create intention with triggers', () => {
    const int = service.create({
      title: 'Review Q1 numbers',
      trigger_conditions: [
        { type: 'date', value: '2026-04-01' },
        { type: 'keyword', value: 'Q1 revenue' },
      ],
    });

    expect(int.triggers).toHaveLength(2);
    expect(int.triggers[0].condition_type).toBe('date');
    expect(int.triggers[1].condition_type).toBe('keyword');
  });

  it('should create intention with related entities and memories', () => {
    const entity = entityService.store({ name: 'TimeHUB', type: 'project' });
    const memory = memoryService.store({ content: 'Revenue is declining', type: 'note' });

    const int = service.create({
      title: 'Resolve TimeHUB issue',
      related_entity_ids: [entity.id],
      related_memory_ids: [memory.id],
    });

    expect(int.related_entities).toHaveLength(1);
    expect(int.related_entities[0].name).toBe('TimeHUB');
    expect(int.related_memories).toHaveLength(1);
    expect(int.related_memories[0].content).toBe('Revenue is declining');
  });

  it('should update intention status', () => {
    const int = service.create({ title: 'Open question' });
    const updated = service.update({
      id: int.id,
      status: 'resolved',
      resolve_reason: 'Decided to keep current approach',
    });

    expect(updated!.status).toBe('resolved');
    expect(updated!.resolve_reason).toBe('Decided to keep current approach');
  });

  it('should list intentions with filters', () => {
    service.create({ title: 'High priority', priority: 'high', project: 'proj-a' });
    service.create({ title: 'Low priority', priority: 'low', project: 'proj-a' });
    service.create({ title: 'Other project', priority: 'high', project: 'proj-b' });

    const all = service.list();
    expect(all).toHaveLength(3);

    const highOnly = service.list({ priority: 'high' });
    expect(highOnly).toHaveLength(2);

    const projA = service.list({ project: 'proj-a' });
    expect(projA).toHaveLength(2);
  });

  it('should check date triggers', () => {
    service.create({
      title: 'Past trigger',
      trigger_conditions: [
        { type: 'date', value: '2020-01-01' }, // past date
      ],
    });
    service.create({
      title: 'Future trigger',
      trigger_conditions: [
        { type: 'date', value: '2099-01-01' }, // future date
      ],
    });

    const triggered = service.checkTriggers();
    expect(triggered).toHaveLength(1);
    expect(triggered[0].intention.title).toBe('Past trigger');
    expect(triggered[0].fired_triggers).toHaveLength(1);
  });

  it('should not trigger resolved intentions', () => {
    const int = service.create({
      title: 'Resolved one',
      trigger_conditions: [{ type: 'date', value: '2020-01-01' }],
    });
    service.update({ id: int.id, status: 'resolved' });

    const triggered = service.checkTriggers();
    expect(triggered).toHaveLength(0);
  });
});
