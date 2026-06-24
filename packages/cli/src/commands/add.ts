import { Command } from 'commander'
import {
  createMemory,
  getProjectMemoryPath,
  MEMORY_TYPES,
  assertSalience,
} from '@helloworlkd/pam-core'

export function registerAddCommand(program: Command) {
  program
    .command('add')
    .description('Add a new memory')
    .requiredOption('-t, --type <type>', `Memory type (${MEMORY_TYPES.join(', ')})`)
    .requiredOption('-c, --content <content>', 'Memory content')
    .option('--title <title>', 'Short display title')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--concepts <concepts>', 'Comma-separated broad canonical concepts')
    .option('--salience <score>', 'Importance score (0-1, default: 0.5)', '0.5')
    .action(async (options) => {
      if (!MEMORY_TYPES.includes(options.type)) {
        console.error(`Invalid type. Must be one of: ${MEMORY_TYPES.join(', ')}`)
        process.exit(1)
      }

      const basePath = getProjectMemoryPath(process.cwd())

      const tags = options.tags ? options.tags.split(',').map((t: string) => t.trim()) : []
      const concepts = options.concepts
        ? options.concepts.split(',').map((concept: string) => concept.trim())
        : undefined
      let salience: number
      try {
        salience = assertSalience(options.salience)
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error))
        process.exit(1)
      }

      const memory = await createMemory(basePath, {
        type: options.type,
        scope: 'project',
        title: options.title,
        content: options.content,
        tags,
        concepts,
        salience,
      })

      console.log(`Memory created: ${memory.metadata.id}`)
    })
}
