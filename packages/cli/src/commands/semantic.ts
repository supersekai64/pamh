import { Command } from 'commander'
import {
  SemanticIndex,
  listMemories,
  readMemory,
  getProjectMemoryPath,
} from '@helloworlkd/pam-core'

export function registerSemanticCommand(program: Command) {
  program
    .command('semantic-search <query>')
    .description('Search memories using semantic similarity')
    .option('-l, --limit <number>', 'Maximum number of results', '10')
    .action(async (query: string, options) => {
      const basePath = getProjectMemoryPath(process.cwd())
      const limit = parseInt(options.limit, 10)

      console.log(`Searching semantically for: "${query}"`)
      console.log('Loading embedding provider (first local run may take a moment)...\n')

      try {
        const semanticIndex = new SemanticIndex(basePath)
        const memories = (await listMemories(basePath)).filter(
          (memory) => memory.metadata.status === 'active'
        )

        for (const memory of memories) {
          await semanticIndex.indexMemory(memory.metadata.id, memory.content)
        }

        const results = await semanticIndex.search(query, limit)

        if (results.length === 0) {
          console.log('No results found.')
          semanticIndex.close()
          return
        }

        console.log(`Found ${results.length} result(s):\n`)

        for (const result of results) {
          const memory = await readMemory(basePath, result.id)

          if (!memory) {
            continue
          }

          const score = (result.score * 100).toFixed(1)
          const preview = memory.content.slice(0, 100).replace(/\n/g, ' ')

          console.log(`[${score}%] ${memory.metadata.id}`)
          console.log(`  Type: ${memory.metadata.type} | Scope: ${memory.metadata.scope}`)
          console.log(`  Tags: ${memory.metadata.tags.join(', ') || 'none'}`)
          console.log(`  Preview: ${preview}...`)
          console.log()
        }

        semanticIndex.close()
      } catch (error) {
        console.error('Error during semantic search:', formatSemanticError(error))
        process.exit(1)
      }
    })
}

function formatSemanticError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
