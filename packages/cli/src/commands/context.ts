import { Command } from 'commander'
import { getProjectMemoryPath, compileContext, writeCompiledContext } from '@helloworlkd/pam-core'

export function registerContextCommand(program: Command) {
  program
    .command('context')
    .description('Compile context from all memory sources')
    .option('-q, --query <query>', 'Search query to include relevant memories')
    .option('--max-tokens <tokens>', 'Maximum tokens in compiled context', '4000')
    .option('--no-project', 'Exclude project memory')
    .option('--no-search', 'Exclude search results')
    .option('-o, --output', 'Write compiled context to compiled-context.md')
    .action(async (options) => {
      const projectBasePath = getProjectMemoryPath(process.cwd())

      const maxTokens = parseInt(options.maxTokens, 10)

      console.log('Compiling context...')

      const compiled = await compileContext(projectBasePath, {
        query: options.query,
        maxTokens,
        includeProject: options.project,
        includeSearch: options.search,
      })

      if (options.output) {
        const outputPath = await writeCompiledContext(projectBasePath, compiled)
        console.log(`\nContext written to: ${outputPath}`)
      } else {
        console.log('\n' + compiled.content)
      }

      console.log(`\n---`)
      console.log(`Total tokens: ~${compiled.tokenCount}`)
      console.log(`Sources:`)
      console.log(`  Project: ${compiled.sources.project.length} memories`)
      console.log(`  Search: ${compiled.sources.search.length} memories`)
    })
}
