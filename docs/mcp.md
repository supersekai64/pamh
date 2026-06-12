# MCP Integration

PAMH exposes a Model Context Protocol server over stdio.

## Automatic Project Setup

Running the default project initializer configures best-effort MCP and agent instruction files:

```bash
memory init
```

Generated or updated files:

- `AGENTS.md` for Codex-style and generic agent instructions
- `CLAUDE.md` for Claude Code project instructions
- `.claude/settings.json` for Claude Code lifecycle hook capture
- `opencode.json` for OpenCode MCP configuration
- `.mcp.json` for clients that read project MCP configuration
- `.vscode/mcp.json` for VS Code and GitHub Copilot MCP configuration
- `.cursor/mcp.json` for Cursor MCP configuration
- `.cursor/rules/pamh.mdc` for Cursor project rules
- `.github/copilot-instructions.md` for GitHub Copilot project instructions

Existing files are not blindly overwritten. Markdown instruction files receive a managed PAMH block, and JSON config files are merged when they contain valid JSON. Invalid JSON config files are skipped and reported.

Use this only to initialize memory storage without integration files:

```bash
memory init --no-integrations
```

## Start Server

```bash
memory server start
```

The server uses the current working directory as the project root. Project memory is resolved from `./.ai-memory`; global memory is resolved from `~/ai-memory`.

## Available Tools

- `search_memory` - Search memories by text, type, tag, and scope
- `get_memory` - Get a memory by ID
- `add_memory` - Add a new memory
- `memory_checkpoint` - Submit durable session learnings as one structured checkpoint
- `edit_memory` - Edit an existing memory
- `delete_memory` - Logically delete a memory
- `list_projects` - List current and linked projects
- `compile_context` - Compile global, project, linked, and search context
- `supersede_memory` - Create a new memory that supersedes an outdated one
- `get_supersession_chain` - Return all versions in a supersession chain
- `get_latest_version` - Resolve a memory to its latest version
- `handoff_begin` - Record context for the next agent or session
- `handoff_accept` - Accept an open handoff and retrieve its context
- `forget_sweep` - Run configurable memory decay cleanup
- `record_hook_event` - Record agent lifecycle hook events for capture workflows
- `recommend_memory_maintenance` - Preview evidence-backed maintenance recommendations
- `preview_memory_distillation` - Preview synthetic memory proposals without creating them
- `preview_knowledge_graph` - Preview typed Knowledge Graph entities and relations
- `apply_memory_recommendation` - Apply one reviewed recommendation by ID

`add_memory` accepts `content`, `type`, optional `scope`, `tags`, and `salience`. Use `supersede_memory` instead of `add_memory` when a new memory replaces an existing one, so both sides of the supersession chain are maintained.

`memory_checkpoint` is preferred for automatic capture. Agents can submit a short task summary plus decisions, facts, preferences, mistakes, and follow-up tasks. PAMH applies the configured capture mode: `manual` records an observation only, `assisted` creates proposed memories, and `auto` creates active memories.

The intelligence preview tools do not mutate memory. Agents should show or
summarize the evidence first, then call `apply_memory_recommendation` only after
the user accepts the proposed maintenance action.

## Capture Model

PAMH supports three capture modes configured in `.ai-memory/auto-capture.yaml`:

- **manual** - Memories are created only when explicitly requested
- **assisted** (default) - Agent proposes memories, user approves
- **auto** - Agent creates memories directly based on rules

In assisted mode, when an agent calls `add_memory`, the memory is created with `status: proposed` and requires user approval via `memory approve <id>` or the UI.

See [docs/capture-modes.md](capture-modes.md) for detailed configuration.

Memory is created when one of these actions happens:

- a user runs a CLI command such as `memory add`
- a user creates a memory in the local UI
- an MCP client calls `add_memory` (status depends on capture mode)
- an MCP client calls `memory_checkpoint` after meaningful work
- a tool lifecycle hook calls `memory hook record`

This is intentional for control and transparency. If an MCP client completes useful work, instruct it to save the relevant decision, task, mistake, or project state through PAMH.

Hook events are append-only observations. A meaningful session-end hook creates
a proposed `session` memory in assisted mode, but durable memory does not include
raw prompt transcripts.

When a `user-prompt` hook receives prompt text through stdin or `data.text`,
PAMH can infer narrow proposed memories for explicit durable corrections such as
"always update documentation after changes" or "this should have been remembered
automatically." The generated memory is compact English, not the raw prompt.

Example agent instruction:

```text
When you make a durable project decision, learn a reusable fact, or finish a meaningful task, call the PAMH memory_checkpoint tool before your final response. Do not store secrets.
```

Example manual fallback:

```bash
memory add --project -t session -s project --tags "opencode,setup" -c "Initialized a React project with Tailwind and shadcn components."
```

## Supersession And Decay

Agents should use `supersede_memory` instead of editing history when newer information replaces an older memory. PAMH archives the old memory and links both versions, so clients can inspect the full chain with `get_supersession_chain` or resolve the current version with `get_latest_version`.

`forget_sweep` applies salience, age, and access-count decay to identify cold memories. Use `dry_run: true` before enabling cleanup in automated workflows.

## Agent Handoff

Use `handoff_begin` near the end of a session to persist a concise summary, open questions, and next steps. The next agent can call `handoff_accept` at startup to resume from the latest open handoff.

## Intelligence Tools

Use `recommend_memory_maintenance` to find distillation, obsolete, noise,
strong-concept, contradiction, metadata, and missing-memory candidates. Each
recommendation references memory evidence.

Use `preview_memory_distillation` to inspect synthetic memory proposals. When a
distilled memory is created through the CLI or API, it uses `source:
distillation`, defaults to `status: proposed` in assisted workflows, and stores
source memory IDs.

Use `preview_knowledge_graph` to inspect entities and typed relations. Generated
relations are evidence-backed previews, not permanent graph mutations.

## Example Client Configuration

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

For local development before publishing the CLI, use Node directly:

```json
{
  "mcpServers": {
    "pamh": {
      "command": "node",
      "args": ["/path/to/pamh/packages/cli/dist/index.js", "server", "start"]
    }
  }
}
```
