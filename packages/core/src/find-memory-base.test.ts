import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { findMemoryBase, getProjectMemoryPath, initProjectMemory } from './storage.js'

describe('findMemoryBase', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pam-find-memory-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should return path if .ai-memory exists in current directory', async () => {
    await initProjectMemory(tempDir)
    const result = findMemoryBase(tempDir)
    expect(result).toBe(join(tempDir, '.ai-memory'))
  })

  it('should return parent path if .ai-memory exists in parent', async () => {
    const parentDir = tempDir
    const childDir = join(parentDir, 'child')
    await mkdir(childDir)
    await initProjectMemory(parentDir)

    const result = findMemoryBase(childDir)
    expect(result).toBe(join(parentDir, '.ai-memory'))
  })

  it('should return grandparent path if .ai-memory exists multiple levels up', async () => {
    const grandparentDir = tempDir
    const parentDir = join(grandparentDir, 'parent')
    const childDir = join(parentDir, 'child')
    await mkdir(parentDir)
    await mkdir(childDir)
    await initProjectMemory(grandparentDir)

    const result = findMemoryBase(childDir)
    expect(result).toBe(join(grandparentDir, '.ai-memory'))
  })

  it('should return null if .ai-memory does not exist anywhere', async () => {
    const result = findMemoryBase(tempDir)
    expect(result).toBeNull()
  })

  it('should stop at filesystem root', async () => {
    const result = findMemoryBase('/')
    expect(result).toBeNull()
  })
})

describe('getProjectMemoryPath with parent lookup', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pam-get-path-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should return existing parent memory path', async () => {
    const parentDir = tempDir
    const childDir = join(parentDir, 'child')
    await mkdir(childDir)
    await initProjectMemory(parentDir)

    const result = getProjectMemoryPath(childDir)
    expect(result).toBe(join(parentDir, '.ai-memory'))
  })

  it('should return current path if no parent memory exists', async () => {
    const result = getProjectMemoryPath(tempDir)
    expect(result).toBe(join(tempDir, '.ai-memory'))
  })

  it('should prefer closest .ai-memory', async () => {
    const parentDir = tempDir
    const childDir = join(parentDir, 'child')
    await mkdir(childDir)
    await initProjectMemory(parentDir)
    await initProjectMemory(childDir)

    const result = getProjectMemoryPath(childDir)
    expect(result).toBe(join(childDir, '.ai-memory'))
  })
})
