import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  createMemory,
  deleteMemory,
  getMemoryDebugStatus,
  initProjectMemory,
  setMemoryDebugMode,
  updateMemory,
} from './index.js'

describe('memory debug logging', () => {
  let tempDir: string
  let basePath: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pamh-debug-test-'))
    basePath = await initProjectMemory(tempDir)
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('records memory operations in a text log when enabled', async () => {
    const status = await setMemoryDebugMode(basePath, true, {
      agent: 'codex',
      model: 'gpt-5',
      session_id: 'session-123',
    })
    const memory = await createMemory(basePath, {
      type: 'knowledge',
      scope: 'project',
      content: 'Debug logging should capture memory mutations.',
      tags: ['debug', 'audit'],
      source: 'test',
    })

    await updateMemory(basePath, memory.metadata.id, {
      content: 'Debug logging captures updates too.',
    })
    await deleteMemory(basePath, memory.metadata.id)
    await setMemoryDebugMode(basePath, false)

    const log = await readFile(status.logPath, 'utf-8')
    expect(log).toContain('debug.enable')
    expect(log).toContain('debug.disable')
    expect(log).toContain('memory.create')
    expect(log).toContain('memory.update')
    expect(log).toContain('memory.delete')
    expect(log).toContain('agent: codex')
    expect(log).toContain('model: gpt-5')
    expect(log).toContain(memory.metadata.id)
  })

  it('reports status and log path', async () => {
    await setMemoryDebugMode(basePath, true)
    const status = await getMemoryDebugStatus(basePath)

    expect(status.enabled).toBe(true)
    expect(status.logPath).toContain('memory-debug.log')
    expect(status.configPath).toContain('debug.json')
  })
})
