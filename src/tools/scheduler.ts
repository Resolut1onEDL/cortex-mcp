import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { SchedulerService } from '../services/scheduler.service.js';
import { jsonContent, textContent } from '../utils/response.js';

export function registerSchedulerTools(server: McpServer, db: Database.Database): void {
  const service = new SchedulerService(db);

  server.tool(
    'scheduler_create',
    'Schedule a recurring or one-time task — reminders, periodic cleanup, automated checks. Use "once" for one-time tasks, "every 5m/1h/1d" for intervals.',
    {
      name: z.string().describe('Short task name'),
      description: z.string().optional().describe('What this task does and why'),
      schedule: z.string().describe('Schedule: "once", "every 5m", "every 1h", "every 1d"'),
      action: z.object({
        type: z.string().describe('Action type: "memory_cleanup", "context_refresh", "reminder", "custom"'),
        params: z.record(z.string(), z.unknown()).optional().describe('Action parameters'),
      }).describe('What to execute when the task runs'),
      project: z.string().default('global').describe('Project scope'),
      enabled: z.boolean().default(true).describe('Whether the task is active'),
    },
    async (params) => {
      const task = service.create(params);
      return jsonContent(task);
    }
  );

  server.tool(
    'scheduler_list',
    'View all scheduled tasks, optionally filtered by project or status. Use to check what automations are active.',
    {
      project: z.string().optional().describe('Filter by project'),
      enabled: z.boolean().optional().describe('Filter by enabled/disabled'),
      limit: z.number().default(20).describe('Max results'),
      offset: z.number().default(0).describe('Offset for pagination'),
    },
    async (params) => {
      const tasks = service.list(params);
      return jsonContent({ count: tasks.length, tasks });
    }
  );

  server.tool(
    'scheduler_get',
    'Get details of a specific scheduled task by ID.',
    {
      id: z.string().describe('Task ID'),
    },
    async ({ id }) => {
      const task = service.get(id);
      if (!task) return textContent(`Task not found: ${id}`);
      return jsonContent(task);
    }
  );

  server.tool(
    'scheduler_update',
    'Modify a scheduled task — change its schedule, enable/disable it, or update what it does.',
    {
      id: z.string().describe('Task ID to update'),
      name: z.string().optional().describe('New name'),
      description: z.string().optional().describe('New description'),
      schedule: z.string().optional().describe('New schedule'),
      action: z.object({
        type: z.string(),
        params: z.record(z.string(), z.unknown()).optional(),
      }).optional().describe('New action'),
      enabled: z.boolean().optional().describe('Enable or disable'),
    },
    async (params) => {
      const task = service.update(params);
      if (!task) return textContent(`Task not found: ${params.id}`);
      return jsonContent(task);
    }
  );

  server.tool(
    'scheduler_delete',
    'Remove a scheduled task that is no longer needed.',
    {
      id: z.string().describe('Task ID to delete'),
    },
    async ({ id }) => {
      const deleted = service.delete(id);
      if (!deleted) return textContent(`Task not found: ${id}`);
      return jsonContent({ success: true, deleted_id: id });
    }
  );

  server.tool(
    'scheduler_check_due',
    'Check for tasks that are due to run now. Returns all tasks whose next_run_at has passed.',
    {},
    async () => {
      const due = service.getDueTasks();
      return jsonContent({ count: due.length, tasks: due });
    }
  );
}
