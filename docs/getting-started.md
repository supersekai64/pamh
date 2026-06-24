# Getting Started

## Prerequisites

- Node.js >= 20.0.0
- PNPM >= 9.0.0

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

For a project-local install that bootstraps PAM automatically:

```bash
cd your-project
npm install -D @supersekai64/pam-cli
```

When `@supersekai64/pam-cli` is installed as a direct project dependency, its postinstall
script initializes `.ai-memory/` and writes supported agent/IDE integration
files. Set `PAM_SKIP_PROJECT_INIT=1` before install to opt out.

**From source** (for development):

```bash
pnpm setup
```

This installs dependencies, builds all packages, and links the `pam` command globally.

**Manual installation** (if you need more control):

```bash
pnpm install
```

## Build

```bash
pnpm build
```

## Link The CLI

```bash
pnpm link:cli
```

This links the `pam` command globally from `packages/cli`. Use this root script instead of `pnpm --filter PAM link --global`, because `pnpm link` does not support filtered workspace execution consistently across PNPM versions and also requires a configured PNPM global bin directory.

## Initialize Memory

### Project Memory

```bash
pam init
```

This creates `.ai-memory/` in the current directory and auto-configures supported project-level agent integrations. Use `pam init --no-integrations` for memory storage only.

If `@supersekai64/pam-cli` was installed locally with `npm install -D @supersekai64/pam-cli`, npm already
runs this project bootstrap during postinstall. Re-run `pam init` whenever
you want to refresh integration files.

If you use Codex and want PAM exposed in every new Codex session, also configure the global Codex MCP server:

```bash
pam init --codex-global
```

Restart Codex after changing the global MCP configuration. PAM does not modify global client config during `npm install`; global integration is explicit so package installation stays safe and predictable.

Project-local npm install can bootstrap project files, but it cannot force an
already-running IDE or AI client to reload them. After the first install, reload
VS Code/Cursor windows, start a new Claude Code/OpenCode session, or
restart/open a new Codex session so the client reloads project instructions and
MCP configuration.

Run the readiness checks before trusting the integration:

```bash
pam doctor integrations
pam smoke-test agent
```

The smoke test creates an active memory and prints a command that verifies
retrieval immediately.

Treat this as the first-run proof:

- `pam doctor integrations` should report every generated project file as OK.
- `pam smoke-test agent` should create an active memory and print its ID.
- The printed `pam search ...` or `pam context --query ...` command
  should find that memory immediately.
- `pam ui --open` should show the active memory store and context preview.

## Configure Your IDE or AI Agent

PAM works best when integrated with your AI-powered development tools via MCP (Model Context Protocol).

### Add PAM to your MCP configuration

For Cursor, VSCode with Copilot, Claude Code, or other MCP-compatible tools:

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

See [MCP Configuration](mcp.md) for detailed examples for each tool.

## Automatic Memory Capture (Default)

By default, PAM uses **auto mode**: your AI agent can create active memories
when it uses the PAM MCP tools or generated hooks, and prompt hooks capture
redacted raw `exchange` memories as Markdown. PAM stores and serves the memory;
it does not silently read arbitrary conversations unless the client integration
sends lifecycle events.

### Workflow

1. **Work normally** with your AI agent (Cursor, Copilot, Claude Code, etc.)
2. **Agent captures memories** automatically when it encounters important information
3. **Inspect or audit memory**:

   ```bash
   # List active memories
   pam list --status active

   # Or open the UI for visual inspection
   pam ui --open
   ```

### Example

```bash
# After working with your AI agent, inspect active memory
pam list --status active
# mem_abc123 | decision | project | active | Use PostgreSQL for main database

# It is immediately searchable
pam search "PostgreSQL"
```

See [Capture Modes](capture-modes.md) for all available modes (manual, assisted, auto).
See [Role Examples](examples.md) for setup flows by user profile, and
[Glossary](glossary.md) for PAM vocabulary.

## Manual Memory Capture (Optional)

You can also add memories manually:

```bash
# Add a memory
pam add -t decision -c "Use PostgreSQL for the main database"

# List memories
pam list

# Search memories
pam search "database"

# Show pam status
pam status
pam status --verbose

# Compile context
pam context --query "architecture" --output
```

## How Memory Discovery Works

PAM searches for `.ai-memory/` by walking up the directory tree, similar to how `.git` works.

**Example 1: Shared memory (monorepo)**

```bash
cd ~/projects/my-app
pam init
# → Creates ~/projects/my-app/.ai-memory/

cd backend
pam add -t decision -c "Use PostgreSQL for the main database"
# → Uses ~/projects/my-app/.ai-memory/

cd ../frontend
pam list
# → Shows the same memory
```

**Example 2: Isolated memory**

```bash
cd ~/projects/my-app/backend
pam init
# → Creates ~/projects/my-app/backend/.ai-memory/
# → This project now has its own isolated memory
```

## Development

```bash
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm lint
pnpm format
```
