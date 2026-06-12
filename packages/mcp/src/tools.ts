import {
  MemoryIndex,
  compileContext,
  createMemory,
  deleteMemory,
  getGlobalMemoryPath,
  getProjectMemoryPath,
  indexAllMemories,
  loadAutoCaptureConfig,
  recordAccess,
  updateMemory,
  assertMemoryType,
  assertMemoryScope,
  supersedeMemory,
  getSupersessionChain,
  getLatestVersion,
  beginHandoff,
  acceptHandoff,
  getOpenHandoff,
  forgetSweep,
  recordHookEvent,
  analyzeDistillation,
  buildKnowledgeGraph,
  generateRecommendations,
  applyRecommendation,
  type MemoryStatus,
  type Memory,
  type DecayConfig,
  type HookEventType,
} from 'pamh-core'

export interface McpToolContext {
  cwd: string
  globalMemoryPath?: string
  projectMemoryPath?: string
}

export interface SearchMemoryInput {
  query?: string
  scope?: 'global' | 'project'
  type?: string
  tag?: string
  limit?: number
}

export interface GetMemoryInput {
  id: string
  scope?: 'global' | 'project'
}

export interface AddMemoryInput {
  content: string
  type: string
  scope?: 'global' | 'project'
  tags?: string[]
  status?: MemoryStatus
  salience?: number // Importance score (0-1, default: 0.5)
}

export interface MemoryCheckpointInput {
  summary?: string
  decisions?: string[]
  facts?: string[]
  preferences?: string[]
  mistakes?: string[]
  tasks?: string[]
  agent?: string
  model?: string
  session_id?: string
  scope?: 'global' | 'project'
}

export interface EditMemoryInput {
  id: string
  content?: string
  type?: string
  scope?: 'global' | 'project'
  tags?: string[]
}

export interface DeleteMemoryInput {
  id: string
  scope?: 'global' | 'project'
}

export interface CompileContextInput {
  query?: string
  maxTokens?: number
}

export interface ListProjectsInput {
  includeCurrent?: boolean
}

export interface IntelligencePreviewInput {
  scope?: 'global' | 'project'
}

export interface ApplyRecommendationInput {
  id: string
  scope?: 'global' | 'project'
}

export function resolveMemoryPath(
  context: McpToolContext,
  scope: 'global' | 'project' = 'project'
) {
  if (scope === 'global') {
    return context.globalMemoryPath ?? getGlobalMemoryPath()
  }

  return context.projectMemoryPath ?? getProjectMemoryPath(context.cwd)
}

export async function searchMemory(input: SearchMemoryInput, context: McpToolContext) {
  const basePath = resolveMemoryPath(context, input.scope)
  await indexAllMemories(basePath)

  const index = new MemoryIndex(basePath)
  const results = index.search({
    query: input.query,
    type: input.type,
    tag: input.tag,
    limit: input.limit ?? 10,
  })
  index.close()

  return results
}

export async function getMemory(input: GetMemoryInput, context: McpToolContext) {
  const basePath = resolveMemoryPath(context, input.scope)
  return recordAccess(basePath, input.id)
}

export async function addMemory(input: AddMemoryInput, context: McpToolContext) {
  const scope = input.scope ?? 'project'
  const basePath = resolveMemoryPath(context, scope)

  const config = await loadAutoCaptureConfig(basePath)
  let status: MemoryStatus = input.status ?? 'active'

  if (!input.status && config.mode === 'assisted') {
    status = 'proposed'
  }

  return createMemory(basePath, {
    content: input.content,
    type: assertMemoryType(input.type),
    scope: assertMemoryScope(scope),
    tags: input.tags ?? [],
    source: 'mcp',
    status,
    salience: input.salience ?? 0.5,
  })
}

