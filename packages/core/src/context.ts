import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { indexAllMemories, listMemories } from './storage.js'
import { recordMemoryDebugEvent } from './memory-debug.js'
import { normalizeConcept } from './concepts.js'
import { MemoryIndex, type ThemeCompilation } from './indexer.js'
import type { Memory, MemoryScope, MemoryStatus, MemoryType } from './types.js'

export interface CompileContextOptions {
  query?: string
  maxTokens?: number
  includeProject?: boolean
  includeSearch?: boolean
}

export interface CompiledContext {
  content: string
  tokenCount: number
  themeCompilations: ThemeCompilation[]
  sources: {
    project: Memory[]
    search: Memory[]
  }
}

export interface ContextMemory {
  id: string
  type: string
  scope: string
  status: string
  source: string
  created_at: string
  updated_at: string
  tags: string[]
  content: string
}

export interface RankedContextSource<T extends ContextMemory = ContextMemory> {
  memory: T
  section: string
  reasons: string[]
  score: number
}

export interface ContextExclusion<T extends ContextMemory = ContextMemory> {
  memory: T
  reason: string
}

export interface ContextComposition<T extends ContextMemory = ContextMemory> {
  selected: Array<RankedContextSource<T>>
  exclusions: Array<ContextExclusion<T>>
}

const DEFAULT_MAX_TOKENS = 4000
const CHARS_PER_TOKEN = 4
const MAX_GENERAL_CONTEXT_SESSIONS = 0
const MAX_FOCUSED_CONTEXT_SESSIONS = 4
const CONTEXT_TYPE_WEIGHTS: Record<string, number> = {
  rule: 1000,
  decision: 930,
  preference: 900,
  knowledge: 830,
  mistake: 730,
  task: 700,
  pattern: 660,
  client: 600,
  session: 160,
  exchange: 130,
}

const CONTEXT_SECTION_TITLES: Record<string, string> = {
  rule: 'Current Project Rules',
  decision: 'Active Decisions',
  preference: 'Durable Preferences',
  knowledge: 'Project Knowledge',
  mistake: 'Known Pitfalls',
  task: 'Open Tasks',
  pattern: 'Reusable Patterns',
  client: 'Client Context',
  session: 'Recent Activity',
  exchange: 'Recent Raw Exchanges',
}

export async function compileContext(
  projectBasePath: string,
  options: CompileContextOptions = {}
): Promise<CompiledContext> {
  const {
    query,
    maxTokens = DEFAULT_MAX_TOKENS,
    includeProject = true,
    includeSearch = true,
  } = options

  const sources = {
    project: [] as Memory[],
    search: [] as Memory[],
  }
  let themeCompilations: ThemeCompilation[] = []

  let composition: ContextComposition = { selected: [], exclusions: [] }
  let content = formatCompiledContext(composition, query, themeCompilations)

  if (existsSync(projectBasePath) && (includeProject || includeSearch)) {
    await indexAllMemories(projectBasePath)
    themeCompilations = includeProject ? getRelevantThemeCompilations(projectBasePath, query) : []
    const memories = (await listMemories(projectBasePath)).map(memoryToContextMemory)
    const contextQuery = includeSearch ? query : undefined
    const maxMemories = includeProject ? Math.max(memories.length, 1) : query ? 10 : 0
    composition = composeContextSources(memories, contextQuery, maxMemories)

    while (composition.selected.length > 0) {
      content = formatCompiledContext(composition, query, themeCompilations)
      if (estimateTokens(content) <= maxTokens) break

      const removed = composition.selected[composition.selected.length - 1]
      composition = {
        selected: composition.selected.slice(0, -1),
        exclusions: [
          ...composition.exclusions,
          { memory: removed.memory, reason: 'formatted context token budget overflow' },
        ],
      }
    }

    content = formatCompiledContext(composition, query, themeCompilations)
    while (estimateTokens(content) > maxTokens && composition.exclusions.length > 0) {
      composition = {
        selected: composition.selected,
        exclusions: composition.exclusions.slice(0, -1),
      }
      content = formatCompiledContext(composition, query, themeCompilations)
    }

    while (estimateTokens(content) > maxTokens && themeCompilations.length > 0) {
      themeCompilations = themeCompilations.slice(0, -1)
      content = formatCompiledContext(composition, query, themeCompilations)
    }

    const selectedMemories = composition.selected.map((source) =>
      contextMemoryToMemory(source.memory)
    )
    if (includeProject) {
      sources.project = selectedMemories
    } else {
      sources.search = selectedMemories
    }
  }

  const tokenCount = estimateTokens(content)

  await recordMemoryDebugEvent(projectBasePath, {
    action: 'context.compile',
    outcome: 'ok',
    details: {
      query,
      maxTokens,
      includeProject,
      includeSearch,
      tokenCount,
      source_counts: {
        project: sources.project.length,
        search: sources.search.length,
      },
      source_ids: {
        project: sources.project.map((memory) => memory.metadata.id),
        search: sources.search.map((memory) => memory.metadata.id),
      },
      exclusion_count: composition.exclusions.length,
      theme_compilation_count: themeCompilations.length,
    },
  })

  return {
    content,
    tokenCount,
    themeCompilations,
    sources,
  }
}

