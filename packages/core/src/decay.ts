import { readFile, writeFile } from 'node:fs/promises'
import { parseMarkdown, serializeMarkdown } from './markdown.js'
import { MemoryIndex } from './indexer.js'
import { findMemoryFile, listMemories } from './storage.js'
import { recordMemoryDebugEvent, summarizeMemoryForDebug } from './memory-debug.js'
import type { Memory } from './types.js'

// Decay M8 parameters (configurable)
export interface DecayConfig {
  lambda: number // Temporal decay rate (default: 0.02)
  sigma: number // Access reinforcement weight (default: 0.6)
  mu: number // Access decay rate (default: 0.04)
  coldThreshold: number // Score below which to soft-delete (default: 0.20)
  hardDeleteAfterDays: number // Days after soft-delete to hard-delete (default: 180)
}

const DEFAULT_CONFIG: DecayConfig = {
  lambda: 0.02,
  sigma: 0.6,
  mu: 0.04,
  coldThreshold: 0.2,
  hardDeleteAfterDays: 180,
}

/**
 * Calculate the decay score for a memory using the M8 formula:
 * score = salience · exp(−λΔt) + σ · log(1+access_count) · exp(−μ · days_since_access)
 */
export function calculateDecayScore(memory: Memory, config: DecayConfig = DEFAULT_CONFIG): number {
  const normalizedConfig = normalizeDecayConfig(config)
  const now = Date.now()
  const createdAt = new Date(memory.metadata.created_at).getTime()
  const lastAccessedAt = memory.metadata.last_accessed_at
    ? new Date(memory.metadata.last_accessed_at).getTime()
    : createdAt

  const daysSinceCreation = (now - createdAt) / (1000 * 60 * 60 * 24)
  const daysSinceAccess = (now - lastAccessedAt) / (1000 * 60 * 60 * 24)

  const salience = memory.metadata.salience ?? 0.5
  const accessCount = memory.metadata.access_count ?? 0

  // M8 formula
  const temporalDecay = salience * Math.exp(-normalizedConfig.lambda * daysSinceCreation)
  const accessReinforcement =
    normalizedConfig.sigma *
    Math.log(1 + accessCount) *
    Math.exp(-normalizedConfig.mu * daysSinceAccess)

  return temporalDecay + accessReinforcement
}

/**
 * Record an access to a memory (increment access_count and update last_accessed_at)
 */
export async function recordAccess(basePath: string, memoryId: string): Promise<Memory | null> {
  const filePath = await findMemoryFile(basePath, memoryId)
  if (!filePath) {
    await recordMemoryDebugEvent(basePath, {
      action: 'memory.access',
      outcome: 'skipped',
      memory_id: memoryId,
      details: { reason: 'not_found' },
    })
    return null
  }

  const raw = await readFile(filePath, 'utf-8')
  const memory = parseMarkdown(raw)

  if (memory.metadata.status !== 'active') {
    await recordMemoryDebugEvent(basePath, {
      action: 'memory.access',
      outcome: 'skipped',
      memory_id: memoryId,
      source: memory.metadata.source,
      details: { reason: 'not_active', status: memory.metadata.status },
      before: summarizeMemoryForDebug(memory),
    })
    return memory
  }

  const before = summarizeMemoryForDebug(memory)
  memory.metadata.access_count = (memory.metadata.access_count ?? 0) + 1
  memory.metadata.last_accessed_at = new Date().toISOString()
  memory.metadata.updated_at = new Date().toISOString()

  await writeFile(filePath, serializeMarkdown(memory), 'utf-8')

  // Update index
  const index = new MemoryIndex(basePath)
  index.indexMemory(memory, filePath)
  index.rebuildThemeCompilations()
  index.close()

  await recordMemoryDebugEvent(basePath, {
    action: 'memory.access',
    outcome: 'ok',
    memory_id: memoryId,
    source: memory.metadata.source,
    details: { file_path: filePath, access_count: memory.metadata.access_count },
    before,
    after: summarizeMemoryForDebug(memory),
  })

  return memory
}

/**
 * Run a forget sweep: soft-delete memories below the cold threshold
 */
