import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { EntityService } from '../services/entity.service.js';
import { jsonContent, textContent } from '../utils/response.js';

const ENTITY_TYPES = ['person', 'project', 'organization', 'tool', 'concept'] as const;

export function registerEntityTools(server: McpServer, db: Database.Database): void {
  const service = new EntityService(db);

  server.tool(
    'entity_store',
    'Create a new entity (person, project, organization, tool, or concept)',
    {
      name: z.string().describe('Entity name'),
      type: z.enum(ENTITY_TYPES).describe('Entity type'),
      description: z.string().optional().describe('Entity description'),
      properties: z.record(z.string(), z.string()).optional().describe('Key-value properties'),
      project: z.string().default('global').describe('Project/namespace scope'),
    },
    async (params) => {
      const entity = service.store(params);
      return jsonContent(entity);
    }
  );

  server.tool(
    'entity_search',
    'Search entities by name or description',
    {
      query: z.string().describe('Search query (matches name and description)'),
      type: z.enum(ENTITY_TYPES).optional().describe('Filter by entity type'),
      project: z.string().optional().describe('Filter by project scope'),
      limit: z.number().default(10).describe('Max results'),
    },
    async (params) => {
      const results = service.search(params);
      return jsonContent({ count: results.length, entities: results });
    }
  );

  server.tool(
    'entity_link_memory',
    'Link an entity to a memory with a relationship type',
    {
      entity_id: z.string().describe('Entity ID'),
      memory_id: z.string().describe('Memory ID'),
      relation: z.string().default('related').describe('Relationship type (e.g. authored, about, related)'),
    },
    async (params) => {
      try {
        const link = service.linkMemory(params);
        return jsonContent({ success: true, ...link });
      } catch (error) {
        return textContent(`Link error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );
}
