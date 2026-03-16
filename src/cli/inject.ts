import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { getDb } from '../db/connection.js';
import { MemoryService } from '../services/memory.service.js';
import { ContextService } from '../services/context.service.js';
import { EntityService } from '../services/entity.service.js';
import { closeDb } from '../db/connection.js';
import type { ProjectContextRow } from '../db/schema.js';

interface InjectOptions {
  dbPath?: string;
  project?: string;
}

function detectProject(): string[] {
  const cwd = process.cwd();
  const candidates: string[] = [];

  // Try package.json name
  const pkgPath = join(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.name) candidates.push(pkg.name);
    } catch { /* ignore */ }
  }

  // Directory name as fallback
  const dirName = (cwd.split('/').pop() || 'global').toLowerCase().replace(/\s+/g, '-');
  if (!candidates.includes(dirName)) candidates.push(dirName);

  // Always include global
  if (!candidates.includes('global')) candidates.push('global');

  return candidates;
}

export function injectContext(options: InjectOptions): void {
  const projects = options.project ? [options.project] : detectProject();
  const db = getDb(options.dbPath);
  const memoryService = new MemoryService(db);
  const contextService = new ContextService(db);
  const entityService = new EntityService(db);

  const lines: string[] = [];
  const seenMemoryIds = new Set<string>();

  for (const project of projects) {
    // Project context
    const contextEntries = contextService.get({ project }) as ProjectContextRow[] | null;
    if (contextEntries && Array.isArray(contextEntries) && contextEntries.length > 0) {
      lines.push(`## Project: ${project}`);
      for (const entry of contextEntries) {
        lines.push(`- **${entry.key}**: ${entry.value}`);
      }
      lines.push('');
    }

    // Recent project decisions
    const decisions = memoryService.list({ project, type: 'decision', limit: 5, offset: 0 });
    for (const mem of decisions) {
      if (!seenMemoryIds.has(mem.id)) {
        seenMemoryIds.add(mem.id);
        if (decisions.indexOf(mem) === 0) lines.push('## Recent Decisions');
        lines.push(`- ${mem.content}`);
      }
    }
    if (decisions.length > 0) lines.push('');

    // Recent project memories
    const projectMemories = memoryService.list({ project, type: 'project', limit: 5, offset: 0 });
    for (const mem of projectMemories) {
      if (!seenMemoryIds.has(mem.id)) {
        seenMemoryIds.add(mem.id);
        if (projectMemories.indexOf(mem) === 0) lines.push('## Project Notes');
        lines.push(`- ${mem.content}`);
      }
    }
    if (projectMemories.length > 0) lines.push('');

    // Key entities for this project
    const entities = entityService.search({ query: '%', project, limit: 10 });
    if (entities.length > 0) {
      lines.push('## Known Entities');
      for (const ent of entities) {
        const desc = ent.description ? ` — ${ent.description}` : '';
        lines.push(`- **${ent.name}** (${ent.type})${desc}`);
      }
      lines.push('');
    }
  }

  // Global user feedback (across all projects)
  const userMemories = memoryService.list({ type: 'feedback', limit: 10, offset: 0 });
  if (userMemories.length > 0) {
    lines.push('## User Feedback & Preferences');
    for (const mem of userMemories) {
      lines.push(`- ${mem.content}`);
    }
    lines.push('');
  }

  closeDb();

  if (lines.length > 0) {
    console.log(lines.join('\n'));
  }
}
