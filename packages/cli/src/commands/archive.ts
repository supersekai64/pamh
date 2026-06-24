import { Command } from 'commander'
import { archiveMemory, getProjectMemoryPath } from '@supersekai64/pam-core'

export function registerArchiveCommand(program: Command) {
  program
    .command('archive <id>')
    .description('Archive a memory')
    .action(async (id) => {
      const basePath = getProjectMemoryPath(process.cwd())

      const archived = await archiveMemory(basePath, id)

      if (!archived) {
        console.error(`Memory not found or already archived: ${id}`)
        process.exit(1)
      }

      console.log(`Memory archived: ${id}`)
    })
}
