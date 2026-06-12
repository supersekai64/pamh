# CLI Reference

## Installation

```bash
pnpm install
pnpm build
```

## Commands

### Initialization

```bash
memory init global
```

Initialize global memory storage in `~/ai-memory/`.

```bash
memory init
```

Initialize memory storage in the current directory (`.ai-memory/`) and auto-configure supported agent/IDE integration files. PAMH will search for `.ai-memory/` by walking up the directory tree, similar to how `.git` works.

**Options:**

- `--no-integrations` - Skip agent and IDE integration files

### Status

```bash
memory status
```

Show current memory status, including which memory directory is being used and memory counts.

**Example:**

```bash
memory status
# Using memory: ~/projects/my-app/.ai-memory/
# Global memory: ~/ai-memory/
# Memories: 12 active, 3 proposed, 1 archived, 2 deleted
```

### Add Memory

```bash
memory add -t <type> -c <content> [options]
```

**Options:**

- `-t, --type <type>` - Memory type (required): decision, knowledge, mistake, rule, preference, session, task, client, project, pattern
- `-c, --content <content>` - Memory content (required)
- `-s, --scope <scope>` - Memory scope: global, project (default: global)
- `--tags <tags>` - Comma-separated tags
- `--salience <score>` - Importance score from `0` to `1` (default: `0.5`)
- `--project` - Use project memory instead of global

**Example:**

```bash
memory add -t decision -c "Use TypeScript for all packages" --tags "tech,typescript"
```

### List Memories

```bash
memory list [options]
```

**Options:**

- `--project` - Use project memory instead of global
- `--type <type>` - Filter by type
- `--scope <scope>` - Filter by scope
- `--tag <tag>` - Filter by tag

**Example:**

```bash
memory list --type decision --tag architecture
```

### Show Memory

```bash
memory show <id> [options]
```

**Options:**

- `--project` - Use project memory instead of global

**Example:**

```bash
memory show mem_abc123def456
```

### Edit Memory

```bash
memory edit <id> [options]
```

**Options:**

- `-c, --content <content>` - New content
- `-t, --type <type>` - New type
- `-s, --scope <scope>` - New scope
- `--tags <tags>` - New comma-separated tags
- `--project` - Use project memory instead of global

**Example:**

```bash
memory edit mem_abc123 -c "Updated content" --tags "updated"
```

### Delete Memory

```bash
memory delete <id> [options]
```

**Options:**

- `--project` - Use project memory instead of global

**Example:**

```bash
memory delete mem_abc123
```

By default, deletion is logical (status set to `deleted`). Use `--physical` only when you want to remove the Markdown file.

### Archive Memory

```bash
memory archive <id> [options]
```

Archive a memory by setting its status to `archived`.

**Options:**

- `--project` - Use project memory instead of global

**Example:**

```bash
memory archive mem_abc123
```

### Search Memories

```bash
memory search [query] [options]
```

**Options:**

- `--type <type>` - Filter by type
- `--scope <scope>` - Filter by scope
- `--tag <tag>` - Filter by tag
- `--limit <limit>` - Maximum results (default: 50)
- `--semantic` - Use semantic vector search
- `--project` - Use project memory instead of global

**Examples:**

```bash
memory search "TypeScript"
memory search --tag "architecture"
memory search --type decision --scope project
memory search "database" --tag "sql" --limit 10
memory search "frontend framework" --semantic
```

Semantic search uses a hybrid embedding provider: local embeddings by default, or OpenAI embeddings when `EMBEDDING_PROVIDER=openai` and `OPENAI_API_KEY` are configured.

### Index Management

```bash
memory index build [options]
```

Index all memories into SQLite.

```bash
memory index rebuild [options]
```

Rebuild the entire index from scratch.

```bash
memory reindex [options]
```

Top-level alias for `memory index rebuild`.

**Options:**

- `--project` - Use project memory instead of global

### Doctor

```bash
memory doctor check [options]
```

