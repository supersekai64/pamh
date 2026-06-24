import { Command } from 'commander'
import { rejectMemory, getProjectMemoryPath } from '@supersekai64/pam-core'

export function registerRejectCommand(program: Command) {
  program
    .command('reject <id>')
    .description('Reject a proposed memory')
    .action(async (id) => {
      const basePath = getProjectMemoryPath(process.cwd())

      const rejected = await rejectMemory(basePath, id)

      if (!rejected) {
        console.error(`Memory not found or not proposed: ${id}`)
        process.exit(1)
      }

      console.log(`Memory rejected: ${id}`)
    })
}
