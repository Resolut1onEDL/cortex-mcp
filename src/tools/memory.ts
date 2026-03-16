import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { MemoryService } from '../services/memory.service.js';
import { jsonContent, textContent } from '../utils/response.js';

const MEMORY_TYPES = ['note', 'feedback', 'project', 'reference', 'decision', 'snippet'] as const;

export function registerMemoryTools(server: McpServer, db: Database.Database): void {
  const service = new MemoryService(db);

  server.tool(
    'memory_store',
    'Save important information that should persist across sessions — user preferences, project decisions, learned patterns, feedback, or anything worth remembering later. Use this when you encounter information that would be lost when the conversation ends.',
    {
      content: z.string().describe('The memory content to store'),
      type: z.enum(MEMORY_TYPES).default('note').describe('Memory type'),
      tags: z.array(z.string()).optional().describe('Tags for categorization'),
      project: z.string().default('global').describe('Project/namespace scope'),
      metadata: z.record(z.string(), z.string()).optional().describe('Extra key-value metadata'),
    },
    async (params) => {
      const memory = service.store(params);
      return jsonContent(memory);
    }
  );

  server.tool(
    'memory_search',
    'Recall relevant memories before answering questions or making decisions. Search by keywords, topics, or context. Use this to check if you already know something about the user, project, or topic before starting work.',
    {
      query: z.string().describe('Search query (supports FTS5 syntax)'),
      project: z.string().optional().describe('Filter by project scope'),
      type: z.enum(MEMORY_TYPES).optional().describe('Filter by memory type'),
      tags: z.array(z.string()).optional().describe('Filter by tags (AND logic)'),
      limit: z.number().default(10).describe('Max results to return'),
    },
    async (params) => {
      try {
        const results = service.search(params);
        return jsonContent({ count: results.length, memories: results });
      } catch (error) {
        return textContent(`Search error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );

  server.tool(
    'memory_list',
    'Browse all stored memories, optionally filtered by project or type. Use to review what is known about a project or to find memories when search terms are unclear.',
    {
      project: z.string().optional().describe('Filter by project scope'),
      type: z.enum(MEMORY_TYPES).optional().describe('Filter by memory type'),
      limit: z.number().default(20).describe('Max results per page'),
      offset: z.number().default(0).describe('Offset for pagination'),
    },
    async (params) => {
      const results = service.list(params);
      return jsonContent({ count: results.length, memories: results });
    }
  );

  server.tool(
    'memory_get',
    'Retrieve a specific memory by ID when you already have the reference.',
    {
      id: z.string().describe('Memory ID'),
    },
    async ({ id }) => {
      const memory = service.get(id);
      if (!memory) {
        return textContent(`Memory not found: ${id}`);
      }
      return jsonContent(memory);
    }
  );

  server.tool(
    'memory_update',
    'Correct or enrich an existing memory — update its content, reclassify its type, or refine its tags when you learn new information.',
    {
      id: z.string().describe('Memory ID to update'),
      content: z.string().optional().describe('New content'),
      type: z.enum(MEMORY_TYPES).optional().describe('New type'),
      tags: z.array(z.string()).optional().describe('New tags (replaces existing)'),
      metadata: z.record(z.string(), z.string()).optional().describe('New metadata (replaces existing)'),
    },
    async (params) => {
      const memory = service.update(params);
      if (!memory) {
        return textContent(`Memory not found: ${params.id}`);
      }
      return jsonContent(memory);
    }
  );

  server.tool(
    'memory_delete',
    'Remove a memory that is outdated, incorrect, or no longer relevant.',
    {
      id: z.string().describe('Memory ID to delete'),
    },
    async ({ id }) => {
      const deleted = service.delete(id);
      if (!deleted) {
        return textContent(`Memory not found: ${id}`);
      }
      return jsonContent({ success: true, deleted_id: id });
    }
  );
}
