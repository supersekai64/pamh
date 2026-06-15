#!/usr/bin/env node

import { execFile, spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

interface UpgradeOptions {
  packageSpec: string
  npmCommand: string
  waitMs: number
  dryRun: boolean
}

const ownPid = process.pid

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))

  if (options.waitMs > 0) {
    await delay(options.waitMs)
  }

  const stopped = await stopRunningPamhServices(options.dryRun)
  if (stopped.length > 0) {
    console.log(`Stopped ${stopped.length} running PAMH service${stopped.length === 1 ? '' : 's'}.`)
  }

  const args = ['install', '-g', options.packageSpec]
  console.log(`Running: ${options.npmCommand} ${args.join(' ')}`)

  if (options.dryRun) {
    return
  }

  await execFileInherited(options.npmCommand, args)
}

function parseArgs(args: string[]): UpgradeOptions {
  const options: UpgradeOptions = {
    packageSpec: 'pamh-cli@latest',
    npmCommand: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    waitMs: 1000,
    dryRun: false,
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
    }
  }

  return options
}

async function stopRunningPamhServices(dryRun: boolean): Promise<number[]> {
  if (process.platform === 'win32') {
    return stopWindowsPamhServices(dryRun)
  }

  return stopUnixPamhServices(dryRun)
}

function stopWindowsPamhServices(dryRun: boolean): Promise<number[]> {
  const command = `
$ownPid = ${ownPid}
$processes = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
  Where-Object {
    $_.ProcessId -ne $ownPid -and
    $_.CommandLine -match 'pamh-cli[\\\\/]dist[\\\\/]index\\.js' -and
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

function stopUnixPamhServices(dryRun: boolean): Promise<number[]> {
  const script = `
set -e
ids="$(ps -eo pid=,args= | awk '/pamh-cli\\/dist\\/index\\.js/ && (/ ui( |$)/ || / server start( |$)/) {print $1}' | grep -v "^${ownPid}$" || true)"
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

function execFileInherited(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', windowsHide: false })

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
