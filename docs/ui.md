# Local UI

PAM includes a local shadcn dashboard for browsing and managing memory without
leaving the machine. The UI uses the shadcn `b2CiAl5qk` preset (`base-mira`) as
its visual baseline. Shared select menus disable item alignment with the
trigger so popups align consistently to the trigger edge.

## Start

```bash
pam ui --open
```

By default, the server binds to `127.0.0.1:3939`.

## Capabilities

- View the current project memory store from one dashboard
- Search memories by content, tag, source, type, or ID
- Filter active, proposed, archived, noise, deleted, or full-history memory
- Switch memory inventory status tabs without refreshing global stats or index cards
- Create active project memories
- Approve or reject proposed memories if manual review mode was explicitly used
- Archive or restore memories
- Inspect memory content, tags, type, source, salience, and timestamps in a drawer
- View indexed store size, active context source count, approximate context tokens, and concept links
- Preview the LLM context summary on the dashboard and the full generated context on `/llm-context`
- Inspect top concepts and knowledge graph metrics
- Open persistent page URLs such as `/llm-context`, `/sqlite-index`, and `/settings`
- Read the LLM context token estimate and SQLite database size directly from
  the Runtime sidebar entries, with skeleton placeholders while those metrics load
- Copy the generated LLM context from `/llm-context` to the clipboard
- Configure capture mode, semicolon-separated ignored concepts, and index rebuilds from Settings without using the CLI; Capture controls render directly instead of using loading skeletons
- Review local npm package build versions with `v`-prefixed numbers in the sidebar and see when npm has newer published versions
- Read package version badges as `latest`, `update`, `ahead`, or `unknown`
- Keep dashboard loading states visually stable by preserving section copy and
  metric layouts while using skeletons sized to the loaded card and metric values

The UI is designed for the automatic PAM workflow. Governance screens and manual
distillation review surfaces are not part of the default product path: capture,
simplification, categorization, contradiction handling, indexing, and vector
search are handled by PAM itself. Proposed memories are still visible only for
compatibility with explicit manual capture modes.

The LLM context preview is not a raw recent-memory list and its source count is
not the total active memory count. The API composes a ranked prompt-source
subset from active project memories by prioritizing durable rules, decisions,
preferences, and knowledge before task and session context. Noise, deleted,
archived, proposed, duplicate implementation summaries, and lower-ranked
overflow are excluded from the prompt context.

The strong concepts shown beside the LLM context are semantic themes from those
selected prompt sources. The API prefers client-provided `concepts` metadata,
which lets the LLM client group concrete details such as settings buttons under
broad themes such as `UI`. If a memory has no client concepts, the API falls
back to content extraction. Metadata-only tags such as checkpoint tags, model
tags, agent tags, memory types, source labels, and status markers are treated as
facets. Concepts that should be hidden are managed from Settings through the
ignored concepts list.

## Architecture

```text
Browser UI
    |
    v
Local HTTP API (127.0.0.1)
    |
    v
@supersekai64/pam-core
    |
    v
Markdown + SQLite + vector index
```

The UI is static and does not own persistence logic. All writes go through the
local API, and the API delegates to `@supersekai64/pam-core`.

## Browser Smoke Test

The repository includes a Playwright smoke suite for the local UI:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

It builds the packages, starts the real local API/UI against a temporary
`.ai-memory` store, and verifies the dashboard shell, memory creation, proposed
memory approval compatibility, context preview, and graph metrics.

## Future Clients

Desktop apps and IDE extensions should live in separate repositories. They can
either:

- call the same local HTTP API exposed by `@supersekai64/pam-api`, or
- embed `@supersekai64/pam-core` directly when a local Node runtime is appropriate.

The recommended default is to use the local HTTP API so clients stay thin and
tool-agnostic.

## Security

The server is local-first and binds to `127.0.0.1` by default. Do not bind to a
public interface unless you understand the risk.
