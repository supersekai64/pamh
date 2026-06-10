# Getting Started

## Prerequisites

- Node.js >= 20.0.0
- PNPM >= 9.0.0

## Installation

**One-command setup** (recommended):

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

This links the `memory` command globally from `packages/cli`. Use this root script instead of `pnpm --filter @pamh/cli link --global`, because `pnpm link` does not support filtered workspace execution consistently across PNPM versions and also requires a configured PNPM global bin directory.

## Usage

```bash
memory init global
memory init project
memory add
memory list
memory search "query"
```

`memory init project` initializes `.ai-memory` and auto-configures supported project-level agent integrations. Use `memory init project --no-integrations` for memory storage only.

## Development

```bash
pnpm test
pnpm lint
pnpm format
```
