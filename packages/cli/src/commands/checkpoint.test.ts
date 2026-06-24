import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Command } from 'commander'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initProjectMemory, listMemories } from '@helloworlkd/pam-core'

import { registerCheckpointCommand } from './checkpoint.js'

describe('checkpoint command', () => {
  let tempDir: string
  let previousCwd: string
  let projectMemoryPath: string

  beforeEach(async () => {
    previousCwd = process.cwd()
    tempDir = await mkdtemp(join(tmpdir(), 'pam-cli-checkpoint-test-'))
    projectMemoryPath = await initProjectMemory(tempDir)
    process.chdir(tempDir)
  })

  afterEach(async () => {
    process.chdir(previousCwd)
    await rm(tempDir, { recursive: true, force: true })
  })

  it('creates checkpoint memories through the CLI fallback command', async () => {
    const program = new Command()
    program.exitOverride()
    registerCheckpointCommand(program)
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await program.parseAsync(
      [
        'node',
        'memory',
        'checkpoint',
        '--summary',
        'Implemented the CLI checkpoint command.',
        '--decision',
        'CLI fallback should reuse the MCP checkpoint behavior.',
        '--fact',
        'AGENTS.md can call pam checkpoint when MCP tools are missing.',
        '--concept',
        'Architecture',
        '--agent',
        'codex',
      ],
      { from: 'node' }
    )

    const memories = await listMemories(projectMemoryPath)

    expect(memories).toHaveLength(3)
    expect(memories.map((memory) => memory.metadata.status)).toEqual(['active', 'active', 'active'])
    expect(memories.map((memory) => memory.metadata.type).sort()).toEqual([
      'decision',
      'knowledge',
      'session',
    ])
    expect(memories.every((memory) => memory.metadata.tags.includes('checkpoint'))).toBe(true)
    expect(memories.every((memory) => memory.metadata.tags.includes('agent-codex'))).toBe(true)
    expect(memories.every((memory) => memory.metadata.concepts?.includes('architecture'))).toBe(
      true
    )
    expect(memories.every((memory) => memory.metadata.source === 'cli-checkpoint:codex')).toBe(true)
    expect(log).toHaveBeenCalledWith('Checkpoint recorded: 3 active memories')

    log.mockRestore()
  })
})
