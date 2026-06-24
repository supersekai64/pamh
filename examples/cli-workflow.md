# CLI Workflow Example

This example demonstrates manual CLI usage for adding memories, searching, and compiling context.

**Note:** For automatic pam capture with your AI agent (Cursor, Copilot, Claude Code, etc.), see [MCP Configuration](../docs/mcp.md) and the [Getting Started guide](../docs/getting-started.md#automatic-memory-capture-default).

## Initialize

```bash
pam init
```

## Add Memories

```bash
pam add -t decision --tags "architecture,sqlite" -c "Use SQLite as a rebuildable local index."
pam add -t knowledge --tags "typescript" -c "Core packages must stay independent from CLI and MCP."
pam add -t mistake --tags "security" -c "Do not store secrets in memory files."
```

## List And Search

```bash
pam list
pam search "SQLite"
pam search --tag security
pam search "local index" --semantic
```

## Compile Context

```bash
pam context --query "architecture" --output
```

The compiled context is written to:

```text
.ai-memory/compiled-context.md
```
