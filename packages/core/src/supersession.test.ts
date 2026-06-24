import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  supersedeMemory,
  getSupersessionChain,
  getLatestVersion,
  createMemory,
  initProjectMemory,
} from './index.js'

describe('supersession', () => {
  let tempDir: string
  let basePath: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pam-supersession-test-'))
    basePath = await initProjectMemory(tempDir)
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should supersede a memory', async () => {
    const oldMemory = await createMemory(basePath, {
      type: 'decision',
      scope: 'project',
      content: 'Use PostgreSQL',
    })

    const result = await supersedeMemory(basePath, oldMemory.metadata.id, {
      type: 'decision',
      scope: 'project',
      content: 'Use MongoDB instead',
    })

    expect(result).not.toBeNull()
    expect(result!.oldMemory.metadata.superseded_by).toBe(result!.newMemory.metadata.id)
    expect(result!.oldMemory.metadata.status).toBe('archived')
    expect(result!.newMemory.metadata.supersedes).toBe(oldMemory.metadata.id)
  })

  it('should get supersession chain', async () => {
    const v1 = await createMemory(basePath, {
      type: 'decision',
      scope: 'project',
      content: 'Version 1',
    })

    const result1 = await supersedeMemory(basePath, v1.metadata.id, {
      type: 'decision',
      scope: 'project',
      content: 'Version 2',
    })

    const result2 = await supersedeMemory(basePath, result1!.newMemory.metadata.id, {
      type: 'decision',
      scope: 'project',
      content: 'Version 3',
    })

    const chain = await getSupersessionChain(basePath, v1.metadata.id)

    expect(chain).toHaveLength(3)
    expect(chain[0].metadata.id).toBe(v1.metadata.id)
    expect(chain[1].metadata.id).toBe(result1!.newMemory.metadata.id)
    expect(chain[2].metadata.id).toBe(result2!.newMemory.metadata.id)
  })

  it('should get supersession chain from any version', async () => {
    const v1 = await createMemory(basePath, {
      type: 'decision',
      scope: 'project',
      content: 'Version 1',
    })

    const result1 = await supersedeMemory(basePath, v1.metadata.id, {
      type: 'decision',
      scope: 'project',
      content: 'Version 2',
    })

    const result2 = await supersedeMemory(basePath, result1!.newMemory.metadata.id, {
      type: 'decision',
      scope: 'project',
      content: 'Version 3',
    })

    for (const id of [
      v1.metadata.id,
      result1!.newMemory.metadata.id,
      result2!.newMemory.metadata.id,
    ]) {
      const chain = await getSupersessionChain(basePath, id)
      expect(chain.map((memory) => memory.metadata.id)).toEqual([
        v1.metadata.id,
        result1!.newMemory.metadata.id,
        result2!.newMemory.metadata.id,
      ])
    }
  })

  it('should get latest version', async () => {
    const v1 = await createMemory(basePath, {
      type: 'decision',
      scope: 'project',
      content: 'Version 1',
    })

    const result1 = await supersedeMemory(basePath, v1.metadata.id, {
      type: 'decision',
      scope: 'project',
      content: 'Version 2',
    })

    const latest = await getLatestVersion(basePath, v1.metadata.id)

    expect(latest).not.toBeNull()
    expect(latest!.metadata.id).toBe(result1!.newMemory.metadata.id)
    expect(latest!.content).toBe('Version 2')
  })

  it('should reject invalid supersession salience', async () => {
    const oldMemory = await createMemory(basePath, {
      type: 'decision',
      scope: 'project',
      content: 'Version 1',
    })

    await expect(
      supersedeMemory(basePath, oldMemory.metadata.id, {
        type: 'decision',
        scope: 'project',
        content: 'Version 2',
        salience: 2,
      })
    ).rejects.toThrow('Invalid salience')
  })
})
