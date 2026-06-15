# Portable AI Memory Hub (PAMH)

Open-source platform for persistent, portable, and model-independent AI memory.

PAMH lets you maintain user-controlled memory that works across multiple LLMs, IDEs, agents, and tools.

## Why PAMH?

AI memory is often trapped inside one chat, IDE, vendor, or session.

PAMH gives your tools a shared, local memory store that you control. Memories
live as project files, can be inspected and edited, and are exposed through the
same CLI, MCP, API, and UI surfaces.

Any compatible agent can read the same context, propose updates, and reuse
project knowledge across sessions.

Key advantages:

- Works across tools, agents, IDEs, and LLM providers.
- Keeps memory local, reviewable, editable, and user-controlled.
- Installs with one npm command and exposes a single `memory` CLI.
- Provides CLI, MCP, API, and UI access to the same memory store.
- Tracks useful context over time instead of losing it in chat history.

PAMH is not another chat interface. It is a memory layer for AI-assisted work.

## Installation

**From npm** (recommended for users):

```bash
npm install -g pamh-cli
```

This installs the `memory` command globally.

If npm stays quiet during the first install, use `npm install -g pamh-cli --loglevel=info` to show dependency progress.

On Windows, stop any running PAMH UI or MCP server before updating the global
package. Native SQLite files can stay locked while `memory ui` or
`memory server start` is running, which makes npm fail with `EBUSY`.
After PAMH is installed, prefer `memory upgrade` for future global updates; it
stops running PAMH UI/MCP services before invoking npm.

To make PAMH part of a specific project that already uses npm/package.json,
install it locally from that project root:

```bash
npm install -D pamh-cli
```

Local installs bootstrap the project automatically: PAMH creates `.ai-memory/`
and writes the supported agent/IDE integration files. After the first install,
reload VS Code/Cursor windows, start a new Claude Code/OpenCode session, or
restart/open a new Codex session so the client reloads project instructions and
MCP configuration.

**From source** (for development):

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

### 1. Initialize PAMH in your project

```bash
cd your-project
memory init
```

This creates `.ai-memory/` and configures agent integrations automatically.

If you installed `pamh-cli` locally in the project with `npm install -D pamh-cli`,
this step is performed automatically by npm postinstall.

### 2. Configure your IDE or AI agent

Add PAMH to your MCP-compatible tool (Cursor, VSCode with Copilot, Claude Code, etc.):

```json
{
  "mcpServers": {
    "pamh": {
      "command": "memory",
      "args": ["server", "start"]
    }
  }
}
```

See [docs/mcp.md](docs/mcp.md) for detailed configuration examples.

### 3. Work with your AI agent (automatic mode)

By default, PAMH uses **assisted mode**: your AI agent automatically proposes memories, and you approve or reject them.

**Workflow:**

1. Work normally with your AI agent (Cursor, Copilot, Claude Code, etc.)
2. The agent proposes memories when it learns something important
3. Review proposals with `memory ui` or `memory list --status proposed`
4. Approve with `memory approve <id>` or reject with `memory reject <id>`

**Example:**

```bash
# See proposed memories
memory list --status proposed

# Approve a memory
memory approve mem_abc123

# Or open the UI to review visually
memory ui --open
```

### 4. Manual mode (optional)

You can also add memories manually:

```bash
memory add -t decision -c "Use PostgreSQL for the main database"
memory list
memory search "database"
```

See [docs/capture-modes.md](docs/capture-modes.md) for all capture modes (manual, assisted, auto).

## How It Works

PAMH works like `.git` - it searches for `.ai-memory/` by walking up the directory tree.

### Shared Memory (Monorepo)

```
~/projects/my-app/
  ├── .ai-memory/              ← Initialize here
  ├── backend/                 ← Uses parent memory
  └── frontend/                ← Uses parent memory
```

```bash
cd ~/projects/my-app
memory init

cd backend
memory add -t decision -c "Use PostgreSQL for the main database"
# → Stored in ~/projects/my-app/.ai-memory/

cd ../frontend
memory list
# → Shows the same memory
```

### Isolated Memory

```
~/projects/my-app/
  ├── backend/
  │   └── .ai-memory/          ← Initialize here for isolated memory
  └── frontend/
      └── .ai-memory/          ← Initialize here for isolated memory
```

```bash
cd ~/projects/my-app/backend
memory init
# → Creates isolated memory for this project only
```

## Features

- Human-readable Markdown memory storage
- SQLite + FTS5 indexing
- Text, tag, and project-memory search
- Semantic search with local or OpenAI embeddings
- Export/import in ZIP, JSON, Markdown, and SQLite formats
- Basic secret redaction
- Context compilation
- Supersession chains for updated or conflicting memories
- Agent handoffs for cross-session context transfer
- Configurable memory decay and forget sweeps
- MCP stdio server
- Local web UI via `memory ui`
- Three capture modes: manual, assisted (default), and auto
- Assisted intelligence: recommendations, cleanup, distillation, and Knowledge Graph previews

## Documentation

- [Getting Started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [CLI](docs/cli.md)
- [MCP](docs/mcp.md)
- [UI](docs/ui.md)
- [Intelligence Layer](docs/intelligence.md)
- [Capture Modes](docs/capture-modes.md)
- [Security](docs/security.md)
- [Concepts](docs/concepts.md)
- [FAQ](docs/faq.md)

## Examples

- [CLI Workflow](examples/cli-workflow.md)
- [Export / Import](examples/export-import.md)
- [Shared Memory](examples/shared-memory.md)
- [MCP Config](examples/mcp-config.json)

## Local UI

```bash
memory ui --open
```

See [docs/ui.md](docs/ui.md).

## Semantic Search

PAMH uses vector embeddings for semantic search:

- **Optional local**: `Xenova/all-MiniLM-L6-v2` (384 dimensions, runs offline after setup)
- **Optional**: OpenAI `text-embedding-3-small` (1536 dimensions, requires API key)

To use local embeddings:

```bash
npm install -g @xenova/transformers
```

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

See [docs/release.md](docs/release.md) for npm publishing.

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
