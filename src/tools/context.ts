import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { ContextService } from '../services/context.service.js';
import { analyzeProject } from '../utils/project-analyzer.js';
import { jsonContent, textContent } from '../utils/response.js';

export function registerContextTools(server: McpServer, db: Database.Database): void {
  const service = new ContextService(db);

  server.tool(
    'context_set',
    'Set or update a project context value (key-value pair)',
    {
      project: z.string().describe('Project name'),
      key: z.string().describe('Context key (e.g. tech_stack, goals, team)'),
      value: z.string().describe('Context value (text, JSON, or markdown)'),
      content_type: z.enum(['text', 'json', 'markdown']).default('text').describe('Content type'),
    },
    async (params) => {
      const ctx = service.set(params);
      return jsonContent(ctx);
    }
  );

  server.tool(
    'context_get',
    'Get project context — one key or all keys for a project',
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
    }
  );

  server.tool(
    'context_analyze',
    'Analyze a project directory: git info, dependencies, file structure, languages',
    {
      directory: z.string().describe('Absolute path to project directory'),
    },
    async ({ directory }) => {
      try {
        const analysis = analyzeProject(directory);
        return jsonContent(analysis);
      } catch (error) {
        return textContent(`Analysis error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );
}
