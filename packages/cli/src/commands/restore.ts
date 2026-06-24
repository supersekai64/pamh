import { Command } from 'commander'
import { restoreMemory, getProjectMemoryPath } from '@helloworlkd/pam-core'

export function registerRestoreCommand(program: Command) {
  program
    .command('restore <id>')
    .description('Restore a deleted memory')
    .action(async (id) => {
      const basePath = getProjectMemoryPath(process.cwd())

      const restored = await restoreMemory(basePath, id)

      if (!restored) {
        console.error(`Memory not found or not deleted: ${id}`)
        process.exit(1)
      }

      console.log(`Memory restored: ${id}`)
    })
}
