# Getting Started

## Prerequisites

- Node.js >= 20.0.0
- PNPM >= 9.0.0

## Installation

**From npm** (recommended for users):

```bash
npm install -g pamh-cli
```

This installs the `memory` command globally.

If npm stays quiet during the first install, use `npm install -g pamh-cli --loglevel=info` to show dependency progress.

**From source** (for development):

```bash
pnpm setup
```

This installs dependencies, builds all packages, and links the `memory` command globally.

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

This links the `memory` command globally from `packages/cli`. Use this root script instead of `pnpm --filter pamh link --global`, because `pnpm link` does not support filtered workspace execution consistently across PNPM versions and also requires a configured PNPM global bin directory.

## Initialize Memory

### Project Memory

```bash
memory init
```

This creates `.ai-memory/` in the current directory and auto-configures supported project-level agent integrations. Use `memory init --no-integrations` for memory storage only.

If you use Codex and want PAMH exposed in every new Codex session, also configure the global Codex MCP server:

```bash
memory init --codex-global
```

Restart Codex after changing the global MCP configuration. PAMH does not modify global client config during `npm install`; global integration is explicit so package installation stays safe and predictable.

## Configure Your IDE or AI Agent

PAMH works best when integrated with your AI-powered development tools via MCP (Model Context Protocol).

### Add PAMH to your MCP configuration

For Cursor, VSCode with Copilot, Claude Code, or other MCP-compatible tools:

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

See [MCP Configuration](mcp.md) for detailed examples for each tool.

## Automatic Memory Capture (Default)

By default, PAMH uses **assisted mode**: your AI agent automatically proposes memories when it learns something important, and you review and approve them.

### Workflow

1. **Work normally** with your AI agent (Cursor, Copilot, Claude Code, etc.)
2. **Agent proposes memories** automatically when it encounters important information
3. **Review proposals**:

   ```bash
   # List proposed memories
   memory list --status proposed

   # Or open the UI for visual review
   memory ui --open
   ```

4. **Approve or reject**:

   ```bash
   # Approve a memory
   memory approve mem_abc123

   # Reject a memory
   memory reject mem_xyz789
   ```

### Example

```bash
# After working with your AI agent, check for proposals
memory list --status proposed
# mem_abc123 | decision | project | proposed | Use PostgreSQL for main database
# mem_def456 | knowledge | project | proposed | API rate limit is 1000 req/min

# Approve the ones you want to keep
memory approve mem_abc123
memory approve mem_def456

# They're now active and searchable
memory list
memory search "PostgreSQL"
```

See [Capture Modes](capture-modes.md) for all available modes (manual, assisted, auto).

## Manual Memory Capture (Optional)

You can also add memories manually:

```bash
# Add a memory
memory add -t decision -c "Use PostgreSQL for the main database"

# List memories
memory list

# Search memories
memory search "database"

# Show memory status
memory status

# Compile context
memory context --query "architecture" --output
```

## How Memory Discovery Works

PAMH searches for `.ai-memory/` by walking up the directory tree, similar to how `.git` works.

**Example 1: Shared memory (monorepo)**

```bash
cd ~/projects/my-app
memory init
# → Creates ~/projects/my-app/.ai-memory/

cd backend
memory add -t decision -c "Use PostgreSQL for the main database"
# → Uses ~/projects/my-app/.ai-memory/

cd ../frontend
memory list
# → Shows the same memory
```

**Example 2: Isolated memory**

```bash
cd ~/projects/my-app/backend
memory init
# → Creates ~/projects/my-app/backend/.ai-memory/
# → This project now has its own isolated memory
```

## Development

```bash
pnpm test
pnpm lint
pnpm format
```
