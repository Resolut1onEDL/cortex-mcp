import type Database from 'better-sqlite3';
import type { IntentionRow, IntentionTriggerRow } from '../db/schema.js';
import { generateId } from '../utils/id.js';

interface CreateIntentionParams {
  title: string;
  context?: string;
  next_action?: string;
  priority?: string;
  project?: string;
  trigger_conditions?: Array<{ type: string; value: string }>;
  related_entity_ids?: string[];
  related_memory_ids?: string[];
}

interface UpdateIntentionParams {
  id: string;
  title?: string;
  status?: string;
  context?: string;
  next_action?: string;
  priority?: string;
  resolve_reason?: string;
  trigger_conditions?: Array<{ type: string; value: string }>;
  related_entity_ids?: string[];
  related_memory_ids?: string[];
}

interface ListIntentionParams {
  status?: string;
  project?: string;
  priority?: string;
  limit?: number;
  offset?: number;
}

interface IntentionFull extends IntentionRow {
  triggers: IntentionTriggerRow[];
  related_entities: Array<{ id: string; name: string; type: string }>;
  related_memories: Array<{ id: string; content: string; type: string }>;
}

interface TriggeredIntention {
  intention: IntentionFull;
  fired_triggers: Array<{ trigger: IntentionTriggerRow; reason: string }>;
}

export class IntentionService {
  constructor(private db: Database.Database) {}

  create(params: CreateIntentionParams): IntentionFull {
    const id = generateId('int');

    this.db.prepare(`
      INSERT INTO intentions (id, title, context, next_action, priority, project)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.title,
      params.context || '',
      params.next_action || '',
      params.priority || 'medium',
      params.project || 'global',
    );

    if (params.trigger_conditions) {
      this.setTriggers(id, params.trigger_conditions);
    }
    if (params.related_entity_ids) {
      for (const eid of params.related_entity_ids) {
        this.db.prepare('INSERT OR IGNORE INTO intention_entity_links (intention_id, entity_id) VALUES (?, ?)').run(id, eid);
      }
    }
    if (params.related_memory_ids) {
      for (const mid of params.related_memory_ids) {
        this.db.prepare('INSERT OR IGNORE INTO intention_memory_links (intention_id, memory_id) VALUES (?, ?)').run(id, mid);
      }
    }

    return this.getFull(id)!;
  }

  getFull(id: string): IntentionFull | undefined {
    const row = this.db.prepare('SELECT * FROM intentions WHERE id = ?').get(id) as IntentionRow | undefined;
    if (!row) return undefined;

    const triggers = this.db.prepare('SELECT * FROM intention_triggers WHERE intention_id = ?').all(id) as IntentionTriggerRow[];

    const related_entities = this.db.prepare(`
      SELECT e.id, e.name, e.type FROM entities e
      JOIN intention_entity_links l ON l.entity_id = e.id
      WHERE l.intention_id = ?
    `).all(id) as Array<{ id: string; name: string; type: string }>;

    const related_memories = this.db.prepare(`
      SELECT m.id, m.content, m.type FROM memories m
      JOIN intention_memory_links l ON l.memory_id = m.id
      WHERE l.intention_id = ?
    `).all(id) as Array<{ id: string; content: string; type: string }>;

    return { ...row, triggers, related_entities, related_memories };
  }

  update(params: UpdateIntentionParams): IntentionFull | undefined {
    const existing = this.db.prepare('SELECT * FROM intentions WHERE id = ?').get(params.id) as IntentionRow | undefined;
    if (!existing) return undefined;

    this.db.prepare(`
      UPDATE intentions SET
        title = ?, status = ?, context = ?, next_action = ?,
        priority = ?, resolve_reason = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      params.title ?? existing.title,
      params.status ?? existing.status,
      params.context ?? existing.context,
      params.next_action ?? existing.next_action,
      params.priority ?? existing.priority,
      params.resolve_reason ?? existing.resolve_reason,
      params.id,
    );

    if (params.trigger_conditions) {
      this.setTriggers(params.id, params.trigger_conditions);
    }
    if (params.related_entity_ids) {
      this.db.prepare('DELETE FROM intention_entity_links WHERE intention_id = ?').run(params.id);
      for (const eid of params.related_entity_ids) {
        this.db.prepare('INSERT OR IGNORE INTO intention_entity_links (intention_id, entity_id) VALUES (?, ?)').run(params.id, eid);
      }
    }
    if (params.related_memory_ids) {
      this.db.prepare('DELETE FROM intention_memory_links WHERE intention_id = ?').run(params.id);
      for (const mid of params.related_memory_ids) {
        this.db.prepare('INSERT OR IGNORE INTO intention_memory_links (intention_id, memory_id) VALUES (?, ?)').run(params.id, mid);
      }
    }

    return this.getFull(params.id);
  }

