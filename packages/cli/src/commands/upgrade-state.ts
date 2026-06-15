import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export type UpgradePhase =
  | 'queued'
  | 'waiting'
  | 'stopping-services'
  | 'installing'
  | 'succeeded'
  | 'failed'

export interface UpgradeStatus {
  runId: string
  phase: UpgradePhase
  message: string
  packageSpec: string
  npmCommand: string
  startedAt: string
  updatedAt: string
  logPath: string
  stoppedServices?: number
  exitCode?: number
}

export interface UpgradeStatePaths {
  dir: string
  statusPath: string
  logPath: string
}

export function getUpgradeStatePaths(runId = 'latest'): UpgradeStatePaths {
  const dir = process.env.PAMH_UPGRADE_STATE_DIR ?? join(tmpdir(), 'pamh-upgrade')
  const suffix = runId === 'latest' ? 'latest' : sanitizeRunId(runId)
  return {
    dir,
    statusPath: join(dir, `${suffix}.json`),
    logPath: join(dir, `${suffix}.log`),
  }
}

export function writeUpgradeStatus(status: UpgradeStatus): void {
  mkdirSync(getUpgradeStatePaths().dir, { recursive: true })
  const paths = getUpgradeStatePaths(status.runId)
  writeFileSync(paths.statusPath, `${JSON.stringify(status, null, 2)}\n`, 'utf-8')
  writeFileSync(getUpgradeStatePaths().statusPath, `${JSON.stringify(status, null, 2)}\n`, 'utf-8')
}

export function readUpgradeStatus(runId = 'latest'): UpgradeStatus | null {
  const path = getUpgradeStatePaths(runId).statusPath
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf-8')) as UpgradeStatus
}

export function appendUpgradeLog(logPath: string, message: string): void {
  mkdirSync(getUpgradeStatePaths().dir, { recursive: true })
  appendFileSync(logPath, message, 'utf-8')
}

export function formatUpgradeStatus(status: UpgradeStatus | null): string {
  if (!status) return 'No PAMH upgrade status has been recorded yet.'

  const lines = [
    `PAMH upgrade ${status.runId}`,
    `Phase: ${status.phase}`,
    `Package: ${status.packageSpec}`,
    `npm: ${status.npmCommand}`,
    `Updated: ${status.updatedAt}`,
    `Message: ${status.message}`,
    `Log: ${status.logPath}`,
  ]

  if (typeof status.stoppedServices === 'number') {
    lines.push(`Stopped services: ${status.stoppedServices}`)
  }

  if (typeof status.exitCode === 'number') {
    lines.push(`Exit code: ${status.exitCode}`)
  }

  return lines.join('\n')
}

function sanitizeRunId(runId: string): string {
  return runId.replace(/[^a-zA-Z0-9_.-]/g, '-')
}
