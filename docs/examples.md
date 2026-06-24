# PAM Role Examples

Use these flows as starting points. PAM is project-local by default: each flow
assumes you run commands from the project root that owns `.ai-memory/`.

## Solo Developer

Goal: keep project decisions and gotchas available across agent sessions.

```bash
pam init
pam doctor integrations
pam smoke-test agent
```

Capture manually when the agent cannot call MCP:

```bash
pam add -t decision -c "Use PostgreSQL for the main application database" --tags "database,architecture"
pam add -t mistake -c "Do not run migrations from the UI process" --tags "deploy"
pam search "database choice"
pam context --query "deployment gotchas"
```

## Team Committing Project Memory

Goal: share durable project knowledge in Git while keeping local indexes and
observations out of review noise.

Recommended:

- Commit curated Markdown memories under `.ai-memory/`.
- Commit active curated memories after checking the Evidence view or `pam list --status active`.
- Treat proposed memories as assisted-mode review items, not as the normal default workflow.
- Rebuild the local index after pulling memory changes.
- Keep `.ai-memory/memory.db`, observations, and backups local unless your team
  explicitly wants to review them.

```bash
pam list --status active
pam doctor check
pam index rebuild
```

## Codex Agent

Goal: let Codex read and write project memories through MCP.

```bash
pam init
pam init --codex-global
pam doctor integrations
pam smoke-test agent
```

Restart Codex after changing global MCP configuration. In the default auto mode,
captured memories become active after consolidation. Switch to assisted mode
only when you explicitly want a review queue:

```bash
pam capture set assisted
pam review
pam approve mem_abc123
```

## Claude Code With Hooks

Goal: record lifecycle observations and use MCP tools when available.

```bash
pam init
pam doctor integrations
```

Generated Claude instructions and hooks should call current `pam` commands
without deprecated `--project` flags. After initialization, start a fresh Claude
Code session so it reloads project instructions.

Inspect active evidence and integration status after sessions:

```bash
pam list --status active
pam status --verbose
```

## Sensitive Or Manual-Only User

Goal: keep full control over durable memory.

Set capture mode to manual in `.ai-memory/config.json` or through the UI before
working with agents. Manual mode keeps MCP checkpoint calls from creating durable
memories automatically.

Recommended routine:

```bash
pam init --no-integrations
pam add -t preference -c "Do not store private customer names in PAM" --tags "privacy"
pam redact mem_abc123
pam export backup.zip
```

When using physical deletion, PAM writes a local backup first:

```bash
pam delete mem_abc123 --physical --yes
pam restore mem_abc123
```
