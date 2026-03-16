import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { SessionService } from '../services/session.service.js';
import { jsonContent } from '../utils/response.js';

export function registerSessionTools(server: McpServer, db: Database.Database): void {
  const service = new SessionService(db);

  server.tool(
    'session_start',
    'Begin a new work session. Returns a complete briefing: triggered intentions, active project states, recent decisions, days since last session, and handoff notes. Call this at the start of every conversation to avoid cold starts.',
    {
      project: z.string().optional().describe('Project scope (auto-detected if omitted)'),
    },
    async ({ project }) => {
      const result = service.start(project);
      return jsonContent(result);
    }
  );

  server.tool(
    'session_end',
    'Close the current session with a summary of what was done, what remains open, and notes for next time. This creates the handoff that makes the next session start smoothly.',
    {
      id: z.string().describe('Session ID from session_start'),
      summary: z.string().describe('What was accomplished in this session'),
      next_session_notes: z.string().optional().describe('Notes for the next session ("start with...", "check on...")'),
      open_items: z.array(z.string()).optional().describe('Items left unfinished'),
      intentions_updated: z.array(z.string()).optional().describe('Intention IDs that were updated this session'),
    },
    async (params) => {
      const session = service.end(params);
      return jsonContent(session);
    }
  );
}
