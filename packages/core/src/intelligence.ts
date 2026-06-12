import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { generateId } from './id.js'
import { archiveMemory, createMemory, deleteMemory, listMemories, updateMemory } from './storage.js'
import { recordMemoryDebugEvent, summarizeMemoryForDebug } from './memory-debug.js'
import type { Memory, MemoryStatus, MemoryType } from './types.js'

export type CleanupAction =
  | 'archive'
  | 'mark_noise'
  | 'merge_or_distill'
  | 'restore'
  | 'physical_delete'

export type RecommendationType =
  | 'distill_candidates'
  | 'obsolete_candidate'
  | 'noise_candidate'
  | 'strong_concept'
  | 'contradiction'
  | 'metadata_fix'
  | 'missing_memory'

export type RecommendationStatus = 'proposed' | 'accepted' | 'rejected' | 'deferred'

export interface MemoryRecommendation {
  id: string
  type: RecommendationType
  status: RecommendationStatus
  title: string
  explanation: string
  evidence_ids: string[]
  action?: CleanupAction
  payload?: Record<string, unknown>
  fingerprint: string
  created_at: string
  updated_at: string
}

export interface DistillationProposal {
  id: string
  concept: string
  type: MemoryType
  scope: 'project' | 'global'
  tags: string[]
  content: string
  source_ids: string[]
  source_count: number
  compression_ratio: number
  reason: string
}

export interface CleanupRecommendation {
  recommendation: MemoryRecommendation
  action: CleanupAction
}

export interface IntelligenceMetrics {
  total_memories: number
  active_memories: number
  proposed_recommendations: number
  source_preservation_rate: number
  top_concept_count: number
}

export interface MemoryMaintenanceReport {
  recommendations: MemoryRecommendation[]
  metrics: IntelligenceMetrics
}

export interface KnowledgeEntity {
  id: string
  label: string
  type:
    | 'concept'
    | 'decision'
    | 'rule'
    | 'file'
    | 'project'
    | 'person'
    | 'stack'
    | 'api'
    | 'mistake'
    | 'feature'
    | 'tool'
    | 'memory'
  evidence_ids: string[]
}

export interface KnowledgeRelation {
  id: string
  source: string
  target: string
  type:
    | 'depends_on'
    | 'supersedes'
    | 'contradicts'
    | 'mentions'
    | 'implements'
    | 'owned_by'
    | 'uses'
    | 'caused_by'
    | 'resolved_by'
    | 'applies_to'
    | 'excludes_from'
  status: 'proposed'
  evidence_ids: string[]
  explanation: string
}

export interface KnowledgeGraph {
  entities: KnowledgeEntity[]
  relations: KnowledgeRelation[]
  metrics: {
    entity_count: number
    relation_count: number
    evidence_coverage: number
  }
}

export interface ApplyRecommendationOptions {
  confirmPhysicalDelete?: boolean
}

const RECOMMENDATIONS_FILE = 'recommendations.json'
const STOP_WORDS = new Set([
  'about',
  'after',
  'also',
  'and',
  'are',
  'but',
  'can',
  'for',
  'from',
  'has',
  'have',
  'into',
  'memory',
  'memories',
  'not',
  'of',
  'only',
  'or',
  'pamh',
  'project',
  'should',
  'the',
  'this',
  'through',
  'to',
  'use',
  'user',
  'with',
])

const STACK_TERMS = new Set([
  'api',
  'codex',
  'claude',
  'copilot',
  'cursor',
  'mcp',
  'opencode',
  'openai',
  'react',
  'sdk',
  'sqlite',
  'typescript',
  'vite',
])

