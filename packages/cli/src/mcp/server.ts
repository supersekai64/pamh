import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import {
  addMemory,
  compileMemoryContext,
  editMemory,
  forgetSweepTool,
  getLatestVersionTool,
  getMemory,
  getSupersessionChainTool,
  handoffAcceptTool,
  handoffBeginTool,
  listProjects,
  memoryCheckpoint,
  recordHookEventTool,
  removeMemory,
  searchMemory,
  supersedeMemoryTool,
  type McpToolContext,
} from './tools.js'

const scopeSchema = z.enum(['global', 'project']).optional()

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

export function createPamhMcpServer(context: McpToolContext) {
  const server = new McpServer({
    name: 'pamh',
    version: '0.1.0',
  })

  server.registerTool(
    'search_memory',
    {
      title: 'Search Memory',
      description: 'Search PAMH memories by text, type, tag, and scope.',
      inputSchema: {
        query: z.string().optional(),
        scope: scopeSchema,
        type: z.string().optional(),
        tag: z.string().optional(),
        limit: z.number().int().positive().optional(),
      },
    },
    async (input) => jsonResult(await searchMemory(input, context))
  )

  server.registerTool(
    'get_memory',
    {
      title: 'Get Memory',
      description: 'Get a PAMH memory by ID.',
      inputSchema: {
        id: z.string(),
        scope: scopeSchema,
      },
    },
    async (input) => jsonResult(await getMemory(input, context))
  )

  server.registerTool(
    'add_memory',
    {
      title: 'Add Memory',
      description: 'Add a new PAMH memory.',
      inputSchema: {
        content: z.string(),
        type: z.string(),
        scope: z.enum(['global', 'project']).default('project'),
        tags: z.array(z.string()).optional(),
        salience: z.number().min(0).max(1).optional(),
      },
    },
    async (input) => jsonResult(await addMemory(input, context))
  )

  server.registerTool(
    'memory_checkpoint',
    {
      title: 'Memory Checkpoint',
      description:
        'Submit a structured checkpoint of durable session learnings. PAMH creates proposed or active memories based on capture mode.',
      inputSchema: {
        summary: z.string().optional(),
        decisions: z.array(z.string()).optional(),
        facts: z.array(z.string()).optional(),
        preferences: z.array(z.string()).optional(),
        mistakes: z.array(z.string()).optional(),
        tasks: z.array(z.string()).optional(),
        agent: z.string().optional(),
        model: z.string().optional(),
        session_id: z.string().optional(),
        scope: z.enum(['global', 'project']).default('project'),
      },
    },
    async (input) => jsonResult(await memoryCheckpoint(input, context))
  )

  server.registerTool(
    'edit_memory',
    {
      title: 'Edit Memory',
      description: 'Edit an existing PAMH memory.',
      inputSchema: {
        id: z.string(),
        content: z.string().optional(),
        type: z.string().optional(),
        scope: scopeSchema,
        tags: z.array(z.string()).optional(),
      },
    },
    async (input) => jsonResult(await editMemory(input, context))
  )

  server.registerTool(
    'delete_memory',
    {
      title: 'Delete Memory',
      description: 'Logically delete a PAMH memory.',
      inputSchema: {
        id: z.string(),
        scope: scopeSchema,
      },
    },
    async (input) => jsonResult({ deleted: await removeMemory(input, context) })
  )

  server.registerTool(
    'list_projects',
    {
      title: 'List Projects',
      description: 'List current and linked PAMH projects.',
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
      description: 'Compile context from global, project, linked, and search memories.',
      inputSchema: {
        query: z.string().optional(),
        maxTokens: z.number().int().positive().optional(),
      },
    },
    async (input) => jsonResult(await compileMemoryContext(input, context))
  )

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
        scope: scopeSchema,
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
        scope: scopeSchema,
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
        scope: scopeSchema,
      },
    },
    async (input) => jsonResult(await getLatestVersionTool(input, context))
  )

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
        scope: scopeSchema,
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
        scope: scopeSchema,
      },
    },
    async (input) => jsonResult(await handoffAcceptTool(input, context))
  )

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
        scope: scopeSchema,
      },
    },
    async (input) => jsonResult(await forgetSweepTool(input, context))
  )

  server.registerTool(
    'record_hook_event',
    {
      title: 'Record Hook Event',
      description:
        'Record a lifecycle hook event (session-start, user-prompt, post-tool-use, session-end, etc.). Use for automatic memory capture.',
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
        scope: scopeSchema,
      },
    },
    async (input) => jsonResult(await recordHookEventTool(input, context))
  )

  return server
}

export async function startPamhMcpServer(context: McpToolContext) {
  const server = createPamhMcpServer(context)
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
