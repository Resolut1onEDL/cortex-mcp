import type Database from 'better-sqlite3';
import type { ScheduledTaskRow } from '../db/schema.js';
import { generateId } from '../utils/id.js';

interface CreateTaskParams {
  name: string;
  description?: string;
  schedule: string;
  action: { type: string; params?: Record<string, unknown> };
  project?: string;
  enabled?: boolean;
}

interface UpdateTaskParams {
  id: string;
  name?: string;
  description?: string;
  schedule?: string;
  action?: { type: string; params?: Record<string, unknown> };
  enabled?: boolean;
}

interface ListTasksParams {
  project?: string;
  enabled?: boolean;
  limit?: number;
  offset?: number;
}

export class SchedulerService {
  constructor(private db: Database.Database) {}

  create(params: CreateTaskParams): ScheduledTaskRow {
    const id = generateId('task');
    const nextRun = this.calculateNextRun(params.schedule);

    this.db.prepare(`
      INSERT INTO scheduled_tasks (id, name, description, schedule, action, project, enabled, next_run_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.name,
      params.description || '',
      params.schedule,
      JSON.stringify(params.action),
      params.project || 'global',
      params.enabled !== false ? 1 : 0,
      nextRun,
    );

    return this.get(id)!;
  }

  get(id: string): ScheduledTaskRow | undefined {
    return this.db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id) as ScheduledTaskRow | undefined;
  }

  list(params: ListTasksParams = {}): ScheduledTaskRow[] {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (params.project) {
      conditions.push('project = ?');
      values.push(params.project);
    }
    if (params.enabled !== undefined) {
      conditions.push('enabled = ?');
      values.push(params.enabled ? 1 : 0);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = params.limit || 20;
    const offset = params.offset || 0;

    return this.db.prepare(
      `SELECT * FROM scheduled_tasks ${where} ORDER BY next_run_at ASC LIMIT ? OFFSET ?`
    ).all(...values, limit, offset) as ScheduledTaskRow[];
  }

  update(params: UpdateTaskParams): ScheduledTaskRow | undefined {
    const existing = this.get(params.id);
    if (!existing) return undefined;

    const name = params.name ?? existing.name;
    const description = params.description ?? existing.description;
    const schedule = params.schedule ?? existing.schedule;
    const action = params.action ? JSON.stringify(params.action) : existing.action;
    const enabled = params.enabled !== undefined ? (params.enabled ? 1 : 0) : existing.enabled;
    const nextRun = params.schedule ? this.calculateNextRun(params.schedule) : existing.next_run_at;

    this.db.prepare(`
      UPDATE scheduled_tasks
      SET name = ?, description = ?, schedule = ?, action = ?, enabled = ?, next_run_at = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(name, description, schedule, action, enabled, nextRun, params.id);

    return this.get(params.id);
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id);
    return result.changes > 0;
  }

  getDueTasks(): ScheduledTaskRow[] {
    return this.db.prepare(
      `SELECT * FROM scheduled_tasks
       WHERE enabled = 1 AND next_run_at <= datetime('now')
       ORDER BY next_run_at ASC`
    ).all() as ScheduledTaskRow[];
  }

  markRun(id: string, result: unknown): void {
    const task = this.get(id);
    if (!task) return;

    const nextRun = task.schedule === 'once' ? null : this.calculateNextRun(task.schedule);
    const enabled = task.schedule === 'once' ? 0 : task.enabled;

    this.db.prepare(`
      UPDATE scheduled_tasks
      SET last_run_at = datetime('now'), next_run_at = ?, run_count = run_count + 1,
          last_result = ?, enabled = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(nextRun, JSON.stringify(result), enabled, id);
  }

  private calculateNextRun(schedule: string): string | null {
    if (schedule === 'once') return new Date().toISOString().replace('T', ' ').slice(0, 19);

    // Parse simple interval patterns: "every 5m", "every 1h", "every 1d"
    const intervalMatch = schedule.match(/^every\s+(\d+)\s*(m|h|d)$/i);
    if (intervalMatch) {
      const value = parseInt(intervalMatch[1], 10);
      const unit = intervalMatch[2].toLowerCase();
      const now = new Date();
      if (unit === 'm') now.setMinutes(now.getMinutes() + value);
      else if (unit === 'h') now.setHours(now.getHours() + value);
      else if (unit === 'd') now.setDate(now.getDate() + value);
      return now.toISOString().replace('T', ' ').slice(0, 19);
    }

    // For cron expressions, store as-is — the runner will interpret them
    return null;
  }
}
