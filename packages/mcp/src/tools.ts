import {
  MemoryIndex,
  compileContext,
  createIntelligentMemory,
  deleteMemory,
  getProjectMemoryPath,
  indexAllMemories,
  loadAutoCaptureConfig,
  recordAccess,
  updateMemory,
  assertMemoryType,
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
  splitMemorySignals,
  type MemoryStatus,
  type Memory,
  type DecayConfig,
  type HookEventType,
} from '@helloworlkd/pam-core'

export interface McpToolContext {
  cwd: string
  projectMemoryPath?: string
}

export interface SearchMemoryInput {
  query?: string
  type?: string
  tag?: string
  theme?: string
  limit?: number
}

export interface GetMemoryInput {
  id: string
}

export interface AddMemoryInput {
  content: string
  title?: string
  type: string
  tags?: string[]
  concepts?: string[]
  theme?: string
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
  concepts?: string[]
  agent?: string
  model?: string
  session_id?: string
  source?: string
}

export interface EditMemoryInput {
  id: string
  content?: string
  title?: string
  type?: string
  tags?: string[]
  concepts?: string[]
  theme?: string
}

export interface DeleteMemoryInput {
  id: string
}

export interface CompileContextInput {
  query?: string
  maxTokens?: number
}

export interface ListProjectsInput {
  includeCurrent?: boolean
}

export type IntelligencePreviewInput = Record<string, never>

export interface ApplyRecommendationInput {
  id: string
}

export function resolveMemoryPath(context: McpToolContext) {
  return context.projectMemoryPath ?? getProjectMemoryPath(context.cwd)
}

export async function searchMemory(input: SearchMemoryInput, context: McpToolContext) {
  const basePath = resolveMemoryPath(context)
  await indexAllMemories(basePath)

  const index = new MemoryIndex(basePath)
  const results = index.search({
    query: input.query,
    type: input.type,
    tag: input.tag,
    theme: input.theme,
    limit: input.limit ?? 10,
    natural: true,
  })
  index.close()

  return results
}

export async function getMemory(input: GetMemoryInput, context: McpToolContext) {
  const basePath = resolveMemoryPath(context)
  return recordAccess(basePath, input.id)
}

export async function addMemory(input: AddMemoryInput, context: McpToolContext) {
  const basePath = resolveMemoryPath(context)

  const config = await loadAutoCaptureConfig(basePath)
  let status: MemoryStatus = input.status ?? 'active'

  if (!input.status && config.mode === 'assisted') {
    status = 'proposed'
  }

  const result = await createIntelligentMemory(
    basePath,
    {
      content: input.content,
      title: input.title,
      type: assertMemoryType(input.type),
      scope: 'project',
      tags: input.tags ?? [],
      concepts: input.concepts,
      theme: input.theme,
      source: 'mcp',
      status,
      salience: input.salience ?? 0.5,
    },
    { autoSupersedeActive: status === 'active' }
  )

  return result.memory
}

export async function memoryCheckpoint(input: MemoryCheckpointInput, context: McpToolContext) {
  const basePath = resolveMemoryPath(context)
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
      consolidation: [],
    }
  }

  const status: MemoryStatus = config.mode === 'auto' ? 'active' : 'proposed'
  const source = input.source ?? (input.agent ? `mcp-checkpoint:${input.agent}` : 'mcp-checkpoint')
  const created: Memory[] = []
  const consolidation: Array<{
    action: string
    memory_id: string
    matched_memory_id?: string
  }> = []

  for (const item of buildCheckpointItems(input)) {
    const result = await createIntelligentMemory(
      basePath,
      {
        type: assertMemoryType(item.type),
        scope: 'project',
        content: item.content,
        tags: buildCheckpointTags(item.tag, input),
        concepts: input.concepts,
        source,
        status,
        salience: item.salience,
      },
      { autoSupersedeActive: status === 'active' }
    )
    created.push(result.memory)
    consolidation.push({
      action: result.action,
      memory_id: result.memory.metadata.id,
      matched_memory_id: result.matchedMemoryId,
    })
  }

  return {
    mode: config.mode,
    status,
    created,
    consolidation,
  }
}

