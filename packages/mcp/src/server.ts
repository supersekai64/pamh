import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import {
  addMemory,
  compileMemoryContext,
  editMemory,
  getMemory,
  listProjects,
  removeMemory,
  searchMemory,
  supersedeMemoryTool,
  getSupersessionChainTool,
  getLatestVersionTool,
  handoffBeginTool,
  handoffAcceptTool,
  forgetSweepTool,
  memoryCheckpoint,
  recordHookEventTool,
  applyMemoryRecommendation,
  previewKnowledgeGraph,
  previewMemoryDistillation,
  recommendMemoryMaintenance,
  type McpToolContext,
} from './tools.js'

function jsonResult(value: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  }
}

const PAM_SERVER_INSTRUCTIONS = `PAM is the persistent memory layer for this project. Use it on EVERY task — not just when asked.

MANDATORY workflow:
1. At the start of every task, call \`search_memory\` (and \`compile_context\` if useful) to retrieve existing rules, preferences, decisions, and recent sessions.
2. Whenever the user expresses a durable preference, rule, decision, correction, or mistake — capture it IMMEDIATELY with \`add_memory\` (do not defer to end of turn). Triggers include phrases like "always", "never", "from now on", "I want X everywhere", "this should have been remembered".
3. Before your final response, call \`memory_checkpoint\` with a summary plus relevant decisions/preferences/rules/mistakes/tasks.

Capture is automatic by default: new installs use \`auto\` mode, hooks capture Markdown exchanges with simplified and raw sections, and MCP writes consolidate or supersede same-theme memories. Assisted/manual modes remain available for stricter review workflows.

Memory types: \`exchange\` (raw captured conversation), \`rule\` (always/never), \`preference\` (style/UX choices), \`decision\` (technical choices), \`knowledge\` (reusable facts), \`mistake\` (lessons), \`session\` (work summary), \`task\` (follow-up). PAM is project-only; clients do not provide a scope. Always write memory content in English.

Strong concepts: when calling \`add_memory\`, \`edit_memory\`, or \`memory_checkpoint\`, fill the optional \`concepts\` array with 1-3 broad, durable semantic themes chosen by the client AI. Use canonical project/product themes, not button labels, page section names, implementation details, memory types, model names, agent names, status labels, source names, or one-off nouns. Keep concrete details in the memory content as evidence.

Never store secrets, tokens, passwords, or transient logs.`

