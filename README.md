# Cortex MCP

> Universal AI memory server with active notifications — memory, entities, scheduling with macOS/Telegram alerts, intentions, archival, and session management via MCP

Cortex MCP gives any AI assistant (Claude, GPT, Gemini, Cursor, or any MCP-compatible client) a **persistent brain** — memories that survive between sessions, project context awareness, entity relationship tracking, intention tracking for open loops, structured project state, and seamless session handoffs. All data stays local on your machine in a SQLite database.

## Features

- **Persistent Memory** — Store, search, and manage memories with full-text search (FTS5), archival, and duplicate detection
- **Active Scheduler** — Schedule reminders that actually notify you via macOS banners, voice alerts, and Telegram
- **Project Context** — Key-value context per project, plus automatic project analysis
- **Entity Knowledge Graph** — Track people, projects, organizations, tools, and concepts with relationships, timelines, and linked memories
- **Intention Tracking** — Track open loops, pending decisions, and goals with automatic trigger conditions (keyword, date, time elapsed)
- **Project State** — Structured project phases, milestones, blockers, and focus areas with history snapshots
- **Session Handoff** — Start/end sessions with automatic briefings, handoff notes, and continuity between conversations
- **Memory Hygiene** — Archive old memories, find duplicates before storing, keep the knowledge base clean
- **Auto Context Injection** — Built-in CLI command to load context at session start
- **Privacy First** — All data stored locally in `~/.cortex-mcp/cortex.db`
- **Universal** — Works with any MCP-compatible AI client
- **Zero Config** — Just install and connect

## Quick Start

### Install

```bash
npm install -g cortex-mcp
```

### Configure for Claude Code

Add to `~/.claude/.mcp.json`:

```json
{
  "mcpServers": {
    "cortex": {
      "command": "cortex-mcp"
    }
  }
}
```

### Configure for Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "cortex": {
      "command": "cortex-mcp"
    }
  }
}
```

### Configure for Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "cortex": {
      "command": "cortex-mcp"
    }
  }
}
```

### Using npx (no install)

Replace `"command": "cortex-mcp"` with:

```json
{
  "command": "npx",
  "args": ["-y", "cortex-mcp"]
}
```

## Tools Reference

### Memory Tools (8)

| Tool | Description | Key Params |
|------|-------------|------------|
| `memory_store` | Store a new memory | `content`, `type`, `tags`, `project` |
| `memory_search` | Full-text search across memories | `query`, `project`, `type`, `tags` |
| `memory_list` | List memories with pagination | `project`, `type`, `limit`, `offset` |
| `memory_get` | Get a single memory by ID | `id` |
| `memory_update` | Update an existing memory | `id`, `content`, `type`, `tags` |
| `memory_delete` | Delete a memory | `id` |
| `memory_archive` | Archive old memories by age or specific IDs | `older_than_days`, `memory_ids` |
| `memory_find_duplicates` | Find similar memories before storing | `content`, `threshold` |

**Memory types:** `note`, `feedback`, `project`, `reference`, `decision`, `snippet`

### Entity Tools (7)

| Tool | Description | Key Params |
|------|-------------|------------|
| `entity_store` | Create a new entity | `name`, `type`, `description`, `properties` |
| `entity_search` | Search entities by name/description | `query`, `type`, `project` |
| `entity_get_full` | Get complete entity picture (properties, memories, relationships, timeline) | `entity_id` |
| `entity_update` | Update entity name, type, description, or properties | `id`, `name`, `type`, `description` |
| `entity_link_memory` | Link an entity to a memory | `entity_id`, `memory_id`, `relation` |
| `entity_link_entity` | Create typed relationship between entities | `source_entity_id`, `target_entity_id`, `relation` |
| `entity_timeline` | Add chronological event to an entity | `entity_id`, `event`, `event_date` |

**Entity types:** `person`, `project`, `organization`, `tool`, `concept`

### Context Tools (3)

| Tool | Description | Key Params |
|------|-------------|------------|
| `context_set` | Set a project context value | `project`, `key`, `value`, `content_type` |
| `context_get` | Get context for a project | `project`, `key` (optional) |
| `context_analyze` | Analyze a project directory | `directory` |

### Scheduler Tools (6)

| Tool | Description | Key Params |
|------|-------------|------------|
| `scheduler_create` | Schedule a reminder or recurring task with real notifications | `name`, `schedule`, `action`, `run_at`, `project` |
| `scheduler_list` | List scheduled tasks | `project`, `enabled` |
| `scheduler_get` | Get task details | `id` |
| `scheduler_update` | Modify a task | `id`, `schedule`, `enabled` |
| `scheduler_delete` | Remove a task | `id` |
| `scheduler_check_due` | Get tasks due to run | — |

**Schedule formats:** `"once"`, `"every 5m"`, `"every 1h"`, `"every 1d"`
**Notifications:** macOS banners + voice alerts (zero config), optional Telegram

### Intention Tools (5)

| Tool | Description | Key Params |
|------|-------------|------------|
| `intention_create` | Track an open loop or pending decision | `title`, `priority`, `trigger_conditions`, `project` |
| `intention_get` | Get full details of an intention | `id` |
| `intention_update` | Update status, resolve, or add triggers | `id`, `status`, `resolve_reason` |
| `intention_list` | List intentions by status/project/priority | `status`, `project`, `priority` |
| `intention_check_triggers` | Check which intentions have fired triggers | — |

