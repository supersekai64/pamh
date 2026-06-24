import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Command } from 'commander'
import {
  checkIndexConsistency,
  findMemoryBase,
  listMemories,
  loadAutoCaptureConfig,
} from '@supersekai64/pam-core'

export function registerStatusCommand(program: Command) {
  program
    .command('status')
    .description('Show current pam status')
    .option('--verbose', 'Show integration, capture, and index details')
    .action(async (options) => {
      const cwd = process.cwd()
      const memoryPath = findMemoryBase(cwd)

      console.log(`Using memory: ${memoryPath ?? 'none'}`)

      if (!memoryPath) {
        console.log('Run `pam init` to create project memory.')
        return
      }

      const memories = await listMemories(memoryPath)
      const active = memories.filter((m) => m.metadata.status === 'active').length
      const proposed = memories.filter((m) => m.metadata.status === 'proposed').length
      const archived = memories.filter((m) => m.metadata.status === 'archived').length
      const deleted = memories.filter((m) => m.metadata.status === 'deleted').length
      console.log(
        `Memories: ${active} active, ${proposed} proposed, ${archived} archived, ${deleted} deleted`
      )

      if (proposed > 0) {
        console.log(
          `Review-mode queue: ${proposed} proposed memories waiting (run \`pam review\` if you intentionally use assisted mode)`
        )
      }

      if (options.verbose) {
        const config = await loadAutoCaptureConfig(memoryPath)
        const report = await checkIndexConsistency(memoryPath)
        console.log('\nVerbose status:')
        console.log(`  Capture mode: ${config.mode}`)
        console.log(`  Index: ${report.totalIndexed}/${report.totalFiles} indexed`)
        console.log(
          `  Index issues: ${report.missingInIndex.length + report.missingInFiles.length}`
        )
        console.log(`  Claude hooks: ${existsSync(join(cwd, '.claude', 'settings.json'))}`)
        console.log(`  MCP config: ${existsSync(join(cwd, '.mcp.json'))}`)
        console.log('  UI: run `pam ui` (default http://127.0.0.1:3939)')
      }
    })
}