export async function generateRecommendations(basePath: string): Promise<MemoryMaintenanceReport> {
  const memories = await listMemories(basePath)
  const existing = await readRecommendations(basePath)
  const suppressed = new Set(
    existing.filter((item) => item.status !== 'proposed').map((item) => item.fingerprint)
  )
  const existingByFingerprint = new Map(existing.map((item) => [item.fingerprint, item]))
  const generated = buildRecommendationCandidates(memories)
  const now = new Date().toISOString()
  const newRecommendations = generated
    .filter((item) => !suppressed.has(item.fingerprint))
    .map((item) => existingByFingerprint.get(item.fingerprint) ?? { ...item, created_at: now })
    .map((item) => ({ ...item, updated_at: item.updated_at ?? now }))

  const merged = [
    ...existing.filter((item) => !newRecommendations.some((next) => next.id === item.id)),
    ...newRecommendations,
  ]

  await writeRecommendations(basePath, merged)

  const activeMemories = memories.filter((memory) => memory.metadata.status === 'active')
  const evidenceLinks = newRecommendations.reduce(
    (count, item) => count + item.evidence_ids.length,
    0
  )
  await recordMemoryDebugEvent(basePath, {
    action: 'recommendation.generate',
    outcome: 'ok',
    tool: 'intelligence',
    details: {
      generated_count: newRecommendations.filter((item) => item.status === 'proposed').length,
      total_memories: memories.length,
      evidence_links: evidenceLinks,
      types: countBy(newRecommendations, (item) => item.type),
    },
  })

  return {
    recommendations: newRecommendations.filter((item) => item.status === 'proposed'),
    metrics: {
      total_memories: memories.length,
      active_memories: activeMemories.length,
      proposed_recommendations: newRecommendations.filter((item) => item.status === 'proposed')
        .length,
      source_preservation_rate: newRecommendations.length ? 1 : 0,
      top_concept_count: getConceptBuckets(memories).length,
    },
  }
}

export async function listRecommendations(basePath: string): Promise<MemoryRecommendation[]> {
  return readRecommendations(basePath)
}

export async function rejectRecommendation(
  basePath: string,
  id: string
): Promise<MemoryRecommendation | null> {
  return setRecommendationStatus(basePath, id, 'rejected')
}

export async function deferRecommendation(
  basePath: string,
  id: string
): Promise<MemoryRecommendation | null> {
  return setRecommendationStatus(basePath, id, 'deferred')
}

export async function applyRecommendation(
  basePath: string,
  id: string,
  options: ApplyRecommendationOptions = {}
): Promise<{ recommendation: MemoryRecommendation; memory?: Memory | null }> {
  const recommendations = await readRecommendations(basePath)
  const recommendation = recommendations.find((item) => item.id === id)
  if (!recommendation) {
    throw new Error(`Recommendation not found: ${id}`)
  }

  let memory: Memory | null | undefined
  const targetId =
    typeof recommendation.payload?.target_id === 'string' ? recommendation.payload.target_id : null

  if (recommendation.action === 'archive' && targetId) {
    await archiveMemory(basePath, targetId)
  } else if (recommendation.action === 'mark_noise' && targetId) {
    memory = await updateMemory(basePath, targetId, {
      status: 'noise',
      tags: mergeTags(await getMemoryTags(basePath, targetId), ['pamh-noise']),
    })
  } else if (recommendation.action === 'restore' && targetId) {
    memory = await updateMemory(basePath, targetId, { status: 'active' })
  } else if (recommendation.action === 'physical_delete' && targetId) {
    if (!options.confirmPhysicalDelete) {
      throw new Error('Physical delete requires explicit confirmation')
    }
    await deleteMemory(basePath, targetId, { physical: true })
  } else if (recommendation.action === 'merge_or_distill') {
    const sourceIds = getStringArray(recommendation.payload?.source_ids)
    const concept =
      typeof recommendation.payload?.concept === 'string'
        ? recommendation.payload.concept
        : recommendation.title
    const proposal = await buildDistillationProposalForIds(basePath, sourceIds, concept)
    if (proposal) {
      memory = await applyDistillationProposal(basePath, proposal)
    }
  }

  const updated = await setRecommendationStatus(basePath, id, 'accepted')
  if (!updated) throw new Error(`Recommendation not found after apply: ${id}`)

  await recordMemoryDebugEvent(basePath, {
    action: 'recommendation.apply',
    outcome: 'ok',
    tool: 'intelligence',
    memory_id: memory?.metadata.id ?? targetId ?? undefined,
    details: {
      recommendation_id: id,
      type: recommendation.type,
      action: recommendation.action,
      evidence_ids: recommendation.evidence_ids,
    },
    after: memory ? summarizeMemoryForDebug(memory) : undefined,
  })

  return { recommendation: updated, memory }
}

