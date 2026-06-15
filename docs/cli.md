# CLI Reference

## Installation

```bash
pnpm install
pnpm build
```

## Commands

### Upgrade

```bash
memory upgrade
```

Update the global PAMH CLI. The command starts a small updater process, stops
running PAMH UI/MCP services, then runs `npm install -g pamh-cli@latest`.
This is the recommended update path on Windows because native SQLite files can
stay locked while PAMH services are running.

### Initialization

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
# Memories: 12 active, 3 proposed, 1 archived, 2 deleted
```

### Add Memory

```bash
memory add -t <type> -c <content> [options]
```

**Options:**

- `-t, --type <type>` - Memory type (required): decision, knowledge, mistake, rule, preference, session, task
- `-c, --content <content>` - Memory content (required)
- `--tags <tags>` - Comma-separated tags
- `--salience <score>` - Importance score from `0` to `1` (default: `0.5`)

**Example:**

```bash
memory add -t decision -c "Use TypeScript for all packages" --tags "tech,typescript"
```

### Checkpoint

```bash
memory checkpoint [options]
```

Submit a structured summary of durable session learnings. This is the CLI fallback for agents that cannot call the MCP `memory_checkpoint` tool. It respects capture mode: `manual` records no durable memories, `assisted` creates `proposed` memories, and `auto` creates `active` memories.

**Options:**

- `--summary <summary>` - Short summary of completed work
- `--decision <decision>` - Durable technical decision (repeatable)
- `--fact <fact>` - Reusable project fact (repeatable)
- `--preference <preference>` - Durable UX or workflow preference (repeatable)
- `--mistake <mistake>` - Reusable lesson from a correction or bug (repeatable)
- `--task <task>` - Follow-up task (repeatable)
- `--agent <agent>` - Agent name to tag checkpoint memories
- `--model <model>` - Model name to tag checkpoint memories
- `--session-id <session_id>` - Session identifier for hook/audit records
- `--json` - Print the raw checkpoint result as JSON

**Example:**

```bash
memory checkpoint \
  --summary "Updated the local UI workflow" \
  --decision "Use Evidence as the review queue for proposed memories" \
  --preference "Proposed memories should be prominent in the sidebar" \
  --agent codex
```

### List Memories

```bash
memory list [options]
```

**Options:**

- `--type <type>` - Filter by type
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
- `--tags <tags>` - New comma-separated tags

**Example:**

```bash
memory edit mem_abc123 -c "Updated content" --tags "updated"
```

### Delete Memory

```bash
memory delete <id> [options]
```

**Options:**

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
- `--tag <tag>` - Filter by tag
- `--limit <limit>` - Maximum results (default: 50)
- `--semantic` - Use semantic vector search

**Examples:**

```bash
memory search "TypeScript"
memory search --tag "architecture"
memory search "database" --tag "sql" --limit 10
memory search "frontend framework" --semantic
```

Semantic search uses either optional local embeddings or OpenAI embeddings. For local embeddings with the global CLI, install `@xenova/transformers` globally once:

```bash
npm install -g @xenova/transformers
```

For OpenAI embeddings, set `EMBEDDING_PROVIDER=openai` and `OPENAI_API_KEY`.

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

### Doctor

```bash
memory doctor check [options]
```

Check consistency between Markdown files and SQLite index.

```bash
memory doctor stats [options]
```

Show memory statistics (counts by status, type, and tags).

**Options:**

### Redact Memory

```bash
memory redact <id> [options]
```

Redact sensitive information (emails, API keys, tokens, passwords, secrets) from a memory.

**Options:**

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

**Example:**

```bash
memory restore mem_abc123
```

### Audit

```bash
memory audit [options]
```

Display comprehensive memory statistics including counts by status, type, top tags, and index status.

**Options:**

### Export

```bash
memory export <output> [options]
```

Export all memories to a file.

**Options:**

- `-f, --format <format>` - Export format: `zip`, `json`, `markdown`, `sqlite` (default: `zip`)

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

Compile context from project memory and optional search results into a single document suitable for LLM consumption. The output groups memories by durable meaning rather than raw storage order, and omits project-only scope metadata.

**Options:**

- `-q, --query <query>` - Search query to include relevant memories
- `--max-tokens <tokens>` - Maximum tokens in compiled context (default: 4000)
- `--no-project` - Exclude project memory
- `--no-search` - Exclude search results
- `-o, --output` - Write compiled context to `compiled-context.md`

**Examples:**

```bash
memory context
memory context --query "TypeScript architecture"
memory context --max-tokens 2000 --output
memory context --no-search
```

### Supersede Memory

```bash
memory supersede create <old_id> -t <type> -c <content> [options]
```

Create a new memory that replaces an existing memory. The old memory is archived and linked to the new version.

**Options:**

- `-t, --type <type>` - Memory type (required)
- `-c, --content <content>` - New memory content (required)
- `--tags <tags>` - Comma-separated tags
- `--salience <salience>` - Importance score from `0` to `1` (default: `0.5`)

```bash
memory supersede chain <memory_id> [options]
memory supersede latest <memory_id> [options]
```

Show the full supersession chain or only the latest version.

**Examples:**

```bash
memory supersede create mem_abc123 -t decision -c "Use SQLite for local indexing"
memory supersede chain mem_abc123
memory supersede latest mem_abc123
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

**Examples:**

```bash
memory handoff begin -a opencode -s "Implemented storage changes" -n "Run release checks"
memory handoff accept -a claude-code
memory handoff list --status open
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

**Example:**

```bash
memory decay sweep --dry-run
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
memory intelligence recommend
memory intelligence cleanup
memory intelligence distill
memory intelligence distill --apply
memory intelligence graph --json
memory intelligence seed-eval
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

- `--agent <agent>` - Agent or tool name
- `--model <model>` - Model name when known
- `--session-id <sessionId>` - Agent session identifier
- `--data <json>` - Additional event data as a JSON object

When `--data` is omitted, `memory hook record` also accepts JSON or plain text
from stdin. This lets lifecycle hook systems pass the current prompt to PAMH
without shell-escaping it.

**Examples:**

```bash
memory hook record session-start --agent claude-code
memory hook record session-end --agent codex --model gpt-5
echo '{"text":"Always update docs after code changes"}' | memory hook record user-prompt --agent local-hook
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
- `pattern` - Reusable patterns

## Memory Scope

- `project` - Project memory

Legacy scopes such as `global`, `client`, `stack`, `temporary`, and `archived` are normalized to `project` when older Markdown memories are read.
