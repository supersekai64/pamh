#!/usr/bin/env node

import { execFile, spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import {
  appendUpgradeLog,
  getUpgradeStatePaths,
  writeUpgradeStatus,
  type UpgradePhase,
} from './commands/upgrade-state.js'

interface UpgradeOptions {
  packageSpec: string
  npmCommand: string
  waitMs: number
  dryRun: boolean
  runId: string
  logPath: string
  startedAt: string
}

const ownPid = process.pid

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))

  try {
    recordProgress(options, 'waiting', 'Waiting for the launcher process to exit.')
    if (options.waitMs > 0) {
      await delay(options.waitMs)
    }

    recordProgress(options, 'stopping-services', 'Stopping running PAM UI/MCP services.')
    const stopped = await stopRunningPAMServices(options.dryRun)
    recordProgress(
      options,
      'stopping-services',
      `Stopped ${stopped.length} running PAM service${stopped.length === 1 ? '' : 's'}.`,
      { stoppedServices: stopped.length }
    )

    const args = ['install', '-g', options.packageSpec]
    recordProgress(options, 'installing', `Running: ${options.npmCommand} ${args.join(' ')}`, {
      stoppedServices: stopped.length,
    })

    if (options.dryRun) {
      recordProgress(options, 'succeeded', 'Dry run complete.', { stoppedServices: stopped.length })
      return
    }

    await execFileLogged(options.npmCommand, args, options)
    recordProgress(options, 'succeeded', 'PAM upgrade completed.', {
      stoppedServices: stopped.length,
      exitCode: 0,
    })
  } catch (error) {
    recordProgress(options, 'failed', error instanceof Error ? error.message : String(error), {
      exitCode: 1,
    })
    throw error
  }
}

function parseArgs(args: string[]): UpgradeOptions {
  const options: UpgradeOptions = {
    packageSpec: '@helloworlkd/pam-cli@latest',
    npmCommand: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    waitMs: 1000,
    dryRun: false,
    runId: `upgrade-${Date.now()}`,
    logPath: '',
    startedAt: new Date().toISOString(),
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--package' && args[index + 1]) {
      options.packageSpec = args[index + 1]
      index += 1
    } else if (arg === '--npm' && args[index + 1]) {
      options.npmCommand = args[index + 1]
      index += 1
    } else if (arg === '--wait-ms' && args[index + 1]) {
      const waitMs = Number.parseInt(args[index + 1], 10)
      if (Number.isFinite(waitMs) && waitMs >= 0) options.waitMs = waitMs
      index += 1
    } else if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--run-id' && args[index + 1]) {
      options.runId = args[index + 1]
      index += 1
    } else if (arg === '--log-path' && args[index + 1]) {
      options.logPath = args[index + 1]
      index += 1
    } else if (arg === '--started-at' && args[index + 1]) {
      options.startedAt = args[index + 1]
      index += 1
    }
  }

  if (!options.logPath) {
    options.logPath = getUpgradeStatePaths(options.runId).logPath
  }

  return options
}

function recordProgress(
  options: UpgradeOptions,
  phase: UpgradePhase,
  message: string,
  extra: Partial<{
    stoppedServices: number
    exitCode: number
  }> = {}
): void {
  const status = createStatus(options, phase, message, extra)
  writeUpgradeStatus(status)
  const line = `[${status.updatedAt}] ${phase}: ${message}\n`
  appendUpgradeLog(options.logPath, line)
  console.log(message)
}

function createStatus(
  options: UpgradeOptions,
  phase: UpgradePhase,
  message: string,
  extra: Partial<{
    stoppedServices: number
    exitCode: number
  }> = {}
) {
  return {
    runId: options.runId,
    phase,
    message,
    packageSpec: options.packageSpec,
    npmCommand: options.npmCommand,
    startedAt: options.startedAt,
    updatedAt: new Date().toISOString(),
    logPath: options.logPath,
    ...extra,
  }
}

async function stopRunningPAMServices(dryRun: boolean): Promise<number[]> {
  if (process.platform === 'win32') {
    return stopWindowsPAMServices(dryRun)
  }

  return stopUnixPAMServices(dryRun)
}

function stopWindowsPAMServices(dryRun: boolean): Promise<number[]> {
  const command = `
$ownPid = ${ownPid}
$processes = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
  Where-Object {
    $_.ProcessId -ne $ownPid -and
    $_.CommandLine -match 'pam-cli[\\\\/]dist[\\\\/]index\\.js' -and
    ($_.CommandLine -match '\\sui(\\s|$)' -or $_.CommandLine -match '\\sserver\\s+start(\\s|$)')
  }
$ids = @($processes | ForEach-Object { $_.ProcessId })
if (${dryRun ? '$false' : '$true'} -and $ids.Count -gt 0) {
  Stop-Process -Id $ids -Force -ErrorAction SilentlyContinue
}
$ids -join ','
`

  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-Command', command], (error, stdout) => {
      if (error) {
        resolve([])
        return
      }
      resolve(parsePidList(stdout))
    })
  })
}

function stopUnixPAMServices(dryRun: boolean): Promise<number[]> {
  const script = `
set -e
ids="$(ps -eo pid=,args= | awk '/pam-cli\\/dist\\/index\\.js/ && (/ ui( |$)/ || / server start( |$)/) {print $1}' | grep -v "^${ownPid}$" || true)"
if [ -n "$ids" ] && [ "${dryRun ? '0' : '1'}" = "1" ]; then
  kill $ids 2>/dev/null || true
fi
printf "%s" "$ids" | tr '\\n' ','
`

  return new Promise((resolve) => {
    execFile('sh', ['-c', script], (error, stdout) => {
      if (error) {
        resolve([])
        return
      }
      resolve(parsePidList(stdout))
    })
  })
}

function parsePidList(value: string): number[] {
  return value
    .split(/[,\s]+/)
    .map((item) => Number.parseInt(item, 10))
    .filter((pid) => Number.isFinite(pid))
}

function execFileLogged(command: string, args: string[], options: UpgradeOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const invocation = getSpawnInvocation(command, args)
    const child = spawn(invocation.command, invocation.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false,
    })

    child.stdout.on('data', (chunk: Buffer) => {
      process.stdout.write(chunk)
      appendUpgradeLog(options.logPath, chunk.toString('utf-8'))
    })

    child.stderr.on('data', (chunk: Buffer) => {
      process.stderr.write(chunk)
      appendUpgradeLog(options.logPath, chunk.toString('utf-8'))
    })

    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} exited with ${signal ?? `code ${code ?? 1}`}`))
    })
  })
}

function getSpawnInvocation(command: string, args: string[]): { command: string; args: string[] } {
  if (process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(command)) {
    return {
      command: process.env.ComSpec ?? 'cmd.exe',
      args: ['/d', '/s', '/c', [command, ...args].map(quoteWindowsCommandArg).join(' ')],
    }
  }

  return { command, args }
}

function quoteWindowsCommandArg(value: string): string {
  if (!/[\s"&()<>^|]/.test(value)) return value
  return `"${value.replace(/"/g, '\\"')}"`
}