export async function analyzeDistillation(basePath: string): Promise<DistillationProposal[]> {
  const memories = await listMemories(basePath)
  const buckets = getConceptBuckets(memories)
  const proposals = buckets
    .filter((bucket) => bucket.memories.length >= 3)
    .slice(0, 20)
    .map((bucket) => buildDistillationProposal(bucket.concept, bucket.memories))

  await recordMemoryDebugEvent(basePath, {
    action: 'distillation.preview',
    outcome: 'ok',
    tool: 'intelligence',
    details: {
      proposal_count: proposals.length,
      source_ids: proposals.flatMap((proposal) => proposal.source_ids),
    },
  })

  return proposals
}

export async function applyDistillationProposal(
  basePath: string,
  proposal: DistillationProposal,
  status: MemoryStatus = 'proposed'
): Promise<Memory> {
  const memory = await createMemory(basePath, {
    type: proposal.type,
    scope: proposal.scope,
    status,
    tags: proposal.tags,
    source: 'distillation',
    source_ids: proposal.source_ids,
    salience: 0.84,
    content: proposal.content,
  })

  await recordMemoryDebugEvent(basePath, {
    action: 'distillation.apply',
    outcome: 'ok',
    tool: 'intelligence',
    memory_id: memory.metadata.id,
    details: {
      proposal_id: proposal.id,
      concept: proposal.concept,
      source_ids: proposal.source_ids,
      compression_ratio: proposal.compression_ratio,
    },
    after: summarizeMemoryForDebug(memory),
  })

  return memory
}

export async function analyzeCleanup(basePath: string): Promise<CleanupRecommendation[]> {
  const report = await generateRecommendations(basePath)
  return report.recommendations
    .filter((recommendation) => recommendation.action)
    .map((recommendation) => ({
      recommendation,
      action: recommendation.action as CleanupAction,
    }))
}

export async function buildKnowledgeGraph(basePath: string): Promise<KnowledgeGraph> {
  const memories = (await listMemories(basePath)).filter(
    (memory) => memory.metadata.status !== 'deleted'
  )
  const entities = new Map<string, KnowledgeEntity>()
  const relations = new Map<string, KnowledgeRelation>()

  for (const memory of memories) {
    const memoryEntity = addEntity(entities, {
      id: `memory:${memory.metadata.id}`,
      label: memory.metadata.id,
      type: 'memory',
      evidence_ids: [memory.metadata.id],
    })

    const typedEntity = addEntity(entities, {
      id: `${memory.metadata.type}:${memory.metadata.id}`,
      label: titleFromContent(memory.content),
      type: entityTypeForMemory(memory.metadata.type),
      evidence_ids: [memory.metadata.id],
    })
    addRelation(relations, typedEntity.id, memoryEntity.id, 'mentions', [memory.metadata.id])

    for (const tag of memory.metadata.tags) {
      const concept = normalizeConcept(tag)
      if (!concept) continue
      const entity = addEntity(entities, {
        id: `concept:${concept}`,
        label: formatLabel(concept),
        type: 'concept',
        evidence_ids: [memory.metadata.id],
      })
      addRelation(relations, typedEntity.id, entity.id, 'mentions', [memory.metadata.id])
    }

    for (const file of extractFiles(memory.content)) {
      const entity = addEntity(entities, {
        id: `file:${file}`,
        label: file,
        type: 'file',
        evidence_ids: [memory.metadata.id],
      })
      addRelation(relations, typedEntity.id, entity.id, 'applies_to', [memory.metadata.id])
    }

    for (const stack of extractStacks(memory.content, memory.metadata.tags)) {
      const entity = addEntity(entities, {
        id: `stack:${stack}`,
        label: formatLabel(stack),
        type: stack === 'api' || stack === 'sdk' ? 'api' : stack === 'codex' ? 'tool' : 'stack',
        evidence_ids: [memory.metadata.id],
      })
      addRelation(relations, typedEntity.id, entity.id, 'uses', [memory.metadata.id])
    }

    if (memory.metadata.supersedes) {
      addRelation(
        relations,
        `memory:${memory.metadata.id}`,
        `memory:${memory.metadata.supersedes}`,
        'supersedes',
        [memory.metadata.id, memory.metadata.supersedes]
      )
    }

    for (const sourceId of memory.metadata.source_ids ?? []) {
      addRelation(relations, `memory:${memory.metadata.id}`, `memory:${sourceId}`, 'uses', [
        memory.metadata.id,
        sourceId,
      ])
    }

    if (isNoise(memory)) {
      addRelation(relations, typedEntity.id, 'concept:neural-map', 'excludes_from', [
        memory.metadata.id,
      ])
      addEntity(entities, {
        id: 'concept:neural-map',
        label: 'Neural Map',
        type: 'concept',
        evidence_ids: [memory.metadata.id],
      })
    }
  }

  const contradictionPairs = findContradictionPairs(memories)
  contradictionPairs.forEach(([left, right]) => {
    addRelation(
      relations,
      `memory:${left.metadata.id}`,
      `memory:${right.metadata.id}`,
      'contradicts',
      [left.metadata.id, right.metadata.id]
    )
  })

  const relationList = [...relations.values()]
  const evidenceCoverage = relationList.length
    ? relationList.filter((relation) => relation.evidence_ids.length > 0).length /
      relationList.length
    : 1

  await recordMemoryDebugEvent(basePath, {
    action: 'knowledge_graph.preview',
    outcome: 'ok',
    tool: 'intelligence',
    details: {
      entity_count: entities.size,
      relation_count: relationList.length,
      evidence_coverage: evidenceCoverage,
    },
  })

  return {
    entities: [...entities.values()],
    relations: relationList,
    metrics: {
      entity_count: entities.size,
      relation_count: relationList.length,
      evidence_coverage: evidenceCoverage,
    },
  }
}

