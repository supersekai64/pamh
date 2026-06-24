# Architecture

## Overview

```text
Project Memory
      |
      v
Memory Core
      |-- CLI
      |-- MCP
      |-- Local API
      `-- Local UI
```

## Memory Layer

Location: `.ai-memory` (discovered by walking up the directory tree)

Contains project-specific knowledge such as architecture, current state, tasks, and sessions.

PAM searches for `.ai-memory/` by walking up the directory tree, similar to how `.git` works. This allows:

- **Shared memory**: initialize in a parent directory, all subdirectories use it
- **Isolated memory**: initialize in a specific subdirectory for project-specific memory

Legacy scopes in existing Markdown are normalized to `project` when read.

See [docs/concepts.md](concepts.md#memory-discovery) for details.

## Packages

### @helloworlkd/pam-core

Responsible for storage, indexing, search, import, export, context compilation,
semantic search, lifecycle hook capture, raw exchange capture, theme
compilation, contradiction-aware capture, and deterministic intelligence
analysis. It has no CLI or MCP dependency.

### @helloworlkd/pam-cli

Command-line interface published to npm. Depends on core, API, and the
`@helloworlkd/pam-protocol` package; `pam server start` delegates to that shared MCP
server implementation.

### @helloworlkd/pam-api

Local HTTP API for human-facing clients. It binds to `127.0.0.1` by default,
uses a per-instance token for mutable requests, and delegates persistence plus
context source selection to core. The API owns UI-facing projections such as
concept graphs and evidence views. Future desktop apps and IDE extensions can
use this API boundary from separate repositories.

### @helloworlkd/pam-ui

Static local web UI served by the local API server. It does not own data or contain persistence logic.

## Storage

- **Source of truth**: Markdown memory files, including `exchange` memories with
  simplified review text and preserved raw exchange text
- **Index**: SQLite (`memory.db`)
- **Compiled themes**: SQLite `theme_compilations`, rebuilt from active Markdown memories

## Search

- Text search (FTS5)
- Tag search
- Metadata search
- Semantic search (sqlite-vec)
- Theme-filtered search and compiled theme context

## Lifecycle

```text
Create
  |
  v
Validate
  |
  v
Index
  |
  v
Search
  |
  v
Update / Archive / Delete / Restore
```

## Context Resolution

```text
Theme Compilations
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
pam and generated relation inspectable.

Hook events are observations. In auto and assisted mode, textual prompt hooks
also create redacted Markdown `exchange` memories with simplified and raw
sections. A meaningful session-end hook can create a `session` memory according
to capture mode.
