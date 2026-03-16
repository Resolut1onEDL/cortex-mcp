import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { EntityService } from '../src/services/entity.service.js';
import { MemoryService } from '../src/services/memory.service.js';
import { up as migration001 } from '../src/db/migrations/001-init.js';

let db: Database.Database;
let entityService: EntityService;
let memoryService: MemoryService;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migration001(db);
  entityService = new EntityService(db);
  memoryService = new MemoryService(db);
});

afterEach(() => {
  db.close();
});

describe('EntityService', () => {
  it('should store and search entities', () => {
    const entity = entityService.store({
      name: 'John Doe',
      type: 'person',
      description: 'Backend developer',
    });

    expect(entity.id).toMatch(/^ent_/);
    expect(entity.name).toBe('John Doe');

    const results = entityService.search({ query: 'John' });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('John Doe');
    expect(results[0].memory_count).toBe(0);
  });

  it('should filter entities by type', () => {
    entityService.store({ name: 'Alice', type: 'person' });
    entityService.store({ name: 'Cortex MCP', type: 'project' });

    const people = entityService.search({ query: '', type: 'person' });
    // LIKE '%%' matches all, but filtered by type
    expect(people.every((e) => e.type === 'person')).toBe(true);
  });

  it('should link entities to memories', () => {
    const entity = entityService.store({ name: 'Test Project', type: 'project' });
    const memory = memoryService.store({ content: 'Project kickoff notes' });

    const link = entityService.linkMemory({
      entity_id: entity.id,
      memory_id: memory.id,
      relation: 'about',
    });

    expect(link.entity_id).toBe(entity.id);
    expect(link.memory_id).toBe(memory.id);
    expect(link.relation).toBe('about');

    // Verify memory_count increases
    const results = entityService.search({ query: 'Test Project' });
    expect(results[0].memory_count).toBe(1);
  });

  it('should scope entities by project', () => {
    entityService.store({ name: 'Global Entity', type: 'concept' });
    entityService.store({ name: 'Scoped Entity', type: 'tool', project: 'my-proj' });

    const scoped = entityService.search({ query: '', project: 'my-proj' });
    expect(scoped).toHaveLength(1);
    expect(scoped[0].name).toBe('Scoped Entity');
  });
});