export async function writeCompiledContext(
  projectBasePath: string,
  compiled: CompiledContext
): Promise<string> {
  const outputPath = join(projectBasePath, 'compiled-context.md')
  await writeFile(outputPath, compiled.content, 'utf-8')

  await recordMemoryDebugEvent(projectBasePath, {
    action: 'context.write',
    outcome: 'ok',
    details: {
      outputPath,
      tokenCount: compiled.tokenCount,
      source_counts: {
        project: compiled.sources.project.length,
        search: compiled.sources.search.length,
      },
    },
  })

  return outputPath
}

export function estimateContextTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

function estimateTokens(text: string): number {
  return estimateContextTokens(text)
}

function formatCompiledContext(
  composition: ContextComposition,
  query: string | undefined,
  themeCompilations: ThemeCompilation[]
): string {
  let content = '# Compiled Context\n\n'
  content += `Generated at: ${new Date().toISOString()}\n`
  if (query) {
    content += `Query: ${query}\n`
  }
  content +=
    'Policy: active durable memories first; noise, deleted, archived, proposed, duplicate implementation summaries, and lower-ranked overflow are excluded.\n'
  content += '\n---\n\n'

  if (themeCompilations.length > 0) {
    content += '## Compiled Themes\n\n'
    for (const compilation of themeCompilations) {
      content += `### ${compilation.title}\n\n`
      content += `- **Theme**: ${compilation.theme}\n`
      content += `- **Sources**: ${compilation.source_count}\n`
      content += `- **Updated**: ${compilation.updated_at}\n\n`
      content += `${compilation.content}\n\n---\n\n`
    }
  }

  if (composition.selected.length > 0) {
    content += '## Selected Memories\n\n'
    for (const [section, sources] of groupContextSources(composition.selected)) {
      content += `### ${section}\n\n`
      for (const source of sources) {
        content += formatMemory(source)
      }
    }
    content += '\n'
  }

  if (composition.exclusions.length > 0) {
    content += '## Excluded Memories\n\n'
    for (const exclusion of composition.exclusions) {
      content += `- ${exclusion.memory.id}: ${exclusion.reason}\n`
    }
    content += '\n'
  }

  return content
}

function getRelevantThemeCompilations(projectBasePath: string, query?: string): ThemeCompilation[] {
  const index = new MemoryIndex(projectBasePath)
  try {
    index.rebuildThemeCompilations()
    const compilations = index.getThemeCompilations()
    const relevant = query?.trim()
      ? compilations.filter((compilation) =>
          contextTextMatchesQuery(themeSearchBlob(compilation), query)
        )
      : compilations

    return relevant.slice(0, 8)
  } finally {
    index.close()
  }
}