export function createPamMcpServer(context: McpToolContext) {
  const server = new McpServer(
    {
      name: 'pam',
      version: '0.1.0',
    },
    {
      instructions: PAM_SERVER_INSTRUCTIONS,
    }
  )

  server.registerTool(
    'search_memory',
    {
      title: 'Search Memory',
      description:
        'Search project PAM memories by text, type, and tag. CALL THIS AT THE START OF EVERY TASK to retrieve existing rules, preferences, and decisions before acting.',
      inputSchema: {
        query: z.string().optional(),
        type: z.string().optional(),
        tag: z.string().optional(),
        theme: z.string().optional(),
        limit: z.number().int().positive().optional(),
      },
      annotations: {
        title: 'Search Memory',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(await searchMemory(input, context))
  )

  server.registerTool(
    'get_memory',
    {
      title: 'Get Memory',
      description: 'Get a PAM memory by ID.',
      inputSchema: {
        id: z.string(),
      },
    },
    async (input) => jsonResult(await getMemory(input, context))
  )

  server.registerTool(
    'add_memory',
    {
      title: 'Add Memory',
      description:
        'Add a new PAM memory. CALL THIS IMMEDIATELY whenever the user expresses a durable preference, rule ("always/never"), decision, correction, or reusable fact — do not defer to end of turn. Default auto mode writes active memories after consolidation; assisted mode writes `proposed` memories for review.',
      inputSchema: {
        content: z.string(),
        title: z.string().optional(),
        type: z.string(),
        tags: z.array(z.string()).optional(),
        concepts: z.array(z.string()).optional(),
        theme: z.string().optional(),
        salience: z.number().min(0).max(1).optional(),
      },
      annotations: {
        title: 'Add Memory',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(await addMemory(input, context))
  )

  server.registerTool(
    'memory_checkpoint',
    {
      title: 'Memory Checkpoint',
      description:
        'Submit a structured checkpoint of durable session learnings. CALL THIS BEFORE YOUR FINAL RESPONSE whenever meaningful project work happened, including a `summary` and any relevant `decisions` / `facts` / `preferences` / `mistakes` / `tasks`. PAM creates active memories in auto mode or proposed memories in assisted mode.',
      inputSchema: {
        summary: z.string().optional(),
        decisions: z.array(z.string()).optional(),
        facts: z.array(z.string()).optional(),
        preferences: z.array(z.string()).optional(),
        mistakes: z.array(z.string()).optional(),
        tasks: z.array(z.string()).optional(),
        concepts: z.array(z.string()).optional(),
        agent: z.string().optional(),
        model: z.string().optional(),
        session_id: z.string().optional(),
      },
      annotations: {
        title: 'Memory Checkpoint',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(await memoryCheckpoint(input, context))
  )

  server.registerTool(
    'edit_memory',
    {
      title: 'Edit Memory',
      description:
        'Edit an existing PAM memory. Client AI agents can provide a concise optional title to improve UI labels while leaving the full content intact.',
      inputSchema: {
        id: z.string(),
        content: z.string().optional(),
        title: z.string().optional(),
        type: z.string().optional(),
        tags: z.array(z.string()).optional(),
        concepts: z.array(z.string()).optional(),
        theme: z.string().optional(),
      },
    },
    async (input) => jsonResult(await editMemory(input, context))
  )

  server.registerTool(
    'delete_memory',
    {
      title: 'Delete Memory',
      description: 'Logically delete a PAM memory.',
      inputSchema: {
        id: z.string(),
      },
    },
    async (input) => jsonResult({ deleted: await removeMemory(input, context) })
  )

  server.registerTool(
    'list_projects',
    {
      title: 'List Projects',
      description: 'List current and linked PAM projects.',
      inputSchema: {
        includeCurrent: z.boolean().optional(),
      },
    },
    async (input) => jsonResult(await listProjects(input, context))
  )

  server.registerTool(
    'compile_context',
    {
      title: 'Compile Context',
      description: 'Compile context from project and search memories.',
      inputSchema: {
        query: z.string().optional(),
        maxTokens: z.number().int().positive().optional(),
      },
    },
    async (input) => jsonResult(await compileMemoryContext(input, context))
  )

  server.registerTool(
    'recommend_memory_maintenance',
    {
      title: 'Recommend Memory Maintenance',
      description:
        'Preview reviewable memory maintenance recommendations with evidence. Does not mutate memories.',
      inputSchema: {},
    },
    async (input) => jsonResult(await recommendMemoryMaintenance(input, context))
  )

  server.registerTool(
    'preview_memory_distillation',
    {
      title: 'Preview Memory Distillation',
      description:
        'Preview deterministic distillation proposals. Does not create distilled memories.',
      inputSchema: {},
    },
    async (input) => jsonResult(await previewMemoryDistillation(input, context))
  )

  server.registerTool(
    'preview_knowledge_graph',
    {
      title: 'Preview Knowledge Graph',
      description:
        'Preview evidence-backed Knowledge Graph entities and typed relations. Relations remain proposed.',
      inputSchema: {},
    },
    async (input) => jsonResult(await previewKnowledgeGraph(input, context))
  )

  server.registerTool(
    'apply_memory_recommendation',
    {
      title: 'Apply Memory Recommendation',
      description:
        'Accept and apply one previously generated memory recommendation by ID. Review evidence before calling.',
      inputSchema: {
        id: z.string(),
      },
    },
    async (input) => jsonResult(await applyMemoryRecommendation(input, context))
  )

  // Supersession tools
  server.registerTool(
    'supersede_memory',
    {
      title: 'Supersede Memory',
      description:
        'Create a new memory that supersedes an existing one. Use when new information contradicts or updates an existing memory.',
      inputSchema: {
        old_id: z.string(),
        content: z.string(),
        type: z.string(),
        tags: z.array(z.string()).optional(),
        salience: z.number().min(0).max(1).optional(),
      },
    },
    async (input) => jsonResult(await supersedeMemoryTool(input, context))
  )

  server.registerTool(
    'get_supersession_chain',
    {
      title: 'Get Supersession Chain',
      description:
        'Get the full supersession chain for a memory (all versions from oldest to newest).',
      inputSchema: {
        memory_id: z.string(),
      },
    },
    async (input) => jsonResult(await getSupersessionChainTool(input, context))
  )

  server.registerTool(
    'get_latest_version',
    {
      title: 'Get Latest Version',
      description: 'Get the latest version of a memory (follows superseded_by chain).',
      inputSchema: {
        memory_id: z.string(),
      },
    },
    async (input) => jsonResult(await getLatestVersionTool(input, context))
  )

  // Handoff tools
  server.registerTool(
    'handoff_begin',
    {
      title: 'Begin Handoff',
      description:
        'Begin a handoff for the next agent. Use when ending a session to provide context for the next agent.',
      inputSchema: {
        summary: z.string(),
        agent_from: z.string().optional(),
        open_questions: z.array(z.string()).optional(),
        next_steps: z.array(z.string()).optional(),
      },
    },
    async (input) => jsonResult(await handoffBeginTool(input, context))
  )

  server.registerTool(
    'handoff_accept',
    {
      title: 'Accept Handoff',
      description:
        'Accept an open handoff from a previous agent. Use when starting a session to see where the previous agent left off.',
      inputSchema: {
        handoff_id: z.string().optional(),
        agent_to: z.string().optional(),
      },
    },
    async (input) => jsonResult(await handoffAcceptTool(input, context))
  )

  // Decay tools
  server.registerTool(
    'forget_sweep',
    {
      title: 'Forget Sweep',
      description:
        'Run a forget sweep to soft-delete memories below the decay threshold. Use to clean up obsolete memories.',
      inputSchema: {
        lambda: z.number().min(0).optional(),
        sigma: z.number().min(0).optional(),
        mu: z.number().min(0).optional(),
        cold_threshold: z.number().min(0).max(1).optional(),
        hard_delete_after_days: z.number().int().min(0).optional(),
        dry_run: z.boolean().optional(),
      },
    },
    async (input) => jsonResult(await forgetSweepTool(input, context))
  )

  // Hook tools (lifecycle events)
  server.registerTool(
    'record_hook_event',
    {
      title: 'Record Hook Event',
      description:
        'Record a lifecycle hook event (session-start, user-prompt, post-tool-use, session-end, etc.). Use for automatic pam capture.',
      inputSchema: {
        type: z.enum([
          'session-start',
          'user-prompt',
          'pre-tool-use',
          'post-tool-use',
          'pre-compact',
          'notification',
          'stop',
          'session-end',
          'other',
        ]),
        agent: z.string().optional(),
        session_id: z.string().optional(),
        data: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async (input) => jsonResult(await recordHookEventTool(input, context))
  )

  return server
}

export async function startPamMcpServer(context: McpToolContext) {
  const server = createPamMcpServer(context)
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
