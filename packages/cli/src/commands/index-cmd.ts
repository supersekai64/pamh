import { Command } from 'commander'
import { indexAllMemories, getProjectMemoryPath } from '@helloworlkd/pam-core'

export function registerIndexCommand(program: Command) {
  const index = program.command('index').description('Index management commands')

  index
    .command('build')
    .description('Index all memories into SQLite')
    .action(async () => {
      const basePath = getProjectMemoryPath(process.cwd())

      console.log('Indexing memories...')
      const count = await indexAllMemories(basePath)
      console.log(`Indexed ${count} memories`)
    })

  index
    .command('rebuild')
    .description('Rebuild the entire index from scratch')
    .action(async () => {
      const basePath = getProjectMemoryPath(process.cwd())

      console.log('Rebuilding index...')
      const count = await indexAllMemories(basePath)
      console.log(`Rebuilt index with ${count} memories`)
    })

  program
    .command('reindex')
    .description('Rebuild the entire index from scratch')
    .action(async () => {
      const basePath = getProjectMemoryPath(process.cwd())

      console.log('Rebuilding index...')
      const count = await indexAllMemories(basePath)
      console.log(`Rebuilt index with ${count} memories`)
    })
}
