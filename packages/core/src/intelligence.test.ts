import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  analyzeDistillation,
  applyDistillationProposal,
  buildKnowledgeGraph,
  createMemory,
  generateRecommendations,
  initProjectMemory,
  readMemory,
  seedIntelligenceEvaluationDataset,
} from './index.js'

describe('intelligence layer', () => {
  let tempDir: string
  let memoryPath: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pamh-intelligence-test-'))
    memoryPath = await initProjectMemory(tempDir)
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('creates distilled proposed memories with preserved source ids', async () => {
    const first = await createMemory(memoryPath, {
      type: 'preference',
      scope: 'project',
      status: 'active',
      tags: ['ui-density'],
      content: 'The UI should use dense operational layouts for repeated review workflows.',
    })
    const second = await createMemory(memoryPath, {
      type: 'preference',
      scope: 'project',
      status: 'active',
      tags: ['ui-density'],
      content: 'Dense operational UI helps memory review stay fast and scannable.',
    })
    const third = await createMemory(memoryPath, {
      type: 'preference',
      scope: 'project',
      status: 'active',
      tags: ['ui-density'],
      content: 'Memory governance screens should remain compact and easy to scan.',
    })

    const proposals = await analyzeDistillation(memoryPath)
    const proposal = proposals.find((item) => item.source_ids.includes(first.metadata.id))
    expect(proposal?.source_count).toBe(3)

    const distilled = await applyDistillationProposal(memoryPath, proposal!)
    const reloaded = await readMemory(memoryPath, distilled.metadata.id)

    expect(reloaded?.metadata.status).toBe('proposed')
    expect(reloaded?.metadata.source).toBe('distillation')
    expect(reloaded?.metadata.source_ids?.sort()).toEqual(
      [first.metadata.id, second.metadata.id, third.metadata.id].sort()
    )
  })

  it('generates reviewable recommendations and a graph with evidence-backed relations', async () => {
    await createMemory(memoryPath, {
      type: 'decision',
      scope: 'project',
      status: 'active',
      tags: ['mcp', 'openai-sdk'],
      content: 'API decisions use the OpenAI SDK and apply to packages/api/src/server.ts.',
    })
    await createMemory(memoryPath, {
      type: 'session',
      scope: 'temporary',
      status: 'active',
      tags: ['generated-test-fragment'],
      content: 'tmp log',
    })

    const report = await generateRecommendations(memoryPath)
    expect(report.recommendations.some((item) => item.type === 'noise_candidate')).toBe(true)

    const graph = await buildKnowledgeGraph(memoryPath)
    expect(graph.relations.some((relation) => relation.type === 'uses')).toBe(true)
    expect(graph.relations.every((relation) => relation.evidence_ids.length > 0)).toBe(true)
  })

  it('seeds the shared evaluation dataset', async () => {
    const result = await seedIntelligenceEvaluationDataset(memoryPath)

    expect(result.categories.active).toBe(150)
    expect(result.categories.near_duplicates).toBe(30)
    expect(result.categories.graph_relations).toBe(30)
    expect(result.created).toBe(270)
  })
})
