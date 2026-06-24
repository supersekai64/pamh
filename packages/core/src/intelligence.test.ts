import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  analyzeDistillation,
  applyDistillationProposal,
  buildKnowledgeGraph,
  createMemory,
  generateRecommendations,
  initProjectMemory,
  preferContradictionRecommendation,
  readMemory,
  seedIntelligenceEvaluationDataset,
} from './index.js'

describe('intelligence layer', () => {
  let tempDir: string
  let memoryPath: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pam-intelligence-test-'))
    memoryPath = await initProjectMemory(tempDir)
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('creates active distilled memories with preserved source ids', async () => {
    const first = await createMemory(memoryPath, {
      type: 'preference',
      scope: 'project',
      status: 'active',
      tags: ['ui-density'],
      content: 'The UI should use dense operational layouts for repeated evidence workflows.',
    })
    const second = await createMemory(memoryPath, {
      type: 'preference',
      scope: 'project',
      status: 'active',
      tags: ['ui-density'],
      content: 'Dense operational UI helps pam review stay fast and scannable.',
    })
    const third = await createMemory(memoryPath, {
      type: 'preference',
      scope: 'project',
      status: 'active',
      tags: ['ui-density'],
      content: 'Memory maintenance screens should remain compact and easy to scan.',
    })

    const proposals = await analyzeDistillation(memoryPath)
    const proposal = proposals.find((item) => item.source_ids.includes(first.metadata.id))
    expect(proposal?.source_count).toBe(3)

    const distilled = await applyDistillationProposal(memoryPath, proposal!)
    const reloaded = await readMemory(memoryPath, distilled.metadata.id)

    expect(reloaded?.metadata.status).toBe('active')
    expect(reloaded?.metadata.source).toBe('distillation')
    expect(reloaded?.metadata.source_ids?.sort()).toEqual(
      [first.metadata.id, second.metadata.id, third.metadata.id].sort()
    )
  })

  it('activates an existing proposed distillation when auto apply sees the same sources', async () => {
    const sourceIds: string[] = []
    for (let index = 0; index < 3; index += 1) {
      const memory = await createMemory(memoryPath, {
        type: 'knowledge',
        scope: 'project',
        status: 'active',
        tags: ['legacy-distillation'],
        content: `Legacy distillation source ${index + 1} should consolidate automatically.`,
      })
      sourceIds.push(memory.metadata.id)
    }

    const proposal = (await analyzeDistillation(memoryPath)).find((item) =>
      sourceIds.every((id) => item.source_ids.includes(id))
    )
    expect(proposal).toBeDefined()

    const proposed = await applyDistillationProposal(memoryPath, proposal!, 'proposed')
    const activated = await applyDistillationProposal(memoryPath, proposal!)

    expect(activated.metadata.id).toBe(proposed.metadata.id)
    expect(activated.metadata.status).toBe('active')
  })

  it('does not propose distillation for French stopword pseudo-concepts', async () => {
    const contents = [
      'La sauvegarde localStorage est supprimée quand la grille est terminée.',
      'Le serveur de développement Sudoku est lancé avec PAM installé.',
      'Le stockage PAM du projet est dans le dossier local avec la configuration.',
      'Le projet est situé dans Documents avec une mémoire initialisée.',
      'Vérifier avec PAM que la mémoire durable est proposée dans le projet.',
    ]

    for (const content of contents) {
      await createMemory(memoryPath, {
        type: 'knowledge',
        scope: 'project',
        status: 'proposed',
        tags: [],
        content,
      })
    }

    const proposals = await analyzeDistillation(memoryPath)
    const concepts = proposals.map((proposal) => proposal.concept.toLowerCase())

    expect(concepts).not.toContain('est')
    expect(concepts).not.toContain('avec')
    expect(concepts).not.toContain('dans')
  })

  it('prunes stored recommendations with invalid stopword concepts', async () => {
    const staleRecommendation = {
      id: 'rec_stale_est',
      type: 'distill_candidates',
      status: 'proposed',
      title: 'Distill 5 memories about Est',
      explanation: 'Est appears repeatedly.',
      evidence_ids: [],
      action: 'merge_or_distill',
      payload: { concept: 'Est', source_ids: [] },
      fingerprint: 'distill_candidates|merge_or_distill||Est',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    await writeFile(
      join(memoryPath, 'recommendations.json'),
      `${JSON.stringify([staleRecommendation], null, 2)}\n`,
      'utf-8'
    )

    const report = await generateRecommendations(memoryPath)
    const stored = JSON.parse(
      await readFile(join(memoryPath, 'recommendations.json'), 'utf-8')
    ) as unknown[]

    expect(report.recommendations.map((item) => item.id)).not.toContain(staleRecommendation.id)
    expect(stored).toEqual([])
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
      scope: 'project',
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

  it('uses readable content titles for memory entities in the knowledge graph', async () => {
    const source = await createMemory(memoryPath, {
      type: 'decision',
      scope: 'project',
      status: 'active',
      title: 'Import collision policy',
      tags: ['import'],
      content: 'Import collision handling should preserve replacement history.',
    })
    const distilled = await createMemory(memoryPath, {
      type: 'knowledge',
      scope: 'project',
      status: 'active',
      tags: ['import', 'distilled'],
      source_ids: [source.metadata.id],
      content: 'Import is a recurring PAM project signal supported by source memories.',
    })

    const graph = await buildKnowledgeGraph(memoryPath)
    const sourceEntity = graph.entities.find(
      (entity) => entity.id === `memory:${source.metadata.id}`
    )
    const distilledEntity = graph.entities.find(
      (entity) => entity.id === `memory:${distilled.metadata.id}`
    )

    expect(sourceEntity?.label).toBe('Import collision policy')
    expect(distilledEntity?.label).toBe(
      'Import is a recurring PAM project signal supported by source memories'
    )
    expect(sourceEntity?.label).not.toBe(source.metadata.id)
    expect(distilledEntity?.label).not.toBe(distilled.metadata.id)
  })

  it('resolves contradiction recommendations by preferring one memory', async () => {
    const left = await createMemory(memoryPath, {
      type: 'decision',
      scope: 'project',
      status: 'active',
      tags: ['capture-mode'],
      content: 'Capture mode should allow automatic pam capture for project decisions.',
    })
    const right = await createMemory(memoryPath, {
      type: 'decision',
      scope: 'project',
      status: 'active',
      tags: ['capture-mode'],
      content: 'Capture mode should deny automatic pam capture for project decisions.',
    })

    const report = await generateRecommendations(memoryPath)
    const recommendation = report.recommendations.find(
      (item) =>
        item.type === 'contradiction' &&
        item.evidence_ids.includes(left.metadata.id) &&
        item.evidence_ids.includes(right.metadata.id)
    )

    expect(recommendation).toBeDefined()

    const result = await preferContradictionRecommendation(
      memoryPath,
      recommendation!.id,
      right.metadata.id
    )
    const preferred = await readMemory(memoryPath, right.metadata.id)
    const archived = await readMemory(memoryPath, left.metadata.id)

    expect(result.recommendation.status).toBe('accepted')
    expect(preferred?.metadata.status).toBe('active')
    expect(archived?.metadata.status).toBe('archived')
    expect(archived?.metadata.superseded_by).toBe(right.metadata.id)
    expect(archived?.metadata.tags).toContain('pam-contradiction-resolved')
  })

  it('ignores archived memories when building actionable contradiction signals', async () => {
    const archived = await createMemory(memoryPath, {
      type: 'decision',
      scope: 'project',
      status: 'archived',
      tags: ['capture-mode'],
      content: 'Capture mode should allow automatic pam capture for project decisions.',
    })
    const active = await createMemory(memoryPath, {
      type: 'decision',
      scope: 'project',
      status: 'active',
      tags: ['capture-mode'],
      content: 'Capture mode should deny automatic pam capture for project decisions.',
    })

    const report = await generateRecommendations(memoryPath)
    expect(
      report.recommendations.some(
        (item) =>
          item.type === 'contradiction' &&
          item.evidence_ids.includes(archived.metadata.id) &&
          item.evidence_ids.includes(active.metadata.id)
      )
    ).toBe(false)

    const graph = await buildKnowledgeGraph(memoryPath)
    expect(
      graph.relations.some(
        (relation) =>
          relation.type === 'contradicts' &&
          relation.evidence_ids.includes(archived.metadata.id) &&
          relation.evidence_ids.includes(active.metadata.id)
      )
    ).toBe(false)
  })

  it('does not treat session summaries as contradiction guidance', async () => {
    const decision = await createMemory(memoryPath, {
      type: 'decision',
      scope: 'project',
      status: 'proposed',
      tags: ['knowledge-graph'],
      content: 'Knowledge Graph should default to active evidence and expose full history.',
    })
    const session = await createMemory(memoryPath, {
      type: 'session',
      scope: 'project',
      status: 'proposed',
      tags: ['knowledge-graph'],
      content:
        'Implemented active evidence and full history modes while filtering archived and deleted memories from active cleanup.',
    })

    const report = await generateRecommendations(memoryPath)
    expect(
      report.recommendations.some(
        (item) =>
          item.type === 'contradiction' &&
          item.evidence_ids.includes(decision.metadata.id) &&
          item.evidence_ids.includes(session.metadata.id)
      )
    ).toBe(false)

    const graph = await buildKnowledgeGraph(memoryPath)
    expect(
      graph.relations.some(
        (relation) =>
          relation.type === 'contradicts' &&
          relation.evidence_ids.includes(decision.metadata.id) &&
          relation.evidence_ids.includes(session.metadata.id)
      )
    ).toBe(false)
  })

  it('does not distill concepts that only exist in proposed memories', async () => {
    for (let index = 0; index < 5; index += 1) {
      await createMemory(memoryPath, {
        type: 'knowledge',
        scope: 'project',
        status: 'proposed',
        tags: ['checkpoint-only'],
        content: `Checkpoint-only proposed memory ${index + 1} should wait for review.`,
      })
    }

    const report = await generateRecommendations(memoryPath)

    expect(
      report.recommendations.some(
        (item) =>
          (item.type === 'distill_candidates' || item.type === 'strong_concept') &&
          item.payload?.concept === 'Checkpoint-Only'
      )
    ).toBe(false)
    expect(report.metrics.source_preservation_rate).toBe(1)
  })

  it('seeds the shared evaluation dataset', async () => {
    const result = await seedIntelligenceEvaluationDataset(memoryPath)

    expect(result.categories.active).toBe(150)
    expect(result.categories.near_duplicates).toBe(30)
    expect(result.categories.graph_relations).toBe(30)
    expect(result.created).toBe(270)
  }, 15000)
})