export async function seedIntelligenceEvaluationDataset(basePath: string): Promise<{
  created: number
  categories: Record<string, number>
}> {
  const categories: Record<string, number> = {
    active: 0,
    near_duplicates: 0,
    obsolete: 0,
    noise: 0,
    contradictions: 0,
    recurring_concepts: 0,
    graph_relations: 0,
  }

  const recurring = [
    'assisted capture',
    'memory distillation',
    'auto cleanup',
    'AI recommendations',
    'knowledge graph',
    'source evidence',
    'SQLite index',
    'Markdown source of truth',
    'MCP integration',
    'review workflow',
  ]

  for (let i = 0; i < 150; i += 1) {
    const concept = recurring[i % recurring.length]
    await createMemory(basePath, {
      type: i % 5 === 0 ? 'decision' : i % 5 === 1 ? 'preference' : 'knowledge',
      scope: 'project',
      status: 'active',
      source: 'evaluation-dataset',
      tags: [slug(concept), 'eval-active'],
      content: `Evaluation memory ${i + 1}: ${formatLabel(concept)} should remain concise, reviewable, and supported by source evidence for the PAMH project.`,
      salience: 0.62,
    })
    categories.active += 1
  }

  for (let i = 0; i < 30; i += 1) {
    await createMemory(basePath, {
      type: 'knowledge',
      scope: 'project',
      status: 'active',
      source: 'evaluation-dataset',
      tags: ['near-duplicate', 'review-workflow'],
      content: `Near duplicate ${i + 1}: Proposed memories must be reviewed before becoming active in assisted capture mode.`,
    })
    categories.near_duplicates += 1
  }

  for (let i = 0; i < 20; i += 1) {
    await createMemory(basePath, {
      type: 'decision',
      scope: 'project',
      status: i % 2 === 0 ? 'archived' : 'active',
      source: 'evaluation-dataset',
      tags: ['obsolete', 'superseded'],
      content: `Obsolete decision ${i + 1}: Use manual-only memory capture for all agents. This is superseded by assisted capture as the default.`,
    })
    categories.obsolete += 1
  }

  for (let i = 0; i < 20; i += 1) {
    await createMemory(basePath, {
      type: 'session',
      scope: 'temporary',
      status: i % 3 === 0 ? 'noise' : 'proposed',
      source: 'evaluation-dataset',
      tags: ['pamh-noise', 'generated-test-fragment'],
      content: `tmp log ${i + 1}`,
      salience: 0.08,
    })
    categories.noise += 1
  }

  for (let i = 0; i < 10; i += 1) {
    await createMemory(basePath, {
      type: 'decision',
      scope: 'project',
      status: 'active',
      source: 'evaluation-dataset',
      tags: ['contradiction', 'capture-mode'],
      content:
        i % 2 === 0
          ? 'Capture mode should be assisted by default.'
          : 'Capture mode should be automatic by default without review.',
    })
    categories.contradictions += 1
  }

  for (const concept of recurring) {
    await createMemory(basePath, {
      type: 'knowledge',
      scope: 'project',
      status: 'active',
      source: 'evaluation-dataset',
      tags: ['strong-concept', slug(concept)],
      content: `${formatLabel(concept)} is a recurring concept that should become visible in distillation and recommendations.`,
      salience: 0.78,
    })
    categories.recurring_concepts += 1
  }

  for (let i = 0; i < 30; i += 1) {
    await createMemory(basePath, {
      type: i % 2 === 0 ? 'rule' : 'decision',
      scope: 'project',
      status: 'active',
      source: 'evaluation-dataset',
      tags: ['graph-relation', i % 2 === 0 ? 'main-tsx' : 'openai-sdk'],
      content:
        i % 2 === 0
          ? `UI rule ${i + 1} applies to packages/ui/src/main.tsx and should be inspectable in the Knowledge Graph.`
          : `API decision ${i + 1} depends on the OpenAI SDK and uses MCP-compatible agents.`,
    })
    categories.graph_relations += 1
  }

  await recordMemoryDebugEvent(basePath, {
    action: 'evaluation_dataset.seed',
    outcome: 'ok',
    tool: 'intelligence',
    details: categories,
  })

  return {
    created: Object.values(categories).reduce((sum, count) => sum + count, 0),
    categories,
  }
}

