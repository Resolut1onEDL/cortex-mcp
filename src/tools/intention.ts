import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { IntentionService } from '../services/intention.service.js';
import { jsonContent, textContent } from '../utils/response.js';

const INTENTION_STATUSES = ['open', 'waiting', 'blocked', 'resolved', 'abandoned'] as const;
const INTENTION_PRIORITIES = ['high', 'medium', 'low'] as const;
const TRIGGER_TYPES = ['keyword', 'date', 'entity_update', 'time_elapsed', 'custom'] as const;

export function registerIntentionTools(server: McpServer, db: Database.Database): void {
  const service = new IntentionService(db);

  server.tool(
    'intention_create',
    'Track an open loop — an unresolved question, pending decision, or goal that needs follow-up across sessions. Intentions persist until explicitly resolved or abandoned. Use this whenever something is "not decided yet" or "needs to come back to later".',
    {
      title: z.string().describe('Short description of the open loop'),
      context: z.string().optional().describe('Background information and reasoning'),
      next_action: z.string().optional().describe('What should happen next'),
      priority: z.enum(INTENTION_PRIORITIES).default('medium').describe('Urgency level'),
      project: z.string().default('global').describe('Project scope'),
      trigger_conditions: z.array(z.object({
        type: z.enum(TRIGGER_TYPES).describe('Trigger type: keyword (fires when topic mentioned), date (fires after date), time_elapsed (e.g. "14d"), entity_update, custom'),
        value: z.string().describe('Trigger value: a keyword, ISO date, duration like "14d", entity ID, or custom expression'),
      })).optional().describe('Conditions that should surface this intention automatically'),
      related_entity_ids: z.array(z.string()).optional().describe('IDs of related entities'),
      related_memory_ids: z.array(z.string()).optional().describe('IDs of related memories'),
    },
    async (params) => {
      const intention = service.create(params);
      return jsonContent(intention);
    }
  );

  server.tool(
    'intention_update',
    'Update an intention — change its status (open/waiting/blocked/resolved/abandoned), set next action, add triggers, or resolve it with a reason. Use this when progress is made on an open loop or when a decision is reached.',
    {
      id: z.string().describe('Intention ID'),
      title: z.string().optional().describe('Updated title'),
      status: z.enum(INTENTION_STATUSES).optional().describe('New status'),
      context: z.string().optional().describe('Updated context'),
      next_action: z.string().optional().describe('Updated next action'),
      priority: z.enum(INTENTION_PRIORITIES).optional().describe('Updated priority'),
      resolve_reason: z.string().optional().describe('Why this was resolved/abandoned'),
      trigger_conditions: z.array(z.object({
        type: z.enum(TRIGGER_TYPES),
        value: z.string(),
      })).optional().describe('Replace trigger conditions'),
      related_entity_ids: z.array(z.string()).optional().describe('Replace related entity IDs'),
      related_memory_ids: z.array(z.string()).optional().describe('Replace related memory IDs'),
    },
    async (params) => {
      const intention = service.update(params);
      if (!intention) return textContent(`Intention not found: ${params.id}`);
      return jsonContent(intention);
    }
  );

  server.tool(
    'intention_get',
    'Get full details of a specific intention by ID — its triggers, related entities, and memories.',
    {
      id: z.string().describe('Intention ID'),
    },
    async ({ id }) => {
      const intention = service.getFull(id);
      if (!intention) return textContent(`Intention not found: ${id}`);
      return jsonContent(intention);
    }
  );

  server.tool(
    'intention_list',
    'List all tracked intentions — open loops, pending decisions, blocked items. Filter by status, project, or priority. Use at session start to see what needs attention.',
    {
      status: z.enum(INTENTION_STATUSES).optional().describe('Filter by status'),
      project: z.string().optional().describe('Filter by project'),
      priority: z.enum(INTENTION_PRIORITIES).optional().describe('Filter by priority'),
      limit: z.number().default(20).describe('Max results'),
      offset: z.number().default(0).describe('Offset for pagination'),
    },
    async (params) => {
      const intentions = service.list(params);
      return jsonContent({ count: intentions.length, intentions });
    }
  );

  server.tool(
    'intention_check_triggers',
    'Check which intentions have triggered conditions — dates passed, time elapsed, keywords matched. Call this at session start to surface items that need attention NOW.',
    {},
    async () => {
      const triggered = service.checkTriggers();
      return jsonContent({ count: triggered.length, triggered });
    }
  );
}
