import { Command } from 'commander'
import {
  configureCodexGlobalIntegration,
  configureProjectIntegrations,
  initAutoCaptureConfig,
  initProjectMemory,
} from '@helloworlkd/pam-core'

interface InitProjectOptions {
  codexGlobal?: boolean
  integrations?: boolean
}

export function registerInitCommand(program: Command) {
  const init = program.command('init').description('Initialize memory storage')

  init
    .option('--codex-global', 'Also configure the global Codex MCP server in ~/.codex/config.toml')
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

      if (options.codexGlobal) {
        const result = await configureCodexGlobalIntegration()
        const suffix = result.reason ? ` (${result.reason})` : ''
        console.log('\nCodex global integration:')
        console.log(`  ${result.status}: ${result.path}${suffix}`)
        console.log('  Restart Codex for the MCP server to be available in new sessions.')
      }
    })
}