function buildRecommendationCandidates(memories: Memory[]): MemoryRecommendation[] {
  const recommendations: MemoryRecommendation[] = []
  const now = new Date().toISOString()

  for (const proposal of getDistillationProposalsFromMemories(memories).slice(0, 20)) {
    recommendations.push(
      makeRecommendation(now, {
        type: 'distill_candidates',
        title: `Distill ${proposal.source_count} memories about ${proposal.concept}`,
        explanation: proposal.reason,
        evidence_ids: proposal.source_ids,
        action: 'merge_or_distill',
        payload: {
          source_ids: proposal.source_ids,
          concept: proposal.concept,
          compression_ratio: proposal.compression_ratio,
        },
      })
    )
  }

  for (const memory of memories.filter((item) => isLowValue(item)).slice(0, 40)) {
    recommendations.push(
      makeRecommendation(now, {
        type: 'noise_candidate',
        title: `Mark low-value memory ${memory.metadata.id} as noise`,
        explanation:
          'The memory is very short, temporary, generated, or already tagged as low signal.',
        evidence_ids: [memory.metadata.id],
        action: 'mark_noise',
        payload: { target_id: memory.metadata.id },
      })
    )
  }

  for (const [older, newer] of findObsoletePairs(memories).slice(0, 30)) {
    recommendations.push(
      makeRecommendation(now, {
        type: 'obsolete_candidate',
        title: `Archive older decision ${older.metadata.id}`,
        explanation: `Newer memory ${newer.metadata.id} appears to replace the older decision.`,
        evidence_ids: [older.metadata.id, newer.metadata.id],
        action: 'archive',
        payload: { target_id: older.metadata.id, replacement_id: newer.metadata.id },
      })
    )
  }

  for (const [left, right] of findContradictionPairs(memories).slice(0, 20)) {
    recommendations.push(
      makeRecommendation(now, {
        type: 'contradiction',
        title: `Review contradiction between ${left.metadata.id} and ${right.metadata.id}`,
        explanation: 'The memories share important terms but use opposing language.',
        evidence_ids: [left.metadata.id, right.metadata.id],
        payload: { left_id: left.metadata.id, right_id: right.metadata.id },
      })
    )
  }

  for (const bucket of getConceptBuckets(memories)
    .filter((item) => item.memories.length >= 5)
    .slice(0, 20)) {
    recommendations.push(
      makeRecommendation(now, {
        type: 'strong_concept',
        title: `${formatLabel(bucket.concept)} is a strong recurring concept`,
        explanation: `The concept appears in ${bucket.memories.length} active memories and may deserve curated context.`,
        evidence_ids: bucket.memories.map((memory) => memory.metadata.id).slice(0, 12),
        payload: { concept: bucket.concept, count: bucket.memories.length },
      })
    )
  }

  return uniqueBy(recommendations, (item) => item.fingerprint)
}

