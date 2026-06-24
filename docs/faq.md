# FAQ

## Does PAM replace an LLM memory feature?

No. PAM gives users an independent memory layer that can be used across LLMs, editors, agents, and tools.

## Where is my data stored?

By default:

- project memory: `./.ai-memory` or the nearest parent `.ai-memory`

## Is SQLite the source of truth?

No. Markdown is the source of truth. SQLite is an index.

## Can I use PAM offline?

Yes for core storage, text search, CLI, export/import, and MCP. Semantic search is optional; local embeddings run offline after installing `@xenova/transformers` and downloading the model once.

## Does semantic search require OpenAI?

No. PAM supports optional local embeddings:

```bash
npm install -g @xenova/transformers
```

OpenAI can be enabled explicitly with:

```bash
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=...
```

## What happens when I delete a memory?

The memory is logically deleted by setting `status: deleted`. It can be restored with:

```bash
pam restore <id>
```

## Can I export my memory?

Yes. Supported MVP export formats:

- ZIP
- JSON
- Markdown

Example:

```bash
pam export backup.zip
```

## Can MCP clients modify memory?

Yes. The MCP server exposes tools for adding, editing, deleting, searching, and compiling context.

## Does PAM automatically record OpenCode or other AI sessions?

PAM supports three capture modes:

- **auto** (default) - Agent creates active memories and hooks capture raw exchanges
- **assisted** - Agent proposes memories, you approve them
- **manual** - You explicitly add memories

In auto mode (the default), when an agent calls `add_memory`, the memory is created with `status: active`. Use assisted mode when you want review before activation.

See [docs/capture-modes.md](capture-modes.md) for configuration details.

Example manual capture:

```bash
pam add -t session --tags "opencode" -c "Implemented the initial React page with Tailwind and shadcn."
```

## Should I commit `.ai-memory` to Git?

That depends on the project. If memory contains only project knowledge and no secrets, committing it can make memory portable with the repository. Review `docs/security.md` before doing so.

## How do I share memory between projects?

PAM uses a `.git`-like discovery mechanism. Initialize memory in a parent directory, and all subdirectories will automatically use it:

```bash
cd ~/projects/my-app
pam init

cd backend
pam add -t decision -c "Use PostgreSQL for the main database"
# → Stored in ~/projects/my-app/.ai-memory/

cd ../frontend
pam list
# → Shows the same memory
```

If you want isolated memory for a specific project, initialize it in that project's directory:

```bash
cd ~/projects/my-app/backend
pam init
# → Creates isolated memory for this project only
```

Use `pam status` to see which memory directory is currently active.

## Is there a global memory store?

No. PAM is project-only. Runtime clients do not provide a scope; `scope: global` and `pam init global` are not supported. Existing Markdown with legacy scopes is normalized to `project` when read.

Project memory is automatically discovered by walking up the directory tree.