function formatMemory(source: RankedContextSource): string {
  const { memory } = source
  let output = `#### ${memory.id}\n\n`
  output += `- **Type**: ${memory.type}\n`
  output += `- **Updated**: ${memory.updated_at}\n`
  output += `- **Included because**: ${source.reasons.join('; ')}\n`
  if (memory.tags.length > 0) {
    output += `- **Tags**: ${memory.tags.join(', ')}\n`
  }
  output += `\n${memory.content}\n\n---\n\n`
  return output
}

export function isContextNoiseMemory(memory: ContextMemory): boolean {
  return (
    memory.status === 'noise' ||
    memory.tags.includes('noise') ||
    memory.tags.includes('ignored') ||
    memory.tags.includes('pam-noise') ||
    memory.source === 'noise'
  )
}

export function composeContextSources<T extends ContextMemory>(
  memories: T[],
  query: string | undefined,
  maxMemories: number
): ContextComposition<T> {
  const exclusions: Array<ContextExclusion<T>> = []
  const focused = Boolean(query?.trim())
  const maxSessions = focused ? MAX_FOCUSED_CONTEXT_SESSIONS : MAX_GENERAL_CONTEXT_SESSIONS
  const activeCandidates = memories.filter((memory) => {
    if (memory.status !== 'active') {
      exclusions.push({ memory, reason: `not active (${memory.status})` })
      return false
    }
    if (isContextNoiseMemory(memory)) {
      exclusions.push({ memory, reason: 'marked as noise' })
      return false
    }
    if (query && !contextMemoryMatchesQuery(memory, query)) {
      exclusions.push({ memory, reason: 'does not match focused query' })
      return false
    }
    return true
  })

  const ranked = activeCandidates
    .map((memory) => ({
      memory,
      section: getContextSection(memory),
      reasons: getContextReasons(memory, focused),
      score: getContextScore(memory, focused),
    }))
    .sort((a, b) => b.score - a.score || b.memory.updated_at.localeCompare(a.memory.updated_at))

  const durable = ranked.filter((item) => !isRecentActivityType(item.memory.type))
  const sessions = ranked.filter((item) => isRecentActivityType(item.memory.type))
  const durableLimit = Math.max(0, maxMemories - Math.min(maxSessions, sessions.length))
  const selected = durable.slice(0, durableLimit)
  const selectedIds = new Set(selected.map((item) => item.memory.id))

  durable.slice(durableLimit).forEach((item) => {
    exclusions.push({ memory: item.memory, reason: 'lower-ranked durable memory overflow' })
  })

  const sessionCandidates = sessions.filter((item) => {
    if (
      !isDuplicateImplementationSummary(
        item.memory,
        selected.map((source) => source.memory)
      )
    ) {
      return true
    }
    exclusions.push({
      memory: item.memory,
      reason: 'duplicate implementation summary covered by a durable memory',
    })
    return false
  })

  const selectedSessions = sessionCandidates.slice(0, Math.max(0, maxMemories - selected.length))
  selectedSessions.slice(0, maxSessions).forEach((item) => {
    selected.push(item)
    selectedIds.add(item.memory.id)
  })

  sessionCandidates.forEach((item) => {
    if (!selectedIds.has(item.memory.id)) {
      exclusions.push({ memory: item.memory, reason: 'recent activity overflow' })
    }
  })

  return { selected, exclusions }
}

function getContextScore(memory: ContextMemory, focused: boolean): number {
  const typeScore = CONTEXT_TYPE_WEIGHTS[memory.type] ?? 500
  const recencyScore = getRecencyScore(memory.updated_at)
  const tagScore = Math.min(memory.tags.length, 6) * 4
  const implementationPenalty = !focused && isImplementationSummary(memory) ? 120 : 0

  return typeScore + recencyScore + tagScore - implementationPenalty
}

function getRecencyScore(updatedAt: string): number {
  const timestamp = Date.parse(updatedAt)
  if (!Number.isFinite(timestamp)) return 0
  const ageDays = Math.max(0, (Date.now() - timestamp) / 86_400_000)
  return Math.max(0, 70 - ageDays)
}

