# Security

PAM is local-first. Memory is stored on disk, owned by the user, and designed to remain readable and auditable.

## Data Storage

- Markdown is the source of truth.
- SQLite is an index and can be rebuilt.
- Project memory defaults to `./.ai-memory` or the nearest parent `.ai-memory`.

## Sensitive Data

PAM includes basic redaction for common sensitive values:

- email addresses
- API keys
- bearer tokens
- AWS access keys
- passwords
- client secrets
- private keys

Use:

```bash
pam redact <id>
```

Redaction is intentionally conservative. Users should still review memories before exporting, sharing, or committing them.

Lifecycle hook observations are redacted before they are written to
`.ai-memory/observations/*.jsonl`. Durable session memories store event counts
and summaries. Textual prompt hooks also create redacted raw Markdown
`exchange` memories in auto/assisted mode.

## `.memoryignore`

`.memoryignore` works like `.gitignore` for memory ingestion and memory-related file handling.

Default exclusions include:

```text
.env
.env.*
*.pem
*.key
secrets/
node_modules/
vendor/
dist/
build/
.git/
*.db
*.sqlite
```

## Deletion

`pam delete` performs logical deletion by setting `status: deleted` in Markdown metadata.

Use:

```bash
pam restore <id>
```

Physical deletion requires an explicit destructive path. In the CLI, use
`pam delete <id> --physical --yes`; in the UI, type the memory ID when
prompted. Prefer logical deletion plus `pam restore <id>` unless you need to
remove the file from disk.

Before physical deletion, PAM writes a local `.ai-memory/backups/*.bak` copy.
`pam restore <id>` can restore from the latest matching backup if the
original Markdown file has already been removed.

The local UI/API server uses a per-instance session token for POST/PATCH/DELETE
requests and rejects cross-origin mutations. It is intended for localhost use,
not for exposure on a network interface.

## MCP

The MCP server runs over stdio and uses the current working directory as the project root.

Before enabling PAM in an MCP client, review which project directory that client starts from.
