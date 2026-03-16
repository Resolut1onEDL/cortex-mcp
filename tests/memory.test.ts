import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { MemoryService } from '../src/services/memory.service.js';
import { up as migration001 } from '../src/db/migrations/001-init.js';

let db: Database.Database;
let service: MemoryService;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migration001(db);
  service = new MemoryService(db);
});

afterEach(() => {
  db.close();
});

describe('MemoryService', () => {
  it('should store and retrieve a memory', () => {
    const mem = service.store({ content: 'Test memory', type: 'note', tags: ['test'] });
    expect(mem.id).toMatch(/^mem_/);
    expect(mem.content).toBe('Test memory');
    expect(mem.type).toBe('note');

    const retrieved = service.get(mem.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.content).toBe('Test memory');
  });

  it('should list memories with filters', () => {
    service.store({ content: 'Note 1', type: 'note', project: 'proj-a' });
    service.store({ content: 'Note 2', type: 'feedback', project: 'proj-a' });
    service.store({ content: 'Note 3', type: 'note', project: 'proj-b' });

    const all = service.list({});
    expect(all).toHaveLength(3);

    const projA = service.list({ project: 'proj-a' });
    expect(projA).toHaveLength(2);

    const notes = service.list({ type: 'note' });
    expect(notes).toHaveLength(2);
  });

  it('should search memories with FTS', () => {
    service.store({ content: 'TypeScript is great for building servers' });
    service.store({ content: 'Python is good for data science' });
    service.store({ content: 'Rust is fast and safe' });

    const results = service.search({ query: 'TypeScript' });
    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('TypeScript');
  });

  it('should update a memory', () => {
    const mem = service.store({ content: 'Original', type: 'note' });
    const updated = service.update({ id: mem.id, content: 'Updated', type: 'feedback' });

    expect(updated).toBeDefined();
    expect(updated!.content).toBe('Updated');
    expect(updated!.type).toBe('feedback');
  });

  it('should delete a memory', () => {
    const mem = service.store({ content: 'To delete' });
    expect(service.delete(mem.id)).toBe(true);
    expect(service.get(mem.id)).toBeUndefined();
    expect(service.delete('nonexistent')).toBe(false);
  });

  it('should filter search by tags', () => {
    service.store({ content: 'Memory with tag', tags: ['important', 'work'] });
    service.store({ content: 'Memory without tag', tags: ['personal'] });

    const results = service.search({ query: 'Memory', tags: ['important'] });
    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('with tag');
  });

  it('should scope memories by project', () => {
    service.store({ content: 'Global memory' });
    service.store({ content: 'Project memory', project: 'my-project' });

    const global = service.list({ project: 'global' });
    expect(global).toHaveLength(1);

    const project = service.list({ project: 'my-project' });
    expect(project).toHaveLength(1);
  });
});
