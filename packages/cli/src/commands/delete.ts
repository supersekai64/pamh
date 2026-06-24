import { Command } from 'commander'
import { backupMemory, deleteMemory, getProjectMemoryPath } from '@supersekai64/pam-core'

export function registerDeleteCommand(program: Command) {
  program
    .command('delete <id>')
    .description('Delete a memory')
    .option('--physical', 'Physically remove the Markdown file and index row')
    .option('--yes', 'Confirm physical deletion in non-interactive runs')
    .action(async (id, options) => {
      const basePath = getProjectMemoryPath(process.cwd())

      if (options.physical && !options.yes) {
        console.error(`Physical deletion requires --yes. Memory not deleted: ${id}`)
        process.exit(1)
      }

      const backupPath = options.physical
        ? await backupMemory(basePath, id, 'physical-delete')
        : null
      const deleted = await deleteMemory(basePath, id, {
        physical: options.physical,
        backup: !backupPath,
      })

      if (!deleted) {
        console.error(`Memory not found: ${id}`)
        process.exit(1)
      }

      console.log(options.physical ? `Memory physically deleted: ${id}` : `Memory deleted: ${id}`)
      if (backupPath) {
        console.log(`Backup written: ${backupPath}`)
      }
    })
}
