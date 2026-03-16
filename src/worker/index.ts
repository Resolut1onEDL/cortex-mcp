import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { McpAgent } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { createDOAdapter, initSchema } from './db-adapter.js';
import { GitHubHandler } from './github-handler.js';
import type { Env, Props } from './env.js';

// Import services (they use `import type` for better-sqlite3, safe for Workers)
import { MemoryService } from '../services/memory.service.js';
import { EntityService } from '../services/entity.service.js';
import { ContextService } from '../services/context.service.js';
import { SchedulerService } from '../services/scheduler.service.js';
import { IntentionService } from '../services/intention.service.js';
import { ProjectStateService } from '../services/project-state.service.js';
import { SessionService } from '../services/session.service.js';

// Import tool registrations (except context — it imports Node.js fs/child_process)
import { registerMemoryTools } from '../tools/memory.js';
import { registerEntityTools } from '../tools/entity.js';
import { registerSchedulerTools } from '../tools/scheduler.js';
import { registerIntentionTools } from '../tools/intention.js';
import { registerProjectStateTools } from '../tools/project-state.js';
import { registerSessionTools } from '../tools/session.js';

// Response helpers
import { jsonContent, textContent } from '../utils/response.js';

export class CortexMCP extends McpAgent<Env, Record<string, never>, Props> {
  server = new McpServer({
    name: 'cortex-mcp',
    version: '0.2.0',
  });

  async init() {
    // Initialize database schema in Durable Object SQLite
    initSchema(this.ctx.storage.sql);

    // Create adapter that makes DO SQLite look like better-sqlite3
    const db = createDOAdapter(this.ctx.storage.sql) as any;

    // Register all tools using existing registration functions
    registerMemoryTools(this.server, db);
    registerEntityTools(this.server, db);
    registerSchedulerTools(this.server, db);
    registerIntentionTools(this.server, db);
    registerProjectStateTools(this.server, db);
    registerSessionTools(this.server, db);

    // Register context tools manually (context_analyze uses Node.js APIs, skip it)
    this.registerContextTools(db);
  }

  private registerContextTools(db: any): void {
    const service = new ContextService(db);

    this.server.tool(
      'context_set',
      'Store structured project context (tech stack, goals, team, conventions) that should be loaded at the start of every session working on this project.',
      {
        project: z.string().describe('Project name'),
        key: z.string().describe('Context key (e.g. tech_stack, goals, team)'),
        value: z.string().describe('Context value (text, JSON, or markdown)'),
        content_type: z.enum(['text', 'json', 'markdown']).default('text').describe('Content type'),
      },
      async (params) => jsonContent(service.set(params)),
    );

    this.server.tool(
      'context_get',
      'Load project context to understand the current project before starting work. Returns tech stack, goals, conventions, and other structured information.',
      {
        project: z.string().describe('Project name'),
        key: z.string().optional().describe('Specific key, or omit to get all context'),
      },
      async (params) => {
        const result = service.get(params);
        if (params.key && !result) {
          return textContent(`Context key not found: ${params.key} in project ${params.project}`);
        }
        return jsonContent(result);
      },
    );

    this.server.tool(
      'context_analyze',
      'Auto-detect project structure. Note: in remote/cloud mode, this tool analyzes stored context rather than the file system.',
      {
        directory: z.string().describe('Project name or identifier'),
      },
      async ({ directory }) => {
        // In cloud mode, return stored context for the project instead of filesystem analysis
        const stored = service.get({ project: directory });
        if (stored && (Array.isArray(stored) ? stored.length > 0 : true)) {
          return jsonContent({ project: directory, stored_context: stored, note: 'Cloud mode: showing stored context. Use context_set to add project info.' });
        }
        return textContent(`No stored context for "${directory}". Use context_set to add project information.`);
      },
    );
  }
}

// Export the Worker with OAuthProvider wrapping
export default new OAuthProvider({
  apiHandler: CortexMCP.serve('/mcp'),
  apiRoute: '/mcp',
  defaultHandler: GitHubHandler,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  clientRegistrationEndpoint: '/register',
});
