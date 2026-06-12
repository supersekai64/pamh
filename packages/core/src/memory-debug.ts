import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { inspect } from 'node:util'

const DEBUG_DIR = 'debug'
const DEBUG_CONFIG_FILE = 'debug.json'
const DEFAULT_LOG_FILE = 'memory-debug.log'
const PREVIEW_LIMIT = 800

export interface MemoryDebugConfig {
  enabled: boolean
  log_file: string
  created_at: string
  updated_at: string
  agent?: string
  model?: string
  session_id?: string
}

export interface MemoryDebugStatus {
  enabled: boolean
  configPath: string
  logPath: string
  config?: MemoryDebugConfig
}

export interface MemoryDebugEvent {
  action: string
  outcome?: 'ok' | 'skipped' | 'error'
  memory_id?: string
  source?: string
  tool?: string
  agent?: string
  model?: string
  session_id?: string
  project_path?: string
  details?: Record<string, unknown>
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  content_preview?: string
}

export async function setMemoryDebugMode(
  basePath: string,
  enabled: boolean,
  options: Partial<Pick<MemoryDebugConfig, 'agent' | 'model' | 'session_id'>> = {}
): Promise<MemoryDebugStatus> {
  const now = new Date().toISOString()
  const existing = await readDebugConfig(basePath)
  const config: MemoryDebugConfig = {
    enabled,
    log_file: existing?.log_file ?? DEFAULT_LOG_FILE,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    agent: options.agent ?? existing?.agent,
    model: options.model ?? existing?.model,
    session_id: options.session_id ?? existing?.session_id,
  }

  const modeEvent: MemoryDebugEvent = {
    action: enabled ? 'debug.enable' : 'debug.disable',
    outcome: 'ok',
    details: {
      log_file: config.log_file,
      configured_agent: config.agent,
      configured_model: config.model,
      configured_session_id: config.session_id,
    },
  }

  if (!enabled) await recordMemoryDebugEvent(basePath, modeEvent)

  await mkdir(getDebugDir(basePath), { recursive: true })
  await writeFile(getDebugConfigPath(basePath), JSON.stringify(config, null, 2), 'utf-8')

  if (enabled) await recordMemoryDebugEvent(basePath, modeEvent)

  return getMemoryDebugStatus(basePath)
}

export async function getMemoryDebugStatus(basePath: string): Promise<MemoryDebugStatus> {
  const config = await readDebugConfig(basePath)
  const envEnabled = isEnvDebugEnabled()
  const logPath = getDebugLogPath(basePath, config)

  return {
    enabled: Boolean(config?.enabled || envEnabled),
    configPath: getDebugConfigPath(basePath),
    logPath,
    config: config ?? undefined,
  }
}

export async function recordMemoryDebugEvent(
  basePath: string,
  event: MemoryDebugEvent
): Promise<void> {
  try {
    const config = await readDebugConfig(basePath)
    if (!config?.enabled && !isEnvDebugEnabled()) return

    const now = new Date().toISOString()
    const runtime = getRuntimeContext(config, event)
    const normalizedEvent = {
      timestamp: now,
      action: event.action,
      outcome: event.outcome ?? 'ok',
      base_path: basePath,
      memory_id: event.memory_id,
      source: event.source,
      ...runtime,
      details: sanitizeValue(event.details),
      before: sanitizeValue(event.before),
      after: sanitizeValue(event.after),
      content_preview: truncate(event.content_preview),
    }

    await mkdir(getDebugDir(basePath), { recursive: true })
    await appendFile(getDebugLogPath(basePath, config), formatDebugEvent(normalizedEvent), 'utf-8')
  } catch {
    // Debug logging must never break memory operations.
  }
}

export function summarizeMemoryForDebug(memory: {
  metadata: {
    id: string
    type: string
    scope: string
    status: string
    tags: string[]
    source: string
    salience?: number
    updated_at?: string
  }
  content: string
}): Record<string, unknown> {
  return {
    id: memory.metadata.id,
    type: memory.metadata.type,
    scope: memory.metadata.scope,
    status: memory.metadata.status,
    source: memory.metadata.source,
    tags: memory.metadata.tags,
    salience: memory.metadata.salience,
    updated_at: memory.metadata.updated_at,
    content_length: memory.content.length,
    content_preview: truncate(memory.content),
  }
}

