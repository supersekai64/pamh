# CLI Reference

## Installation

```bash
pnpm install
pnpm build
```

## Commands

### Upgrade

```bash
pam upgrade
```

Update the global PAM CLI. The command starts a small updater process, stops
running PAM UI/MCP services, then runs `npm install -g @helloworlkd/pam-cli@latest`.
This is the recommended update path on Windows because native SQLite files can
stay locked while PAM services are running.

`pam upgrade` prints the status file, log file, and a platform-specific
command for following progress live. On Windows, use the printed
`Get-Content -Wait -LiteralPath ...` command to watch the updater without
starting another PAM process during npm installation.

```bash
pam upgrade status
pam upgrade log
```

`pam upgrade status` shows the latest recorded phase, package spec, npm
command, message, and log path. `pam upgrade log` prints the latest log path.

### Initialization

```bash
pam init
```

Initialize memory storage in the current directory (`.ai-memory/`) and auto-configure supported agent/IDE integration files. PAM will search for `.ai-memory/` by walking up the directory tree, similar to how `.git` works.

**Options:**

- `--no-integrations` - Skip agent and IDE integration files

### Status

```bash
pam status
```

Show current pam status, including which memory directory is being used and memory counts.

**Example:**

```bash
pam status
# Using memory: ~/projects/my-app/.ai-memory/
# Memories: 12 active, 0 proposed, 1 archived, 2 deleted
```

### Add Memory

```bash
pam add -t <type> -c <content> [options]
```

**Options:**

- `-t, --type <type>` - Memory type (required): decision, knowledge, mistake, rule, preference, session, task
- `-c, --content <content>` - Memory content (required)
- `--title <title>` - Short display title, useful when an AI client can summarize the memory
- `--tags <tags>` - Comma-separated tags
- `--concepts <concepts>` - Comma-separated broad canonical concepts
- `--salience <score>` - Importance score from `0` to `1` (default: `0.5`)

**Example:**

```bash
pam add -t decision --title "TypeScript package policy" -c "Use TypeScript for all packages" --tags "tech,typescript" --concepts "Architecture"
```

### Checkpoint

```bash
pam checkpoint [options]
```

Submit a structured summary of durable session learnings. This is the CLI fallback for agents that cannot call the MCP `memory_checkpoint` tool. It respects capture mode: `manual` records no durable memories, `assisted` creates `proposed` memories, and `auto` creates `active` memories.

**Options:**

- `--summary <summary>` - Short summary of completed work
- `--decision <decision>` - Durable technical decision (repeatable)
- `--fact <fact>` - Reusable project fact (repeatable)
- `--preference <preference>` - Durable UX or workflow preference (repeatable)
- `--mistake <mistake>` - Reusable lesson from a correction or bug (repeatable)
- `--task <task>` - Follow-up task (repeatable)
- `--concept <concept>` - Broad canonical concept for generated checkpoint memories (repeatable)
- `--agent <agent>` - Agent name to tag checkpoint memories
- `--model <model>` - Model name to tag checkpoint memories
- `--session-id <session_id>` - Session identifier for hook/audit records
- `--json` - Print the raw checkpoint result as JSON

**Example:**

```bash
pam checkpoint \
  --summary "Updated the local UI workflow" \
  --decision "Use automatic capture as the default memory path" \
  --preference "Active memories should be prominent in the sidebar" \
  --concept UI \
  --agent codex
```

### List Memories

```bash
pam list [options]
```

**Options:**

- `--type <type>` - Filter by type
- `--tag <tag>` - Filter by tag

**Example:**

```bash
pam list --type decision --tag architecture
```

### Show Memory

```bash
pam show <id> [options]
```

**Options:**

- `--physical` - Remove the Markdown file and index row after writing a local backup
- `--yes` - Required confirmation for physical deletion in non-interactive runs

**Example:**

```bash
pam show mem_abc123def456
```

### Edit Memory

```bash
pam edit <id> [options]
```

**Options:**

- `-c, --content <content>` - New content
- `--title <title>` - New short display title; pass an empty string to clear it
- `-t, --type <type>` - New type
- `--tags <tags>` - New comma-separated tags
- `--concepts <concepts>` - New comma-separated broad canonical concepts

