import { readFile, writeFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { generateId } from './id.js'
import { loadAutoCaptureConfig } from './auto-capture.js'
import { createMemory, indexAllMemories, listMemories } from './storage.js'
import { redactContent } from './redaction.js'
import { MemoryIndex } from './indexer.js'
import type { MemoryType } from './types.js'

// Lifecycle hook event types
export type HookEventType =
  | 'session-start'
  | 'user-prompt'
  | 'pre-tool-use'
  | 'post-tool-use'
  | 'pre-compact'
  | 'notification'
  | 'stop'
  | 'session-end'
  | 'other'

export interface HookEvent {
  id: string
  type: HookEventType
  timestamp: string
  agent?: string // e.g. "claude-code", "codex", "opencode"
  session_id?: string
  project_path?: string
  data: Record<string, unknown> // Event-specific data
}

const SESSIONS_DIR = 'sessions'
const OBSERVATIONS_DIR = 'observations'

/**
 * Record a lifecycle hook event (fire-and-forget)
 */
export async function recordHookEvent(
  basePath: string,
  event: Omit<HookEvent, 'id' | 'timestamp'>
): Promise<HookEvent> {
  const observationsDir = join(basePath, OBSERVATIONS_DIR)

  // Create observations directory if it doesn't exist
  if (!existsSync(observationsDir)) {
    await mkdir(observationsDir, { recursive: true })
  }

  const id = generateId()
  const timestamp = new Date().toISOString()

  const fullEvent: HookEvent = {
    ...event,
    data: redactHookData(event.data ?? {}),
    id,
    timestamp,
  }

  // Write to observations log (append-only)
  const logFile = join(observationsDir, `${timestamp.split('T')[0]}.jsonl`)
  await writeFile(logFile, JSON.stringify(fullEvent) + '\n', { flag: 'a', encoding: 'utf-8' })

  if (event.type === 'session-start' && event.session_id) {
    await recoverInterruptedSessions(basePath, event.session_id)
  }

  await createRawExchangeMemoryFromHookEvent(basePath, fullEvent)
  await proposeDurableMemoryFromHookEvent(basePath, fullEvent)

  // If it's a session-end event, create a session summary
  if (event.type === 'session-end' && event.session_id) {
    await createSessionSummary(basePath, event.session_id)
  }

  return fullEvent
}

async function createRawExchangeMemoryFromHookEvent(
  basePath: string,
  event: HookEvent
): Promise<void> {
  const text = getPromptText(event.data)
  if (!text) return

  const config = await loadAutoCaptureConfig(basePath)
  if (config.mode === 'manual') return

  const status = config.mode === 'auto' ? 'active' : 'proposed'
  const role = getExchangeRole(event)
  const relevantIds = await findRelevantMemoryIds(basePath, text)

  await createMemory(basePath, {
    type: 'exchange',
    scope: 'project',
    status,
    source: event.agent ? `hook-exchange:${event.agent}` : 'hook-exchange',
    tags: [
      'raw-exchange',
      `role-${role}`,
      optionalSlug(event.agent),
      event.session_id ? `session-${slug(event.session_id)}` : undefined,
    ].filter((tag): tag is string => Boolean(tag)),
    salience: 0.34,
    source_ids: relevantIds,
    content: formatRawExchangeMemory(event, role, text, relevantIds),
  })
}

async function findRelevantMemoryIds(basePath: string, text: string): Promise<string[]> {
  await indexAllMemories(basePath)
  const index = new MemoryIndex(basePath)
  try {
    return index
      .search({ query: text, limit: 8, natural: true })
      .filter((memory) => memory.type !== 'exchange')
      .map((memory) => memory.id)
  } finally {
    index.close()
  }
}

function formatRawExchangeMemory(
  event: HookEvent,
  role: string,
  text: string,
  relevantIds: string[]
): string {
  const simplified = simplifyExchangeText(text)

  return [
    'Raw conversation exchange captured automatically by PAM.',
    '',
    '## Simplified',
    '',
    `- Role: ${role}`,
    `- Summary: ${simplified.summary}`,
    `- Signal: ${simplified.signal}`,
    relevantIds.length
      ? `- Relevant memory IDs before answer: ${relevantIds.join(', ')}`
      : '- Relevant memory IDs before answer: none',
    '- Preservation: the original redacted exchange is kept below for auditability.',
    '',
    '## Raw Exchange',
    '',
    `Hook event: ${event.id}`,
    `Role: ${role}`,
    `Agent: ${event.agent ?? 'unknown'}`,
    `Session: ${event.session_id ?? 'unknown'}`,
    `Timestamp: ${event.timestamp}`,
    relevantIds.length
      ? `Relevant memory IDs before answer: ${relevantIds.join(', ')}`
      : 'Relevant memory IDs before answer: none',
    '',
    'Content:',
    text,
  ].join('\n')
}

function simplifyExchangeText(text: string): { summary: string; signal: string } {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const summary = truncateSentence(normalized, 240) || 'No text content.'
  const signal = inferExchangeSignal(normalized)

  return { summary, signal }
}

function inferExchangeSignal(text: string): string {
  const normalized = normalizeText(text)

  if (/\?$/.test(text.trim())) {
    return 'question'
  }
  if (
    /\b(always|never|must|should|rule|automatically|automatic|toujours|jamais|doit|devrait|regle|automatique)\b/.test(
      normalized
    )
  ) {
    return 'instruction-like'
  }
  if (
    /\b(decide|decided|decision|choose|chosen|adopt|use|choisir|choisi|utiliser)\b/.test(normalized)
  ) {
    return 'decision-like'
  }
  if (/\b(issue|bug|error|fail|failure|problem|probleme|erreur|echec)\b/.test(normalized)) {
    return 'issue-like'
  }
  return 'conversation'
}

function truncateSentence(value: string, limit: number): string {
  if (value.length <= limit) return value
  return `${value.slice(0, limit).trim()}...`
}

function getExchangeRole(event: HookEvent): string {
  const role = event.data.role
  if (typeof role === 'string' && role.trim()) return slug(role)
  if (event.type === 'user-prompt') return 'user'
  return slug(event.type)
}

function redactHookData(value: unknown): Record<string, unknown> {
  const redacted = redactUnknown(value)
  return isRecord(redacted) ? redacted : {}
}

function redactUnknown(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactContent(value).content
  }

  if (Array.isArray(value)) {
    return value.map(redactUnknown)
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, redactUnknown(nestedValue)])
    )
  }

  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

