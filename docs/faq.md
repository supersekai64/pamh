# FAQ

## Does PAMH replace an LLM memory feature?

No. PAMH gives users an independent memory layer that can be used across LLMs, editors, agents, and tools.

## Where is my data stored?

By default:

- global memory: `~/ai-memory`
- project memory: `./.ai-memory`

## Is SQLite the source of truth?

No. Markdown is the source of truth. SQLite is an index.

## Can I use PAMH offline?

Yes for core storage, text search, CLI, export/import, and MCP. Semantic search uses local embeddings by default, but the first local model download may require network access.

## Does semantic search require OpenAI?

No. PAMH uses a local embedding provider by default. OpenAI can be enabled explicitly with:

```bash
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=...
```

## What happens when I delete a memory?

The memory is logically deleted by setting `status: deleted`. It can be restored with:

```bash
memory restore <id>
```

## Can I export my memory?

Yes. Supported MVP export formats:

- ZIP
- JSON
- Markdown

Example:

```bash
memory export backup.zip
```

## Can MCP clients modify memory?

Yes. The MCP server exposes tools for adding, editing, deleting, searching, and compiling context.

## Does PAMH automatically record OpenCode or other AI sessions?

PAMH supports three capture modes:

- **manual** - You explicitly add memories
- **assisted** (default) - Agent proposes memories, you approve them
- **auto** - Agent creates memories directly based on rules

In assisted mode (the default), when an agent calls `add_memory`, the memory is created with `status: proposed`. You review and approve it with `memory approve <id>` or via the UI.

See [docs/capture-modes.md](capture-modes.md) for configuration details.

Example manual capture:

```bash
memory add --project -t session -s project --tags "opencode" -c "Implemented the initial React page with Tailwind and shadcn."
```

## Should I commit `.ai-memory` to Git?

That depends on the project. If memory contains only project knowledge and no secrets, committing it can make memory portable with the repository. Review `docs/security.md` before doing so.

## How do I share memory between projects?

PAMH uses a `.git`-like discovery mechanism. Initialize memory in a parent directory, and all subdirectories will automatically use it:

```bash
cd ~/projects/client-app
memory init

cd wordpress-plugin
memory add -t decision -c "Use TypeScript"
# → Stored in ~/projects/client-app/.ai-memory/

cd ../nextjs-admin
memory list
# → Shows the same memory
```

If you want isolated memory for a specific project, initialize it in that project's directory:

```bash
cd ~/projects/client-app/wordpress-plugin
memory init
# → Creates isolated memory for this project only
```

Use `memory status` to see which memory directory is currently active.

## What's the difference between global and project memory?

- **Global memory** (`~/ai-memory/`): Cross-project preferences, patterns, and reusable knowledge. Use `memory init global` to create it.
- **Project memory** (`.ai-memory/`): Project-specific decisions, architecture, sessions, and tasks. Use `memory init` to create it.

Both can be used together. Project memory is automatically discovered by walking up the directory tree.