Check consistency between Markdown files and SQLite index.

```bash
memory doctor stats [options]
```

Show memory statistics (counts by type, scope, tags).

**Options:**

- `--project` - Use project memory instead of global

### Redact Memory

```bash
memory redact <id> [options]
```

Redact sensitive information (emails, API keys, tokens, passwords, secrets) from a memory.

**Options:**

- `--project` - Use project memory instead of global

**Example:**

```bash
memory redact mem_abc123
```

### Restore Memory

```bash
memory restore <id> [options]
```

Restore a logically deleted memory (status back to `active`).

**Options:**

- `--project` - Use project memory instead of global

**Example:**

```bash
memory restore mem_abc123
```

### Audit

```bash
memory audit [options]
```

Display comprehensive memory statistics including counts by type, scope, top tags, and index status.

**Options:**

- `--project` - Use project memory instead of global

### Export

```bash
memory export <output> [options]
```

Export all memories to a file.

**Options:**

- `-f, --format <format>` - Export format: `zip`, `json`, `markdown`, `sqlite` (default: `zip`)
- `--project` - Use project memory instead of global

**Examples:**

```bash
memory export backup.zip
memory export backup.json --format json
memory export backup.md --format markdown
memory export memory.sqlite --format sqlite
```

### Import

```bash
memory import <input> [options]
```

Import memories from a file.

**Options:**

- `-f, --format <format>` - Import format: `zip`, `json`, `markdown` (default: `json`)
- `--project` - Use project memory instead of global

**Examples:**

```bash
memory import backup.json
memory import backup.zip --format zip
memory import memory.md --format markdown
```

### Context

```bash
memory context [options]
```

Compile context from all memory sources (Global → Project → Linked → Search) into a single document suitable for LLM consumption.

**Options:**

- `-q, --query <query>` - Search query to include relevant memories
- `--max-tokens <tokens>` - Maximum tokens in compiled context (default: 4000)
- `--no-global` - Exclude global memory
- `--no-project` - Exclude project memory
- `--no-linked` - Exclude linked projects memory
- `--no-search` - Exclude search results
- `-o, --output` - Write compiled context to `compiled-context.md`
- `--project` - Use project memory instead of global

**Examples:**

```bash
memory context
memory context --query "TypeScript architecture"
memory context --max-tokens 2000 --output
memory context --no-linked --no-search
```

### Supersede Memory

```bash
memory supersede create <old_id> -t <type> -c <content> [options]
```

Create a new memory that replaces an existing memory. The old memory is archived and linked to the new version.

**Options:**

- `-t, --type <type>` - Memory type (required)
- `-s, --scope <scope>` - Memory scope (defaults to `project` with `--project`, otherwise `global`)
- `-c, --content <content>` - New memory content (required)
- `--tags <tags>` - Comma-separated tags
- `--salience <salience>` - Importance score from `0` to `1` (default: `0.5`)
- `--project` - Use project memory instead of global

```bash
memory supersede chain <memory_id> [options]
memory supersede latest <memory_id> [options]
```

Show the full supersession chain or only the latest version.

**Examples:**

```bash
memory supersede create mem_abc123 -t decision -c "Use SQLite for local indexing" --project
memory supersede chain mem_abc123 --project
memory supersede latest mem_abc123 --project
```

### Handoff

```bash
memory handoff begin -s <summary> [options]
memory handoff accept [options]
memory handoff list [options]
```

Create, accept, and list cross-agent handoffs so another agent can resume with current context.

**Options:**

- `-s, --summary <summary>` - Summary of where you left off (required for `begin`)
- `-a, --agent <agent>` - Agent name for `begin` or `accept`
- `-q, --questions <questions>` - Comma-separated open questions for `begin`
- `-n, --next-steps <steps>` - Comma-separated next steps for `begin`
- `--status <status>` - Filter `list` by `open`, `accepted`, or `expired`
- `--project` - Use project memory instead of global

**Examples:**