**Example:**

```bash
pam edit mem_abc123 --title "Updated API decision" -c "Updated content" --tags "updated" --concepts "Architecture"
```

### Delete Memory

```bash
pam delete <id> [options]
```

**Options:**

**Example:**

```bash
pam delete mem_abc123
```

By default, deletion is logical (status set to `deleted`). Use `--physical`
only when you want to remove the Markdown file. Physical deletion writes a
recoverable `.ai-memory/backups/*.bak` copy first.

### Archive Memory

```bash
pam archive <id> [options]
```

Archive a memory by setting its status to `archived`.

**Options:**

**Example:**

```bash
pam archive mem_abc123
```

### Search Memories

```bash
pam search [query] [options]
```

**Options:**

- `--type <type>` - Filter by type
- `--tag <tag>` - Filter by tag
- `--limit <limit>` - Maximum results (default: 50)
- `--semantic` - Use semantic vector search

**Examples:**

```bash
pam search "TypeScript"
pam search --tag "architecture"
pam search "database" --tag "sql" --limit 10
pam search "frontend framework" --semantic
```

Lexical search runs exact matching first. If there are no exact hits, PAM
falls back to related tags and synonyms, so natural queries such as
`pam search "database choice"` can still find a stored PostgreSQL decision.

Semantic search uses built-in local hash embeddings by default. For optional local model embeddings with the global CLI, install `@xenova/transformers` globally once and set `EMBEDDING_PROVIDER=local`:

```bash
npm install -g @xenova/transformers
```

For OpenAI embeddings, set `EMBEDDING_PROVIDER=openai` and `OPENAI_API_KEY`.

### Index Management

```bash
pam index build [options]
```

Index all memories into SQLite.

```bash
pam index rebuild [options]
```

Rebuild the entire index from scratch.

```bash
pam reindex [options]
```

Top-level alias for `pam index rebuild`.

**Options:**

### Doctor

```bash
pam doctor check [options]
```

Check consistency between Markdown files and SQLite index.

```bash
pam doctor stats [options]
```

Show memory statistics (counts by status, type, and tags).

```bash
pam doctor integrations [options]
```

Check first-run readiness: `.ai-memory`, generated agent instructions, MCP
configs, hooks, and stale unsupported flags such as `--project`.

**Options:**

### Review-Mode Queue

```bash
pam review [options]
```

Show proposed memories waiting for approval. This is mainly for assisted mode;
the default auto workflow should normally keep this queue empty.

### Smoke Test

```bash
pam smoke-test agent [options]
```

Create an active test memory and verify that the local store, index, and context
path are reachable. Run the printed search or context command to confirm recall.

This command is the quickest proof that PAM is not only installed but also
capturing into the project store that the CLI, MCP server, API, and UI share.

### Redact Memory

```bash
pam redact <id> [options]
```

Redact sensitive information (emails, API keys, tokens, passwords, secrets) from a memory.

**Options:**

**Example:**

```bash
pam redact mem_abc123
```

### Restore Memory

```bash
pam restore <id> [options]
```

Restore a logically deleted memory (status back to `active`). If the Markdown
file was physically deleted, PAM restores the latest matching backup from
`.ai-memory/backups/`.

**Options:**

**Example:**

```bash
pam restore mem_abc123
```

### Audit

```bash
pam audit [options]
```

Display comprehensive memory statistics including counts by status, type, top tags, and index status.

**Options:**

### Export

```bash
pam export <output> [options]
```

Export all memories to a file.

**Options:**

- `-f, --format <format>` - Export format: `zip`, `json`, `markdown`, `sqlite` (default: `zip`)

**Examples:**

```bash
pam export backup.zip
pam export backup.json --format json
pam export backup.md --format markdown
pam export memory.sqlite --format sqlite
```

### Import

```bash
pam import <input> [options]
```

Import memories from a file.

**Options:**

- `-f, --format <format>` - Import format: `zip`, `json`, `markdown` (default: `json`)
- `--collision <mode>` - Existing-ID handling: `skip`, `replace`, `rename`, or `supersede`

