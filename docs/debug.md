# Memory Debug Logging

PAMH can write a plain-text debug log for memory activity in the current project.

Enable it:

```bash
memory debug on --agent codex --model gpt-5
```

Show status and path:

```bash
memory debug status
memory debug path
```

Disable it:

```bash
memory debug off
```

The default project log is:

```text
.ai-memory/debug/memory-debug.log
```

Each entry is timestamped and includes the operation, memory id when relevant, source/tool,
agent/model/session when known, before/after metadata summaries, and a compact JSON line for
machine analysis.

Environment variables can enrich logs without changing commands:

```bash
PAMH_DEBUG=1
PAMH_AGENT=codex
PAMH_MODEL=gpt-5
PAMH_SESSION_ID=my-session
PAMH_TOOL=mcp
```

Logged events include memory create/read/update/delete/archive/restore/approve/reject/access,
full reindexing, context compilation, context writes, UI/API concept analysis, and memory
list/search requests.
