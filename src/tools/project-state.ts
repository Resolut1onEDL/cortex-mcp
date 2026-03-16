import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { ProjectStateService } from '../services/project-state.service.js';
import { jsonContent, textContent } from '../utils/response.js';

const PHASE_STATUSES = ['not_started', 'in_progress', 'completed', 'paused'] as const;
const MILESTONE_STATUSES = ['not_started', 'in_progress', 'completed', 'blocked'] as const;

export function registerProjectStateTools(server: McpServer, db: Database.Database): void {
  const service = new ProjectStateService(db);

  server.tool(
    'project_state_set',
    'Set or update the structured state of a project — current phase, milestones, blockers, focus, and anti-patterns. Automatically saves a history snapshot before each update so progress can be tracked over time.',
    {
      project: z.string().describe('Project name'),
      phase: z.string().optional().describe('Current phase name (e.g. "Phase 1: Research")'),
      phase_status: z.enum(PHASE_STATUSES).optional().describe('Phase status'),
      started_at: z.string().optional().describe('Phase start date (ISO)'),
      target_end: z.string().optional().describe('Target end date (ISO)'),
      milestones: z.array(z.object({
        name: z.string(),
        status: z.enum(MILESTONE_STATUSES),
        due: z.string().optional(),
      })).optional().describe('List of milestones with status'),
      blockers: z.array(z.string()).optional().describe('Current blockers'),
      current_focus: z.string().optional().describe('What to focus on right now'),
      anti_patterns: z.array(z.string()).optional().describe('Things to avoid'),
      metadata: z.record(z.string(), z.unknown()).optional().describe('Additional structured data'),
      change_summary: z.string().optional().describe('Brief description of what changed'),
      session_id: z.string().optional().describe('Session ID for history tracking'),
    },
    async (params) => {
      const state = service.set(params);
      return jsonContent(state);
    }
  );

  server.tool(
    'project_state_get',
    'Get the current structured state of a project — phase, milestones, blockers, focus. Use this to understand where a project stands before starting work.',
    {
      project: z.string().describe('Project name'),
    },
    async ({ project }) => {
      const state = service.get(project);
      if (!state) return textContent(`No state found for project: ${project}`);
      return jsonContent(state);
    }
  );

  server.tool(
    'project_state_history',
    'View how a project has evolved over time — all past state snapshots. Use this to understand trajectory, identify stalls, or recap progress ("3 weeks ago you were at X, now Y").',
    {
      project: z.string().describe('Project name'),
      limit: z.number().default(20).describe('Max history entries to return'),
    },
    async ({ project, limit }) => {
      const history = service.history(project, limit);
      return jsonContent({ count: history.length, history });
    }
  );
}