function getContextSection(memory: ContextMemory): string {
  return CONTEXT_SECTION_TITLES[memory.type] ?? 'Project Knowledge'
}

function getContextReasons(memory: ContextMemory, focused: boolean): string[] {
  const reasons = [`active ${memory.type}`]
  if (['rule', 'decision', 'preference', 'knowledge'].includes(memory.type)) {
    reasons.push('durable context')
  }
  if (isRecentActivityType(memory.type)) {
    reasons.push('limited recent activity')
  }
  if (focused) {
    reasons.push('matches focused query')
  }
  return reasons
}

function contextMemoryMatchesQuery(memory: ContextMemory, query: string): boolean {
  return contextTextMatchesQuery(
    [
      memory.id,
      memory.type,
      memory.scope,
      memory.status,
      memory.source,
      memory.content,
      ...memory.tags,
    ].join(' '),
    query
  )
}

function contextTextMatchesQuery(text: string, query: string): boolean {
  const normalizedQuery = normalizeConcept(query) ?? query.toLowerCase().trim()
  if (!normalizedQuery) return true
  const terms = normalizedQuery.split(/\s+/).filter(Boolean)
  const blob = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')

  return terms.every((term) => blob.includes(term))
}

function themeSearchBlob(compilation: ThemeCompilation): string {
  return [
    compilation.theme,
    compilation.title,
    compilation.content,
    ...compilation.source_ids,
  ].join(' ')
}

function isDuplicateImplementationSummary(
  memory: ContextMemory,
  selected: ContextMemory[]
): boolean {
  if (!isImplementationSummary(memory)) return false

  return selected.some((candidate) => {
    if (candidate.type === 'session') return false
    return countSharedTags(memory.tags, candidate.tags) >= 2
  })
}

function isImplementationSummary(memory: ContextMemory): boolean {
  return (
    memory.type === 'session' &&
    /^(added|built|changed|completed|created|fixed|implemented|removed|updated|verified)\b/i.test(
      memory.content.trim()
    )
  )
}

function countSharedTags(left: string[], right: string[]): number {
  const rightTags = new Set(right)
  return left.filter((tag) => rightTags.has(tag)).length
}

function groupContextSources(
  sources: RankedContextSource[]
): Array<[string, RankedContextSource[]]> {
  const order = [
    'Current Project Rules',
    'Active Decisions',
    'Durable Preferences',
    'Project Knowledge',
    'Known Pitfalls',
    'Open Tasks',
    'Reusable Patterns',
    'Client Context',
    'Recent Activity',
    'Recent Raw Exchanges',
  ]
  const groups = new Map<string, RankedContextSource[]>()

  sources.forEach((source) => {
    groups.set(source.section, [...(groups.get(source.section) ?? []), source])
  })

  return [...groups.entries()].sort(
    (a, b) => sectionOrder(order, a[0]) - sectionOrder(order, b[0]) || a[0].localeCompare(b[0])
  )
}

function isRecentActivityType(type: string): boolean {
  return type === 'session' || type === 'exchange'
}

function sectionOrder(order: string[], section: string): number {
  const index = order.indexOf(section)
  return index === -1 ? order.length : index
}

function memoryToContextMemory(memory: Memory): ContextMemory {
  return {
    id: memory.metadata.id,
    type: memory.metadata.type,
    scope: memory.metadata.scope,
    status: memory.metadata.status,
    source: memory.metadata.source,
    created_at: memory.metadata.created_at,
    updated_at: memory.metadata.updated_at,
    tags: memory.metadata.tags,
    content: memory.content,
  }
}

function contextMemoryToMemory(memory: ContextMemory): Memory {
  return {
    metadata: {
      id: memory.id,
      type: memory.type as MemoryType,
      scope: memory.scope as MemoryScope,
      status: memory.status as MemoryStatus,
      created_at: memory.created_at,
      updated_at: memory.updated_at,
      tags: memory.tags,
      source: memory.source,
    },
    content: memory.content,
  }
}
