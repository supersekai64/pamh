import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { approveMemory, rejectMemory } from './approve.js'
import { createMemory, readMemory, initProjectMemory } from './storage.js'

describe('approve', () => {
  let tempDir: string
  let basePath: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pam-approve-test-'))
    basePath = await initProjectMemory(tempDir)
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should approve a proposed memory', async () => {
    const memory = await createMemory(basePath, {
      type: 'knowledge',
      scope: 'project',
      content: 'Proposed content',
      status: 'proposed',
    })

    const approved = await approveMemory(basePath, memory.metadata.id)
    expect(approved).toBe(true)

    const read = await readMemory(basePath, memory.metadata.id)
    expect(read!.metadata.status).toBe('active')
  })

  it('should reject a proposed memory', async () => {
    const memory = await createMemory(basePath, {
      type: 'knowledge',
      scope: 'project',
      content: 'Proposed content',
      status: 'proposed',
    })

    const rejected = await rejectMemory(basePath, memory.metadata.id)
    expect(rejected).toBe(true)

    const read = await readMemory(basePath, memory.metadata.id)
    expect(read!.metadata.status).toBe('deleted')
  })

  it('should return false for non-proposed memory', async () => {
    const memory = await createMemory(basePath, {
      type: 'knowledge',
      scope: 'project',
      content: 'Active content',
    })

    const approved = await approveMemory(basePath, memory.metadata.id)
    expect(approved).toBe(false)

    const rejected = await rejectMemory(basePath, memory.metadata.id)
    expect(rejected).toBe(false)
  })

  it('should return false for non-existent memory', async () => {
    const approved = await approveMemory(basePath, 'mem_nonexistent')
    expect(approved).toBe(false)

    const rejected = await rejectMemory(basePath, 'mem_nonexistent')
    expect(rejected).toBe(false)
  })
})
