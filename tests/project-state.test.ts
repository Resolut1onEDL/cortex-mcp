import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ProjectStateService } from '../src/services/project-state.service.js';
import { up as migration001 } from '../src/db/migrations/001-init.js';
import { up as migration003 } from '../src/db/migrations/003-intentions-states-sessions.js';

let db: Database.Database;
let service: ProjectStateService;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migration001(db);
  migration003(db);
  service = new ProjectStateService(db);
});

afterEach(() => { db.close(); });

describe('ProjectStateService', () => {
  it('should create and retrieve project state', () => {
    const state = service.set({
      project: 'my-project',
      phase: 'Phase 1: Research',
      phase_status: 'in_progress',
      current_focus: 'Reading documentation',
      milestones: [
        { name: 'Read docs', status: 'in_progress', due: '2026-04-01' },
        { name: 'First prototype', status: 'not_started', due: '2026-04-15' },
      ],
    });

    expect(state.project).toBe('my-project');
    expect(state.phase).toBe('Phase 1: Research');
    expect(state.phase_status).toBe('in_progress');
    expect(JSON.parse(state.milestones)).toHaveLength(2);

    const retrieved = service.get('my-project');
    expect(retrieved).toBeDefined();
    expect(retrieved!.current_focus).toBe('Reading documentation');
  });

  it('should update existing state and create history', () => {
    service.set({
      project: 'my-project',
      phase: 'Phase 1',
      phase_status: 'in_progress',
    });

    service.set({
      project: 'my-project',
      phase: 'Phase 2',
      phase_status: 'in_progress',
      change_summary: 'Moved to phase 2',
    });

    const state = service.get('my-project');
    expect(state!.phase).toBe('Phase 2');

    const history = service.history('my-project');
    expect(history).toHaveLength(1);
    expect(history[0].change_summary).toBe('Moved to phase 2');
    const snapshot = JSON.parse(history[0].snapshot);
    expect(snapshot.phase).toBe('Phase 1');
  });

  it('should preserve unspecified fields on update', () => {
    service.set({
      project: 'my-project',
      phase: 'Phase 1',
      current_focus: 'Important focus',
      anti_patterns: ['Do not rush'],
    });

    service.set({
      project: 'my-project',
      phase: 'Phase 2',
    });

    const state = service.get('my-project');
    expect(state!.phase).toBe('Phase 2');
    expect(state!.current_focus).toBe('Important focus');
    expect(JSON.parse(state!.anti_patterns)).toEqual(['Do not rush']);
  });

  it('should track history across multiple updates', () => {
    service.set({ project: 'proj', phase: 'Phase 1' });
    service.set({ project: 'proj', phase: 'Phase 2', change_summary: 'v2' });
    service.set({ project: 'proj', phase: 'Phase 3', change_summary: 'v3' });

    const history = service.history('proj');
    expect(history).toHaveLength(2);
    // Snapshots capture state BEFORE each update, ordered by created_at DESC
    const snapshots = history.map(h => JSON.parse(h.snapshot).phase);
    expect(snapshots).toContain('Phase 1');
    expect(snapshots).toContain('Phase 2');
  });
});