**Examples:**

```bash
pam import backup.json
pam import backup.zip --format zip
pam import memory.md --format markdown
pam import team-backup.json --collision supersede
```

### Context

```bash
pam context [options]
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
pam context
pam context --query "TypeScript architecture"
pam context --max-tokens 2000 --output
pam context --no-search
```

### Supersede Memory

```bash
pam supersede create <old_id> -t <type> -c <content> [options]
```

Create a new memory that replaces an existing memory. The old memory is archived and linked to the new version.

**Options:**

- `-t, --type <type>` - Memory type (required)
- `-c, --content <content>` - New memory content (required)
- `--tags <tags>` - Comma-separated tags
- `--salience <salience>` - Importance score from `0` to `1` (default: `0.5`)

```bash
pam supersede chain <memory_id> [options]
pam supersede latest <memory_id> [options]
```

Show the full supersession chain or only the latest version.

**Examples:**

```bash
pam supersede create mem_abc123 -t decision -c "Use SQLite for local indexing"
pam supersede chain mem_abc123
pam supersede latest mem_abc123
```

### Handoff

```bash
pam handoff begin -s <summary> [options]
pam handoff accept [options]
pam handoff list [options]
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
pam handoff begin -a opencode -s "Implemented storage changes" -n "Run release checks"
pam handoff accept -a claude-code
pam handoff list --status open
```

### Decay

```bash
pam decay sweep [options]
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
pam decay sweep --dry-run
```

### Intelligence

```bash
pam intelligence recommend [options]
pam intelligence list [options]
pam intelligence cleanup [options]
pam intelligence distill [options]
pam intelligence graph [options]
pam intelligence seed-eval [options]
```

Analyze memory quality and produce optional diagnostic maintenance proposals.

**Common options:**

- `--json` - Print JSON output

**Recommendation actions:**

```bash
pam intelligence apply <id> [options]
pam intelligence reject <id> [options]
pam intelligence defer <id> [options]
```

`apply` accepts `--confirm-physical-delete` for recommendations that explicitly
request physical deletion.

**Examples:**

```bash
pam intelligence recommend
pam intelligence cleanup
pam intelligence distill
pam intelligence distill --apply
pam intelligence graph --json
pam intelligence seed-eval
```

The intelligence layer keeps recommendations separate from the normal automatic
capture path. Distillation preserves source evidence IDs. See
`docs/intelligence.md` for the full model.

### Server

```bash
pam server start
```

Start the PAM MCP server over stdio. This command is intended to be launched by MCP-compatible clients such as Claude Code, OpenCode, Cursor, Continue.dev, or other agent runtimes.

See `docs/mcp.md` for integration details.

### Hooks

```bash
pam hook record <type> [options]
```

Record an agent lifecycle event for automatic capture workflows. This is
intended for tools that can run shell hooks even when they do not call MCP
directly. Textual prompt hooks create redacted Markdown `exchange` memories in
auto/assisted mode. Each exchange memory includes a `Simplified` section for
quick review and a preserved `Raw Exchange` section for auditability.

**Options:**

- `--agent <agent>` - Agent or tool name
- `--model <model>` - Model name when known
- `--session-id <sessionId>` - Agent session identifier
- `--data <json>` - Additional event data as a JSON object

When `--data` is omitted, `pam hook record` also accepts JSON or plain text
from stdin. This lets lifecycle hook systems pass the current prompt to PAM
without shell-escaping it.

**Examples:**

```bash
pam hook record session-start --agent claude-code
pam hook record session-end --agent codex --model gpt-5
echo '{"text":"Always update docs after code changes"}' | pam hook record user-prompt --agent local-hook
```

### Local UI

```bash
pam ui [options]
```

Start the local PAM web UI and API server.

**Options:**

- `--host <host>` - Host to bind (default: `127.0.0.1`)
- `-p, --port <port>` - Port to bind (default: `3939`)
- `--open` - Open the UI in the default browser

**Examples:**

```bash
pam ui
pam ui --open
pam ui --port 4040
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
