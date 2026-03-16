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
    'Register a person, project, organization, tool, or concept that appears across multiple conversations. Entities connect related memories and build a knowledge graph over time.',
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
    'Look up known people, projects, tools, or concepts. Use this to check what is already known about someone or something before making assumptions.',
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
    'Connect an entity to a related memory — e.g., link a person to their feedback, or a project to a decision made about it.',
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

  server.tool(
    'entity_link_entity',
    'Create a typed relationship between two entities — "Roman owns 29% of TimeHUB", "Vika studies Applied Informatics", "TimeHUB located_in Bali". Builds a knowledge graph of how things connect.',
    {
      source_entity_id: z.string().describe('Source entity ID (the subject)'),
      target_entity_id: z.string().describe('Target entity ID (the object)'),
      relation: z.string().describe('Relationship type (e.g. owns, works_at, located_in, studies, part_of)'),
      properties: z.record(z.string(), z.string()).optional().describe('Additional properties (e.g. {"share": "29%"})'),
    },
    async (params) => {
      try {
        const link = service.linkEntity(params);
        return jsonContent({ success: true, ...link });
      } catch (error) {
        return textContent(`Link error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );

  server.tool(
    'entity_update',
    'Update an existing entity — change its name, description, type, or properties. Use when entity details evolve over time (e.g., person changes role, project changes phase).',
    {
      id: z.string().describe('Entity ID to update'),
      name: z.string().optional().describe('New name'),
      type: z.enum(ENTITY_TYPES).optional().describe('New type'),
      description: z.string().optional().describe('New description'),
      properties: z.record(z.string(), z.string()).optional().describe('New properties (replaces existing)'),
    },
    async (params) => {
      const entity = service.update(params);
      if (!entity) return textContent(`Entity not found: ${params.id}`);
      return jsonContent(entity);
    }
  );

  server.tool(
    'entity_timeline',
    'Add a chronological event to an entity — "TimeHUB: founded 2024-01", "revenue drop 2026-01", "restructuring discussion 2026-03". Builds a living history for any entity.',
    {
      entity_id: z.string().describe('Entity ID'),
      event: z.string().describe('Event description'),
      event_date: z.string().describe('When it happened (ISO date or approximate like "2026-01")'),
      metadata: z.record(z.string(), z.unknown()).optional().describe('Additional event data'),
    },
    async (params) => {
      try {
        const evt = service.addTimelineEvent(params);
        return jsonContent(evt);
      } catch (error) {
        return textContent(`Timeline error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );

  server.tool(
    'entity_get_full',
    'Get a complete picture of an entity — its properties, all linked memories, relationships to other entities, and chronological timeline. One call gives you everything known about a person, project, or concept.',
    {
      entity_id: z.string().describe('Entity ID'),
    },
    async ({ entity_id }) => {
      const full = service.getFull(entity_id);
      if (!full) return textContent(`Entity not found: ${entity_id}`);
      return jsonContent(full);
    }
  );
}
