# Architecture

## Overview

```text
Global Memory
      │
      ▼
Project Memories
      │
      ▼
Memory Core
      │
      ├── CLI
      ├── MCP
      ├── Local API
      └── Local UI
```

## Memory Layers

### Global Memory

Location: `~/ai-memory`

Contains cross-project knowledge such as identity, preferences, patterns, and decisions.

### Project Memory

Location: `.ai-memory` (discovered by walking up the directory tree)

Contains project-specific knowledge such as architecture, current state, tasks, and sessions.

PAMH searches for `.ai-memory/` by walking up the directory tree, similar to how `.git` works. This allows:

- **Shared memory**: Initialize in a parent directory, all subdirectories use it
- **Isolated memory**: Initialize in a specific subdirectory for project-specific memory

See [docs/concepts.md](concepts.md#memory-discovery) for details.

## Packages

### pamh-core

Responsible for storage, indexing, search, import, export, context compilation,
semantic search, lifecycle hook capture, and deterministic intelligence
analysis. It has no CLI or MCP dependency.

### pamh-cli

Command-line interface published to npm. Depends on core and embeds the MCP server used by IDEs and AI agents.

### pamh-api

Local HTTP API for human-facing clients. It binds to `127.0.0.1` by default and delegates all persistence to core. Future desktop apps and IDE extensions can use this API boundary from separate repositories.

### pamh-ui

Static local web UI served by the local API server. It does not own data or contain persistence logic.

## Storage

- **Source of truth** : Markdown
- **Index** : SQLite (memory.db)

## Search

- Text search (FTS5)
- Tag search
- Scope search
- Semantic search (sqlite-vec)

## Lifecycle

```text
Create
  │
  ▼
Validate
  │
  ▼
Index
  │
  ▼
Search
  │
  ▼
Update / Archive / Delete / Restore
```

## Context Resolution

```text
Global Memory
      +
Project Memory
      +
Search Results
      =
Compiled Context
```

## Intelligence Layer

```text
Observations
      +
Markdown Memories
      |
      v
Deterministic Analysis
      |
      +--> Recommendations
      +--> Distillation Proposals
      +--> Cleanup Proposals
      +--> Knowledge Graph Preview
```

Recommendations are separate review objects. They do not mutate memories until a
user or agent applies one explicitly.

Distilled memories preserve evidence with `source_ids`. Knowledge Graph
relations preserve evidence with `evidence_ids`. This keeps every synthetic
memory and generated relation inspectable.

Hook events are observations. In assisted mode, a meaningful session-end hook can
create a proposed `session` memory, but raw prompt transcripts are not stored as
durable memory.