export async function forgetSweep(
  basePath: string,
  config: DecayConfig = DEFAULT_CONFIG,
  dryRun: boolean = false
): Promise<{
  softDeleted: Memory[]
  hardDeleted: Memory[]
  preserved: Memory[]
}> {
  const result = {
    softDeleted: [] as Memory[],
    hardDeleted: [] as Memory[],
    preserved: [] as Memory[],
  }

  const normalizedConfig = normalizeDecayConfig(config)
  const memories = await listMemories(basePath)
  const now = Date.now()

  for (const memory of memories) {
    // Skip memories that are already outside the active working set.
    if (
      memory.metadata.status === 'deleted' ||
      memory.metadata.status === 'archived' ||
      memory.metadata.status === 'noise'
    ) {
      // Check if it's time to hard-delete
      if (memory.metadata.status === 'archived' && memory.metadata.updated_at) {
        const daysSinceArchive =
          (now - new Date(memory.metadata.updated_at).getTime()) / (1000 * 60 * 60 * 24)
        if (daysSinceArchive > normalizedConfig.hardDeleteAfterDays) {
          if (!dryRun) {
            await hardDeleteMemory(basePath, memory.metadata.id)
          }
          result.hardDeleted.push(memory)
          continue
        }
      }
      result.preserved.push(memory)
      continue
    }

    // Skip pinned memories (high salience)
    if ((memory.metadata.salience ?? 0) >= 0.9) {
      result.preserved.push(memory)
      continue
    }

    // Calculate decay score
    const score = calculateDecayScore(memory, normalizedConfig)

    if (score < normalizedConfig.coldThreshold) {
      // Soft-delete
      if (!dryRun) {
        await softDeleteMemory(basePath, memory.metadata.id)
      }
      result.softDeleted.push(memory)
    } else {
      result.preserved.push(memory)
    }
  }

  await recordMemoryDebugEvent(basePath, {
    action: 'memory.decay_sweep',
    outcome: dryRun ? 'skipped' : 'ok',
    details: {
      dryRun,
      config: normalizedConfig,
      softDeleted: result.softDeleted.map((memory) => memory.metadata.id),
      hardDeleted: result.hardDeleted.map((memory) => memory.metadata.id),
      preserved_count: result.preserved.length,
    },
  })

  return result
}

/**
 * Soft-delete a memory (mark as archived)
 */
async function softDeleteMemory(basePath: string, memoryId: string): Promise<void> {
  const filePath = await findMemoryFile(basePath, memoryId)
  if (!filePath) return

  const raw = await readFile(filePath, 'utf-8')
  const memory = parseMarkdown(raw)

  memory.metadata.status = 'archived'
  memory.metadata.updated_at = new Date().toISOString()

  await writeFile(filePath, serializeMarkdown(memory), 'utf-8')

  const index = new MemoryIndex(basePath)
  index.indexMemory(memory, filePath)
  index.close()
}

/**
 * Hard-delete a memory (remove file)
 */
async function hardDeleteMemory(basePath: string, memoryId: string): Promise<void> {
  const filePath = await findMemoryFile(basePath, memoryId)
  if (!filePath) return

  const { rm } = await import('node:fs/promises')
  await rm(filePath, { force: true })

  const index = new MemoryIndex(basePath)
  index.removeMemory(memoryId, 'Hard-deleted by decay sweep')
  index.rebuildThemeCompilations()
  index.close()
}

function normalizeDecayConfig(config: DecayConfig): DecayConfig {
  return {
    lambda: assertFiniteMinimum(config.lambda, 'lambda', 0),
    sigma: assertFiniteMinimum(config.sigma, 'sigma', 0),
    mu: assertFiniteMinimum(config.mu, 'mu', 0),
    coldThreshold: assertFiniteRange(config.coldThreshold, 'coldThreshold', 0, 1),
    hardDeleteAfterDays: assertNonNegativeInteger(
      config.hardDeleteAfterDays,
      'hardDeleteAfterDays'
    ),
  }
}

function assertFiniteMinimum(value: number, name: string, minimum: number): number {
  if (!Number.isFinite(value) || value < minimum) {
    throw new Error(`Invalid ${name}: ${String(value)}. Must be >= ${minimum}.`)
  }
  return value
}

function assertFiniteRange(value: number, name: string, minimum: number, maximum: number): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`Invalid ${name}: ${String(value)}. Must be between ${minimum} and ${maximum}.`)
  }
  return value
}

function assertNonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid ${name}: ${String(value)}. Must be a non-negative integer.`)
  }
  return value
}
