import { Command } from 'commander'
import { listMemories, getProjectMemoryPath } from '@supersekai64/pam-core'

export function registerListCommand(program: Command) {
  program
    .command('list')
    .description('List all memories')
    .option('--type <type>', 'Filter by type')
    .option('--tag <tag>', 'Filter by tag')
    .option('--status <status>', 'Filter by status')
    .action(async (options) => {
      const basePath = getProjectMemoryPath(process.cwd())

      let memories = await listMemories(basePath)

      if (options.type) {
        memories = memories.filter((m) => m.metadata.type === options.type)
      }
      if (options.tag) {
        memories = memories.filter((m) => m.metadata.tags.includes(options.tag))
      }
      if (options.status) {
        memories = memories.filter((m) => m.metadata.status === options.status)
      }

      if (memories.length === 0) {
        console.log('No memories found')
        return
      }

      for (const memory of memories) {
        const { id, type, scope, status, tags } = memory.metadata
        const preview = memory.content.slice(0, 50).replace(/\n/g, ' ')
        const tagStr = tags.length > 0 ? ` [${tags.join(', ')}]` : ''
        console.log(`${id} | ${type} | ${scope} | ${status}${tagStr} | ${preview}...`)
      }

      console.log(`\nTotal: ${memories.length} memories`)
    })
}
