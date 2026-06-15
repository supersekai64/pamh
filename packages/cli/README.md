# Portable AI Memory Hub (PAMH)

CLI for persistent, portable, model-independent AI memory.

## Installation

```bash
npm install -g pamh-cli
```

This installs the `memory` command.

For automatic project bootstrap:

```bash
cd your-project
npm install -D pamh-cli
```

Local install creates `.ai-memory/` and supported agent/IDE integration files.
After the first install, reload VS Code/Cursor windows, start a new Claude
Code/OpenCode session, or restart/open a new Codex session so the client reloads
project config.

## Quick Start

```bash
memory init
memory add -t decision -c "Use SQLite for the local memory index"
memory checkpoint --summary "Finished CLI setup" --fact "PAMH stores project memory in .ai-memory"
memory search "SQLite"
memory server start
```

See the full documentation at https://github.com/supersekai64/pamh.
