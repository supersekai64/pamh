import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'
import { MemoryIndex } from './indexer.js'
import { createMemory, initProjectMemory, updateMemory, deleteMemory } from './storage.js'

describe('MemoryIndex', () => {
  let tempDir: string
  let basePath: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pam-index-test-'))
    basePath = await initProjectMemory(tempDir)
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should index a memory and retrieve it', async () => {
    const memory = await createMemory(basePath, {
      type: 'decision',
      scope: 'project',
      content: 'Use TypeScript for all packages',
      tags: ['tech', 'typescript'],
    })

    const index = new MemoryIndex(basePath)
    const result = index.getMemoryById(memory.metadata.id)
    index.close()

    expect(result).not.toBeNull()
    expect(result!.id).toBe(memory.metadata.id)
    expect(result!.content).toBe('Use TypeScript for all packages')
    expect(result!.tags).toContain('tech')
    expect(result!.tags).toContain('typescript')
  })

  it('should migrate an existing index before creating the theme index', async () => {
    const legacyBasePath = join(tempDir, 'legacy-memory')
    await mkdir(legacyBasePath, { recursive: true })

    const dbPath = join(legacyBasePath, 'memory.db')
    const db = new Database(dbPath)
    db.exec(`
      CREATE TABLE memories (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        scope TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        source TEXT NOT NULL,
        title TEXT,
        content TEXT NOT NULL,
        file_path TEXT NOT NULL
      );
    `)
    db.close()

    const index = new MemoryIndex(legacyBasePath)
    index.close()

    const migrated = new Database(dbPath)
    const columns = migrated.prepare('PRAGMA table_info(memories)').all() as Array<{ name: string }>
    const indexes = migrated.prepare('PRAGMA index_list(memories)').all() as Array<{ name: string }>
    migrated.close()

    expect(columns.map((column) => column.name)).toContain('theme')
    expect(indexes.map((item) => item.name)).toContain('idx_memories_theme')
  })

  it('should search by full text', async () => {
    await createMemory(basePath, {
      type: 'knowledge',
      scope: 'project',
      content: 'PostgreSQL is a powerful database',
      tags: ['database'],
    })

    await createMemory(basePath, {
      type: 'knowledge',
      scope: 'project',
      content: 'MongoDB is a NoSQL database',
      tags: ['database'],
    })

    const index = new MemoryIndex(basePath)
    const results = index.search({ query: 'PostgreSQL' })
    index.close()

    expect(results.length).toBeGreaterThan(0)
    expect(results[0].content).toContain('PostgreSQL')
  })

  it('should fall back to natural query synonyms when exact search misses', async () => {
    await createMemory(basePath, {
      type: 'decision',
      scope: 'project',
      content: 'Use PostgreSQL for production persistence',
      tags: ['architecture'],
    })

    const index = new MemoryIndex(basePath)
    const exactResults = index.search({ query: 'database choice', natural: false })
    const naturalResults = index.search({ query: 'database choice' })
    index.close()

    expect(exactResults).toHaveLength(0)
    expect(naturalResults.length).toBeGreaterThan(0)
    expect(naturalResults[0].content).toContain('PostgreSQL')
  })

  it('should search by tag', async () => {
    await createMemory(basePath, {
      type: 'decision',
      scope: 'project',
      content: 'Decision 1',
      tags: ['important'],
    })

    await createMemory(basePath, {
      type: 'decision',
      scope: 'project',
      content: 'Decision 2',
      tags: ['minor'],
    })

    const index = new MemoryIndex(basePath)
    const results = index.search({ tag: 'important' })
    index.close()

    expect(results.length).toBe(1)
    expect(results[0].content).toBe('Decision 1')
  })

  it('should search by type', async () => {
    await createMemory(basePath, {
      type: 'decision',
      scope: 'project',
      content: 'A decision',
    })

    await createMemory(basePath, {
      type: 'knowledge',
      scope: 'project',
      content: 'Some knowledge',
    })

    const index = new MemoryIndex(basePath)
    const results = index.search({ type: 'decision' })
    index.close()

    expect(results.length).toBe(1)
    expect(results[0].type).toBe('decision')
  })

  it('should search by scope', async () => {
    await createMemory(basePath, {
      type: 'knowledge',
      scope: 'project',
      content: 'Project knowledge',
    })

    const index = new MemoryIndex(basePath)
    const results = index.search({ scope: 'project' })
    index.close()

    expect(results.length).toBe(1)
    expect(results[0].scope).toBe('project')
  })

  it('should update index when memory is updated', async () => {
    const memory = await createMemory(basePath, {
      type: 'knowledge',
      scope: 'project',
      content: 'Original content',
      tags: ['original'],
    })

    await updateMemory(basePath, memory.metadata.id, {
      content: 'Updated content',
      tags: ['updated'],
    })

    const index = new MemoryIndex(basePath)
    const result = index.getMemoryById(memory.metadata.id)
    index.close()

    expect(result!.content).toBe('Updated content')
    expect(result!.tags).toContain('updated')
    expect(result!.tags).not.toContain('original')
  })

  it('should update index when memory is deleted', async () => {
    const memory = await createMemory(basePath, {
      type: 'knowledge',
      scope: 'project',
      content: 'To be deleted',
    })

    await deleteMemory(basePath, memory.metadata.id)

    const index = new MemoryIndex(basePath)
    const result = index.getMemoryById(memory.metadata.id)
    index.close()

    expect(result!.status).toBe('deleted')
  })

  it('should return stats', async () => {
    await createMemory(basePath, {
      type: 'decision',
      scope: 'project',
      content: 'Decision 1',
      tags: ['tag1'],
    })

    await createMemory(basePath, {
      type: 'knowledge',
      scope: 'project',
      content: 'Knowledge 1',
      tags: ['tag1', 'tag2'],
    })

    const index = new MemoryIndex(basePath)
    const stats = index.getStats()
    index.close()

    expect(stats.total).toBe(2)
    expect(stats.active).toBe(2)
    expect(stats.byType.decision).toBe(1)
    expect(stats.byType.knowledge).toBe(1)
    expect(stats.tags.tag1).toBe(2)
    expect(stats.tags.tag2).toBe(1)
  })

  it('should not return deleted memories in search', async () => {
    const memory = await createMemory(basePath, {
      type: 'knowledge',
      scope: 'project',
      content: 'Active knowledge',
    })

    await createMemory(basePath, {
      type: 'knowledge',
      scope: 'project',
      content: 'Deleted knowledge',
    })

    await deleteMemory(basePath, memory.metadata.id)

    const index = new MemoryIndex(basePath)
    const results = index.search({ query: 'knowledge' })
    index.close()

    expect(results.length).toBe(1)
    expect(results[0].content).toBe('Deleted knowledge')
  })

  it('should not throw when searching FTS special characters', async () => {
    await createMemory(basePath, {
      type: 'knowledge',
      scope: 'project',
      content: 'Exact phrase with punctuation',
    })

    const index = new MemoryIndex(basePath)
    expect(() => index.search({ query: '"unterminated AND (paren:' })).not.toThrow()
    index.close()
  })
})
