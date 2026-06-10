import { Command } from 'commander'
import {
  getGlobalMemoryPath,
  getProjectMemoryPath,
  compileContext,
  writeCompiledContext,
} from '@pamh/core'

export function registerContextCommand(program: Command) {
  program
    .command('context')
    .description('Compile context from all memory sources')
    .option('-q, --query <query>', 'Search query to include relevant memories')
    .option('--max-tokens <tokens>', 'Maximum tokens in compiled context', '4000')
    .option('--no-global', 'Exclude global memory')
    .option('--no-project', 'Exclude project memory')
    .option('--no-search', 'Exclude search results')
    .option('-o, --output', 'Write compiled context to compiled-context.md')
    .option('--project', 'Use project memory instead of global')
    .action(async (options) => {
      const globalBasePath = getGlobalMemoryPath()
      const projectBasePath = getProjectMemoryPath(process.cwd())

      const maxTokens = parseInt(options.maxTokens, 10)

      console.log('Compiling context...')

      const compiled = await compileContext(globalBasePath, projectBasePath, {
        query: options.query,
        maxTokens,
        includeGlobal: options.global,
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
      console.log(`  Global: ${compiled.sources.global.length} memories`)
      console.log(`  Project: ${compiled.sources.project.length} memories`)
      console.log(`  Search: ${compiled.sources.search.length} memories`)
    })
}
