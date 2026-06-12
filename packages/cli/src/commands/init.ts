import { Command } from 'commander'
import {
  configureProjectIntegrations,
  initAutoCaptureConfig,
  initGlobalMemory,
  initProjectMemory,
} from 'pamh-core'

interface InitProjectOptions {
  integrations?: boolean
}

export function registerInitCommand(program: Command) {
  const init = program.command('init').description('Initialize memory storage')

  init
    .option('--no-integrations', 'Skip agent and IDE integration files')
    .action(async (options: InitProjectOptions) => {
      const cwd = process.cwd()
      const path = await initProjectMemory(cwd)
      await initAutoCaptureConfig(path)
      console.log(`Memory initialized at: ${path}`)

      if (options.integrations !== false) {
        const { results } = await configureProjectIntegrations(cwd)
        console.log('\nProject integrations:')
        for (const result of results) {
          const suffix = result.reason ? ` (${result.reason})` : ''
          console.log(`  ${result.status}: ${result.path}${suffix}`)
        }
      }
    })

  init
    .command('global')
    .description('Initialize global memory in ~/ai-memory')
    .action(async () => {
      const path = await initGlobalMemory()
      await initAutoCaptureConfig(path)
      console.log(`Global memory initialized at: ${path}`)
    })
}
