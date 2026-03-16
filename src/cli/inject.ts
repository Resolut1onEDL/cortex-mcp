import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { getDb } from '../db/connection.js';
import { MemoryService } from '../services/memory.service.js';
import { ContextService } from '../services/context.service.js';
import { EntityService } from '../services/entity.service.js';
import { IntentionService } from '../services/intention.service.js';
import { ProjectStateService } from '../services/project-state.service.js';
import { SessionService } from '../services/session.service.js';
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
  const intentionService = new IntentionService(db);
  const projectStateService = new ProjectStateService(db);
  const sessionService = new SessionService(db);

  const lines: string[] = [];
  const seenMemoryIds = new Set<string>();

  // Last session handoff notes
  const primaryProject = projects[0];
  const lastSession = sessionService.getLatest(primaryProject);
  if (lastSession?.next_session_notes) {
    lines.push('## Last Session Notes');
    lines.push(lastSession.next_session_notes);
    lines.push('');
    if (lastSession.ended_at) {
      const days = Math.floor((Date.now() - new Date(lastSession.ended_at).getTime()) / 86400000);
      if (days > 0) lines.push(`*${days} day(s) since last session*\n`);
    }
  }

  // Triggered intentions (across all projects)
  const triggered = intentionService.checkTriggers();
  if (triggered.length > 0) {
    lines.push('## Triggered Intentions');
    for (const t of triggered) {
      const reasons = t.fired_triggers.map(f => f.reason).join('; ');
      lines.push(`- **[${t.intention.priority}] ${t.intention.title}** — ${reasons}`);
      if (t.intention.next_action) lines.push(`  Next: ${t.intention.next_action}`);
    }
    lines.push('');
  }

  // Open intentions (high priority first)
  const openIntentions = intentionService.list({ status: 'open', limit: 10 });
  const nonTriggeredOpen = openIntentions.filter(
    i => !triggered.some(t => t.intention.id === i.id)
  );
  if (nonTriggeredOpen.length > 0) {
    lines.push('## Open Intentions');
    for (const int of nonTriggeredOpen) {
      lines.push(`- [${int.priority}] ${int.title}`);
    }
    lines.push('');
  }

  for (const project of projects) {
    // Project state
    const state = projectStateService.get(project);
    if (state) {
      lines.push(`## Project State: ${project}`);
      lines.push(`- **Phase**: ${state.phase} (${state.phase_status})`);
      if (state.current_focus) lines.push(`- **Focus**: ${state.current_focus}`);
      const milestones = JSON.parse(state.milestones) as Array<{ name: string; status: string }>;
      if (milestones.length > 0) {
        lines.push('- **Milestones**:');
        for (const m of milestones) {
          const icon = m.status === 'completed' ? '[x]' : m.status === 'in_progress' ? '[~]' : '[ ]';
          lines.push(`  ${icon} ${m.name}`);
        }
      }
      const blockers = JSON.parse(state.blockers) as string[];
      if (blockers.length > 0) {
        lines.push(`- **Blockers**: ${blockers.join(', ')}`);
      }
      lines.push('');
    }

    // Project context
    const contextEntries = contextService.get({ project }) as ProjectContextRow[] | null;
    if (contextEntries && Array.isArray(contextEntries) && contextEntries.length > 0) {
      lines.push(`## Context: ${project}`);
      for (const entry of contextEntries) {
        lines.push(`- **${entry.key}**: ${entry.value}`);
      }
      lines.push('');
    }

    // Recent decisions
    const decisions = memoryService.list({ project, type: 'decision', limit: 5, offset: 0 });
    for (const mem of decisions) {
      if (!seenMemoryIds.has(mem.id)) {
        seenMemoryIds.add(mem.id);
        if (decisions.indexOf(mem) === 0) lines.push('## Recent Decisions');
        lines.push(`- ${mem.content}`);
      }
    }
    if (decisions.length > 0) lines.push('');

    // Key entities
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

  // Global user feedback
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
