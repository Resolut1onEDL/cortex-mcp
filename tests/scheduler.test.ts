import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SchedulerService } from '../src/services/scheduler.service.js';
import { up as migration001 } from '../src/db/migrations/001-init.js';
import { up as migration002 } from '../src/db/migrations/002-scheduler.js';

let db: Database.Database;
let service: SchedulerService;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migration001(db);
  migration002(db);
  service = new SchedulerService(db);
});

afterEach(() => {
  db.close();
});

describe('SchedulerService', () => {
  it('should create and retrieve a task', () => {
    const task = service.create({
      name: 'Test task',
      schedule: 'every 1h',
      action: { type: 'reminder', params: { message: 'Hello' } },
    });

    expect(task.id).toMatch(/^task_/);
    expect(task.name).toBe('Test task');
    expect(task.schedule).toBe('every 1h');
    expect(task.enabled).toBe(1);
    expect(task.next_run_at).toBeTruthy();

    const retrieved = service.get(task.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe('Test task');
  });

  it('should list tasks with filters', () => {
    service.create({ name: 'Task A', schedule: 'every 1h', action: { type: 'custom' }, project: 'proj-a' });
    service.create({ name: 'Task B', schedule: 'every 1d', action: { type: 'custom' }, project: 'proj-b' });
    service.create({ name: 'Task C', schedule: 'once', action: { type: 'custom' }, project: 'proj-a', enabled: false });

    const all = service.list();
    expect(all).toHaveLength(3);

    const projA = service.list({ project: 'proj-a' });
    expect(projA).toHaveLength(2);

    const enabled = service.list({ enabled: true });
    expect(enabled).toHaveLength(2);
  });

  it('should update a task', () => {
    const task = service.create({ name: 'Original', schedule: 'every 1h', action: { type: 'custom' } });
    const updated = service.update({ id: task.id, name: 'Updated', enabled: false });

    expect(updated).toBeDefined();
    expect(updated!.name).toBe('Updated');
    expect(updated!.enabled).toBe(0);
  });

  it('should delete a task', () => {
    const task = service.create({ name: 'To delete', schedule: 'once', action: { type: 'custom' } });
    expect(service.delete(task.id)).toBe(true);
    expect(service.get(task.id)).toBeUndefined();
    expect(service.delete('nonexistent')).toBe(false);
  });

  it('should mark a one-time task as disabled after run', () => {
    const task = service.create({ name: 'One-shot', schedule: 'once', action: { type: 'reminder' } });
    service.markRun(task.id, { status: 'ok' });

    const after = service.get(task.id);
    expect(after!.run_count).toBe(1);
    expect(after!.enabled).toBe(0);
    expect(after!.last_run_at).toBeTruthy();
    expect(JSON.parse(after!.last_result!)).toEqual({ status: 'ok' });
  });

  it('should keep recurring task enabled after run', () => {
    const task = service.create({ name: 'Recurring', schedule: 'every 1h', action: { type: 'cleanup' } });
    service.markRun(task.id, { cleaned: 5 });

    const after = service.get(task.id);
    expect(after!.run_count).toBe(1);
    expect(after!.enabled).toBe(1);
    expect(after!.next_run_at).toBeTruthy();
  });

  it('should scope tasks by project', () => {
    service.create({ name: 'Global', schedule: 'every 1d', action: { type: 'custom' } });
    service.create({ name: 'Scoped', schedule: 'every 1d', action: { type: 'custom' }, project: 'my-project' });

    const global = service.list({ project: 'global' });
    expect(global).toHaveLength(1);

    const scoped = service.list({ project: 'my-project' });
    expect(scoped).toHaveLength(1);
  });
});
