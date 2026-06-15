import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'

interface UpgradeCommandOptions {
  package?: string
  npm?: string
  dryRun?: boolean
}

const CLI_DIST_DIR = dirname(fileURLToPath(import.meta.url))

export function registerUpgradeCommand(program: Command) {
  program
    .command('upgrade')
    .description('Update the global PAMH CLI without leaving running services locked')
    .option('--package <spec>', 'Package spec to install', 'pamh-cli@latest')
    .option('--npm <command>', 'npm executable to use')
    .option('--dry-run', 'Show the update steps without installing')
    .action((options: UpgradeCommandOptions) => {
      const updaterPath = join(CLI_DIST_DIR, '../self-upgrade.js')
      const args = [updaterPath, '--package', options.package ?? 'pamh-cli@latest']

      if (options.npm) args.push('--npm', options.npm)
      if (options.dryRun) args.push('--dry-run')

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

      child.unref()
      console.log('PAMH upgrade started in the background.')
      console.log('Running PAMH UI/MCP services will be stopped before npm updates the package.')
    })
}
