import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Command } from 'commander'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMemory, initProjectMemory } from '@supersekai64/pam-core'

import { registerSearchCommand } from './search.js'

describe('search command', () => {
  let tempDir: string
  let previousCwd: string
  let memoryPath: string

  beforeEach(async () => {
    previousCwd = process.cwd()
    tempDir = await mkdtemp(join(tmpdir(), 'pam-cli-search-test-'))
    memoryPath = await initProjectMemory(tempDir)
    process.chdir(tempDir)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    process.chdir(previousCwd)
    await rm(tempDir, { recursive: true, force: true })
  })

  it('announces related matches when natural query fallback is used', async () => {
    await createMemory(memoryPath, {
      type: 'decision',
      scope: 'project',
      content: 'Use PostgreSQL for production persistence.',
      tags: ['architecture'],
    })

    const program = new Command()
    program.exitOverride()
    registerSearchCommand(program)
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await program.parseAsync(['node', 'memory', 'search', 'database choice'], { from: 'node' })

    expect(log).toHaveBeenCalledWith(
      'No exact lexical hits; showing related matches from tags and synonyms.\n'
    )
    expect(log.mock.calls.some(([line]) => String(line).includes('PostgreSQL'))).toBe(true)
  })
})