function makeRecommendation(
  now: string,
  input: Omit<MemoryRecommendation, 'id' | 'status' | 'fingerprint' | 'created_at' | 'updated_at'>
): MemoryRecommendation {
  const fingerprint = [
    input.type,
    input.action ?? 'inspect',
    ...input.evidence_ids.slice().sort(),
    JSON.stringify(input.payload ?? {}),
  ].join('|')

  return {
    ...input,
    id: generateId(),
    status: 'proposed',
    fingerprint,
    created_at: now,
    updated_at: now,
  }
}

function getDistillationProposalsFromMemories(memories: Memory[]): DistillationProposal[] {
  return getConceptBuckets(memories)
    .filter((bucket) => bucket.memories.length >= 3)
    .map((bucket) => buildDistillationProposal(bucket.concept, bucket.memories))
}

function getConceptBuckets(memories: Memory[]): Array<{ concept: string; memories: Memory[] }> {
  const visible = memories.filter(
    (memory) =>
      ['active', 'proposed'].includes(memory.metadata.status) &&
      !isNoise(memory) &&
      memory.content.trim().length > 12
  )
  const buckets = new Map<string, Memory[]>()

  for (const memory of visible) {
    const concepts = new Set<string>()
    memory.metadata.tags.forEach((tag) => {
      const concept = normalizeConcept(tag)
      if (concept) concepts.add(concept)
    })
    extractKeywords(memory.content)
      .slice(0, 6)
      .forEach((keyword) => concepts.add(keyword))

    for (const concept of concepts) {
      buckets.set(concept, [...(buckets.get(concept) ?? []), memory])
    }
  }

  return [...buckets.entries()]
    .map(([concept, bucketMemories]) => ({ concept, memories: bucketMemories }))
    .sort((a, b) => b.memories.length - a.memories.length || a.concept.localeCompare(b.concept))
}

function buildDistillationProposal(concept: string, memories: Memory[]): DistillationProposal {
  const sourceIds = memories.map((memory) => memory.metadata.id)
  const dominantType = dominant(memories.map((memory) => memory.metadata.type)) ?? 'knowledge'
  const tags = mergeTags(
    [slug(concept), 'distilled'],
    memories.flatMap((memory) => memory.metadata.tags).slice(0, 12)
  ).slice(0, 10)
  const sourceChars = memories.reduce((sum, memory) => sum + memory.content.length, 0)
  const evidence = memories.slice(0, 8).map((memory) => {
    return `- ${memory.metadata.type}/${memory.metadata.scope} ${memory.metadata.id}: ${truncate(memory.content, 180)}`
  })
  const content = [
    `${formatLabel(concept)} is a recurring PAMH project signal supported by ${memories.length} source memories.`,
    '',
    'Durable summary:',
    `- Keep ${formatLabel(concept)} concise, reviewable, and evidence-backed when it appears in LLM context.`,
    '',
    'Evidence:',
    ...evidence,
  ].join('\n')

  return {
    id: `distill-${slug(concept)}-${sourceIds.slice(0, 3).join('-')}`,
    concept: formatLabel(concept),
    type: dominantType,
    scope: 'project',
    tags,
    content,
    source_ids: sourceIds,
    source_count: memories.length,
    compression_ratio: sourceChars ? Number((content.length / sourceChars).toFixed(3)) : 1,
    reason: `${formatLabel(concept)} appears repeatedly and can be represented as one proposed synthetic memory while preserving source IDs.`,
  }
}

async function buildDistillationProposalForIds(
  basePath: string,
  sourceIds: string[],
  concept: string
): Promise<DistillationProposal | null> {
  const memories = (await listMemories(basePath)).filter((memory) =>
    sourceIds.includes(memory.metadata.id)
  )
  if (!memories.length) return null
  return buildDistillationProposal(concept, memories)
}

