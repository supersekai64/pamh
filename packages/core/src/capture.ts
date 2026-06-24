import { extractConceptCandidates, normalizeConcept, tokenizeConceptText } from './concepts.js'
import { recordMemoryDebugEvent, summarizeMemoryForDebug } from './memory-debug.js'
import { createMemory, listMemories, updateMemory } from './storage.js'
import { supersedeMemory } from './supersession.js'
import { inferMemoryTheme } from './themes.js'
import type { CreateMemoryInput, Memory } from './types.js'

export type IntelligentCaptureAction =
  | 'created'
  | 'merged_proposed'
  | 'proposed_supersession'
  | 'superseded_active'
  | 'resolved_contradiction'

export interface IntelligentCaptureOptions {
  autoSupersedeActive?: boolean
}

export interface IntelligentCaptureResult {
  action: IntelligentCaptureAction
  memory: Memory
  matchedMemoryId?: string
}

interface CandidateScore {
  memory: Memory
  score: number
}

interface MemorySketch {
  concepts: Set<string>
  tags: Set<string>
  tokens: Set<string>
  title?: string
}

const MERGE_THRESHOLD = 0.62
const GENERIC_CAPTURE_TAGS = new Set([
  'checkpoint',
  'decision',
  'fact',
  'knowledge',
  'mistake',
  'preference',
  'rule',
  'session',
  'task',
])

export async function createIntelligentMemory(
  basePath: string,
  input: CreateMemoryInput,
  options: IntelligentCaptureOptions = {}
): Promise<IntelligentCaptureResult> {
  const contradiction = await findContradictionCandidate(basePath, input)
  if (contradiction) {
    return resolveContradictionCapture(basePath, input, contradiction, options)
  }

  const match = await findConsolidationCandidate(basePath, input)

  if (!match) {
    const memory = await createMemory(basePath, input)
    await recordMemoryDebugEvent(basePath, {
      action: 'capture.intelligent_create',
      outcome: 'ok',
      memory_id: memory.metadata.id,
      source: memory.metadata.source,
      details: { reason: 'no_merge_candidate' },
      after: summarizeMemoryForDebug(memory),
    })
    return { action: 'created', memory }
  }

  const target = match.memory
  const nextContent = mergeContent(target.content, input.content)
  const nextTags = mergeValues(target.metadata.tags, input.tags ?? [])
  const nextConcepts = mergeValues(target.metadata.concepts ?? [], input.concepts ?? [])
  const nextSourceIds = mergeValues(target.metadata.source_ids ?? [], input.source_ids ?? [])

  if (target.metadata.status === 'proposed' && input.status === 'proposed') {
    const memory = await updateMemory(basePath, target.metadata.id, {
      content: nextContent,
      title: target.metadata.title ?? input.title,
      tags: nextTags,
      concepts: nextConcepts.length ? nextConcepts : undefined,
      source_ids: nextSourceIds.length ? nextSourceIds : undefined,
    })
    if (!memory) {
      const created = await createMemory(basePath, input)
      return { action: 'created', memory: created }
    }

    await recordMemoryDebugEvent(basePath, {
      action: 'capture.merge_proposed',
      outcome: 'ok',
      memory_id: memory.metadata.id,
      source: memory.metadata.source,
      details: {
        matched_memory_id: target.metadata.id,
        score: match.score,
      },
      after: summarizeMemoryForDebug(memory),
      content_preview: input.content,
    })

    return {
      action: 'merged_proposed',
      memory,
      matchedMemoryId: target.metadata.id,
    }
  }

  const mergedInput: CreateMemoryInput = {
    ...input,
    title: input.title ?? target.metadata.title,
    content: nextContent,
    tags: mergeValues(nextTags, ['intelligent-merge']),
    concepts: nextConcepts,
    source: input.source ?? 'intelligent-capture',
    source_ids: mergeValues(
      [target.metadata.id],
      [...(target.metadata.source_ids ?? []), ...(input.source_ids ?? [])]
    ),
    supersedes: target.metadata.id,
  }

  if (input.status === 'active' && options.autoSupersedeActive) {
    const result = await supersedeMemory(basePath, target.metadata.id, mergedInput)
    if (result) {
      await recordMemoryDebugEvent(basePath, {
        action: 'capture.supersede_active',
        outcome: 'ok',
        memory_id: result.newMemory.metadata.id,
        source: result.newMemory.metadata.source,
        details: {
          matched_memory_id: target.metadata.id,
          score: match.score,
        },
        before: summarizeMemoryForDebug(result.oldMemory),
        after: summarizeMemoryForDebug(result.newMemory),
      })

      return {
        action: 'superseded_active',
        memory: result.newMemory,
        matchedMemoryId: target.metadata.id,
      }
    }
  }

  const memory = await createMemory(basePath, {
    ...mergedInput,
    status: 'proposed',
  })

  await recordMemoryDebugEvent(basePath, {
    action: 'capture.propose_supersession',
    outcome: 'ok',
    memory_id: memory.metadata.id,
    source: memory.metadata.source,
    details: {
      matched_memory_id: target.metadata.id,
      score: match.score,
    },
    before: summarizeMemoryForDebug(target),
    after: summarizeMemoryForDebug(memory),
  })

  return {
    action: 'proposed_supersession',
    memory,
    matchedMemoryId: target.metadata.id,
  }
}

