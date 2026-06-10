import { Command } from 'commander'
import { findMemoryBase, getGlobalMemoryPath, listMemories } from '@pamh/core'
import { existsSync } from 'node:fs'

export function registerStatusCommand(program: Command) {
  program
    .command('status')
    .description('Show current memory status')
    .action(async () => {
      const cwd = process.cwd()
      const memoryPath = findMemoryBase(cwd)
      const globalPath = getGlobalMemoryPath()

      console.log(`Using memory: ${memoryPath ?? 'none'}`)
      console.log(`Global memory: ${existsSync(globalPath) ? globalPath : 'not initialized'}`)

      if (memoryPath) {
        const memories = await listMemories(memoryPath)
        const active = memories.filter((m) => m.metadata.status === 'active').length
        const proposed = memories.filter((m) => m.metadata.status === 'proposed').length
        const archived = memories.filter((m) => m.metadata.status === 'archived').length
        const deleted = memories.filter((m) => m.metadata.status === 'deleted').length
        console.log(
          `Memories: ${active} active, ${proposed} proposed, ${archived} archived, ${deleted} deleted`
        )
      }
    })
}
