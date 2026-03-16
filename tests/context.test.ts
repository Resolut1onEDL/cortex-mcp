import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ContextService } from '../src/services/context.service.js';
import { up as migration001 } from '../src/db/migrations/001-init.js';
import { analyzeProject } from '../src/utils/project-analyzer.js';
import { join } from 'path';

let db: Database.Database;
let service: ContextService;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migration001(db);
  service = new ContextService(db);
});

afterEach(() => {
  db.close();
});

describe('ContextService', () => {
  it('should set and get a context value', () => {
    const ctx = service.set({
      project: 'my-project',
      key: 'tech_stack',
      value: 'TypeScript, SQLite, MCP',
    });

    expect(ctx.project).toBe('my-project');
    expect(ctx.key).toBe('tech_stack');
    expect(ctx.value).toBe('TypeScript, SQLite, MCP');

    const retrieved = service.get({ project: 'my-project', key: 'tech_stack' });
    expect(retrieved).toBeDefined();
  });

  it('should upsert on duplicate project+key', () => {
    service.set({ project: 'proj', key: 'goal', value: 'v1' });
    service.set({ project: 'proj', key: 'goal', value: 'v2' });

    const result = service.get({ project: 'proj', key: 'goal' }) as { value: string };
    expect(result.value).toBe('v2');
  });

  it('should get all context for a project', () => {
    service.set({ project: 'proj', key: 'goal', value: 'Ship v1' });
    service.set({ project: 'proj', key: 'stack', value: 'TypeScript' });
    service.set({ project: 'other', key: 'goal', value: 'Other goal' });

    const all = service.get({ project: 'proj' });
    expect(Array.isArray(all)).toBe(true);
    expect((all as unknown[]).length).toBe(2);
  });
});

describe('analyzeProject', () => {
  it('should analyze the current project directory', () => {
    const projectDir = join(import.meta.dirname, '..');
    const analysis = analyzeProject(projectDir);

    expect(analysis.directory).toBe(projectDir);
    expect(analysis.file_count).toBeGreaterThan(0);
    expect(analysis.languages).toHaveProperty('TypeScript');
    // git info may be null if no commits yet
    expect(analysis.package).not.toBeNull();
    expect(analysis.package!.name).toBe('cortex-mcp');
  });
});
