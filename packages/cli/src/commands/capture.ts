import { Command } from 'commander'
import {
  loadAutoCaptureConfig,
  saveAutoCaptureConfig,
  getProjectMemoryPath,
  type AutoCaptureMode,
} from '@helloworlkd/pam-core'

export function registerCaptureCommand(program: Command) {
  const capture = program.command('capture').description('Auto-capture configuration')

  capture
    .command('show')
    .description('Show current auto-capture configuration')
    .action(async () => {
      const basePath = getProjectMemoryPath(process.cwd())
      const config = await loadAutoCaptureConfig(basePath)

      console.log(`Mode: ${config.mode}`)
      if (config.rules && config.rules.length > 0) {
        console.log('\nRules:')
        for (const rule of config.rules) {
          console.log(`  - ${JSON.stringify(rule)}`)
        }
      }
      if (config.exclude && config.exclude.length > 0) {
        console.log('\nExclude:')
        for (const rule of config.exclude) {
          console.log(`  - ${JSON.stringify(rule)}`)
        }
      }
    })

  capture
    .command('set <mode>')
    .description('Set auto-capture mode (manual, assisted, auto)')
    .action(async (mode) => {
      if (!['manual', 'assisted', 'auto'].includes(mode)) {
        console.error('Invalid mode. Must be one of: manual, assisted, auto')
        process.exit(1)
      }

      const basePath = getProjectMemoryPath(process.cwd())
      const config = await loadAutoCaptureConfig(basePath)
      config.mode = mode as AutoCaptureMode

      await saveAutoCaptureConfig(basePath, config)
      console.log(`Auto-capture mode set to: ${mode}`)
    })
}
