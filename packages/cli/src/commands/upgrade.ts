import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import {
  appendUpgradeLog,
  formatUpgradeStatus,
  getUpgradeStatePaths,
  readUpgradeStatus,
  writeUpgradeStatus,
  type UpgradeStatus,
} from './upgrade-state.js'

interface UpgradeCommandOptions {
  package?: string
  npm?: string
  dryRun?: boolean
}

const CLI_DIST_DIR = dirname(fileURLToPath(import.meta.url))

export function registerUpgradeCommand(program: Command) {
  const upgrade = program
    .command('upgrade')
    .description('Update the global PAM CLI without leaving running services locked')
    .option('--package <spec>', 'Package spec to install', '@helloworlkd/pam-cli@latest')
    .option('--npm <command>', 'npm executable to use')
    .option('--dry-run', 'Show the update steps without installing')
    .action((options: UpgradeCommandOptions) => {
      const runId = `upgrade-${Date.now()}`
      const startedAt = new Date().toISOString()
      const paths = getUpgradeStatePaths(runId)
      const updaterPath = join(CLI_DIST_DIR, '../self-upgrade.js')
      const args = [updaterPath, '--package', options.package ?? '@helloworlkd/pam-cli@latest']

      if (options.npm) args.push('--npm', options.npm)
      if (options.dryRun) args.push('--dry-run')
      args.push('--run-id', runId, '--log-path', paths.logPath, '--started-at', startedAt)

      const child = spawn(process.execPath, args, {
        detached: !options.dryRun,
        stdio: options.dryRun ? 'inherit' : 'ignore',
        windowsHide: false,
      })

      if (options.dryRun) {
        child.on('exit', (code) => {
          process.exit(code ?? 0)
        })
        return
      }

      const status: UpgradeStatus = {
        runId,
        phase: 'queued',
        message: 'Updater process started in the background.',
        packageSpec: options.package ?? '@helloworlkd/pam-cli@latest',
        npmCommand: options.npm ?? (process.platform === 'win32' ? 'npm.cmd' : 'npm'),
        startedAt,
        updatedAt: startedAt,
        logPath: paths.logPath,
      }
      writeUpgradeStatus(status)
      appendUpgradeLog(paths.logPath, `[${startedAt}] queued: ${status.message}\n`)

      child.unref()
      console.log(`PAM upgrade started in the background (${runId}).`)
      console.log('Progress: queued -> stopping services -> npm install -> done.')
      console.log(`Status file: ${paths.statusPath}`)
      console.log(`Log file: ${paths.logPath}`)
      console.log(`Follow live: ${formatLogFollowCommand(paths.logPath)}`)
    })

  upgrade
    .command('status')
    .description('Show the latest PAM upgrade status')
    .action(() => {
      console.log(formatUpgradeStatus(readUpgradeStatus()))
    })

  upgrade
    .command('log')
    .description('Show the latest PAM upgrade log path')
    .action(() => {
      const status = readUpgradeStatus()
      if (!status) {
        console.log('No PAM upgrade log has been recorded yet.')
        return
      }
      console.log(status.logPath)
    })
}

function formatLogFollowCommand(logPath: string): string {
  if (process.platform === 'win32') {
    return `Get-Content -Wait -LiteralPath "${logPath}"`
  }

  return `tail -f "${logPath}"`
}
