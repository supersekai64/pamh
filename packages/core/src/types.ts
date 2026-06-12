export const MEMORY_TYPES = [
  'decision',
  'knowledge',
  'mistake',
  'rule',
  'preference',
  'session',
  'task',
  'client',
  'project',
  'pattern',
] as const

export type MemoryType = (typeof MEMORY_TYPES)[number]

export function isMemoryType(value: unknown): value is MemoryType {
  return typeof value === 'string' && MEMORY_TYPES.includes(value as MemoryType)
}

export const MEMORY_SCOPES = [
  'global',
  'project',
  'client',
  'stack',
  'temporary',
  'archived',
] as const

export type MemoryScope = (typeof MEMORY_SCOPES)[number]

export function isMemoryScope(value: unknown): value is MemoryScope {
  return typeof value === 'string' && MEMORY_SCOPES.includes(value as MemoryScope)
}

export const MEMORY_STATUSES = ['active', 'deleted', 'archived', 'proposed', 'noise'] as const

export type MemoryStatus = (typeof MEMORY_STATUSES)[number]

export function isMemoryStatus(value: unknown): value is MemoryStatus {
  return typeof value === 'string' && MEMORY_STATUSES.includes(value as MemoryStatus)
}

export function assertMemoryType(value: unknown): MemoryType {
  if (!isMemoryType(value)) {
    throw new Error(`Invalid memory type: ${String(value)}`)
  }
  return value
}

export function assertMemoryScope(value: unknown): MemoryScope {
  if (!isMemoryScope(value)) {
    throw new Error(`Invalid memory scope: ${String(value)}`)
  }
  return value
}

export function assertMemoryStatus(value: unknown): MemoryStatus {
  if (!isMemoryStatus(value)) {
    throw new Error(`Invalid memory status: ${String(value)}`)
  }
  return value
}

export function assertSalience(value: unknown): number {
  const salience = Number(value)
  if (!Number.isFinite(salience) || salience < 0 || salience > 1) {
    throw new Error(`Invalid salience: ${String(value)}. Must be a number between 0 and 1.`)
  }
  return salience
}

export function assertNonNegativeInteger(value: unknown, name: string): number {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`Invalid ${name}: ${String(value)}. Must be a non-negative integer.`)
  }
  return number
}

export interface MemoryMetadata {
  id: string
  type: MemoryType
  scope: MemoryScope
  status: MemoryStatus
  created_at: string
  updated_at: string
  tags: string[]
  source: string
  // Supersession chain (conflict management)
  supersedes?: string // ID of the memory this one replaces
  superseded_by?: string // ID of the memory that replaced this one
  // Evidence model for distillation, recommendations, and graph relations.
  source_ids?: string[] // IDs of memories used as evidence
  // Decay M8 (intelligent forgetting)
  salience?: number // Base importance score (0-1)
  access_count?: number // Number of times accessed
  last_accessed_at?: string // Last access timestamp
}

export interface Memory {
  metadata: MemoryMetadata
  content: string
}

export interface CreateMemoryInput {
  type: MemoryType
  scope: MemoryScope
  content: string
  tags?: string[]
  source?: string
  status?: MemoryStatus
  salience?: number // Base importance score (0-1, default: 0.5)
  supersedes?: string // ID of the memory this one replaces
  source_ids?: string[] // IDs of memories used as evidence
}

export interface UpdateMemoryInput {
  content?: string
  tags?: string[]
  type?: MemoryType
  scope?: MemoryScope
  status?: MemoryStatus
  source_ids?: string[]
}

// Handoff types (cross-agent context transfer)
export type HandoffStatus = 'open' | 'accepted' | 'expired'

export interface Handoff {
  id: string
  project_path: string
  status: HandoffStatus
  created_at: string
  accepted_at?: string
  agent_from?: string // e.g. "claude-code", "codex"
  agent_to?: string
  summary: string // "Where you left off"
  open_questions?: string[]
  next_steps?: string[]
}
