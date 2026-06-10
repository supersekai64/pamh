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
# Using memory: ~/projects/client-app/.ai-memory/
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
- `--project` - Use project memory instead of global
- `--physical` - Physically remove the Markdown file and index row

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

### Server

```bash
memory server start
```

Start the PAMH MCP server over stdio. This command is intended to be launched by MCP-compatible clients such as Claude Code, OpenCode, Cursor, Continue.dev, or other agent runtimes.

See `docs/mcp.md` for integration details.

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
