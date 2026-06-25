# Portable AI Memory (PAM)

[![npm version](https://img.shields.io/npm/v/%40helloworlkd%2Fpam-cli?label=pam-cli)](https://www.npmjs.com/package/@helloworlkd/pam-cli)
[![npm downloads](https://img.shields.io/npm/dm/%40helloworlkd%2Fpam-cli?label=npm%20downloads)](https://www.npmjs.com/package/@helloworlkd/pam-cli)
[![Node.js](https://img.shields.io/node/v/%40helloworlkd%2Fpam-cli?label=node)](#requirements)
[![License](https://img.shields.io/badge/license-source--available-blue)](LICENSE)

Persistent, local, model-independent memory for AI-assisted development.

PAM stores durable project knowledge in `.ai-memory/` and exposes the same
memory store through a CLI, MCP server, local HTTP API, and local web UI. It is
designed for teams and developers who want AI tools to remember project
decisions, rules, mistakes, preferences, tasks, and handoff context across
sessions, editors, agents, and LLM providers.

PAM is not a hosted chat product. It is a local memory layer that you control.

## Start Here

- If you want to use PAM from npm, install `@helloworlkd/pam-cli` and run the
  `pam` command.
- If you want to integrate PAM into another TypeScript tool, use the examples in
  [Programmatic Usage](#programmatic-usage).
- If you want to fork or contribute to PAM, use the workflow in
  [Development From Source](#development-from-source).

## Requirements

- Node.js `>=20.0.0`
- npm for normal package installs
- pnpm `>=9.0.0` for source development

## Install From npm

### Global CLI

```bash
npm install -g @helloworlkd/pam-cli
pam --version
```

This installs the `pam` command globally. The CLI package pulls compatible
versions of the core, API, protocol, and UI packages.

For future global updates, stop any running `pam ui` or `pam server start`
processes, then run npm directly:

```bash
npm install -g @helloworlkd/pam-cli@latest
```

## First Project Setup

Run these commands in the project that should own the memory store:

```bash
cd your-project
pam init
pam doctor integrations
pam smoke-test agent
pam ui --open
```

What each step does:

- `pam init` creates `.ai-memory/` and can generate project integration files.
- `pam doctor integrations` checks that generated files and MCP config are
  ready.
- `pam smoke-test agent` creates and retrieves a test memory.
- `pam ui --open` opens the local dashboard for the same memory store.

When an IDE or AI client is already running, restart or reload it after
generating integration files so it picks up the new MCP configuration and
instructions.

## MCP Setup

Add PAM to any MCP-compatible client:

```json
{
  "mcpServers": {
    "pam": {
      "command": "pam",
      "args": ["server", "start"]
    }
  }
}
```

See [docs/mcp.md](docs/mcp.md) for client-specific examples.

## Daily CLI Commands

| Task                      | Command                                                         |
| ------------------------- | --------------------------------------------------------------- |
| Initialize project memory | `pam init`                                                      |
| Add a memory manually     | `pam add -t decision -c "Use PostgreSQL for the main database"` |
| List active memories      | `pam list --status active`                                      |
| Search memory             | `pam search "database decision"`                                |
| Build LLM context         | `pam context --query "architecture" --output`                   |
| Open the UI               | `pam ui --open`                                                 |
| Start the MCP server      | `pam server start`                                              |
| Check setup health        | `pam doctor integrations`                                       |
| Export memory             | `pam export backup.zip`                                         |
| Import memory             | `pam import backup.json`                                        |

See [docs/cli.md](docs/cli.md) for the full command reference.

## How PAM Stores Memory

PAM works like `.git`: commands search upward from the current directory until
they find `.ai-memory/`.

```text
my-app/
|-- .ai-memory/       # shared memory store
|-- backend/          # uses parent memory
`-- frontend/         # uses parent memory
```

Memory is stored as human-readable Markdown. SQLite, FTS, semantic vectors, and
theme compilations are derived indexes that can be rebuilt.

PAM only records what its CLI, MCP tools, API, UI, or generated hooks send to
it. It does not silently read arbitrary conversations.

## How Search Works

`pam search` and the MCP `search_memory` tool use hybrid retrieval by default:

1. Exact SQLite FTS5 search first, for fast precise matches.
2. Related lexical search when exact terms miss, using tags and built-in synonyms.
3. Semantic vector search when lexical results are weak, missing, or the query is
   vague.
4. Fusion and reranking when both lexical and semantic signals are useful.

The source of truth is still the Markdown files in `.ai-memory/`. `memory.db`
contains rebuildable SQLite, FTS, theme, and vector indexes. `compiled-context.md`
is a generated LLM context document, not the canonical memory store.

## Capture Modes

PAM defaults to `auto` mode:

- MCP tools can write active durable memories directly.
- Generated hooks can capture redacted raw `exchange` memories as Markdown
  evidence.
- Duplicate or contradictory memories can be merged or superseded.

Use `assisted` mode when you want proposed memories to be reviewed first, or
`manual` mode when you only want explicit CLI/API writes.

See [docs/capture-modes.md](docs/capture-modes.md).

## Programmatic Usage

Use `@helloworlkd/pam-core` when embedding PAM storage and search in another
TypeScript tool:

```ts
import { createMemory, initProjectMemory, listMemories } from '@helloworlkd/pam-core'

const basePath = await initProjectMemory(process.cwd())

await createMemory(basePath, {
  type: 'decision',
  scope: 'project',
  content: 'Use SQLite for the local memory index.',
  tags: ['storage'],
})

const memories = await listMemories(basePath)
```

Use `@helloworlkd/pam-api` when embedding the local HTTP API:

```ts
import { startLocalApiServer } from '@helloworlkd/pam-api'

const api = await startLocalApiServer({
  cwd: process.cwd(),
  host: '127.0.0.1',
  port: 3939,
})

console.log(api.url)
```

## Features

- Local Markdown memory store in `.ai-memory/`
- SQLite and FTS5 indexes
- Hybrid text, tag, metadata, and semantic vector search
- Built-in local hash embeddings with optional local model or OpenAI embeddings
- MCP stdio server for AI agents and IDEs
- Local web UI through `pam ui`
- Context compilation for LLM prompts
- Capture modes: `auto`, `assisted`, and `manual`
- Review, approve, reject, archive, restore, redact, import, and export flows
- Supersession chains for updated or conflicting memories
- Cross-agent handoffs
- Optional diagnostics, cleanup recommendations, distillation, and Knowledge
  Graph previews

## Development From Source

Clone your fork, then run:

```bash
pnpm setup
```

`pnpm setup` installs dependencies, builds every package, and links the local
`pam` command from `packages/cli`.

Manual development flow:

```bash
pnpm install
pnpm build
pnpm link:cli
```

Common checks:

```bash
pnpm test
pnpm lint
pnpm format:check
pnpm pack:check
pnpm release:check
```

End-to-end tests require Chromium:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

## Repository Structure

```text
PAM/
|-- packages/
|   |-- core/       # Storage, Markdown, indexing, search, capture logic
|   |-- api/        # Local HTTP API for UI/Desktop/IDE clients
|   |-- cli/        # Command-line interface and npm binary
|   |-- mcp/        # MCP server and MCP tools
|   `-- ui/         # Local web interface
|-- docs/           # User and developer documentation
|-- examples/       # Example workflows and configs
|-- scripts/        # Release and packaging utilities
`-- tests/          # End-to-end tests
```

## Documentation

- [Getting Started](docs/getting-started.md)
- [CLI Reference](docs/cli.md)
- [MCP Setup](docs/mcp.md)
- [UI](docs/ui.md)
- [Architecture](docs/architecture.md)
- [Concepts and Semantic Search](docs/concepts.md)
- [Capture Modes](docs/capture-modes.md)
- [Intelligence Layer](docs/intelligence.md)
- [Role Examples](docs/examples.md)
- [Security](docs/security.md)
- [Debugging](docs/debug.md)
- [FAQ](docs/faq.md)
- [Glossary](docs/glossary.md)

## Examples

- [CLI Workflow](examples/cli-workflow.md)
- [Export / Import](examples/export-import.md)
- [Shared Memory](examples/shared-memory.md)
- [MCP Config](examples/mcp-config.json)

## License

PAM is source-available under the [PAM Source-Available License v1.0](LICENSE).
You may read, fork, modify, and contribute to the project for non-commercial
purposes. Commercial use, commercial redistribution, commercial integration,
hosted service use, and derivative package distribution require prior written
permission.
