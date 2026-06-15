# Concepts

## Memory

A memory is a Markdown document with YAML frontmatter metadata.

Example:

```markdown
---
id: mem_abc123
type: decision
scope: project
status: active
created_at: '2026-01-01T00:00:00.000Z'
updated_at: '2026-01-01T00:00:00.000Z'
tags:
  - architecture
source: manual
---

Use SQLite for the local memory index.
```

## Source Of Truth

Markdown is always the source of truth. SQLite, FTS5, and vector indexes are derived artifacts.

If an index is corrupted or missing, it can be rebuilt from Markdown files.

## Memory Types

Supported types:

- `decision`
- `knowledge`
- `mistake`
- `rule`
- `preference`
- `session`
- `task`
- `client`
- `pattern`

## Memory Scope

PAMH is project-only. Runtime clients do not choose a scope, and all new memory
belongs to the current project store.

Older Markdown files may still contain legacy scope values. PAMH normalizes
those values to `project` when memories are read or imported.

## Project Memory

Project memory belongs to one repository or workspace.

Default path:

```text
./.ai-memory
```

Use it for architecture, local decisions, project state, sessions, and tasks.

## Memory Discovery

PAMH searches for `.ai-memory/` by walking up the directory tree, similar to how `.git` works.

### Shared Memory (Monorepo)

When you initialize memory in a parent directory, all subdirectories automatically use that memory:

```text
~/projects/my-app/
  |-- .ai-memory/              <- Initialize here
  |-- backend/                 <- Uses parent memory
  `-- frontend/                <- Uses parent memory
```

```bash
cd ~/projects/my-app
memory init

cd backend
memory add -t decision -c "Use PostgreSQL for the main database"
# -> Stored in ~/projects/my-app/.ai-memory/

cd ../frontend
memory list
# -> Shows the same memory
```

### Isolated Memory

When you initialize memory in a specific subdirectory, that project gets its own isolated memory:

```text
~/projects/my-app/
  |-- backend/
  |   `-- .ai-memory/          <- Initialize here for isolated memory
  `-- frontend/
      `-- .ai-memory/          <- Initialize here for isolated memory
```

```bash
cd ~/projects/my-app/backend
memory init
# -> Creates ~/projects/my-app/backend/.ai-memory/
# -> This project now has its own isolated memory
```

### Checking Which Memory Is Used

Use `memory status` to see which memory directory is currently active:

```bash
memory status
# Using memory: ~/projects/my-app/.ai-memory/
# Memories: 12 active, 3 proposed, 1 archived
```

## Context Compilation

Compiled context combines memory sources in this order:

1. Project memory
2. Search results

The UI Concepts map is derived from the same composed source set as the LLM
context preview, so it shows concepts that structure the context the LLM would
actually receive rather than every visible memory in the store.

Use:

```bash
memory context --query "architecture" --output
```

This writes `compiled-context.md` to project memory.

## Semantic Search

PAMH uses vector embeddings for semantic search. Text search works out of the box; semantic search needs either the optional local embedding package or OpenAI embeddings.

### Optional: Local Embeddings

- **Model**: `Xenova/all-MiniLM-L6-v2` (384 dimensions)
- **Runtime**: ONNX via `@xenova/transformers`
- **Storage**: SQLite with `sqlite-vec` extension
- **First run**: Automatically downloads the model (~80MB)

Install the local provider next to the global PAMH CLI:

```bash
npm install -g @xenova/transformers
```

The model runs entirely on your machine. No data leaves your system.

### Optional: OpenAI Embeddings

You can switch to OpenAI's embedding API:

```bash
export EMBEDDING_PROVIDER=openai
export OPENAI_API_KEY=your_key_here
```

This uses `text-embedding-3-small` (1536 dimensions) by default.

### When to Use Each

- **Local embeddings**: Best when you want offline, private semantic search after one optional setup step.
- **OpenAI embeddings**: Higher quality for complex semantic queries, but requires network and API key.

## Capture Control

PAMH uses explicit capture by default. It does not scrape editor sessions, terminal output, or LLM conversations.

PAMH supports three capture modes:

- **manual** - You explicitly call `memory add`
- **assisted** (default) - Agent proposes memories via MCP, you approve them
- **auto** - Agent creates memories directly based on configured rules

Use one of these capture paths:

- CLI: `memory add`
- UI: `memory ui`
- MCP: an agent calls `add_memory`

The capture mode is configured in `.ai-memory/auto-capture.yaml`. See [docs/capture-modes.md](capture-modes.md) for details.

Explicit capture keeps memory auditable and prevents accidental storage of private or transient information.
