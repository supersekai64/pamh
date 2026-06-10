import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { compileContext, writeCompiledContext } from './context.js'
import { createMemory, initProjectMemory } from './storage.js'

describe('context', () => {
  let globalDir: string
  let projectDir: string

  beforeEach(async () => {
    globalDir = await mkdtemp(join(tmpdir(), 'pamh-context-global-'))
    projectDir = await mkdtemp(join(tmpdir(), 'pamh-context-project-'))
    await initProjectMemory(projectDir)
  })

  afterEach(async () => {
    await rm(globalDir, { recursive: true, force: true })
    await rm(projectDir, { recursive: true, force: true })
  })

  describe('compileContext', () => {
    it('should compile context from global and project memories', async () => {
      await createMemory(globalDir, {
        type: 'preference',
        scope: 'global',
        content: 'Global preference',
      })

      await createMemory(projectDir, {
        type: 'decision',
        scope: 'project',
        content: 'Project decision',
      })

      const compiled = await compileContext(globalDir, projectDir)

      expect(compiled.sources.global.length).toBe(1)
      expect(compiled.sources.project.length).toBe(1)
      expect(compiled.content).toContain('Global preference')
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

      const compiled = await compileContext(globalDir, projectDir, { maxTokens: 100 })

      expect(compiled.tokenCount).toBeLessThanOrEqual(100)
    })

    it('should exclude global memory when includeGlobal is false', async () => {
      await createMemory(globalDir, {
        type: 'preference',
        scope: 'global',
        content: 'Global preference',
      })

      const compiled = await compileContext(globalDir, projectDir, { includeGlobal: false })

      expect(compiled.sources.global.length).toBe(0)
      expect(compiled.content).not.toContain('Global preference')
    })

    it('should exclude project memory when includeProject is false', async () => {
      await createMemory(projectDir, {
        type: 'decision',
        scope: 'project',
        content: 'Project decision',
      })

      const compiled = await compileContext(globalDir, projectDir, { includeProject: false })

      expect(compiled.sources.project.length).toBe(0)
      expect(compiled.content).not.toContain('Project decision')
    })

    it('should handle empty memory stores', async () => {
      const compiled = await compileContext(globalDir, projectDir)

      expect(compiled.sources.global.length).toBe(0)
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

      const compiled = await compileContext(globalDir, projectDir)

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

      const compiled = await compileContext(globalDir, projectDir)
      const outputPath = await writeCompiledContext(projectDir, compiled)

      expect(outputPath).toContain('compiled-context.md')

      const { readFile } = await import('node:fs/promises')
      const content = await readFile(outputPath, 'utf-8')
      expect(content).toBe(compiled.content)
    })
  })
})
