# Local UI

PAMH includes a local web UI for browsing and managing memory without leaving the machine.

## Start

```bash
memory ui --open
```

By default, the server binds to `127.0.0.1:3939`.

## Capabilities

- View project or global memory stores
- Search memories
- Filter by status
- Create memories
- Edit content, type, scope, and tags
- Archive, restore, logically delete, or physically delete memories
- View local index statistics
- Review assisted maintenance recommendations
- Preview and create proposed distilled memories
- Inspect the Knowledge Graph in a separate tab
- Inspect evidence IDs for recommendations, graph entities, and graph relations

The neural/concept map and the Knowledge Graph are separate views. The concept
map shows recurring memory signals and co-occurrence. The Knowledge Graph shows
explicit entities and typed, evidence-backed relations.

## Architecture

```text
Browser UI
    │
    ▼
Local HTTP API (127.0.0.1)
    │
    ▼
pamh-core
    │
    ▼
Markdown + SQLite
```

The UI is static and does not own persistence logic. All writes go through the local API, and the API delegates to `pamh-core`.

## Future Clients

Desktop apps and IDE extensions should live in separate repositories. They can either:

- call the same local HTTP API exposed by `pamh-api`, or
- embed `pamh-core` directly when a local Node runtime is appropriate.

The recommended default is to use the local HTTP API so clients stay thin and tool-agnostic.

## Security

The server is local-first and binds to `127.0.0.1` by default. Do not bind to a public interface unless you understand the risk.
