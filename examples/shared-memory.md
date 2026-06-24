# Shared Memory Example

## Scenario

You have a monorepo with multiple projects:

```text
~/projects/my-app/
  |-- backend/
  `-- frontend/
```

## Setup

Initialize memory in the parent directory:

```bash
cd ~/projects/my-app
pam init
```

This creates `~/projects/my-app/.ai-memory/`.

## Usage

From any subdirectory, PAM automatically uses the parent memory:

```bash
cd ~/projects/my-app/backend
pam add -t decision -c "Use PostgreSQL for the main database"
# -> Stored in ~/projects/my-app/.ai-memory/

cd ~/projects/my-app/frontend
pam list
# -> Shows the same memory
```

## Checking Which Memory Is Used

Use `pam status` to see which memory directory is currently active:

```bash
cd ~/projects/my-app/backend
pam status
# Using memory: ~/projects/my-app/.ai-memory/
# Memories: 1 active, 0 proposed, 0 archived, 0 deleted
```

## Isolated Memory

If you want isolated memory for a specific project:

```bash
cd ~/projects/my-app/backend
pam init
# -> Creates ~/projects/my-app/backend/.ai-memory/
# -> Now this project has its own memory
```

```bash
pam status
# Using memory: ~/projects/my-app/backend/.ai-memory/
# Memories: 0 active, 0 proposed, 0 archived, 0 deleted
```

## Cross-Project Preferences

PAM is project-only. For preferences shared by several related projects,
initialize `.ai-memory/` in a common parent directory and let each child project
discover that parent store.

```bash
cd ~/projects
pam init

cd ~/projects/my-app
pam add -t preference -c "Use TypeScript strict mode in workspace packages"
# -> Stored in ~/projects/.ai-memory/
```
