# Cortex MCP

> Universal AI memory, context, and entity server using the Model Context Protocol

Cortex MCP gives any AI assistant (Claude, GPT, Gemini, Cursor, or any MCP-compatible client) a **persistent brain** — memories that survive between sessions, project context awareness, and entity relationship tracking. All data stays local on your machine in a SQLite database.

## Features

- **Persistent Memory** — Store, search, and manage memories with full-text search (FTS5)
- **Project Context** — Key-value context per project, plus automatic project analysis
- **Entity Tracking** — Track people, projects, organizations, tools, and concepts with relationship linking
- **Task Scheduler** — Create recurring or one-time automated tasks
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

### Memory Tools (6)

| Tool | Description | Key Params |
|------|-------------|------------|
| `memory_store` | Store a new memory | `content`, `type`, `tags`, `project` |
| `memory_search` | Full-text search across memories | `query`, `project`, `type`, `tags` |
| `memory_list` | List memories with pagination | `project`, `type`, `limit`, `offset` |
| `memory_get` | Get a single memory by ID | `id` |
| `memory_update` | Update an existing memory | `id`, `content`, `type`, `tags` |
| `memory_delete` | Delete a memory | `id` |

**Memory types:** `note`, `feedback`, `project`, `reference`, `decision`, `snippet`

### Entity Tools (3)

| Tool | Description | Key Params |
|------|-------------|------------|
| `entity_store` | Create a new entity | `name`, `type`, `description`, `properties` |
| `entity_search` | Search entities by name/description | `query`, `type`, `project` |
| `entity_link_memory` | Link an entity to a memory | `entity_id`, `memory_id`, `relation` |

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
| `scheduler_create` | Schedule a task | `name`, `schedule`, `action`, `project` |
| `scheduler_list` | List scheduled tasks | `project`, `enabled` |
| `scheduler_get` | Get task details | `id` |
| `scheduler_update` | Modify a task | `id`, `schedule`, `enabled` |
| `scheduler_delete` | Remove a task | `id` |
| `scheduler_check_due` | Get tasks due to run | — |

**Schedule formats:** `"once"`, `"every 5m"`, `"every 1h"`, `"every 1d"`

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
- [ ] **v0.3** — StreamableHTTP transport for ChatGPT/Gemini access
- [ ] **v0.3** — Web dashboard for browsing memories
- [ ] **v0.4** — Import/export functionality
- [ ] **v0.4** — Multi-user support with authentication

## License

MIT