function findObsoletePairs(memories: Memory[]): Array<[Memory, Memory]> {
  const candidates = memories
    .filter((memory) => memory.metadata.type === 'decision' && memory.metadata.status !== 'deleted')
    .sort((a, b) => a.metadata.created_at.localeCompare(b.metadata.created_at))
  const pairs: Array<[Memory, Memory]> = []

  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const older = candidates[i]
      const newer = candidates[j]
      if (newer.metadata.supersedes === older.metadata.id) {
        pairs.push([older, newer])
        continue
      }
      const similarity = jaccard(tokens(older.content), tokens(newer.content))
      if (similarity > 0.42 && replacementLanguage(newer.content)) pairs.push([older, newer])
    }
  }

  return pairs
}

function findContradictionPairs(memories: Memory[]): Array<[Memory, Memory]> {
  const candidates = memories.filter(
    (memory) => memory.metadata.status !== 'deleted' && !isNoise(memory)
  )
  const pairs: Array<[Memory, Memory]> = []

  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const left = candidates[i]
      const right = candidates[j]
      const shared = jaccard(tokens(left.content), tokens(right.content))
      if (shared < 0.22) continue
      if (hasOpposingLanguage(left.content, right.content)) pairs.push([left, right])
    }
  }

  return pairs
}

function isLowValue(memory: Memory): boolean {
  if (isNoise(memory)) return false
  const content = memory.content.trim()
  if (memory.metadata.status === 'deleted') return false
  if (memory.metadata.scope === 'temporary') return true
  if (content.length < 24) return true
  if (/^(tmp|test|foo|bar|lorem|debug log)\b/i.test(content)) return true
  return memory.metadata.tags.some((tag) =>
    ['generated-test-fragment', 'low-value', 'scratch'].includes(tag)
  )
}

function isNoise(memory: Memory): boolean {
  return (
    memory.metadata.status === 'noise' ||
    memory.metadata.tags.includes('noise') ||
    memory.metadata.tags.includes('pamh-noise') ||
    memory.metadata.source === 'noise'
  )
}

function replacementLanguage(content: string): boolean {
  return /\b(replace[sd]?|supersede[sd]?|instead|newer|no longer|obsolete)\b/i.test(content)
}

function hasOpposingLanguage(left: string, right: string): boolean {
  const pairs = [
    [/\bmust\b|\bshould\b/i, /\bmust not\b|\bshould not\b|\bnever\b/i],
    [/\bmanual\b/i, /\bauto(matic)?\b/i],
    [/\bactive\b/i, /\bdeleted\b|\barchived\b|\bnoise\b/i],
    [/\ballow\b|\benable\b/i, /\bdeny\b|\bdisable\b|\bblock\b/i],
  ]

  return pairs.some(([a, b]) => (a.test(left) && b.test(right)) || (b.test(left) && a.test(right)))
}

async function readRecommendations(basePath: string): Promise<MemoryRecommendation[]> {
  const filePath = join(basePath, RECOMMENDATIONS_FILE)
  if (!existsSync(filePath)) return []

  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf-8')) as MemoryRecommendation[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function writeRecommendations(
  basePath: string,
  recommendations: MemoryRecommendation[]
): Promise<void> {
  await mkdir(basePath, { recursive: true })
  await writeFile(
    join(basePath, RECOMMENDATIONS_FILE),
    `${JSON.stringify(recommendations, null, 2)}\n`,
    'utf-8'
  )
}

async function setRecommendationStatus(
  basePath: string,
  id: string,
  status: RecommendationStatus
): Promise<MemoryRecommendation | null> {
  const recommendations = await readRecommendations(basePath)
  const index = recommendations.findIndex((item) => item.id === id)
  if (index === -1) return null

  recommendations[index] = {
    ...recommendations[index],
    status,
    updated_at: new Date().toISOString(),
  }
  await writeRecommendations(basePath, recommendations)
  await recordMemoryDebugEvent(basePath, {
    action: `recommendation.${status}`,
    outcome: 'ok',
    tool: 'intelligence',
    details: {
      recommendation_id: id,
      type: recommendations[index].type,
      evidence_ids: recommendations[index].evidence_ids,
    },
  })
  return recommendations[index]
}

async function getMemoryTags(basePath: string, id: string): Promise<string[]> {
  return (
    (await listMemories(basePath)).find((memory) => memory.metadata.id === id)?.metadata.tags ?? []
  )
}

