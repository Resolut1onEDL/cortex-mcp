import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { SchedulerService } from '../services/scheduler.service.js';
import { jsonContent, textContent } from '../utils/response.js';

export function registerSchedulerTools(server: McpServer, db: Database.Database): void {
  const service = new SchedulerService(db);

  server.tool(
    'scheduler_create',
    'Schedule a reminder or recurring task. The cortex daemon (cortex-mcp daemon start) delivers notifications via macOS banners and optionally Telegram. Use "once" for one-time reminders, "every 5m/1h/1d" for recurring tasks. For reminders, set action type to "reminder" with params.message.',
    {
      name: z.string().describe('Short task name'),
      description: z.string().optional().describe('What this task does and why'),
      schedule: z.string().describe('Schedule: "once", "every 5m", "every 1h", "every 1d"'),
      action: z.object({
        type: z.string().describe('Action type: "reminder", "memory_cleanup", "context_refresh", "custom"'),
        params: z.record(z.string(), z.unknown()).optional().describe('Action parameters (for reminder: { message: "text" })'),
      }).describe('What to execute when the task runs'),
      run_at: z.string().optional().describe('Specific time to run (ISO 8601, e.g. "2026-03-17T15:00:00"). Overrides schedule for first run.'),
      project: z.string().default('global').describe('Project scope'),
      enabled: z.boolean().default(true).describe('Whether the task is active'),
    },
    async (params) => {
      const { run_at, ...createParams } = params;
      const task = service.create(createParams);

      // Override next_run_at if run_at is provided
      if (run_at) {
        service.setNextRun(task.id, run_at);
        return jsonContent(service.get(task.id));
      }

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
    'Check for tasks that are due to run now. The daemon calls this automatically, but you can also call it manually to see what is pending.',
    {},
    async () => {
      const due = service.getDueTasks();
      return jsonContent({ count: due.length, tasks: due });
    }
  );
}
