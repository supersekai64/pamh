import { Command } from 'commander'
import { exportMemories, getProjectMemoryPath } from '@supersekai64/pam-core'
import { resolve } from 'node:path'

export function registerExportCommand(program: Command) {
  program
    .command('export <output>')
    .description('Export memories to a file')
    .option('-f, --format <format>', 'Export format (zip, json, markdown, sqlite)', 'zip')
    .action(async (output, options) => {
      const basePath = getProjectMemoryPath(process.cwd())
      const outputPath = resolve(output)

      console.log(`Exporting memories to ${outputPath}...`)

      try {
        await exportMemories({
          format: options.format,
          outputPath,
          basePath,
        })

        console.log(`Export completed: ${outputPath}`)
      } catch (error) {
        console.error(`Export failed: ${error}`)
        process.exit(1)
      }
    })
}
