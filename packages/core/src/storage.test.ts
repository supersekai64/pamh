import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  initProjectMemory,
  createMemory,
  readMemory,
  updateMemory,
  deleteMemory,
  archiveMemory,
  listMemories,
  indexAllMemories,
  findMemoryFile,
  scanMemoryFileIssues,
} from './storage.js'
import { MemoryIndex } from './indexer.js'
import { existsSync } from 'node:fs'

describe('storage', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pam-test-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  describe('initProjectMemory', () => {
    it('should create project memory structure', async () => {
      const basePath = await initProjectMemory(tempDir)

      expect(existsSync(basePath)).toBe(true)
      expect(existsSync(join(basePath, 'sessions'))).toBe(true)
      expect(existsSync(join(basePath, 'exchanges'))).toBe(true)
      expect(existsSync(join(basePath, 'auto-capture.yaml'))).toBe(true)
      expect(existsSync(join(basePath, 'project.md'))).toBe(false)
      expect(existsSync(join(basePath, 'architecture.md'))).toBe(false)
      expect(existsSync(join(basePath, 'decisions.md'))).toBe(false)
    })
  })

  describe('CRUD', () => {
    it('should create a memory', async () => {
      const basePath = await initProjectMemory(tempDir)

      const memory = await createMemory(basePath, {
        type: 'decision',
        scope: 'project',
        content: 'Use TypeScript for everything',
        tags: ['tech', 'typescript'],
        concepts: ['Architecture'],
      })

      expect(memory.metadata.id).toMatch(/^mem_/)
      expect(memory.metadata.type).toBe('decision')
      expect(memory.metadata.scope).toBe('project')
      expect(memory.metadata.status).toBe('active')
      expect(memory.metadata.theme).toBe('decision')
      expect(memory.metadata.title).toBe('Use TypeScript for everything')
      expect(memory.metadata.tags).toEqual(['tech', 'typescript'])
      expect(memory.metadata.concepts).toEqual(['architecture'])
      expect(memory.content).toBe('Use TypeScript for everything')
    })

    it('should keep memory titles compact and consistent', async () => {
      const basePath = await initProjectMemory(tempDir)

      const generated = await createMemory(basePath, {
        type: 'session',
        scope: 'project',
        content:
          'Added SQLite index diagnostic cards to the PAM UI SQLite index page with storage and vector coverage metrics.',
      })
      const explicit = await createMemory(basePath, {
        type: 'knowledge',
        scope: 'project',
        title: 'Explicit display title',
        content: 'This content should not replace the title.',
      })

      expect(generated.metadata.title).toBe(
        'Added SQLite index diagnostic cards to the PAM UI SQLite index page with'
      )
      expect(explicit.metadata.title).toBe('Explicit display title')
    })

    it('should persist compiled theme summaries in SQLite', async () => {
      const basePath = await initProjectMemory(tempDir)

      await createMemory(basePath, {
        type: 'rule',
        scope: 'project',
        content: 'Always update documentation after behavior changes.',
      })
      await createMemory(basePath, {
        type: 'decision',
        scope: 'project',
        content: 'Use SQLite for compiled theme storage.',
      })

      const index = new MemoryIndex(basePath)
      const compilations = index.getThemeCompilations()
      index.close()

      expect(compilations.map((item) => item.theme)).toEqual(
        expect.arrayContaining(['instruction', 'decision'])
      )
      expect(compilations.find((item) => item.theme === 'instruction')?.content).toContain(
        'compiled PAM memory theme'
      )
    })

    it('should read a memory', async () => {
      const basePath = await initProjectMemory(tempDir)

      const created = await createMemory(basePath, {
        type: 'knowledge',
        scope: 'project',
        content: 'Test knowledge',
      })

      const read = await readMemory(basePath, created.metadata.id)

      expect(read).not.toBeNull()
      expect(read!.metadata.id).toBe(created.metadata.id)
      expect(read!.content).toBe('Test knowledge')
    })

    it('should return null for non-existent memory', async () => {
      const basePath = await initProjectMemory(tempDir)
      const read = await readMemory(basePath, 'mem_nonexistent')
      expect(read).toBeNull()
    })

    it('should update a memory', async () => {
      const basePath = await initProjectMemory(tempDir)

      const created = await createMemory(basePath, {
        type: 'knowledge',
        scope: 'project',
        content: 'Original content',
      })

      const updated = await updateMemory(basePath, created.metadata.id, {
        content: 'Updated content',
        tags: ['updated'],
        concepts: ['UI'],
      })

      expect(updated).not.toBeNull()
      expect(updated!.content).toBe('Updated content')
      expect(updated!.metadata.tags).toEqual(['updated'])
      expect(updated!.metadata.concepts).toEqual(['ui'])
      expect(updated!.metadata.updated_at).not.toBe(created.metadata.updated_at)
    })

    it('should move the Markdown file when a memory type changes', async () => {
      const basePath = await initProjectMemory(tempDir)

      const created = await createMemory(basePath, {
        type: 'knowledge',
        scope: 'project',
        content: 'Move me',
      })
      const oldPath = join(basePath, 'knowledge', `${created.metadata.id}.md`)

      const updated = await updateMemory(basePath, created.metadata.id, {
        type: 'decision',
      })
      const newPath = join(basePath, 'decisions', `${created.metadata.id}.md`)

      expect(updated!.metadata.type).toBe('decision')
      expect(existsSync(oldPath)).toBe(false)
      expect(existsSync(newPath)).toBe(true)
      expect(await findMemoryFile(basePath, created.metadata.id)).toBe(newPath)
    })

    it('should delete a memory (logical)', async () => {
      const basePath = await initProjectMemory(tempDir)

      const created = await createMemory(basePath, {
        type: 'knowledge',
        scope: 'project',
        content: 'To be deleted',
      })

      const deleted = await deleteMemory(basePath, created.metadata.id)
      expect(deleted).toBe(true)

      const read = await readMemory(basePath, created.metadata.id)
      expect(read!.metadata.status).toBe('deleted')
    })

    it('should archive a memory', async () => {
      const basePath = await initProjectMemory(tempDir)

      const created = await createMemory(basePath, {
        type: 'knowledge',
        scope: 'project',
        content: 'To be archived',
      })

      const archived = await archiveMemory(basePath, created.metadata.id)
      expect(archived).toBe(true)

      const read = await readMemory(basePath, created.metadata.id)
      expect(read!.metadata.status).toBe('archived')

      const index = new MemoryIndex(basePath)
      const results = index.search({ query: 'archived' })
      index.close()

      expect(results.length).toBe(0)
    })

    it('should physically delete a memory', async () => {
      const basePath = await initProjectMemory(tempDir)

      const created = await createMemory(basePath, {
        type: 'knowledge',
        scope: 'project',
        content: 'Physically deleted',
      })

      const deleted = await deleteMemory(basePath, created.metadata.id, { physical: true })
      expect(deleted).toBe(true)

      const backups = await readdir(join(basePath, 'backups'))
      expect(backups.some((entry) => entry.endsWith(`-${created.metadata.id}.bak`))).toBe(true)

      const read = await readMemory(basePath, created.metadata.id)
      expect(read).toBeNull()

      const index = new MemoryIndex(basePath)
      const result = index.getMemoryById(created.metadata.id)
      index.close()

      expect(result).toBeNull()

      const memories = await listMemories(basePath)
      expect(memories).toHaveLength(0)
    })

    it('should list all memories', async () => {
      const basePath = await initProjectMemory(tempDir)

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

      const memories = await listMemories(basePath)

      expect(memories.length).toBe(2)
    })

    it('should reject invalid type and scope at runtime', async () => {
      const basePath = await initProjectMemory(tempDir)

      await expect(
        createMemory(basePath, {
          type: 'invalid' as never,
          scope: 'project',
          content: 'Invalid type',
        })
      ).rejects.toThrow('Invalid memory type')

      await expect(
        createMemory(basePath, {
          type: 'knowledge',
          scope: 'invalid' as never,
          content: 'Invalid scope',
        })
      ).rejects.toThrow('Invalid memory scope')

      await expect(
        createMemory(basePath, {
          type: 'knowledge',
          scope: 'project',
          content: 'Invalid salience',
          salience: 2,
        })
      ).rejects.toThrow('Invalid salience')
    })

    it('should clear stale index rows during rebuild', async () => {
      const basePath = await initProjectMemory(tempDir)
      const memory = await createMemory(basePath, {
        type: 'knowledge',
        scope: 'project',
        content: 'Remove this physical file',
      })

      await rm(join(basePath, 'knowledge', `${memory.metadata.id}.md`), { force: true })
      await indexAllMemories(basePath)

      const index = new MemoryIndex(basePath)
      const result = index.getMemoryById(memory.metadata.id)
      index.close()

      expect(result).toBeNull()
    })

    it('should report invalid Markdown memory files', async () => {
      const basePath = await initProjectMemory(tempDir)
      await mkdir(join(basePath, 'knowledge'), { recursive: true })
      await writeFile(
        join(basePath, 'knowledge', 'unsafe.md'),
        `---
id: ../../unsafe
type: knowledge
scope: project
status: active
tags: []
source: manual
---
Unsafe id
`,
        'utf-8'
      )

      const issues = await scanMemoryFileIssues(basePath)

      expect(issues).toHaveLength(1)
      expect(issues[0].error).toContain('Invalid memory id')
    })
  })
})
