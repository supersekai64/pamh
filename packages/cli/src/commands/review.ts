import { Command } from 'commander'
import { getProjectMemoryPath, listMemories } from '@helloworlkd/pam-core'

export function registerReviewCommand(program: Command) {
  program
    .command('review')
    .description('Show proposed memories waiting for approval')
    .option('--limit <limit>', 'Maximum proposed memories to show', '20')
    .action(async (options) => {
      const basePath = getProjectMemoryPath(process.cwd())
      const limit = Number.parseInt(options.limit, 10)
      const memories = (await listMemories(basePath))
        .filter((memory) => memory.metadata.status === 'proposed')
        .sort((a, b) => b.metadata.updated_at.localeCompare(a.metadata.updated_at))
        .slice(0, Number.isFinite(limit) ? limit : 20)

      if (memories.length === 0) {
        console.log('No proposed memories waiting for review.')
        return
      }

      console.log(`Proposed memories (${memories.length} shown):\n`)
      for (const memory of memories) {
        const preview = memory.content.replace(/\s+/g, ' ').slice(0, 120)
        console.log(`${memory.metadata.id} | ${memory.metadata.type} | ${preview}...`)
      }
      console.log('\nApprove with `pam approve <id>` or open `pam ui`.')
    })
}
