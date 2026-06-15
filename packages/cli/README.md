# Portable AI Memory Hub (PAMH)

CLI for persistent, portable, model-independent AI memory.

## Installation

```bash
npm install -g pamh-cli
```

This installs the `memory` command.

## Quick Start

```bash
memory init
memory add -t decision -c "Use SQLite for the local memory index"
memory checkpoint --summary "Finished CLI setup" --fact "PAMH stores project memory in .ai-memory"
memory search "SQLite"
memory server start
```

See the full documentation at https://github.com/supersekai64/pamh.
