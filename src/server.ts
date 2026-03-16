import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getDb } from './db/connection.js';
import { registerMemoryTools } from './tools/memory.js';
import { registerEntityTools } from './tools/entity.js';
import { registerContextTools } from './tools/context.js';
import { registerSchedulerTools } from './tools/scheduler.js';

export function createServer(dbPath?: string): McpServer {
  const server = new McpServer({
    name: 'cortex-mcp',
    version: '0.1.0',
  });

  const db = getDb(dbPath);

  registerMemoryTools(server, db);
  registerEntityTools(server, db);
  registerContextTools(server, db);
  registerSchedulerTools(server, db);

  return server;
}
