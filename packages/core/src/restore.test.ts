import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { restoreMemory } from './restore.js'
import {
  archiveMemory,
  createMemory,
  deleteMemory,
  readMemory,
  initProjectMemory,
} from './storage.js'
import { MemoryIndex } from './indexer.js'

describe('restore', () => {
  let tempDir: string
  let basePath: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pam-restore-test-'))
    basePath = await initProjectMemory(tempDir)
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should restore a deleted memory', async () => {
    const memory = await createMemory(basePath, {
      type: 'knowledge',
      scope: 'project',
      content: 'Test content',
    })

    await deleteMemory(basePath, memory.metadata.id)

    const deleted = await readMemory(basePath, memory.metadata.id)
    expect(deleted!.metadata.status).toBe('deleted')

    const restored = await restoreMemory(basePath, memory.metadata.id)
    expect(restored).toBe(true)

    const active = await readMemory(basePath, memory.metadata.id)
    expect(active!.metadata.status).toBe('active')

    const index = new MemoryIndex(basePath)
    const results = index.search({ query: 'Test content' })
    index.close()

    expect(results.some((result) => result.id === memory.metadata.id)).toBe(true)
  })

  it('should restore a physically deleted memory from its latest backup', async () => {
    const memory = await createMemory(basePath, {
      type: 'decision',
      scope: 'project',
      tags: ['backup'],
      content: 'Recoverable physical delete',
    })

    await deleteMemory(basePath, memory.metadata.id, { physical: true })
    expect(await readMemory(basePath, memory.metadata.id)).toBeNull()

    const restored = await restoreMemory(basePath, memory.metadata.id)
    expect(restored).toBe(true)

    const active = await readMemory(basePath, memory.metadata.id)
    expect(active!.metadata.status).toBe('active')
    expect(active!.metadata.type).toBe('decision')
    expect(active!.metadata.tags).toEqual(['backup'])
    expect(active!.content).toBe('Recoverable physical delete')
  })

  it('should restore an archived memory', async () => {
    const memory = await createMemory(basePath, {
      type: 'knowledge',
      scope: 'project',
      content: 'Archived content',
    })

    await archiveMemory(basePath, memory.metadata.id)

    const archived = await readMemory(basePath, memory.metadata.id)
    expect(archived!.metadata.status).toBe('archived')

    const restored = await restoreMemory(basePath, memory.metadata.id)
    expect(restored).toBe(true)

    const active = await readMemory(basePath, memory.metadata.id)
    expect(active!.metadata.status).toBe('active')
  })

  it('should restore a noise memory', async () => {
    const memory = await createMemory(basePath, {
      type: 'knowledge',
      scope: 'project',
      status: 'noise',
      content: 'Noise content',
    })

    const restored = await restoreMemory(basePath, memory.metadata.id)
    expect(restored).toBe(true)

    const active = await readMemory(basePath, memory.metadata.id)
    expect(active!.metadata.status).toBe('active')
  })

  it('should return false for non-existent memory', async () => {
    const result = await restoreMemory(basePath, 'mem_nonexistent')
    expect(result).toBe(false)
  })

  it('should return false for already active memory', async () => {
    const memory = await createMemory(basePath, {
      type: 'knowledge',
      scope: 'project',
      content: 'Test content',
    })

    const result = await restoreMemory(basePath, memory.metadata.id)
    expect(result).toBe(false)
  })
})
