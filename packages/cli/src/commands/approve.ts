import { Command } from 'commander'
import { approveMemory, getProjectMemoryPath } from '@supersekai64/pam-core'

export function registerApproveCommand(program: Command) {
  program
    .command('approve <id>')
    .description('Approve a proposed memory')
    .action(async (id) => {
      const basePath = getProjectMemoryPath(process.cwd())

      const approved = await approveMemory(basePath, id)

      if (!approved) {
        console.error(`Memory not found or not proposed: ${id}`)
        process.exit(1)
      }

      console.log(`Memory approved: ${id}`)
    })
}