function addEntity(
  entities: Map<string, KnowledgeEntity>,
  entity: KnowledgeEntity
): KnowledgeEntity {
  const existing = entities.get(entity.id)
  if (existing) {
    existing.evidence_ids = mergeTags(existing.evidence_ids, entity.evidence_ids)
    return existing
  }
  entities.set(entity.id, entity)
  return entity
}

function addRelation(
  relations: Map<string, KnowledgeRelation>,
  source: string,
  target: string,
  type: KnowledgeRelation['type'],
  evidenceIds: string[]
): void {
  const key = `${source}|${type}|${target}`
  const existing = relations.get(key)
  if (existing) {
    existing.evidence_ids = mergeTags(existing.evidence_ids, evidenceIds)
    return
  }

  relations.set(key, {
    id: generateId(),
    source,
    target,
    type,
    status: 'proposed',
    evidence_ids: mergeTags([], evidenceIds),
    explanation: `${source} ${type.replace(/_/g, ' ')} ${target} based on referenced memory evidence.`,
  })
}

function extractFiles(content: string): string[] {
  return uniqueBy(
    content.match(/[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+/g) ?? [],
    (file) => file
  ).slice(0, 8)
}

function entityTypeForMemory(type: MemoryType): KnowledgeEntity['type'] {
  const mapping: Partial<Record<MemoryType, KnowledgeEntity['type']>> = {
    client: 'person',
    decision: 'decision',
    knowledge: 'concept',
    mistake: 'mistake',
    pattern: 'concept',
    preference: 'concept',
    project: 'project',
    rule: 'rule',
    session: 'feature',
    task: 'feature',
  }

  return mapping[type] ?? 'concept'
}

function extractStacks(content: string, tags: string[]): string[] {
  const words = [
    ...tokens(content),
    ...(tags.map((tag) => normalizeConcept(tag)).filter(Boolean) as string[]),
  ]
  return uniqueBy(
    words.filter((word) => STACK_TERMS.has(word)),
    (word) => word
  ).slice(0, 8)
}

function extractKeywords(content: string): string[] {
  const counts = new Map<string, number>()
  for (const token of tokens(content)) {
    counts.set(token, (counts.get(token) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([token]) => token)
}

function tokens(content: string): string[] {
  return (
    content
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .match(/[a-z0-9][a-z0-9+#.-]{2,}/g) ?? []
  ).filter((word) => !STOP_WORDS.has(word) && !/^\d+$/.test(word))
}

function normalizeConcept(value: string): string | null {
  const normalized = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9+#.\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.#-]+|[.#-]+$/g, '')
  if (!normalized || STOP_WORDS.has(normalized)) return null
  if (normalized.length < 3 && !['ai', 'api', 'db', 'ui', 'ux'].includes(normalized)) return null
  return normalized
}

function formatLabel(value: string): string {
  const special: Record<string, string> = {
    ai: 'AI',
    api: 'API',
    db: 'DB',
    llm: 'LLM',
    mcp: 'MCP',
    sdk: 'SDK',
    sqlite: 'SQLite',
    ui: 'UI',
    ux: 'UX',
  }

  return value
    .split(/([\s-]+)/)
    .map((part) => {
      if (/^[\s-]+$/.test(part)) return part
      return special[part] ?? part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join('')
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function titleFromContent(content: string): string {
  return truncate(content.replace(/\s+/g, ' ').trim() || 'Untitled memory', 72)
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit).trim()}...`
}

function mergeTags(left: string[], right: string[]): string[] {
  return Array.from(new Set([...left, ...right].filter(Boolean)))
}

function jaccard(left: string[], right: string[]): number {
  const a = new Set(left)
  const b = new Set(right)
  const intersection = [...a].filter((item) => b.has(item)).length
  const union = new Set([...a, ...b]).size
  return union ? intersection / union : 0
}

function dominant<T extends string>(values: T[]): T | undefined {
  const counts = countValues(values)
  let best: T | undefined
  let bestCount = -1
  for (const value of values) {
    const count = counts[value] ?? 0
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

function countBy<T>(items: T[], getKey: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = getKey(item)
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
}

function countValues<T extends string>(items: T[]): Record<T, number> {
  return items.reduce<Record<T, number>>(
    (acc, item) => {
      acc[item] = (acc[item] ?? 0) + 1
      return acc
    },
    {} as Record<T, number>
  )
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = getKey(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}
