import { Command } from 'commander'
import { listMemories, MemoryIndex, getProjectMemoryPath } from '@supersekai64/pam-core'

export function registerAuditCommand(program: Command) {
  program
    .command('audit')
    .description('Display memory statistics and audit information')
    .action(async () => {
      const basePath = getProjectMemoryPath(process.cwd())

      const memories = await listMemories(basePath)

      const total = memories.length
      const active = memories.filter((m) => m.metadata.status === 'active').length
      const deleted = memories.filter((m) => m.metadata.status === 'deleted').length
      const archived = memories.filter((m) => m.metadata.status === 'archived').length

      const byType: Record<string, number> = {}
      const byScope: Record<string, number> = {}
      const allTags: Record<string, number> = {}

      for (const memory of memories) {
        byType[memory.metadata.type] = (byType[memory.metadata.type] || 0) + 1
        byScope[memory.metadata.scope] = (byScope[memory.metadata.scope] || 0) + 1

        for (const tag of memory.metadata.tags) {
          allTags[tag] = (allTags[tag] || 0) + 1
        }
      }

      console.log('\n=== Memory Audit ===\n')
      console.log(`Total memories: ${total}`)
      console.log(`  Active: ${active}`)
      console.log(`  Deleted: ${deleted}`)
      console.log(`  Archived: ${archived}`)

      if (Object.keys(byType).length > 0) {
        console.log('\nBy type:')
        for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
          console.log(`  ${type}: ${count}`)
        }
      }

      if (Object.keys(byScope).length > 0) {
        console.log('\nBy scope:')
        for (const [scope, count] of Object.entries(byScope).sort((a, b) => b[1] - a[1])) {
          console.log(`  ${scope}: ${count}`)
        }
      }

      if (Object.keys(allTags).length > 0) {
        console.log('\nTop tags:')
        const sortedTags = Object.entries(allTags)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
        for (const [tag, count] of sortedTags) {
          console.log(`  ${tag}: ${count}`)
        }
      }

      try {
        const index = new MemoryIndex(basePath)
        const stats = index.getStats()
        index.close()

        console.log(`\nIndex status:`)
        console.log(`  Indexed: ${stats.total}`)
        console.log(`  Active in index: ${stats.active}`)
      } catch {
        console.log('\nIndex status: not available')
      }
    })
}
