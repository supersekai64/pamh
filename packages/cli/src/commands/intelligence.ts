import { Command } from 'commander'
import {
  analyzeCleanup,
  analyzeDistillation,
  applyDistillationProposal,
  applyRecommendation,
  buildKnowledgeGraph,
  deferRecommendation,
  generateRecommendations,
  getProjectMemoryPath,
  listRecommendations,
  rejectRecommendation,
  seedIntelligenceEvaluationDataset,
  type DistillationProposal,
  type MemoryRecommendation,
} from '@supersekai64/pam-core'

interface StoreOptions {
  project?: boolean
  json?: boolean
}

export function registerIntelligenceCommand(program: Command) {
  const intelligence = program
    .command('intelligence')
    .description('Analyze memory quality, recommendations, distillation, cleanup, and graph')

  intelligence
    .command('recommend')
    .description('Generate reviewable AI maintenance recommendations')
    .option('--json', 'Print JSON')
    .action(async (options: StoreOptions) => {
      const report = await generateRecommendations(resolveBasePath(options))
      if (options.json) return printJson(report)
      printRecommendations(report.recommendations)
      console.log(`\nOpen recommendations: ${report.metrics.proposed_recommendations}`)
    })

  intelligence
    .command('list')
    .description('List stored recommendations')
    .option('--json', 'Print JSON')
    .action(async (options: StoreOptions) => {
      const recommendations = await listRecommendations(resolveBasePath(options))
      if (options.json) return printJson(recommendations)
      printRecommendations(recommendations)
    })

  intelligence
    .command('apply <id>')
    .description('Accept and apply a recommendation')
    .option('--confirm-physical-delete', 'Allow a physical delete recommendation to delete files')
    .option('--json', 'Print JSON')
    .action(async (id, options: StoreOptions & { confirmPhysicalDelete?: boolean }) => {
      const result = await applyRecommendation(resolveBasePath(options), id, {
        confirmPhysicalDelete: options.confirmPhysicalDelete,
      })
      if (options.json) return printJson(result)
      console.log(`Applied recommendation ${result.recommendation.id}`)
      if (result.memory) console.log(`Created/updated memory: ${result.memory.metadata.id}`)
    })

  intelligence
    .command('reject <id>')
    .description('Reject a recommendation so it does not immediately reappear')
    .action(async (id, options: StoreOptions) => {
      const recommendation = await rejectRecommendation(resolveBasePath(options), id)
      if (!recommendation) {
        console.error(`Recommendation not found: ${id}`)
        process.exit(1)
      }
      console.log(`Rejected recommendation ${id}`)
    })

  intelligence
    .command('defer <id>')
    .description('Defer a recommendation')
    .action(async (id, options: StoreOptions) => {
      const recommendation = await deferRecommendation(resolveBasePath(options), id)
      if (!recommendation) {
        console.error(`Recommendation not found: ${id}`)
        process.exit(1)
      }
      console.log(`Deferred recommendation ${id}`)
    })

  intelligence
    .command('cleanup')
    .description('Preview grouped cleanup recommendations')
    .option('--json', 'Print JSON')
    .action(async (options: StoreOptions) => {
      const cleanup = await analyzeCleanup(resolveBasePath(options))
      if (options.json) return printJson(cleanup)
      const groups = groupBy(cleanup, (item) => item.action)
      for (const [action, items] of Object.entries(groups)) {
        console.log(`\n${action} (${items.length})`)
        printRecommendations(
          items.map((item) => item.recommendation),
          '  '
        )
      }
    })

  intelligence
    .command('distill')
    .description('Preview distillation proposals, or create distilled memories with --apply')
    .option('--apply', 'Create distilled memories')
    .option('--json', 'Print JSON')
    .action(async (options: StoreOptions & { apply?: boolean }) => {
      const basePath = resolveBasePath(options)
      const proposals = await analyzeDistillation(basePath)
      if (options.apply) {
        const created = []
        for (const proposal of proposals) {
          created.push(await applyDistillationProposal(basePath, proposal))
        }
        if (options.json) return printJson({ proposals, created })
        console.log(`Created ${created.length} distilled memories`)
        return
      }
      if (options.json) return printJson(proposals)
      printDistillationProposals(proposals)
    })

  intelligence
    .command('graph')
    .description('Preview the Knowledge Graph with typed evidence-backed relations')
    .option('--json', 'Print JSON')
    .action(async (options: StoreOptions) => {
      const graph = await buildKnowledgeGraph(resolveBasePath(options))
      if (options.json) return printJson(graph)
      console.log(`Entities: ${graph.metrics.entity_count}`)
      console.log(`Relations: ${graph.metrics.relation_count}`)
      console.log(`Evidence coverage: ${Math.round(graph.metrics.evidence_coverage * 100)}%`)
      graph.relations.slice(0, 25).forEach((relation) => {
        console.log(
          `${relation.id} | ${relation.type} | ${relation.source} -> ${relation.target} | evidence ${relation.evidence_ids.join(', ')}`
        )
      })
    })

  intelligence
    .command('seed-eval')
    .description('Create the shared intelligence evaluation dataset')
    .option('--json', 'Print JSON')
    .action(async (options: StoreOptions) => {
      const result = await seedIntelligenceEvaluationDataset(resolveBasePath(options))
      if (options.json) return printJson(result)
      console.log(`Created ${result.created} evaluation memories`)
      for (const [category, count] of Object.entries(result.categories)) {
        console.log(`  ${category}: ${count}`)
      }
    })
}

function resolveBasePath(options: StoreOptions): string {
  void options
  return getProjectMemoryPath(process.cwd())
}

function printRecommendations(recommendations: MemoryRecommendation[], indent = ''): void {
  if (!recommendations.length) {
    console.log(`${indent}No recommendations`)
    return
  }

  for (const recommendation of recommendations) {
    console.log(
      `${indent}${recommendation.id} | ${recommendation.status} | ${recommendation.type} | ${recommendation.action ?? 'inspect'}`
    )
    console.log(`${indent}  ${recommendation.title}`)
    console.log(`${indent}  Evidence: ${recommendation.evidence_ids.join(', ') || 'none'}`)
  }
}

function printDistillationProposals(proposals: DistillationProposal[]): void {
  if (!proposals.length) {
    console.log('No distillation proposals')
    return
  }

  for (const proposal of proposals) {
    console.log(`${proposal.id} | ${proposal.type} | ${proposal.source_count} sources`)
    console.log(`  ${proposal.concept} | compression ratio ${proposal.compression_ratio}`)
    console.log(`  Sources: ${proposal.source_ids.slice(0, 12).join(', ')}`)
  }
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2))
}

function groupBy<T>(items: T[], getKey: (item: T) => string): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const key = getKey(item)
    acc[key] = [...(acc[key] ?? []), item]
    return acc
  }, {})
}
