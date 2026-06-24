# MCP Integration

PAM exposes a Model Context Protocol server over stdio.

## Automatic Project Setup

Running the default project initializer configures best-effort MCP and agent instruction files:

```bash
pam init
```

For projects that already use npm/package.json, installing `@supersekai64/pam-cli` as a
direct local dependency also runs this bootstrap automatically:

```bash
npm install -D @supersekai64/pam-cli
```

Use `PAM_SKIP_PROJECT_INIT=1` to disable the postinstall bootstrap.

Generated or updated files:

- `AGENTS.md` for Codex-style and generic agent instructions
- `CLAUDE.md` for Claude Code project instructions
- `.claude/settings.json` for Claude Code lifecycle hook capture
- `.codex/hooks.json` for Codex lifecycle hook capture
- `opencode.json` for OpenCode MCP configuration
- `.mcp.json` for clients that read project MCP configuration
- `.vscode/mcp.json` for VS Code and GitHub Copilot MCP configuration
- `.cursor/mcp.json` for Cursor MCP configuration
- `.cursor/rules/pam.mdc` for Cursor project rules
- `.github/copilot-instructions.md` for GitHub Copilot project instructions

Existing files are not blindly overwritten. Markdown instruction files receive a managed PAM block, and JSON config files are merged when they contain valid JSON. Invalid JSON config files are skipped and reported.

Use this only to initialize memory storage without integration files:

```bash
pam init --no-integrations
```

For Codex, project files may not be enough if the client only loads global MCP
servers at session startup. Configure the global Codex MCP server explicitly:

```bash
pam init --codex-global
```

This updates `~/.codex/config.toml` with:

```toml
[mcp_servers.pam]
command = "pam"
args = ["server", "start"]
startup_timeout_sec = 30
```

Restart Codex after running the command. A project-local npm install can write
project integration files automatically, but PAM intentionally does not modify
global client config from npm postinstall; the global setup is opt-in.

## Start Server

```bash
pam server start
```

The server uses the current working directory as the project root. Project memory is resolved from `./.ai-memory` or the nearest parent `.ai-memory`.

## Available Tools

- `search_memory` - Search project memories by text, type, and tag
- `get_memory` - Get a memory by ID
- `add_memory` - Add or consolidate a durable memory signal
- `memory_checkpoint` - Submit durable session learnings as one structured checkpoint
- `edit_memory` - Edit an existing memory
- `delete_memory` - Logically delete a memory
- `list_projects` - List current and linked projects
- `compile_context` - Compile project and search context
- `supersede_memory` - Create a new memory that supersedes an outdated one
- `get_supersession_chain` - Return all versions in a supersession chain
- `get_latest_version` - Resolve a memory to its latest version
- `handoff_begin` - Record context for the next agent or session
- `handoff_accept` - Accept an open handoff and retrieve its context
- `forget_sweep` - Run configurable pam decay cleanup
- `record_hook_event` - Record agent lifecycle hook events for capture workflows
- `recommend_memory_maintenance` - Preview evidence-backed maintenance recommendations
- `preview_memory_distillation` - Preview synthetic memory proposals without creating them
- `preview_knowledge_graph` - Preview typed Knowledge Graph entities and relations
- `apply_memory_recommendation` - Apply one reviewed recommendation by ID

`add_memory` accepts `content`, `type`, optional `title`, `tags`, `concepts`,
and `salience`. `concepts` are client-provided canonical semantic themes used
for strong concept grouping; they are separate from technical tags. PAM is
project-only, so MCP clients do not provide a scope. The MCP capture path is
intelligent by default: before creating another memory, PAM
looks for a same-type, same-theme memory. If it finds a review-mode proposed
match, it merges the new signal into that proposal. If it finds active guidance that is
likely contradicted by the new signal, PAM creates a supersession linked with
`supersedes` and `source_ids`; auto mode can supersede the active memory
directly.

Use `supersede_memory` when the client already knows exactly which memory is
being replaced. Otherwise, `add_memory` can discover the likely same-theme
target automatically.

Client AI agents can improve UI readability by generating a short `title` and
1-3 broad `concepts` for a memory and passing them to `add_memory`,
`edit_memory`, or `memory_checkpoint`. For example, a concrete settings button
change should usually use a broad concept such as `UI`, while keeping the
button detail in the memory content. PAM stores this metadata as reviewable
Markdown and falls back to content extraction when no client concepts are
present; the local server does not call a hidden model by itself.

