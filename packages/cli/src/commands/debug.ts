import { Command } from 'commander'
import {
  getMemoryDebugStatus,
  getProjectMemoryPath,
  setMemoryDebugMode,
} from '@helloworlkd/pam-core'

interface DebugOptions {
  agent?: string
  model?: string
  session?: string
}

export function registerDebugCommand(program: Command) {
  const debug = program.command('debug').description('Configure project pam debug logging')

  debug
    .command('on')
    .description('Enable pam debug logging')
    .option('--agent <agent>', 'Agent name to record, e.g. codex, claude-code')
    .option('--model <model>', 'Model name to record, e.g. gpt-5, claude-sonnet')
    .option('--session <session>', 'Session id to record')
    .action(async (options: DebugOptions) => {
      const basePath = resolveBasePath(options)
      const status = await setMemoryDebugMode(basePath, true, {
        agent: options.agent,
        model: options.model,
        session_id: options.session,
      })

      console.log('Memory debug logging enabled.')
      console.log(`Log file: ${status.logPath}`)
    })

  debug
    .command('off')
    .description('Disable pam debug logging')
    .action(async (options: DebugOptions) => {
      const basePath = resolveBasePath(options)
      const status = await setMemoryDebugMode(basePath, false)

      console.log('Memory debug logging disabled.')
      console.log(`Log file: ${status.logPath}`)
    })

  debug
    .command('status')
    .description('Show pam debug logging status')
    .action(async (options: DebugOptions) => {
      const basePath = resolveBasePath(options)
      const status = await getMemoryDebugStatus(basePath)

      console.log(`Memory debug: ${status.enabled ? 'enabled' : 'disabled'}`)
      console.log(`Config: ${status.configPath}`)
      console.log(`Log file: ${status.logPath}`)
      if (status.config?.agent) console.log(`Agent: ${status.config.agent}`)
      if (status.config?.model) console.log(`Model: ${status.config.model}`)
      if (status.config?.session_id) console.log(`Session: ${status.config.session_id}`)
    })

  debug
    .command('path')
    .description('Print the pam debug log path')
    .action(async (options: DebugOptions) => {
      const basePath = resolveBasePath(options)
      const status = await getMemoryDebugStatus(basePath)
      console.log(status.logPath)
    })
}

function resolveBasePath(options: DebugOptions): string {
  void options
  return getProjectMemoryPath(process.cwd())
}