export function splitMemorySignals(content: string): string[] {
  const trimmed = content.trim()
  if (!trimmed) return []

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const bulletItems = lines
    .map((line) => line.match(/^(?:[-*]|\d+[.)])\s+(.+)$/u)?.[1]?.trim())
    .filter((line): line is string => Boolean(line && line.length >= 24))

  if (bulletItems.length >= 2 && bulletItems.length === lines.length) {
    return bulletItems
  }

  return [trimmed]
}

async function resolveContradictionCapture(
  basePath: string,
  input: CreateMemoryInput,
  match: CandidateScore,
  options: IntelligentCaptureOptions
): Promise<IntelligentCaptureResult> {
  const target = match.memory
  const inputStatus = input.status ?? 'active'
  const tags = mergeValues(target.metadata.tags, input.tags ?? [])
  const concepts = mergeValues(target.metadata.concepts ?? [], input.concepts ?? [])
  const sourceIds = mergeValues(
    [target.metadata.id],
    [...(target.metadata.source_ids ?? []), ...(input.source_ids ?? [])]
  )

  if (target.metadata.status === 'proposed') {
    const memory = await updateMemory(basePath, target.metadata.id, {
      content: input.content,
      title: input.title ?? target.metadata.title,
      tags: mergeValues(tags, ['contradiction-resolved']),
      concepts,
      status: inputStatus,
      source_ids: sourceIds,
    })
    if (memory) {
      await recordMemoryDebugEvent(basePath, {
        action: 'capture.resolve_contradiction',
        outcome: 'ok',
        memory_id: memory.metadata.id,
        source: memory.metadata.source,
        details: {
          matched_memory_id: target.metadata.id,
          score: match.score,
          strategy: 'update_proposed',
        },
        before: summarizeMemoryForDebug(target),
        after: summarizeMemoryForDebug(memory),
      })

      return {
        action: 'resolved_contradiction',
        memory,
        matchedMemoryId: target.metadata.id,
      }
    }
  }

  const replacementInput: CreateMemoryInput = {
    ...input,
    title: input.title ?? target.metadata.title,
    tags: mergeValues(tags, ['contradiction-resolved']),
    concepts,
    source: input.source ?? 'intelligent-capture',
    source_ids: sourceIds,
    supersedes: target.metadata.id,
  }

  if (inputStatus === 'active' && options.autoSupersedeActive) {
    const result = await supersedeMemory(basePath, target.metadata.id, replacementInput)
    if (result) {
      await recordMemoryDebugEvent(basePath, {
        action: 'capture.supersede_contradiction',
        outcome: 'ok',
        memory_id: result.newMemory.metadata.id,
        source: result.newMemory.metadata.source,
        details: {
          matched_memory_id: target.metadata.id,
          score: match.score,
        },
        before: summarizeMemoryForDebug(result.oldMemory),
        after: summarizeMemoryForDebug(result.newMemory),
      })

      return {
        action: 'superseded_active',
        memory: result.newMemory,
        matchedMemoryId: target.metadata.id,
      }
    }
  }

  const memory = await createMemory(basePath, {
    ...replacementInput,
    status: 'proposed',
  })

  await recordMemoryDebugEvent(basePath, {
    action: 'capture.propose_contradiction_supersession',
    outcome: 'ok',
    memory_id: memory.metadata.id,
    source: memory.metadata.source,
    details: {
      matched_memory_id: target.metadata.id,
      score: match.score,
    },
    before: summarizeMemoryForDebug(target),
    after: summarizeMemoryForDebug(memory),
  })

  return {
    action: 'proposed_supersession',
    memory,
    matchedMemoryId: target.metadata.id,
  }
}