`memory_checkpoint` is still useful for concise end-of-task summaries, but it
is not the only safety net. Textual hooks capture raw exchanges during the
session, and durable `add_memory` calls can save important decisions as soon as
they appear. PAM applies the configured capture mode: `manual` records an
observation only, `assisted` creates proposed memories, and `auto` creates
active memories. Bullet-list checkpoint entries are split into separate signals
when every bullet is already a standalone memory candidate, then each signal
goes through the same consolidation flow as `add_memory`.

If a session closes before a final checkpoint, PAM can recover a basic session
summary on the next `session-start` by scanning previous hook events that never
received a `session-end`. This does not invent missing agent reasoning, but it
does preserve the captured exchange trail and creates a recovered `session`
pam when enough activity exists.

The intelligence preview tools are diagnostic and optional. They do not drive
the default capture path, which is automatic. Keep them for audits, debugging,
or sensitive projects; day-to-day memory operation should not depend on manual
distillation or maintenance review.

## Capture Model

PAM supports three capture modes configured in `.ai-memory/auto-capture.yaml`:

- **auto** (default) - Agent creates active memories and hooks capture raw exchanges
- **assisted** - Agent proposes memories, user approves
- **manual** - Memories are created only when explicitly requested

In assisted mode, when an agent calls `add_memory`, new memories are created
with `status: proposed` and require user approval via `pam approve <id>` or
the UI. Same-theme proposed memories are merged before review so the user sees a
cleaner queue instead of many near-duplicates. In the default auto mode, those
same captures are active after consolidation.

See [docs/capture-modes.md](capture-modes.md) for detailed configuration.

Memory is created when one of these actions happens:

- a user runs a CLI command such as `pam add`
- a user creates a memory in the local UI
- an MCP client calls `add_memory` (status depends on capture mode)
- an MCP client calls `memory_checkpoint` after meaningful work
- a tool lifecycle hook calls `pam hook record`

This is intentional for control and transparency. If an MCP client completes useful work, instruct it to save the relevant decision, task, mistake, or project state through PAM.

Hook events are append-only observations. Textual prompt hooks also create
redacted Markdown `exchange` memories in auto/assisted mode. These files include
a `Simplified` section for quick review and a preserved `Raw Exchange` section
for auditability. A meaningful session-end hook creates a `session` memory
according to capture mode.

When a `user-prompt` hook receives prompt text through stdin or `data.text`,
PAM captures the raw exchange, searches existing active memory for relevant
pre-answer context IDs, and may infer narrow durable memories for explicit
corrections such as "always update documentation after changes" or "this should
have been remembered automatically."

Example agent instruction:

```text
When you make a durable project decision, learn a reusable fact, or finish a meaningful task, call the PAM memory_checkpoint tool before your final response. Do not store secrets.
```

Example manual fallback:

```bash
pam add -t session --tags "opencode,setup" -c "Initialized a React project with Tailwind and shadcn components."
```

## Supersession And Decay

Agents should use `supersede_memory` instead of editing history when newer information replaces an older memory. PAM archives the old memory and links both versions, so clients can inspect the full chain with `get_supersession_chain` or resolve the current version with `get_latest_version`.

`forget_sweep` applies salience, age, and access-count decay to identify cold memories. Use `dry_run: true` before enabling cleanup in automated workflows.

## Agent Handoff

Use `handoff_begin` near the end of a session to persist a concise summary, open questions, and next steps. The next agent can call `handoff_accept` at startup to resume from the latest open handoff.

## Intelligence Tools

Use `recommend_memory_maintenance` to find distillation, obsolete, noise,
strong-concept, contradiction, metadata, and missing-memory candidates. Each
recommendation references memory evidence.

Use `preview_memory_distillation` to inspect synthetic memory proposals. When a
distilled memory is created through the CLI or API, it uses `source:
distillation`, defaults to `status: active` in automatic workflows, and stores
source memory IDs. Assisted workflows can still create distilled memories as
`proposed` when review is required.

Use `preview_knowledge_graph` to inspect entities and typed relations. Generated
relations are evidence-backed previews, not permanent graph mutations.

## Example Client Configuration

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

For local development before publishing the CLI, use Node directly:

```json
{
  "mcpServers": {
    "pam": {
      "command": "node",
      "args": ["/path/to/pam/packages/cli/dist/index.js", "server", "start"]
    }
  }
}
```