```bash
memory handoff begin --project -a opencode -s "Implemented storage changes" -n "Run release checks"
memory handoff accept --project -a claude-code
memory handoff list --project --status open
```

### Decay

```bash
memory decay sweep [options]
```

Run a forget sweep. Memories below the decay threshold are soft-deleted, while old archived memories can be physically removed after the configured retention period.

**Options:**

- `--lambda <lambda>` - Temporal decay rate (default: `0.02`)
- `--sigma <sigma>` - Access reinforcement weight (default: `0.6`)
- `--mu <mu>` - Access decay rate (default: `0.04`)
- `--threshold <threshold>` - Cold threshold (default: `0.20`)
- `--hard-delete-days <days>` - Days before hard-delete (default: `180`)
- `--dry-run` - Preview without making changes
- `--project` - Use project memory instead of global

**Example:**

```bash
memory decay sweep --project --dry-run
```

### Intelligence

```bash
memory intelligence recommend [options]
memory intelligence list [options]
memory intelligence cleanup [options]
memory intelligence distill [options]
memory intelligence graph [options]
memory intelligence seed-eval [options]
```

Analyze memory quality and produce reviewable maintenance proposals.

**Common options:**

- `--project` - Use project memory instead of global
- `--json` - Print JSON output

**Recommendation actions:**

```bash
memory intelligence apply <id> [options]
memory intelligence reject <id> [options]
memory intelligence defer <id> [options]
```

`apply` accepts `--confirm-physical-delete` for recommendations that explicitly
request physical deletion.

**Examples:**

```bash
memory intelligence recommend --project
memory intelligence cleanup --project
memory intelligence distill --project
memory intelligence distill --project --apply
memory intelligence graph --project --json
memory intelligence seed-eval --project
```

The intelligence layer keeps recommendations separate from memory mutations.
Distillation creates proposed memories by default and preserves source evidence
IDs. See `docs/intelligence.md` for the full model.

### Server

```bash
memory server start
```

Start the PAMH MCP server over stdio. This command is intended to be launched by MCP-compatible clients such as Claude Code, OpenCode, Cursor, Continue.dev, or other agent runtimes.

See `docs/mcp.md` for integration details.

### Hooks

```bash
memory hook record <type> [options]
```

Record an agent lifecycle event for assisted capture workflows. This is intended
for tools that can run shell hooks even when they do not call MCP directly.

**Options:**

- `--project` - Use project memory instead of global
- `--agent <agent>` - Agent or tool name
- `--model <model>` - Model name when known
- `--session-id <sessionId>` - Agent session identifier
- `--data <json>` - Additional event data as a JSON object

When `--data` is omitted, `memory hook record` also accepts JSON or plain text
from stdin. This lets lifecycle hook systems pass the current prompt to PAMH
without shell-escaping it.

**Examples:**

```bash
memory hook record session-start --project --agent claude-code
memory hook record session-end --project --agent codex --model gpt-5
echo '{"text":"Always update docs after code changes"}' | memory hook record user-prompt --project --agent local-hook
```

### Local UI

```bash
memory ui [options]
```

Start the local PAMH web UI and API server.

**Options:**

- `--host <host>` - Host to bind (default: `127.0.0.1`)
- `-p, --port <port>` - Port to bind (default: `3939`)
- `--open` - Open the UI in the default browser

**Examples:**

```bash
memory ui
memory ui --open
memory ui --port 4040
```

## Memory Types

- `decision` - Architectural or technical decisions
- `knowledge` - General knowledge and facts
- `mistake` - Lessons learned from mistakes
- `rule` - Rules and constraints
- `preference` - User preferences
- `session` - Session notes
- `task` - Tasks and todos
- `client` - Client information
- `project` - Project metadata
- `pattern` - Reusable patterns

## Memory Scopes

- `global` - Global memory (default)
- `project` - Project-specific memory
- `client` - Client-specific memory
- `stack` - Technology stack memory
- `temporary` - Temporary memory
- `archived` - Archived memory