  list(params: ListIntentionParams = {}): IntentionFull[] {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (params.status) { conditions.push('status = ?'); values.push(params.status); }
    if (params.project) { conditions.push('project = ?'); values.push(params.project); }
    if (params.priority) { conditions.push('priority = ?'); values.push(params.priority); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = params.limit || 20;
    const offset = params.offset || 0;

    const rows = this.db.prepare(
      `SELECT * FROM intentions ${where} ORDER BY
        CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 END,
        updated_at DESC
       LIMIT ? OFFSET ?`
    ).all(...values, limit, offset) as IntentionRow[];

    return rows.map(r => this.getFull(r.id)!);
  }

  checkTriggers(): TriggeredIntention[] {
    const openIntentions = this.db.prepare(
      "SELECT * FROM intentions WHERE status IN ('open','waiting','blocked')"
    ).all() as IntentionRow[];

    const triggered: TriggeredIntention[] = [];
    const now = new Date();

    for (const intention of openIntentions) {
      const triggers = this.db.prepare(
        'SELECT * FROM intention_triggers WHERE intention_id = ?'
      ).all(intention.id) as IntentionTriggerRow[];

      const fired: Array<{ trigger: IntentionTriggerRow; reason: string }> = [];

      for (const trigger of triggers) {
        const result = this.evaluateTrigger(trigger, now);
        if (result) {
          fired.push({ trigger, reason: result });
          this.db.prepare(
            "UPDATE intention_triggers SET last_checked_at = datetime('now'), last_triggered_at = datetime('now') WHERE id = ?"
          ).run(trigger.id);
        } else {
          this.db.prepare(
            "UPDATE intention_triggers SET last_checked_at = datetime('now') WHERE id = ?"
          ).run(trigger.id);
        }
      }

      if (fired.length > 0) {
        triggered.push({
          intention: this.getFull(intention.id)!,
          fired_triggers: fired,
        });
      }
    }

    return triggered;
  }

  private evaluateTrigger(trigger: IntentionTriggerRow, now: Date): string | null {
    switch (trigger.condition_type) {
      case 'date': {
        const targetDate = new Date(trigger.condition_value);
        if (now >= targetDate) {
          return `Date condition met: ${trigger.condition_value}`;
        }
        return null;
      }
      case 'time_elapsed': {
        // Format: "14d" (14 days since creation)
        const match = trigger.condition_value.match(/^(\d+)\s*(d|h|m)$/i);
        if (!match) return null;
        const value = parseInt(match[1], 10);
        const unit = match[2].toLowerCase();

        const created = new Date(trigger.created_at);
        let elapsed = (now.getTime() - created.getTime()) / 1000;
        if (unit === 'd') elapsed /= 86400;
        else if (unit === 'h') elapsed /= 3600;
        else if (unit === 'm') elapsed /= 60;

        if (elapsed >= value) {
          return `Time elapsed: ${trigger.condition_value} since trigger created`;
        }
        return null;
      }
      case 'keyword':
        // Keywords are checked externally (by session_start with user input)
        // Here we just return null — they fire when matched in session context
        return null;
      case 'entity_update':
        // Check if entity was updated recently (within last session)
        return null;
      case 'custom':
        // Custom triggers are evaluated externally
        return null;
      default:
        return null;
    }
  }

  private setTriggers(intentionId: string, conditions: Array<{ type: string; value: string }>): void {
    this.db.prepare('DELETE FROM intention_triggers WHERE intention_id = ?').run(intentionId);
    for (const cond of conditions) {
      const tid = generateId('trig');
      this.db.prepare(
        'INSERT INTO intention_triggers (id, intention_id, condition_type, condition_value) VALUES (?, ?, ?, ?)'
      ).run(tid, intentionId, cond.type, cond.value);
    }
  }
}
