import { Command } from 'commander'
import {
  supersedeMemory,
  getSupersessionChain,
  getLatestVersion,
  getProjectMemoryPath,
  assertMemoryType,
  assertSalience,
} from '@helloworlkd/pam-core'

export function registerSupersedeCommand(program: Command) {
  const supersede = program.command('supersede').description('Memory supersession management')

  supersede
    .command('create <old_id>')
    .description('Create a new memory that supersedes an existing one')
    .option('-t, --type <type>', 'Memory type (required)')
    .option('-c, --content <content>', 'Memory content (required)')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--salience <salience>', 'Importance score (0-1)', '0.5')
    .action(async (oldId, options) => {
      if (!options.type || !options.content) {
        console.error('Error: --type and --content are required')
        process.exit(1)
      }

      const basePath = getProjectMemoryPath(process.cwd())

      const type = assertMemoryType(options.type)
      const tags = options.tags ? options.tags.split(',').map((t: string) => t.trim()) : []
      let salience: number
      try {
        salience = assertSalience(options.salience)
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error))
        process.exit(1)
      }

      const result = await supersedeMemory(basePath, oldId, {
        type,
        scope: 'project',
        content: options.content,
        tags,
        salience,
        source: 'manual',
      })

      if (!result) {
        console.error(`Memory not found: ${oldId}`)
        process.exit(1)
      }

      console.log(`Superseded ${oldId} with ${result.newMemory.metadata.id}`)
      console.log(`\nOld pam archived: ${result.oldMemory.metadata.id}`)
      console.log(`New memory created: ${result.newMemory.metadata.id}`)
    })

  supersede
    .command('chain <memory_id>')
    .description('Show the supersession chain for a memory')
    .action(async (memoryId) => {
      const basePath = getProjectMemoryPath(process.cwd())

      const chain = await getSupersessionChain(basePath, memoryId)

      if (chain.length === 0) {
        console.log(`Memory not found: ${memoryId}`)
        return
      }

      console.log(`Supersession chain (${chain.length} versions):\n`)
      chain.forEach((memory, index) => {
        const arrow = index < chain.length - 1 ? '→' : ' '
        console.log(`${arrow} ${memory.metadata.id} (${memory.metadata.status})`)
        console.log(`  Created: ${memory.metadata.created_at}`)
        console.log(`  Content: ${memory.content.substring(0, 80)}...`)
        console.log('')
      })
    })

  supersede
    .command('latest <memory_id>')
    .description('Get the latest version of a memory')
    .action(async (memoryId) => {
      const basePath = getProjectMemoryPath(process.cwd())

      const latest = await getLatestVersion(basePath, memoryId)

      if (!latest) {
        console.log(`Memory not found: ${memoryId}`)
        return
      }

      console.log(`Latest version: ${latest.metadata.id}`)
      console.log(`Status: ${latest.metadata.status}`)
      console.log(`Created: ${latest.metadata.created_at}`)
      console.log(`\nContent:\n${latest.content}`)
    })
}