export async function editMemory(input: EditMemoryInput, context: McpToolContext) {
  const basePath = resolveMemoryPath(context)

  return updateMemory(basePath, input.id, {
    content: input.content,
    title: input.title,
    type: input.type ? assertMemoryType(input.type) : undefined,
    tags: input.tags,
    concepts: input.concepts,
    theme: input.theme,
  })
}

export async function removeMemory(input: DeleteMemoryInput, context: McpToolContext) {
  const basePath = resolveMemoryPath(context)
  return deleteMemory(basePath, input.id)
}

export async function listProjects(input: ListProjectsInput, context: McpToolContext) {
  const projects = input.includeCurrent === false ? [] : [context.cwd]
  return projects
}

export async function compileMemoryContext(input: CompileContextInput, context: McpToolContext) {
  const projectPath = resolveMemoryPath(context)
  return compileContext(projectPath, {
    query: input.query,
    maxTokens: input.maxTokens,
  })
}

export async function recommendMemoryMaintenance(
  _input: IntelligencePreviewInput,
  context: McpToolContext
) {
  return generateRecommendations(resolveMemoryPath(context))
}

export async function previewMemoryDistillation(
  _input: IntelligencePreviewInput,
  context: McpToolContext
) {
  return analyzeDistillation(resolveMemoryPath(context))
}

export async function previewKnowledgeGraph(
  _input: IntelligencePreviewInput,
  context: McpToolContext
) {
  return buildKnowledgeGraph(resolveMemoryPath(context))
}

export async function applyMemoryRecommendation(
  input: ApplyRecommendationInput,
  context: McpToolContext
) {
  return applyRecommendation(resolveMemoryPath(context), input.id)
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
    .flatMap((content) =>
      splitMemorySignals(content).map((signal) => ({ type, tag, content: signal, salience }))
    )
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
  tags?: string[]
  salience?: number
}

export async function supersedeMemoryTool(input: SupersedeMemoryInput, context: McpToolContext) {
  const basePath = resolveMemoryPath(context)

  return supersedeMemory(basePath, input.old_id, {
    content: input.content,
    type: assertMemoryType(input.type),
    scope: 'project',
    tags: input.tags ?? [],
    source: 'mcp',
    salience: input.salience ?? 0.5,
  })
}

export interface GetSupersessionChainInput {
  memory_id: string
}

export async function getSupersessionChainTool(
  input: GetSupersessionChainInput,
  context: McpToolContext
) {
  const basePath = resolveMemoryPath(context)
  return getSupersessionChain(basePath, input.memory_id)
}

export interface GetLatestVersionInput {
  memory_id: string
}

export async function getLatestVersionTool(input: GetLatestVersionInput, context: McpToolContext) {
  const basePath = resolveMemoryPath(context)
  return getLatestVersion(basePath, input.memory_id)
}

// Handoff tools
export interface HandoffBeginInput {
  summary: string
  agent_from?: string
  open_questions?: string[]
  next_steps?: string[]
}

export async function handoffBeginTool(input: HandoffBeginInput, context: McpToolContext) {
  const basePath = resolveMemoryPath(context)
  return beginHandoff(
    basePath,
    input.summary,
    input.agent_from,
    input.open_questions,
    input.next_steps,
    resolveMemoryPath(context)
  )
}

export interface HandoffAcceptInput {
  handoff_id?: string // If not provided, accepts the latest open handoff
  agent_to?: string
}

export async function handoffAcceptTool(input: HandoffAcceptInput, context: McpToolContext) {
  const basePath = resolveMemoryPath(context)

  if (input.handoff_id) {
    return acceptHandoff(basePath, input.handoff_id, input.agent_to)
  }

  const openHandoff = await getOpenHandoff(basePath, resolveMemoryPath(context))
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
}

export async function forgetSweepTool(input: ForgetSweepInput, context: McpToolContext) {
  const basePath = resolveMemoryPath(context)

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
}

export async function recordHookEventTool(input: RecordHookEventInput, context: McpToolContext) {
  const basePath = resolveMemoryPath(context)

  return recordHookEvent(basePath, {
    type: input.type,
    agent: input.agent,
    session_id: input.session_id,
    project_path: context.cwd,
    data: input.data ?? {},
  })
}