**Statuses:** `open`, `waiting`, `blocked`, `resolved`, `abandoned`
**Trigger types:** `keyword`, `date`, `time_elapsed`, `entity_update`, `custom`

### Project State Tools (3)

| Tool | Description | Key Params |
|------|-------------|------------|
| `project_state_set` | Set/update project phase, milestones, blockers | `project`, `phase`, `milestones`, `blockers` |
| `project_state_get` | Get current project state | `project` |
| `project_state_history` | View project evolution over time | `project`, `limit` |

### Session Tools (2)

| Tool | Description | Key Params |
|------|-------------|------------|
| `session_start` | Begin session with full briefing (triggered intentions, states, handoff notes) | `project` |
| `session_end` | Close session with summary and handoff notes for next time | `id`, `summary`, `next_session_notes` |

## Auto Context Injection

Cortex can automatically inject project context at the start of every Claude Code session using hooks.

### Setup

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "cortex-mcp inject"
          }
        ]
      }
    ]
  }
}
```

The `inject` command auto-detects the current project (via `package.json` name or directory name) and outputs relevant context, decisions, entities, and user preferences from cortex memory.

Options:
- `--project <name>` — Override auto-detected project name
- `--db-path <path>` — Custom database path

## Usage Examples

### Storing a memory

> "Remember that our API uses JWT tokens with 24h expiration"

The AI will call `memory_store` with appropriate type and tags.

### Searching memories

> "What do you remember about our authentication system?"

The AI will call `memory_search` with query `"authentication"`.

### Tracking entities

> "John is our backend lead, working on the payments service"

The AI will call `entity_store` to create John, then link relevant memories.

### Setting project context

> "This project uses React + TypeScript with Tailwind CSS"

The AI will call `context_set` to store the tech stack for the current project.

### Analyzing a project

> "Analyze the project in /path/to/my-app"

The AI will call `context_analyze` to get git info, dependencies, file structure, and detected languages.

### Tracking open loops

> "We still haven't decided on the auth provider — remind me if I don't resolve this within 2 weeks"

The AI will call `intention_create` with a `time_elapsed` trigger set to `"14d"`.

### Scheduling a reminder

> "Remind me tomorrow at 15:00 to go to the barber"

The AI will call `scheduler_create` with `run_at: "2026-03-17T15:00:00"` and action type `"reminder"`. At 15:00, you'll get a macOS notification banner + voice alert.

### Session handoff

> "Let's wrap up for today"

The AI will call `session_end` with a summary and handoff notes, so the next session starts with full context.

## Notifications

The scheduler delivers **real notifications** when reminders are due — no extra setup needed.

| Channel | Config | Notes |
|---------|--------|-------|
| macOS banner | Zero config | Notification banner with sound |
| Voice alert | Zero config | `say` command — works even with Focus Mode |
| Telegram | Optional | Mobile notifications anywhere |

### Telegram setup (optional)

Create `~/.cortex-mcp/config.json`:

```json
{
  "telegram": {
    "bot_token": "YOUR_BOT_TOKEN",
    "chat_id": "YOUR_CHAT_ID"
  }
}
```

### Standalone daemon

When the MCP server isn't running, use the daemon to keep notifications active:

```bash
cortex-mcp daemon start     # Start background daemon
cortex-mcp daemon stop      # Stop daemon
cortex-mcp daemon status    # Check if running
cortex-mcp daemon install   # Auto-start on login (macOS LaunchAgent)
cortex-mcp daemon uninstall # Remove auto-start
```

## Configuration

| Flag | Description | Default |
|------|-------------|---------|
| `--db-path` | Custom database file path | `~/.cortex-mcp/cortex.db` |

### Custom database path

```json
{
  "mcpServers": {
    "cortex": {
      "command": "cortex-mcp",
      "args": ["--db-path", "/path/to/custom.db"]
    }
  }
}
```

## Data Storage

All data is stored in a single SQLite file at `~/.cortex-mcp/cortex.db` by default.

**Backup:**
```bash
cp ~/.cortex-mcp/cortex.db ~/cortex-backup.db
```

**Reset:**
```bash
rm ~/.cortex-mcp/cortex.db
```

## Development

```bash
git clone https://github.com/Resolut1onEDL/cortex-mcp.git
cd cortex-mcp
npm install
npm run dev        # Watch mode with tsx
npm test           # Run tests
npm run build      # Compile TypeScript
npm run typecheck  # Type check without emitting
```

## Roadmap

- [x] **v0.1** — Memory, entities, context, project analysis
- [x] **v0.2** — Task scheduler, auto context injection, improved tool descriptions
- [x] **v0.3** — Intention tracking, project state management, session handoff, enhanced entity graph
- [x] **v0.4** — Active scheduler with real notifications (macOS + voice + Telegram), memory archival & deduplication, entity update, daemon CLI
- [ ] **v0.5** — StreamableHTTP transport for ChatGPT/Gemini access
- [ ] **v0.5** — Web dashboard for browsing memories
- [ ] **v0.6** — Import/export functionality
- [ ] **v0.6** — Multi-user support with authentication

## License

MIT
