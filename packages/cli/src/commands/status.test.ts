import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Command } from 'commander'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { registerStatusCommand } from './status.js'

describe('status command', () => {
  let tempDir: string
  let previousCwd: string

  beforeEach(async () => {
    previousCwd = process.cwd()
    tempDir = await mkdtemp(join(tmpdir(), 'pam-cli-status-test-'))
    process.chdir(tempDir)
  })

  afterEach(async () => {
    process.chdir(previousCwd)
    await rm(tempDir, { recursive: true, force: true })
  })

  it('reports an uninitialized project without opening a missing index', async () => {
    const program = new Command()
    program.exitOverride()
    registerStatusCommand(program)
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await expect(
      program.parseAsync(['node', 'memory', 'status', '--verbose'], { from: 'node' })
    ).resolves.toBeDefined()

    expect(log).toHaveBeenCalledWith('Using memory: none')
    expect(log).toHaveBeenCalledWith('Run `pam init` to create project memory.')

    log.mockRestore()
  })
})
