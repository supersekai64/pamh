import { Command } from 'commander'
import { readMemory, getProjectMemoryPath } from '@helloworlkd/pam-core'

export function registerShowCommand(program: Command) {
  program
    .command('show <id>')
    .description('Show a memory by ID')
    .action(async (id) => {
      const basePath = getProjectMemoryPath(process.cwd())

      const memory = await readMemory(basePath, id)

      if (!memory) {
        console.error(`Memory not found: ${id}`)
        process.exit(1)
      }

      console.log('---')
      console.log(`ID: ${memory.metadata.id}`)
      console.log(`Type: ${memory.metadata.type}`)
      console.log(`Scope: ${memory.metadata.scope}`)
      console.log(`Status: ${memory.metadata.status}`)
      console.log(`Created: ${memory.metadata.created_at}`)
      console.log(`Updated: ${memory.metadata.updated_at}`)
      console.log(`Tags: ${memory.metadata.tags.join(', ') || 'none'}`)
      console.log(`Source: ${memory.metadata.source}`)
      console.log('---')
      console.log()
      console.log(memory.content)
    })
}
