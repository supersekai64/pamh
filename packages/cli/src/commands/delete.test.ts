import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Command } from 'commander'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMemory, initProjectMemory, readMemory, restoreMemory } from '@supersekai64/pam-core'

import { registerDeleteCommand } from './delete.js'

describe('delete command', () => {
  let tempDir: string
  let previousCwd: string
  let memoryPath: string

  beforeEach(async () => {
    previousCwd = process.cwd()
    tempDir = await mkdtemp(join(tmpdir(), 'pam-cli-delete-test-'))
    memoryPath = await initProjectMemory(tempDir)
    process.chdir(tempDir)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    process.chdir(previousCwd)
    await rm(tempDir, { recursive: true, force: true })
  })

  it('writes a backup before physical deletion and leaves it restorable', async () => {
    const memory = await createMemory(memoryPath, {
      type: 'knowledge',
      scope: 'project',
      content: 'CLI physical delete should be recoverable.',
    })

    const program = new Command()
    program.exitOverride()
    registerDeleteCommand(program)
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await program.parseAsync(
      ['node', 'memory', 'delete', memory.metadata.id, '--physical', '--yes'],
      { from: 'node' }
    )

    expect(await readMemory(memoryPath, memory.metadata.id)).toBeNull()
    expect(log.mock.calls.some(([line]) => String(line).startsWith('Backup written:'))).toBe(true)

    await expect(restoreMemory(memoryPath, memory.metadata.id)).resolves.toBe(true)
    await expect(readMemory(memoryPath, memory.metadata.id)).resolves.toMatchObject({
      content: 'CLI physical delete should be recoverable.',
    })
  })
})