export async function memoryCheckpoint(input: MemoryCheckpointInput, context: McpToolContext) {
  const scope = input.scope ?? 'project'
  const basePath = resolveMemoryPath(context, scope)
  const config = await loadAutoCaptureConfig(basePath)

  await recordHookEvent(basePath, {
    type: 'other',
    agent: input.agent,
    session_id: input.session_id,
    project_path: context.cwd,
    data: {
      action: 'memory_checkpoint',
      model: input.model,
      counts: {
        summary: input.summary ? 1 : 0,
        decisions: input.decisions?.length ?? 0,
        facts: input.facts?.length ?? 0,
        preferences: input.preferences?.length ?? 0,
        mistakes: input.mistakes?.length ?? 0,
        tasks: input.tasks?.length ?? 0,
      },
    },
  })

  if (config.mode === 'manual') {
    return {
      mode: config.mode,
      status: 'skipped',
      reason: 'capture mode is manual',
      created: [],
    }
  }

  const status: MemoryStatus = config.mode === 'auto' ? 'active' : 'proposed'
  const source = input.agent ? `mcp-checkpoint:${input.agent}` : 'mcp-checkpoint'
  const created: Memory[] = []

  for (const item of buildCheckpointItems(input)) {
    created.push(
      await createMemory(basePath, {
        type: assertMemoryType(item.type),
        scope: assertMemoryScope(scope),
        content: item.content,
        tags: buildCheckpointTags(item.tag, input),
        source,
        status,
        salience: item.salience,
      })
    )
  }

  return {
    mode: config.mode,
    status,
    created,
  }
}

export async function editMemory(input: EditMemoryInput, context: McpToolContext) {
  const basePath = resolveMemoryPath(context, input.scope)

  return updateMemory(basePath, input.id, {
    content: input.content,
    type: input.type ? assertMemoryType(input.type) : undefined,
    tags: input.tags,
  })
}

export async function removeMemory(input: DeleteMemoryInput, context: McpToolContext) {
  const basePath = resolveMemoryPath(context, input.scope)
  return deleteMemory(basePath, input.id)
}

export async function listProjects(input: ListProjectsInput, context: McpToolContext) {
  const projects = input.includeCurrent === false ? [] : [context.cwd]
  return projects
}

export async function compileMemoryContext(input: CompileContextInput, context: McpToolContext) {
  return compileContext(
    resolveMemoryPath(context, 'global'),
    resolveMemoryPath(context, 'project'),
    {
      query: input.query,
      maxTokens: input.maxTokens,
    }
  )
}

export async function recommendMemoryMaintenance(
  input: IntelligencePreviewInput,
  context: McpToolContext
) {
  return generateRecommendations(resolveMemoryPath(context, input.scope))
}

export async function previewMemoryDistillation(
  input: IntelligencePreviewInput,
  context: McpToolContext
) {
  return analyzeDistillation(resolveMemoryPath(context, input.scope))
}

export async function previewKnowledgeGraph(
  input: IntelligencePreviewInput,
  context: McpToolContext
) {
  return buildKnowledgeGraph(resolveMemoryPath(context, input.scope))
}

export async function applyMemoryRecommendation(
  input: ApplyRecommendationInput,
  context: McpToolContext
) {
  return applyRecommendation(resolveMemoryPath(context, input.scope), input.id)
}

interface CheckpointItem {
  type: string
  tag: string
  content: string
  salience: number
}

function buildCheckpointItems(input: MemoryCheckpointInput): CheckpointItem[] {
  return [
    ...singleCheckpointItem(input.summary, 'session', 'session', 0.66),
    ...checkpointItems(input.decisions, 'decision', 'decision', 0.82),
    ...checkpointItems(input.facts, 'knowledge', 'fact', 0.68),
    ...checkpointItems(input.preferences, 'preference', 'preference', 0.72),
    ...checkpointItems(input.mistakes, 'mistake', 'mistake', 0.74),
    ...checkpointItems(input.tasks, 'task', 'task', 0.58),
  ]
}

function singleCheckpointItem(
  value: string | undefined,
  type: string,
  tag: string,
  salience: number
): CheckpointItem[] {
  const content = value?.trim()
  return content ? [{ type, tag, content, salience }] : []
}

function checkpointItems(
  values: string[] | undefined,
  type: string,
  tag: string,
  salience: number
): CheckpointItem[] {
  return (values ?? [])
    .map((content) => content.trim())
    .filter(Boolean)
    .map((content) => ({ type, tag, content, salience }))
}

