import type Database from 'better-sqlite3';
import type { ProjectStateRow, ProjectStateHistoryRow } from '../db/schema.js';
import { generateId } from '../utils/id.js';

interface SetProjectStateParams {
  project: string;
  phase?: string;
  phase_status?: string;
  started_at?: string;
  target_end?: string;
  milestones?: Array<{ name: string; status: string; due?: string }>;
  blockers?: string[];
  current_focus?: string;
  anti_patterns?: string[];
  metadata?: Record<string, unknown>;
  change_summary?: string;
  session_id?: string;
}

export class ProjectStateService {
  constructor(private db: Database.Database) {}

  set(params: SetProjectStateParams): ProjectStateRow {
    const existing = this.db.prepare('SELECT * FROM project_states WHERE project = ?').get(params.project) as ProjectStateRow | undefined;

    // Save history snapshot before update (if state exists)
    if (existing) {
      const histId = generateId('psh');
      this.db.prepare(`
        INSERT INTO project_state_history (id, project, snapshot, change_summary, session_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        histId,
        params.project,
        JSON.stringify(existing),
        params.change_summary || '',
        params.session_id || null,
      );
    }

    if (existing) {
      this.db.prepare(`
        UPDATE project_states SET
          phase = ?, phase_status = ?, started_at = ?, target_end = ?,
          milestones = ?, blockers = ?, current_focus = ?,
          anti_patterns = ?, metadata = ?, updated_at = datetime('now')
        WHERE project = ?
      `).run(
        params.phase ?? existing.phase,
        params.phase_status ?? existing.phase_status,
        params.started_at ?? existing.started_at,
        params.target_end ?? existing.target_end,
        params.milestones ? JSON.stringify(params.milestones) : existing.milestones,
        params.blockers ? JSON.stringify(params.blockers) : existing.blockers,
        params.current_focus ?? existing.current_focus,
        params.anti_patterns ? JSON.stringify(params.anti_patterns) : existing.anti_patterns,
        params.metadata ? JSON.stringify(params.metadata) : existing.metadata,
        params.project,
      );
    } else {
      const id = generateId('ps');
      this.db.prepare(`
        INSERT INTO project_states (id, project, phase, phase_status, started_at, target_end,
          milestones, blockers, current_focus, anti_patterns, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        params.project,
        params.phase || '',
        params.phase_status || 'not_started',
        params.started_at || null,
        params.target_end || null,
        JSON.stringify(params.milestones || []),
        JSON.stringify(params.blockers || []),
        params.current_focus || '',
        JSON.stringify(params.anti_patterns || []),
        JSON.stringify(params.metadata || {}),
      );
    }

    return this.get(params.project)!;
  }

  get(project: string): ProjectStateRow | undefined {
    return this.db.prepare('SELECT * FROM project_states WHERE project = ?').get(project) as ProjectStateRow | undefined;
  }

  history(project: string, limit: number = 20): ProjectStateHistoryRow[] {
    return this.db.prepare(
      'SELECT * FROM project_state_history WHERE project = ? ORDER BY created_at DESC LIMIT ?'
    ).all(project, limit) as ProjectStateHistoryRow[];
  }
}
