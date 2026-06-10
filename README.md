# Portable AI Memory Hub (PAMH)

Open-source platform for persistent, portable, and model-independent AI memory.

PAMH lets you maintain user-controlled memory that works across multiple LLMs, IDEs, agents, and tools.

## Installation

**One-command setup** (recommended):

```bash
pnpm setup
```

This installs dependencies, builds all packages, and links the `memory` command globally.

**Manual installation** (if you need more control):

```bash
pnpm install
pnpm build
pnpm link:cli
```

`pnpm link:cli` exposes the `memory` command globally from `packages/cli`.

## Quick Start

```bash
memory init project
memory add --project -t decision -s project -c "Use SQLite as a local rebuildable index."
memory search "SQLite" --project
memory context --project --query "architecture" --output
```

`memory init project` also creates best-effort agent and IDE integration files so MCP-compatible tools can discover PAMH with minimal manual setup.

## Features

- Human-readable Markdown memory storage
- SQLite + FTS5 indexing
- Text, tag, and scope search
- Semantic search with local or OpenAI embeddings
- Export/import in ZIP, JSON, Markdown, and SQLite formats
- Basic secret redaction
- Context compilation
- MCP stdio server
- Local web UI via `memory ui`
- Three capture modes: manual, assisted (default), and auto

## Documentation

- [Getting Started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [CLI](docs/cli.md)
- [MCP](docs/mcp.md)
- [UI](docs/ui.md)
- [Capture Modes](docs/capture-modes.md)
- [Security](docs/security.md)
- [Concepts](docs/concepts.md)
- [FAQ](docs/faq.md)

## Examples

- [CLI Workflow](examples/cli-workflow.md)
- [Export / Import](examples/export-import.md)
- [MCP Config](examples/mcp-config.json)
- [Linked Projects](examples/linked-projects.yaml)

## MCP

```bash
memory server start
```

See [docs/mcp.md](docs/mcp.md).

PAMH does not automatically record every AI tool action. MCP clients must be configured to use PAMH, and the client or agent must explicitly call PAMH tools such as `add_memory`.

## Local UI

```bash
memory ui --open
```

See [docs/ui.md](docs/ui.md).

## Semantic Search

PAMH uses vector embeddings for semantic search:

- **Default**: Local model `Xenova/all-MiniLM-L6-v2` (384 dimensions, runs offline)
- **Optional**: OpenAI `text-embedding-3-small` (1536 dimensions, requires API key)

To use OpenAI embeddings:

```bash
export EMBEDDING_PROVIDER=openai
export OPENAI_API_KEY=your_key_here
```

See [docs/concepts.md](docs/concepts.md#semantic-search) for details.

## Development

```bash
pnpm build
pnpm test
pnpm lint
pnpm format
pnpm release:check
```

## Structure

```text
pamh/
├── packages/
│   ├── core/       # Storage, indexing, search
│   ├── api/        # Local HTTP API for UI/Desktop/IDE clients
│   ├── cli/        # Command-line interface
│   ├── mcp/        # MCP server
│   └── ui/         # Local web interface
├── docs/           # Documentation
├── examples/       # Usage examples
└── scripts/        # Utility scripts
```

## License

MIT