async function findContradictionCandidate(
  basePath: string,
  input: CreateMemoryInput
): Promise<CandidateScore | null> {
  const inputTheme = inferMemoryTheme(input)
  const inputTokens = new Set(tokenizeConceptText(input.content))
  const inputTags = new Set((input.tags ?? []).map((tag) => normalizeConcept(tag)).filter(isString))
  const candidates = (await listMemories(basePath)).filter((memory) => {
    if (memory.metadata.type !== input.type) return false
    if (memory.metadata.scope !== input.scope) return false
    if (memory.metadata.status !== 'active' && memory.metadata.status !== 'proposed') return false
    if (memory.metadata.superseded_by) return false
    if (isNoise(memory)) return false
    return true
  })

  const scored = candidates
    .map((memory) => {
      const memoryTheme =
        memory.metadata.theme ??
        inferMemoryTheme({
          type: memory.metadata.type,
          content: memory.content,
          tags: memory.metadata.tags,
          source: memory.metadata.source,
        })
      const memoryTokens = new Set(tokenizeConceptText(memory.content))
      const memoryTags = new Set(
        memory.metadata.tags.map((tag) => normalizeConcept(tag)).filter(isString)
      )
      const tokenScore = jaccard(inputTokens, memoryTokens)
      const tagScore = jaccard(inputTags, memoryTags)
      const sameTheme = inputTheme === memoryTheme
      const score = tokenScore * 0.72 + tagScore * 0.18 + (sameTheme ? 0.1 : 0)
      return { memory, score }
    })
    .filter((candidate) => {
      if (candidate.score < 0.24) return false
      return hasOpposingLanguage(input.content, candidate.memory.content)
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        statusPriority(b.memory) - statusPriority(a.memory) ||
        b.memory.metadata.updated_at.localeCompare(a.memory.metadata.updated_at)
    )

  return scored[0] ?? null
}

async function findConsolidationCandidate(
  basePath: string,
  input: CreateMemoryInput
): Promise<CandidateScore | null> {
  const inputSketch = sketchInput(input)
  const candidates = (await listMemories(basePath)).filter((memory) => {
    if (memory.metadata.type !== input.type) return false
    if (memory.metadata.scope !== input.scope) return false
    if (memory.metadata.status !== 'active' && memory.metadata.status !== 'proposed') return false
    if (memory.metadata.superseded_by) return false
    if (isNoise(memory)) return false
    return true
  })

  const scored = candidates
    .map((memory) => ({
      memory,
      score: scoreCandidate(inputSketch, sketchMemory(memory)),
    }))
    .filter((candidate) => candidate.score >= MERGE_THRESHOLD)
    .sort(
      (a, b) =>
        b.score - a.score ||
        statusPriority(b.memory) - statusPriority(a.memory) ||
        b.memory.metadata.updated_at.localeCompare(a.memory.metadata.updated_at)
    )

  return scored[0] ?? null
}

function statusPriority(memory: Memory): number {
  return memory.metadata.status === 'proposed' ? 1 : 0
}

function sketchInput(input: CreateMemoryInput): MemorySketch {
  return buildSketch(input.content, input.tags ?? [], input.title, input.concepts)
}

function sketchMemory(memory: Memory): MemorySketch {
  return buildSketch(
    memory.content,
    memory.metadata.tags,
    memory.metadata.title,
    memory.metadata.concepts
  )
}

function buildSketch(
  content: string,
  tags: string[],
  title?: string,
  explicitConcepts: string[] = []
): MemorySketch {
  const semanticTags = tags.filter(isSemanticTag)
  const normalizedTags = new Set(semanticTags.map((tag) => normalizeConcept(tag)).filter(isString))
  const concepts = new Set<string>([
    ...normalizedTags,
    ...explicitConcepts.map((concept) => normalizeConcept(concept)).filter(isString),
  ])
  extractConceptCandidates(content, semanticTags)
    .slice(0, 10)
    .forEach((candidate) => concepts.add(candidate.id))

  return {
    concepts,
    tags: normalizedTags,
    tokens: new Set(tokenizeConceptText(content)),
    title: normalizeComparable(title),
  }
}

function isSemanticTag(tag: string): boolean {
  const lower = tag.trim().toLowerCase()
  if (!lower) return false
  if (lower.startsWith('agent-') || lower.startsWith('model-')) return false
  const normalized = normalizeConcept(lower)
  if (!normalized) return false
  return !GENERIC_CAPTURE_TAGS.has(normalized)
}

function scoreCandidate(left: MemorySketch, right: MemorySketch): number {
  const tagScore = jaccard(left.tags, right.tags)
  const conceptScore = jaccard(left.concepts, right.concepts)
  const tokenScore = jaccard(left.tokens, right.tokens)
  const sharedConcepts = intersectionSize(left.concepts, right.concepts)
  const titleBoost = left.title && left.title === right.title ? 0.16 : 0

  if (sharedConcepts === 0 && tokenScore < 0.38) return 0
  if (sharedConcepts === 1 && tagScore < 0.5 && tokenScore < 0.28) return 0

  return Math.min(1, tagScore * 0.4 + conceptScore * 0.35 + tokenScore * 0.25 + titleBoost)
}

function mergeContent(existing: string, incoming: string): string {
  const current = existing.trim()
  const next = incoming.trim()
  if (!current) return next
  if (!next) return current

  const normalizedCurrent = normalizeComparable(current)
  const normalizedNext = normalizeComparable(next)
  if (normalizedCurrent.includes(normalizedNext)) return current
  if (normalizedNext.includes(normalizedCurrent)) return next

  const bullet = `- ${next.replace(/\r?\n/g, '\n  ')}`
  if (/\nAdditional signals:\n/u.test(current)) {
    return `${current}\n${bullet}`
  }
  return `${current}\n\nAdditional signals:\n${bullet}`
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (!left.size && !right.size) return 0
  const intersection = intersectionSize(left, right)
  const union = new Set([...left, ...right]).size
  return union ? intersection / union : 0
}

function intersectionSize(left: Set<string>, right: Set<string>): number {
  let count = 0
  left.forEach((value) => {
    if (right.has(value)) count += 1
  })
  return count
}

function mergeValues(left: string[], right: string[]): string[] {
  return Array.from(new Set([...left, ...right].filter(Boolean)))
}

function normalizeComparable(value: string | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasOpposingLanguage(left: string, right: string): boolean {
  const pairs = [
    [/\bmust\b|\bshould\b|\balways\b/i, /\bmust not\b|\bshould not\b|\bnever\b/i],
    [/\bmanual\b/i, /\bauto(matic)?\b/i],
    [/\bactive\b/i, /\bdeleted\b|\barchived\b|\bnoise\b/i],
    [/\ballow\b|\benable\b/i, /\bdeny\b|\bdisable\b|\bblock\b/i],
    [/\bkeep\b|\bpreserve\b/i, /\bremove\b|\bdelete\b|\bdrop\b/i],
  ]

  return pairs.some(([a, b]) => (a.test(left) && b.test(right)) || (b.test(left) && a.test(right)))
}

function isNoise(memory: Memory): boolean {
  return (
    memory.metadata.status === 'noise' ||
    memory.metadata.tags.includes('noise') ||
    memory.metadata.tags.includes('pam-noise') ||
    memory.metadata.source === 'noise'
  )
}

function isString(value: string | null): value is string {
  return Boolean(value)
}
