import type Database from 'better-sqlite3';
import type { SessionRow } from '../db/schema.js';
import { generateId } from '../utils/id.js';
import { IntentionService } from './intention.service.js';
import { ProjectStateService } from './project-state.service.js';
import { MemoryService } from './memory.service.js';

interface SessionStartResult {
  session: SessionRow;
  triggered_intentions: unknown[];
  active_project_states: unknown[];
  recent_important_memories: unknown[];
  days_since_last_session: number | null;
  last_session_notes: string | null;
}

interface SessionEndParams {
  id: string;
  summary: string;
  next_session_notes?: string;
  open_items?: string[];
  intentions_updated?: string[];
}

export class SessionService {
  constructor(private db: Database.Database) {}

  start(project?: string): SessionStartResult {
    const sessionId = generateId('sess');
    const proj = project || 'global';

    this.db.prepare(`
      INSERT INTO sessions (id, project) VALUES (?, ?)
    `).run(sessionId, proj);

    const session = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as SessionRow;

    // Get last session
    const lastSession = this.db.prepare(
      "SELECT * FROM sessions WHERE project = ? AND ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT 1"
    ).get(proj) as SessionRow | undefined;

    let daysSinceLastSession: number | null = null;
    if (lastSession?.ended_at) {
      const last = new Date(lastSession.ended_at);
      const now = new Date();
      daysSinceLastSession = Math.floor((now.getTime() - last.getTime()) / 86400000);
    }

    // Check triggered intentions
    const intentionService = new IntentionService(this.db);
    const triggered = intentionService.checkTriggers();

    // Get active project states
    const stateService = new ProjectStateService(this.db);
    const projectState = stateService.get(proj);
    const activeStates: unknown[] = [];
    if (projectState) activeStates.push(projectState);

    // Also get global state if project-specific
    if (proj !== 'global') {
      const globalState = stateService.get('global');
      if (globalState) activeStates.push(globalState);
    }

    // Get recent important memories
    const memoryService = new MemoryService(this.db);
    const recentDecisions = memoryService.list({ project: proj, type: 'decision', limit: 5, offset: 0 });
    const recentFeedback = memoryService.list({ type: 'feedback', limit: 5, offset: 0 });

    return {
      session,
      triggered_intentions: triggered,
      active_project_states: activeStates,
      recent_important_memories: [...recentDecisions, ...recentFeedback],
      days_since_last_session: daysSinceLastSession,
      last_session_notes: lastSession?.next_session_notes || null,
    };
  }

  end(params: SessionEndParams): SessionRow {
    this.db.prepare(`
      UPDATE sessions SET
        ended_at = datetime('now'),
        summary = ?,
        next_session_notes = ?,
        open_items = ?,
        intentions_updated = ?
      WHERE id = ?
    `).run(
      params.summary,
      params.next_session_notes || null,
      JSON.stringify(params.open_items || []),
      JSON.stringify(params.intentions_updated || []),
      params.id,
    );

    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(params.id) as SessionRow;
  }

  getLatest(project?: string): SessionRow | undefined {
    const proj = project || 'global';
    return this.db.prepare(
      'SELECT * FROM sessions WHERE project = ? ORDER BY started_at DESC LIMIT 1'
    ).get(proj) as SessionRow | undefined;
  }
}
