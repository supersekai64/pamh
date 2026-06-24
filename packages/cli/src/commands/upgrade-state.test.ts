import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  appendUpgradeLog,
  formatUpgradeStatus,
  getUpgradeStatePaths,
  readUpgradeStatus,
  writeUpgradeStatus,
  type UpgradeStatus,
} from './upgrade-state.js'

describe('upgrade state', () => {
  let tempDir: string
  let previousStateDir: string | undefined

  beforeEach(async () => {
    previousStateDir = process.env.PAM_UPGRADE_STATE_DIR
    tempDir = await mkdtemp(join(tmpdir(), 'pam-upgrade-state-test-'))
    process.env.PAM_UPGRADE_STATE_DIR = tempDir
  })

  afterEach(async () => {
    if (previousStateDir === undefined) {
      delete process.env.PAM_UPGRADE_STATE_DIR
    } else {
      process.env.PAM_UPGRADE_STATE_DIR = previousStateDir
    }
    await rm(tempDir, { recursive: true, force: true })
  })

  it('writes latest and per-run status', () => {
    const status: UpgradeStatus = {
      runId: 'upgrade-test',
      phase: 'installing',
      message: 'Running npm install',
      packageSpec: '@helloworlkd/pam-cli@latest',
      npmCommand: 'npm.cmd',
      startedAt: '2026-06-15T20:00:00.000Z',
      updatedAt: '2026-06-15T20:00:01.000Z',
      logPath: getUpgradeStatePaths('upgrade-test').logPath,
    }

    writeUpgradeStatus(status)

    expect(readUpgradeStatus()).toMatchObject({ runId: 'upgrade-test', phase: 'installing' })
    expect(readUpgradeStatus('upgrade-test')).toMatchObject({
      runId: 'upgrade-test',
      phase: 'installing',
    })
  })

  it('formats missing and existing status', () => {
    expect(formatUpgradeStatus(null)).toContain('No PAM upgrade status')
    expect(
      formatUpgradeStatus({
        runId: 'upgrade-test',
        phase: 'succeeded',
        message: 'PAM upgrade completed.',
        packageSpec: '@helloworlkd/pam-cli@latest',
        npmCommand: 'npm',
        startedAt: '2026-06-15T20:00:00.000Z',
        updatedAt: '2026-06-15T20:00:02.000Z',
        logPath: '/tmp/pam-upgrade/upgrade-test.log',
        stoppedServices: 1,
        exitCode: 0,
      })
    ).toContain('Phase: succeeded')
  })

  it('appends log output', async () => {
    const paths = getUpgradeStatePaths('upgrade-test')

    appendUpgradeLog(paths.logPath, 'first\n')
    appendUpgradeLog(paths.logPath, 'second\n')

    await expect(readFile(paths.logPath, 'utf-8')).resolves.toBe('first\nsecond\n')
  })
})