async function readDebugConfig(basePath: string): Promise<MemoryDebugConfig | null> {
  const configPath = getDebugConfigPath(basePath)
  if (!existsSync(configPath)) return null

  try {
    return JSON.parse(await readFile(configPath, 'utf-8')) as MemoryDebugConfig
  } catch {
    return null
  }
}

function getDebugDir(basePath: string): string {
  return join(basePath, DEBUG_DIR)
}

function getDebugConfigPath(basePath: string): string {
  return join(getDebugDir(basePath), DEBUG_CONFIG_FILE)
}

function getDebugLogPath(basePath: string, config?: MemoryDebugConfig | null): string {
  return join(getDebugDir(basePath), config?.log_file ?? DEFAULT_LOG_FILE)
}

function isEnvDebugEnabled(): boolean {
  return ['1', 'true', 'yes', 'on'].includes((process.env.PAMH_DEBUG ?? '').toLowerCase())
}

function getRuntimeContext(config: MemoryDebugConfig | null, event: MemoryDebugEvent) {
  const argv = process.argv.join(' ')
  return {
    tool: event.tool ?? process.env.PAMH_TOOL ?? event.source ?? inferToolFromArgv(),
    agent: event.agent ?? process.env.PAMH_AGENT ?? process.env.AI_AGENT ?? config?.agent,
    model:
      event.model ??
      process.env.PAMH_MODEL ??
      process.env.OPENAI_MODEL ??
      process.env.ANTHROPIC_MODEL ??
      config?.model,
    session_id:
      event.session_id ??
      process.env.PAMH_SESSION_ID ??
      process.env.CLAUDE_SESSION_ID ??
      config?.session_id,
    project_path: event.project_path ?? process.env.PAMH_PROJECT_PATH ?? process.cwd(),
    pid: process.pid,
    command: argv,
  }
}

function inferToolFromArgv(): string {
  const command = process.argv.map((part) => basename(part).toLowerCase()).join(' ')
  if (command.includes('mcp')) return 'mcp'
  if (command.includes('ui')) return 'ui'
  if (command.includes('server')) return 'api'
  if (command.includes('memory') || command.includes('index.js')) return 'cli'
  return 'node'
}

function formatDebugEvent(event: Record<string, unknown>): string {
  const lines = [
    '='.repeat(96),
    `${event.timestamp} | ${event.action} | ${event.outcome}`,
    `base_path: ${event.base_path}`,
  ]

  pushIfPresent(lines, 'memory_id', event.memory_id)
  pushIfPresent(lines, 'source', event.source)
  pushIfPresent(lines, 'tool', event.tool)
  pushIfPresent(lines, 'agent', event.agent)
  pushIfPresent(lines, 'model', event.model)
  pushIfPresent(lines, 'session_id', event.session_id)
  pushIfPresent(lines, 'project_path', event.project_path)
  pushIfPresent(lines, 'pid', event.pid)
  pushIfPresent(lines, 'command', event.command)

  appendSection(lines, 'details', event.details)
  appendSection(lines, 'before', event.before)
  appendSection(lines, 'after', event.after)
  appendSection(lines, 'content_preview', event.content_preview)

  lines.push(`json: ${JSON.stringify(event)}`, '')
  return `${lines.join('\n')}\n`
}

function pushIfPresent(lines: string[], label: string, value: unknown): void {
  if (value === undefined || value === null || value === '') return
  lines.push(`${label}: ${String(value)}`)
}

function appendSection(lines: string[], label: string, value: unknown): void {
  if (value === undefined || value === null || value === '') return
  lines.push(`${label}:`)

  if (typeof value === 'string') {
    lines.push(indent(value))
    return
  }

  lines.push(indent(inspect(value, { depth: 6, breakLength: 100 })))
}

function sanitizeValue(value: unknown): unknown {
  if (value === undefined) return undefined
  if (typeof value === 'string') return truncate(value)
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sanitizeValue(item),
      ])
    )
  }
  return value
}

function truncate(value?: string): string | undefined {
  if (value === undefined) return undefined
  const normalized = value.replace(/\r\n/g, '\n')
  if (normalized.length <= PREVIEW_LIMIT) return normalized
  return `${normalized.slice(0, PREVIEW_LIMIT)}... [truncated ${normalized.length - PREVIEW_LIMIT} chars]`
}

function indent(value: string): string {
  return value
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n')
}

export function relativeDebugPath(basePath: string, path: string): string {
  return relative(basePath, path)
}
