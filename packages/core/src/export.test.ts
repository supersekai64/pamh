import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { exportMemories } from './export.js'
import { createMemory, initProjectMemory } from './storage.js'
import { existsSync } from 'node:fs'

describe('export', () => {
  let tempDir: string
  let basePath: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pam-export-test-'))
    basePath = await initProjectMemory(tempDir)
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should export to JSON format', async () => {
    await createMemory(basePath, {
      type: 'decision',
      scope: 'project',
      content: 'Test decision',
      tags: ['test'],
    })

    const outputPath = join(tempDir, 'export.json')
    await exportMemories({ format: 'json', outputPath, basePath })

    expect(existsSync(outputPath)).toBe(true)

    const content = await readFile(outputPath, 'utf-8')
    const data = JSON.parse(content)

    expect(data.version).toBe('1.0.0')
    expect(data.memories).toBeDefined()
    expect(data.memories.length).toBe(1)
    expect(data.memories[0].content).toBe('Test decision')
  })

  it('should export to Markdown format', async () => {
    await createMemory(basePath, {
      type: 'knowledge',
      scope: 'project',
      content: 'Test knowledge',
    })

    const outputPath = join(tempDir, 'export.md')
    await exportMemories({ format: 'markdown', outputPath, basePath })

    expect(existsSync(outputPath)).toBe(true)

    const content = await readFile(outputPath, 'utf-8')
    expect(content).toContain('# Memory Export')
    expect(content).toContain('Test knowledge')
  })

  it('should export to ZIP format', async () => {
    await createMemory(basePath, {
      type: 'decision',
      scope: 'project',
      content: 'Test decision',
    })

    const outputPath = join(tempDir, 'export.zip')
    await exportMemories({ format: 'zip', outputPath, basePath })

    expect(existsSync(outputPath)).toBe(true)
  })

  it('should export to SQLite format', async () => {
    await createMemory(basePath, {
      type: 'decision',
      scope: 'project',
      content: 'SQLite export decision',
    })

    const outputPath = join(tempDir, 'export.sqlite')
    await exportMemories({ format: 'sqlite', outputPath, basePath })

    expect(existsSync(outputPath)).toBe(true)
  })

  it('should export multiple memories', async () => {
    await createMemory(basePath, {
      type: 'decision',
      scope: 'project',
      content: 'Decision 1',
    })
    await createMemory(basePath, {
      type: 'knowledge',
      scope: 'project',
      content: 'Knowledge 1',
    })

    const outputPath = join(tempDir, 'export.json')
    await exportMemories({ format: 'json', outputPath, basePath })

    const content = await readFile(outputPath, 'utf-8')
    const data = JSON.parse(content)

    expect(data.memories.length).toBe(2)
  })
})