interface HookMemoryProposal {
  type: MemoryType
  content: string
  tags: string[]
  salience: number
}

async function proposeDurableMemoryFromHookEvent(
  basePath: string,
  event: HookEvent
): Promise<void> {
  if (event.type !== 'user-prompt') return

  const text = getPromptText(event.data)
  if (!text) return

  const proposals = inferDurableMemoriesFromPrompt(text)
  if (!proposals.length) return

  const config = await loadAutoCaptureConfig(basePath)
  if (config.mode === 'manual') return

  const existing = await listMemories(basePath)
  const status = config.mode === 'auto' ? 'active' : 'proposed'
  const source = event.agent ? `hook-inference:${event.agent}` : 'hook-inference'

  for (const proposal of proposals) {
    const duplicate = existing.some(
      (memory) =>
        memory.metadata.source.startsWith('hook-inference') &&
        normalizeText(memory.content) === normalizeText(proposal.content)
    )
    if (duplicate) continue

    await createMemory(basePath, {
      type: proposal.type,
      scope: 'project',
      status,
      source,
      tags: ['hook-inferred', ...proposal.tags],
      salience: proposal.salience,
      content: proposal.content,
    })
  }
}

function getPromptText(data: Record<string, unknown>): string {
  const candidates = [
    data.text,
    data.prompt,
    data.user_prompt,
    data.message,
    data.content,
    data.transcript,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate
  }

  return ''
}