function buildCheckpointTags(tag: string, input: MemoryCheckpointInput): string[] {
  return [
    'checkpoint',
    tag,
    optionalTag('agent', input.agent),
    optionalTag('model', input.model),
  ].filter((value): value is string => Boolean(value))
}

function optionalTag(prefix: string, value: string | undefined): string | undefined {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  return normalized ? `${prefix}-${normalized}` : undefined
}

// Supersession tools
export interface SupersedeMemoryInput {
  old_id: string
  content: string
  type: string
  scope?: 'global' | 'project'
  tags?: string[]
  salience?: number
}

export async function supersedeMemoryTool(input: SupersedeMemoryInput, context: McpToolContext) {
  const scope = input.scope ?? 'project'
  const basePath = resolveMemoryPath(context, scope)

  return supersedeMemory(basePath, input.old_id, {
    content: input.content,
    type: assertMemoryType(input.type),
    scope: assertMemoryScope(scope),
    tags: input.tags ?? [],
    source: 'mcp',
    salience: input.salience ?? 0.5,
  })
}

export interface GetSupersessionChainInput {
  memory_id: string
  scope?: 'global' | 'project'
}

export async function getSupersessionChainTool(
  input: GetSupersessionChainInput,
  context: McpToolContext
) {
  const basePath = resolveMemoryPath(context, input.scope)
  return getSupersessionChain(basePath, input.memory_id)
}

export interface GetLatestVersionInput {
  memory_id: string
  scope?: 'global' | 'project'
}

export async function getLatestVersionTool(input: GetLatestVersionInput, context: McpToolContext) {
  const basePath = resolveMemoryPath(context, input.scope)
  return getLatestVersion(basePath, input.memory_id)
}

// Handoff tools
export interface HandoffBeginInput {
  summary: string
  agent_from?: string
  open_questions?: string[]
  next_steps?: string[]
  scope?: 'global' | 'project'
}

export async function handoffBeginTool(input: HandoffBeginInput, context: McpToolContext) {
  const basePath = resolveMemoryPath(context, input.scope)
  return beginHandoff(
    basePath,
    input.summary,
    input.agent_from,
    input.open_questions,
    input.next_steps,
    resolveMemoryPath(context, 'project')
  )
}

export interface HandoffAcceptInput {
  handoff_id?: string // If not provided, accepts the latest open handoff
  agent_to?: string
  scope?: 'global' | 'project'
}

export async function handoffAcceptTool(input: HandoffAcceptInput, context: McpToolContext) {
  const basePath = resolveMemoryPath(context, input.scope)

  if (input.handoff_id) {
    return acceptHandoff(basePath, input.handoff_id, input.agent_to)
  }

  const openHandoff = await getOpenHandoff(basePath, resolveMemoryPath(context, 'project'))
  if (!openHandoff) {
    return null
  }

  return acceptHandoff(basePath, openHandoff.id, input.agent_to)
}

// Decay tools
export interface ForgetSweepInput {
  lambda?: number
  sigma?: number
  mu?: number
  cold_threshold?: number
  hard_delete_after_days?: number
  dry_run?: boolean
  scope?: 'global' | 'project'
}

export async function forgetSweepTool(input: ForgetSweepInput, context: McpToolContext) {
  const basePath = resolveMemoryPath(context, input.scope)

  const config: DecayConfig = {
    lambda: input.lambda ?? 0.02,
    sigma: input.sigma ?? 0.6,
    mu: input.mu ?? 0.04,
    coldThreshold: input.cold_threshold ?? 0.2,
    hardDeleteAfterDays: input.hard_delete_after_days ?? 180,
  }

  return forgetSweep(basePath, config, input.dry_run ?? false)
}

// Hook tools (lifecycle events)
export interface RecordHookEventInput {
  type: HookEventType
  agent?: string
  session_id?: string
  data?: Record<string, unknown>
  scope?: 'global' | 'project'
}

export async function recordHookEventTool(input: RecordHookEventInput, context: McpToolContext) {
  const basePath = resolveMemoryPath(context, input.scope)

  return recordHookEvent(basePath, {
    type: input.type,
    agent: input.agent,
    session_id: input.session_id,
    project_path: context.cwd,
    data: input.data ?? {},
  })
}
