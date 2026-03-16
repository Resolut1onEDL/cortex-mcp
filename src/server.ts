import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getDb } from './db/connection.js';
import { registerMemoryTools } from './tools/memory.js';
import { registerEntityTools } from './tools/entity.js';
import { registerContextTools } from './tools/context.js';
import { registerSchedulerTools } from './tools/scheduler.js';
import { registerIntentionTools } from './tools/intention.js';
import { registerProjectStateTools } from './tools/project-state.js';
import { registerSessionTools } from './tools/session.js';
import { SchedulerService } from './services/scheduler.service.js';
import { IntentionService } from './services/intention.service.js';
import { notify } from './daemon/notifier.js';

const SCHEDULER_INTERVAL = 30_000; // 30 seconds

function startSchedulerLoop(db: import('better-sqlite3').Database): void {
  const scheduler = new SchedulerService(db);
  const intentions = new IntentionService(db);

  const tick = async () => {
    try {
      // Check due tasks
      const dueTasks = scheduler.getDueTasks();
      for (const task of dueTasks) {
        const action = JSON.parse(task.action) as { type: string; params?: Record<string, unknown> };
        const message = action.type === 'reminder'
          ? (action.params?.message as string) || task.name
          : `Task "${task.name}" is due`;

        await notify({
          title: 'Cortex Reminder',
          message,
          subtitle: action.type !== 'reminder' ? action.type : undefined,
        });

        scheduler.markRun(task.id, { notified_at: new Date().toISOString() });
      }

      // Check intention triggers
      const triggered = intentions.checkTriggers();
      for (const item of triggered) {
        await notify({
          title: 'Cortex Intention',
          message: item.intention.title,
          subtitle: item.fired_triggers.map(t => t.reason).join(', '),
        });
      }
    } catch {
      // Silent — don't crash the MCP server
    }
  };

  // Initial check after 5s (let server finish connecting first)
  setTimeout(tick, 5000);
  // Then every 30s
  setInterval(tick, SCHEDULER_INTERVAL);
}

export function createServer(dbPath?: string): McpServer {
  const server = new McpServer({
    name: 'cortex-mcp',
    version: '0.2.0',
  });

  const db = getDb(dbPath);

  registerMemoryTools(server, db);
  registerEntityTools(server, db);
  registerContextTools(server, db);
  registerSchedulerTools(server, db);
  registerIntentionTools(server, db);
  registerProjectStateTools(server, db);
  registerSessionTools(server, db);

  // Start background scheduler — checks due tasks every 30s and sends notifications
  startSchedulerLoop(db);

  return server;
}