function inferDurableMemoriesFromPrompt(text: string): HookMemoryProposal[] {
  const normalized = normalizeText(text)
  const proposals: HookMemoryProposal[] = []
  const hasInstructionLanguage =
    /\b(always|must|should|rule|automatically|automatic)\b/.test(normalized) ||
    /\b(toujours|regle|règle|automatique|normalement|aurait du|aurait dû)\b/.test(normalized)

  if (!hasInstructionLanguage) return []

  if (/\b(doc|docs|documentation|documentations)\b/.test(normalized)) {
    proposals.push({
      type: 'rule',
      tags: ['documentation', 'workflow'],
      salience: 0.78,
      content:
        'After implementing project changes, always update the relevant documentation in the same pass and report documentation status in the final response.',
    })
  }

  if (/\b(memory|memories|memoire|mémoire|memoriser|mémoriser)\b/.test(normalized)) {
    proposals.push({
      type: 'rule',
      tags: ['memory-capture', 'workflow'],
      salience: 0.82,
      content:
        'When the user states that a durable rule, preference, or workflow expectation should have been remembered automatically, capture it as a durable project memory without waiting for another explicit request.',
    })
  }

  return proposals
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Create a session summary from hook events
 */
async function createSessionSummary(basePath: string, sessionId: string): Promise<void> {
  assertSafeFileId(sessionId, 'sessionId')

  const sessionsDir = join(basePath, SESSIONS_DIR)

  // Create sessions directory if it doesn't exist
  if (!existsSync(sessionsDir)) {
    await mkdir(sessionsDir, { recursive: true })
  }

  // Read all observations for this session
  const events = await getSessionEvents(basePath, sessionId)

  if (events.length === 0) return

  // Create a simple rule-based summary
  const summary = {
    session_id: sessionId,
    started_at: events[0]?.timestamp,
    ended_at: events[events.length - 1]?.timestamp,
    agent: events[0]?.agent,
    event_count: events.length,
    prompts: events.filter((e) => e.type === 'user-prompt').length,
    tool_calls: events.filter((e) => e.type === 'post-tool-use').length,
    summary: generateRuleBasedSummary(events),
  }

  const summaryFile = join(sessionsDir, `${sessionId}.json`)
  await writeFile(summaryFile, JSON.stringify(summary, null, 2), 'utf-8')

  if (!isMeaningfulSession(events)) return

  const config = await loadAutoCaptureConfig(basePath)
  if (config.mode === 'manual') return

  await createMemory(basePath, {
    type: 'session',
    scope: 'project',
    status: config.mode === 'auto' ? 'active' : 'proposed',
    source: summary.agent ? `hook:${summary.agent}` : 'hook',
    tags: ['hook-session', optionalSlug(summary.agent), `session-${slug(sessionId)}`].filter(
      (tag): tag is string => Boolean(tag)
    ),
    salience: 0.58,
    content: [
      `Session ${sessionId} produced meaningful project activity.`,
      '',
      `Agent: ${summary.agent ?? 'unknown'}`,
      `Events: ${summary.event_count}`,
      `Prompts: ${summary.prompts}`,
      `Tool calls: ${summary.tool_calls}`,
      `Started: ${summary.started_at ?? 'unknown'}`,
      `Ended: ${summary.ended_at ?? 'unknown'}`,
      '',
      'This session memory was generated from lifecycle event counts only; textual prompt hooks are stored separately as redacted exchange memories with simplified and raw sections.',
    ].join('\n'),
  })
}

async function recoverInterruptedSessions(
  basePath: string,
  currentSessionId: string
): Promise<void> {
  const events = await getSessionEvents(basePath)
  const grouped = new Map<string, HookEvent[]>()

  for (const event of events) {
    if (!event.session_id || event.session_id === currentSessionId) continue
    grouped.set(event.session_id, [...(grouped.get(event.session_id) ?? []), event])
  }

  if (grouped.size === 0) return

  const memories = await listMemories(basePath)
  for (const [sessionId, sessionEvents] of grouped.entries()) {
    if (!isSafeFileId(sessionId)) continue
    if (sessionEvents.some((event) => event.type === 'session-end')) continue
    if (!isMeaningfulSession(sessionEvents)) continue

    const sessionTag = `session-${slug(sessionId)}`
    const alreadySummarized = memories.some(
      (memory) => memory.metadata.type === 'session' && memory.metadata.tags.includes(sessionTag)
    )
    if (alreadySummarized) continue

    await createRecoveredSessionSummary(basePath, sessionId, sessionEvents)
  }
}

async function createRecoveredSessionSummary(
  basePath: string,
  sessionId: string,
  events: HookEvent[]
): Promise<void> {
  assertSafeFileId(sessionId, 'sessionId')

  const sessionsDir = join(basePath, SESSIONS_DIR)
  if (!existsSync(sessionsDir)) {
    await mkdir(sessionsDir, { recursive: true })
  }

  const summary = {
    session_id: sessionId,
    recovered: true,
    started_at: events[0]?.timestamp,
    ended_at: events[events.length - 1]?.timestamp,
    agent: events[0]?.agent,
    event_count: events.length,
    prompts: events.filter((e) => e.type === 'user-prompt').length,
    tool_calls: events.filter((e) => e.type === 'post-tool-use').length,
    summary: generateRuleBasedSummary(events),
  }

  const summaryFile = join(sessionsDir, `${sessionId}.json`)
  await writeFile(summaryFile, JSON.stringify(summary, null, 2), 'utf-8')

  const config = await loadAutoCaptureConfig(basePath)
  if (config.mode === 'manual') return

  await createMemory(basePath, {
    type: 'session',
    scope: 'project',
    status: config.mode === 'auto' ? 'active' : 'proposed',
    source: summary.agent ? `hook-recovery:${summary.agent}` : 'hook-recovery',
    tags: [
      'hook-session',
      'recovered-session',
      optionalSlug(summary.agent),
      `session-${slug(sessionId)}`,
    ].filter((tag): tag is string => Boolean(tag)),
    salience: 0.54,
    content: [
      `Recovered interrupted session ${sessionId} from lifecycle events.`,
      '',
      `Agent: ${summary.agent ?? 'unknown'}`,
      `Events: ${summary.event_count}`,
      `Prompts: ${summary.prompts}`,
      `Tool calls: ${summary.tool_calls}`,
      `Started: ${summary.started_at ?? 'unknown'}`,
      `Last event: ${summary.ended_at ?? 'unknown'}`,
      '',
      'This recovered session memory was generated on the next session start because no session-end checkpoint was recorded. Textual prompt hooks are stored separately as redacted exchange memories with simplified and raw sections.',
    ].join('\n'),
  })
}

/**
 * Generate a rule-based summary from events
 */
function generateRuleBasedSummary(events: HookEvent[]): string {
  const prompts = events.filter((e) => e.type === 'user-prompt')
  const toolCalls = events.filter((e) => e.type === 'post-tool-use')

  let summary = `Session with ${prompts.length} prompts and ${toolCalls.length} tool calls.`

  if (prompts.length > 0) {
    const firstPrompt = prompts[0]?.data?.text as string | undefined
    if (firstPrompt) {
      summary += ` First prompt: "${firstPrompt.substring(0, 100)}..."`
    }
  }

  return summary
}

function isMeaningfulSession(events: HookEvent[]): boolean {
  const prompts = events.filter((event) => event.type === 'user-prompt').length
  const toolCalls = events.filter((event) => event.type === 'post-tool-use').length
  return prompts > 0 || toolCalls > 1 || events.length >= 4
}

function optionalSlug(value: string | undefined): string | undefined {
  const normalized = value ? slug(value) : ''
  return normalized ? `agent-${normalized}` : undefined
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Get all events for a session
 */
export async function getSessionEvents(basePath: string, sessionId?: string): Promise<HookEvent[]> {
  const observationsDir = join(basePath, OBSERVATIONS_DIR)

  if (!existsSync(observationsDir)) {
    return []
  }

  const files = await readdir(observationsDir)
  const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'))

  const events: HookEvent[] = []

  for (const file of jsonlFiles) {
    const filePath = join(observationsDir, file)
    const content = await readFile(filePath, 'utf-8')
    const lines = content.trim().split('\n')

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const event: HookEvent = JSON.parse(line)
        if (!sessionId || event.session_id === sessionId) {
          events.push(event)
        }
      } catch {
        // Skip invalid lines
      }
    }
  }

  // Sort by timestamp
  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  return events
}

function assertSafeFileId(id: string, name: string): void {
  if (!/^[A-Za-z0-9_.-]+$/.test(id)) {
    throw new Error(`Invalid ${name}: ${id}`)
  }
}

function isSafeFileId(id: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(id)
}

/**
 * Get recent events (last N days)
 */
export async function getRecentEvents(basePath: string, days: number = 7): Promise<HookEvent[]> {
  const observationsDir = join(basePath, OBSERVATIONS_DIR)

  if (!existsSync(observationsDir)) {
    return []
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)

  const files = await readdir(observationsDir)
  const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'))

  const events: HookEvent[] = []

  for (const file of jsonlFiles) {
    // Check if file is within the date range
    const fileDate = new Date(file.replace('.jsonl', ''))
    if (fileDate < cutoff) continue

    const filePath = join(observationsDir, file)
    const content = await readFile(filePath, 'utf-8')
    const lines = content.trim().split('\n')

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const event: HookEvent = JSON.parse(line)
        events.push(event)
      } catch {
        // Skip invalid lines
      }
    }
  }

  // Sort by timestamp
  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  return events
}
