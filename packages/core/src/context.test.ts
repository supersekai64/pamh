import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { compileContext, writeCompiledContext } from './context.js'
import { createMemory, initProjectMemory } from './storage.js'

describe('context', () => {
  let projectDir: string

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'pam-context-project-'))
    await initProjectMemory(projectDir)
  })

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })

  describe('compileContext', () => {
    it('should compile context from project memories', async () => {
      await createMemory(projectDir, {
        type: 'decision',
        scope: 'project',
        content: 'Project decision',
      })

      const compiled = await compileContext(projectDir)

      expect(compiled.sources.project.length).toBe(1)
      expect(compiled.content).toContain('Project decision')
      expect(compiled.tokenCount).toBeGreaterThan(0)
    })

    it('should respect maxTokens limit', async () => {
      for (let i = 0; i < 10; i++) {
        await createMemory(projectDir, {
          type: 'knowledge',
          scope: 'project',
          content: `Memory ${i} with some content that takes up space`.repeat(10),
        })
      }

      const compiled = await compileContext(projectDir, { maxTokens: 100 })

      expect(compiled.tokenCount).toBeLessThanOrEqual(100)
    })

    it('should exclude project memory when includeProject is false', async () => {
      await createMemory(projectDir, {
        type: 'decision',
        scope: 'project',
        content: 'Project decision',
      })

      const compiled = await compileContext(projectDir, { includeProject: false })

      expect(compiled.sources.project.length).toBe(0)
      expect(compiled.content).not.toContain('Project decision')
    })

    it('should handle empty memory stores', async () => {
      const compiled = await compileContext(projectDir)

      expect(compiled.sources.project.length).toBe(0)
      expect(compiled.content).toContain('# Compiled Context')
    })

    it('should only include active memories', async () => {
      const memory = await createMemory(projectDir, {
        type: 'knowledge',
        scope: 'project',
        content: 'Active memory',
      })

      await createMemory(projectDir, {
        type: 'knowledge',
        scope: 'project',
        content: 'Another memory',
      })

      const { deleteMemory } = await import('./storage.js')
      await deleteMemory(projectDir, memory.metadata.id)

      const compiled = await compileContext(projectDir)

      expect(compiled.sources.project.length).toBe(1)
      expect(compiled.content).toContain('Another memory')
      expect(compiled.content).not.toContain('Active memory')
    })
  })

  describe('writeCompiledContext', () => {
    it('should write compiled context to file', async () => {
      await createMemory(projectDir, {
        type: 'decision',
        scope: 'project',
        content: 'Test decision',
      })

      const compiled = await compileContext(projectDir)
      const outputPath = await writeCompiledContext(projectDir, compiled)

      expect(outputPath).toContain('compiled-context.md')

      const { readFile } = await import('node:fs/promises')
      const content = await readFile(outputPath, 'utf-8')
      expect(content).toBe(compiled.content)
    })
  })
})
