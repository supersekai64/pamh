# Portable AI Memory (PAM)

Open-source platform for persistent, portable, and model-independent AI memory.

PAM lets you maintain user-controlled memory that works across multiple LLMs, IDEs, agents, and tools.

## Why PAM?

AI memory is often trapped inside one chat, IDE, vendor, or session.

PAM gives your tools a shared, local memory store that you control. Memories
live as project files, can be inspected and edited, and are exposed through the
same CLI, MCP, API, and UI surfaces.

Any compatible agent can read the same context, propose updates, and reuse
project knowledge across sessions.
PAM provides the shared memory layer; your agent still needs the PAM MCP tools
or generated hooks to capture memories.

Key advantages:

- Works across tools, agents, IDEs, and LLM providers.
- Keeps memory local, reviewable, editable, and user-controlled.
- Installs with one npm command and exposes a single `pam` CLI.
- Provides CLI, MCP, API, and UI access to the same memory store.
- Tracks useful context over time instead of losing it in chat history.

PAM is not another chat interface. It is a memory layer for AI-assisted work.

## PAMagotchi Lite

This workspace now includes [PAMagotchi Lite](pamagotchi-lite/README.md), a
raw-first rebuild experiment focused on the simplest useful memory loop:
append-only exchange capture, AI-assisted themed checkpoints, and compact
context compilation.

## Installation

**From npm** (recommended for users):

```bash
npm install -g @supersekai64/pam-cli
```

This installs the `pam` command globally.

If npm stays quiet during the first install, use `npm install -g @supersekai64/pam-cli --loglevel=info` to show dependency progress.

On Windows, stop any running PAM UI or MCP server before updating the global
package. Native SQLite files can stay locked while `pam ui` or
`pam server start` is running, which makes npm fail with `EBUSY`.
After PAM is installed, prefer `pam upgrade` for future global updates; it
stops running PAM UI/MCP services before invoking npm. The command prints a
status file, log file, and a platform-specific follow command so you can watch
upgrade progress while the updater runs in the background.

To make PAM part of a specific project that already uses npm/package.json,
install it locally from that project root:

```bash
npm install -D @supersekai64/pam-cli
```

Local installs bootstrap the project automatically: PAM creates `.ai-memory/`
and writes the supported agent/IDE integration files. After the first install,
reload VS Code/Cursor windows, start a new Claude Code/OpenCode session, or
restart/open a new Codex session so the client reloads project instructions and
MCP configuration.

**From source** (for development):

```bash
pnpm setup
```

This installs dependencies, builds all packages, and links the `pam` command globally.

**Manual installation** (if you need more control):

```bash
pnpm install
pnpm build
pnpm link:cli
```

`pnpm link:cli` exposes the `pam` command globally from `packages/cli`.

## Quick Start

### 1. Initialize PAM in your project

```bash
cd your-project
pam init
```

This creates `.ai-memory/` and configures agent integrations automatically.

If you installed `@supersekai64/pam-cli` locally in the project with `npm install -D @supersekai64/pam-cli`,
this step is performed automatically by npm postinstall.

### 2. Configure your IDE or AI agent

Add PAM to your MCP-compatible tool (Cursor, VSCode with Copilot, Claude Code, etc.):

```json
{
  "mcpServers": {
    "PAM": {
      "command": "pam",
      "args": ["server", "start"]
    }
  }
}
```

See [docs/mcp.md](docs/mcp.md) for detailed configuration examples.

### 3. Verify the setup

```bash
pam doctor integrations
pam smoke-test agent
```

`doctor integrations` checks the generated client files, `smoke-test agent`
creates an active test memory, and the printed search/context command verifies
that the agent can recall it immediately.

First-run success looks like this: `doctor integrations` reports OK, the smoke
test prints an active memory ID, and the printed `pam search ...` or
`pam context --query ...` command can find it immediately.

### 4. Work with your AI agent (automatic capture)

By default, PAM uses **auto mode**: an integrated agent can write active
memories directly, and lifecycle hooks capture raw conversation exchanges as
Markdown `exchange` memories.

MCP capture is intelligent by default. When an agent saves a durable signal,
PAM looks for same-type, same-theme memories first: review-mode duplicates are
merged, active contradictions can be superseded in auto mode, and evidence
links are preserved through `source_ids`.

**Workflow:**

1. Work normally with your AI agent (Cursor, Copilot, Claude Code, etc.)
2. Hooks capture raw prompt/exchange evidence as Markdown
3. Durable signals are categorized into broad themes such as Instruction, Decision, and Issue
4. PAM updates SQLite theme compilations and vector indexes automatically
5. Agents search memory through MCP before answering

**Example:**

```bash
# Inspect the active memories the agent can use
pam list --status active

# Or open the UI to inspect memory and context
pam ui --open
```

### 5. Manual mode (optional)

You can also add memories manually:

```bash
pam add -t decision -c "Use PostgreSQL for the main database"
pam list
pam search "database"
```

See [docs/capture-modes.md](docs/capture-modes.md) for all capture modes (manual, assisted, auto).

## How It Works

PAM works like `.git` - it searches for `.ai-memory/` by walking up the directory tree.

### Shared Memory (Monorepo)

```
~/projects/my-app/
  ├── .ai-memory/              ← Initialize here
  ├── backend/                 ← Uses parent memory
  └── frontend/                ← Uses parent memory
```

```bash
cd ~/projects/my-app
pam init

cd backend
pam add -t decision -c "Use PostgreSQL for the main database"
# → Stored in ~/projects/my-app/.ai-memory/

cd ../frontend
pam list
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
pam init
# → Creates isolated memory for this project only
```

## Features

- Human-readable Markdown memory storage, including raw `exchange` memories
- SQLite + FTS5 indexing
- SQLite theme compilations for compact Instruction/Decision/Issue-style context
- Text, tag, and project-pam search
- Automatic semantic vectors with built-in local hash embeddings, optional local model, or OpenAI embeddings
- Export/import in ZIP, JSON, Markdown, and SQLite formats
- Basic secret redaction
- Context compilation
- Supersession chains for updated or conflicting memories
- Agent handoffs for cross-session context transfer
- Configurable pam decay and forget sweeps
- MCP stdio server
- Local web UI via `pam ui`
- Three capture modes: auto (default), assisted, and manual
- Intelligent MCP capture that merges same-theme review-mode proposals, detects
  likely contradictions, and preserves source links when replacing active guidance
- Optional diagnostics: recommendations, cleanup, distillation, and Knowledge Graph previews

## Documentation

- [Getting Started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [CLI](docs/cli.md)
- [MCP](docs/mcp.md)
- [UI](docs/ui.md)
- [Intelligence Layer](docs/intelligence.md)
- [Capture Modes](docs/capture-modes.md)
- [Role Examples](docs/examples.md)
- [Glossary](docs/glossary.md)
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
pam ui --open
```

See [docs/ui.md](docs/ui.md).

## Semantic Search

PAM uses vector embeddings for semantic search and automatic pam indexing:

- **Default local**: deterministic hash embeddings (384 dimensions, no setup)
- **Optional local model**: `Xenova/all-MiniLM-L6-v2` (384 dimensions, runs offline after setup)
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
pnpm exec playwright install chromium # once, before browser E2E tests
pnpm test:e2e
pnpm lint
pnpm format
pnpm release:check
```

See [docs/release.md](docs/release.md) for npm publishing.

## Structure

```text
PAM/
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
