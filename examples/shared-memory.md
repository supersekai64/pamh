# Shared Memory Example

## Scenario

You have a monorepo with multiple projects:

```text
~/projects/client-app/
  ├── wordpress-plugin/
  └── nextjs-admin/
```

## Setup

Initialize memory in the parent directory:

```bash
cd ~/projects/client-app
memory init
```

This creates `~/projects/client-app/.ai-memory/`.

## Usage

From any subdirectory, PAMH automatically uses the parent memory:

```bash
cd ~/projects/client-app/wordpress-plugin
memory add -t decision -c "Use TypeScript"
# → Stored in ~/projects/client-app/.ai-memory/

cd ~/projects/client-app/nextjs-admin
memory list
# → Shows the same memory
```

## Checking Which Memory Is Used

Use `memory status` to see which memory directory is currently active:

```bash
cd ~/projects/client-app/wordpress-plugin
memory status
# Using memory: ~/projects/client-app/.ai-memory/
# Global memory: ~/ai-memory/
# Memories: 1 active, 0 proposed, 0 archived, 0 deleted
```

## Isolated Memory

If you want isolated memory for a specific project:

```bash
cd ~/projects/client-app/wordpress-plugin
memory init
# → Creates ~/projects/client-app/wordpress-plugin/.ai-memory/
# → Now this project has its own memory
```

```bash
memory status
# Using memory: ~/projects/client-app/wordpress-plugin/.ai-memory/
# Global memory: ~/ai-memory/
# Memories: 0 active, 0 proposed, 0 archived, 0 deleted
```

## Global Memory

You can also initialize global memory for cross-project preferences:

```bash
memory init global
# → Creates ~/ai-memory/

memory add -t preference -s global -c "Always use TypeScript strict mode"
# → Stored in ~/ai-memory/
```

Global memory is always available, regardless of which project you're in.
