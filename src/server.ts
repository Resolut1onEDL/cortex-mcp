import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getDb } from './db/connection.js';
import { registerMemoryTools } from './tools/memory.js';
import { registerEntityTools } from './tools/entity.js';
import { registerContextTools } from './tools/context.js';
import { registerSchedulerTools } from './tools/scheduler.js';
import { registerIntentionTools } from './tools/intention.js';
import { registerProjectStateTools } from './tools/project-state.js';
import { registerSessionTools } from './tools/session.js';

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

  return server;
}
