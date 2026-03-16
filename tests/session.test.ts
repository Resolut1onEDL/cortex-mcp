import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SessionService } from '../src/services/session.service.js';
import { MemoryService } from '../src/services/memory.service.js';
import { up as migration001 } from '../src/db/migrations/001-init.js';
import { up as migration002 } from '../src/db/migrations/002-scheduler.js';
import { up as migration003 } from '../src/db/migrations/003-intentions-states-sessions.js';

let db: Database.Database;
let service: SessionService;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migration001(db);
  migration002(db);
  migration003(db);
  service = new SessionService(db);
});

afterEach(() => { db.close(); });

describe('SessionService', () => {
  it('should start a session and return briefing', () => {
    const result = service.start('my-project');

    expect(result.session.id).toMatch(/^sess_/);
    expect(result.session.project).toBe('my-project');
    expect(result.days_since_last_session).toBeNull();
    expect(result.triggered_intentions).toEqual([]);
    expect(result.active_project_states).toEqual([]);
  });

  it('should end a session with summary', () => {
    const { session } = service.start('my-project');

    const ended = service.end({
      id: session.id,
      summary: 'Implemented login feature',
      next_session_notes: 'Start with testing the edge cases',
      open_items: ['Fix error handling', 'Add tests'],
    });

    expect(ended.summary).toBe('Implemented login feature');
    expect(ended.next_session_notes).toBe('Start with testing the edge cases');
    expect(ended.ended_at).toBeTruthy();
    expect(JSON.parse(ended.open_items)).toHaveLength(2);
  });

  it('should include recent memories in session start', () => {
    const memoryService = new MemoryService(db);
    memoryService.store({ content: 'Use PostgreSQL', type: 'decision', project: 'my-project' });
    memoryService.store({ content: 'No inline styles', type: 'feedback' });

    const result = service.start('my-project');
    expect(result.recent_important_memories.length).toBeGreaterThan(0);
  });

  it('should return last session notes on new session', () => {
    const first = service.start('my-project');
    service.end({
      id: first.session.id,
      summary: 'First session',
      next_session_notes: 'Continue with API design',
    });

    const second = service.start('my-project');
    expect(second.last_session_notes).toBe('Continue with API design');
  });
});
