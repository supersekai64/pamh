import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { existsSync } from 'node:fs'
import AdmZip from 'adm-zip'
import { importMemories } from './import.js'
import { createMemory, initProjectMemory, listMemories } from './storage.js'
import { MemoryIndex } from './indexer.js'
import { getSupersessionChain } from './supersession.js'

describe('import', () => {
  let tempDir: string
  let basePath: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pam-import-test-'))
    basePath = await initProjectMemory(tempDir)
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should import from JSON format', async () => {
    const jsonData = {
      version: '1.0.0',
      memories: [
        {
          metadata: {
            id: 'mem_test123',
            type: 'decision',
            scope: 'project',
            status: 'active',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
            tags: ['test'],
            source: 'import',
          },
          content: 'Test decision',
        },
      ],
    }

    const inputPath = join(tempDir, 'import.json')
    await writeFile(inputPath, JSON.stringify(jsonData, null, 2), 'utf-8')

    const result = await importMemories({ format: 'json', inputPath, basePath })

    expect(result.imported).toBe(1)
    expect(result.skipped).toBe(0)
    expect(result.errors).toEqual([])

    const memories = await listMemories(basePath)
    expect(memories.length).toBe(1)
    expect(memories[0].content).toBe('Test decision')

    const index = new MemoryIndex(basePath)
    const results = index.search({ query: 'Test decision' })
    index.close()

    expect(results.length).toBe(1)
  })

  it('should import multiple memories from JSON', async () => {
    const jsonData = {
      version: '1.0.0',
      memories: [
        {
          metadata: {
            id: 'mem_1',
            type: 'decision',
            scope: 'project',
            status: 'active',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
            tags: [],
            source: 'import',
          },
          content: 'Decision 1',
        },
        {
          metadata: {
            id: 'mem_2',
            type: 'knowledge',
            scope: 'project',
            status: 'active',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
            tags: [],
            source: 'import',
          },
          content: 'Knowledge 1',
        },
      ],
    }

    const inputPath = join(tempDir, 'import.json')
    await writeFile(inputPath, JSON.stringify(jsonData, null, 2), 'utf-8')

    const result = await importMemories({ format: 'json', inputPath, basePath })

    expect(result.imported).toBe(2)

    const memories = await listMemories(basePath)
    expect(memories.length).toBe(2)
  })

  it('should import a Markdown memory', async () => {
    const inputPath = join(tempDir, 'memory.md')
    await writeFile(
      inputPath,
      `---
id: mem_markdown
type: knowledge
scope: project
status: active
created_at: '2026-01-01T00:00:00.000Z'
updated_at: '2026-01-01T00:00:00.000Z'
tags:
  - markdown
source: import
---
Markdown memory content
`,
      'utf-8'
    )

    const result = await importMemories({ format: 'markdown', inputPath, basePath })

    expect(result.imported).toBe(1)
    expect(result.skipped).toBe(0)

    const index = new MemoryIndex(basePath)
    const results = index.search({ query: 'Markdown memory content' })
    index.close()

    expect(results.length).toBe(1)
  })

  it('should normalize legacy project type in JSON imports', async () => {
    const jsonData = {
      version: '1.0.0',
      memories: [
        {
          metadata: {
            id: 'mem_legacy_project_type',
            type: 'project',
            scope: 'project',
            status: 'active',
            tags: [],
            source: 'import',
          },
          content: 'Legacy project metadata is now regular knowledge.',
        },
      ],
    }

    const inputPath = join(tempDir, 'legacy-project-type.json')
    await writeFile(inputPath, JSON.stringify(jsonData, null, 2), 'utf-8')

    const result = await importMemories({ format: 'json', inputPath, basePath })

    expect(result.imported).toBe(1)
    expect(result.skipped).toBe(0)

    const memories = await listMemories(basePath)
    expect(memories[0].metadata.type).toBe('knowledge')
  })

  it('should handle invalid JSON gracefully', async () => {
    const inputPath = join(tempDir, 'invalid.json')
    await writeFile(inputPath, 'not valid json', 'utf-8')

    await expect(importMemories({ format: 'json', inputPath, basePath })).rejects.toThrow()
  })

  it('should skip memories with errors', async () => {
    const jsonData = {
      version: '1.0.0',
      memories: [
        {
          metadata: {
            id: 'mem_valid',
            type: 'decision',
            scope: 'project',
            status: 'active',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
            tags: [],
            source: 'import',
          },
          content: 'Valid memory',
        },
      ],
    }

    const inputPath = join(tempDir, 'import.json')
    await writeFile(inputPath, JSON.stringify(jsonData, null, 2), 'utf-8')

    const result = await importMemories({ format: 'json', inputPath, basePath })

    expect(result.imported).toBe(1)
    expect(result.skipped).toBe(0)
  })

  it('should reject imported memories with invalid metadata', async () => {
    const jsonData = {
      version: '1.0.0',
      memories: [
        {
          metadata: {
            id: 'mem_invalid',
            type: 'unknown',
            scope: 'project',
            status: 'active',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
            tags: [],
            source: 'import',
          },
          content: 'Invalid memory',
        },
      ],
    }

    const inputPath = join(tempDir, 'invalid-metadata.json')
    await writeFile(inputPath, JSON.stringify(jsonData, null, 2), 'utf-8')

    const result = await importMemories({ format: 'json', inputPath, basePath })

    expect(result.imported).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.errors[0]).toContain('Invalid memory type')
  })

  it('should skip JSON memories with unsafe IDs without writing outside the store', async () => {
    const outsidePath = join(tempDir, 'outside_PAM_escape.md')
    const jsonData = {
      version: '1.0.0',
      memories: [
        {
          metadata: {
            id: '../../outside_PAM_escape',
            type: 'knowledge',
            scope: 'project',
            status: 'active',
            tags: [],
            source: 'import',
          },
          content: 'Unsafe memory',
        },
      ],
    }

    const inputPath = join(tempDir, 'unsafe.json')
    await writeFile(inputPath, JSON.stringify(jsonData, null, 2), 'utf-8')

    const result = await importMemories({ format: 'json', inputPath, basePath })

    expect(result.imported).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.errors[0]).toContain('Invalid memory id')
    expect(existsSync(outsidePath)).toBe(false)
  })

  it('should skip ZIP memories with unsafe IDs', async () => {
    const inputPath = join(tempDir, 'unsafe.zip')
    const zip = new AdmZip()
    zip.addFile(
      'knowledge/unsafe.md',
      Buffer.from(
        `---
id: mem_bad/path
type: knowledge
scope: project
status: active
created_at: '2026-01-01T00:00:00.000Z'
updated_at: '2026-01-01T00:00:00.000Z'
tags: []
source: import
---
Unsafe ZIP memory
`,
        'utf-8'
      )
    )
    zip.writeZip(inputPath)

    const result = await importMemories({ format: 'zip', inputPath, basePath })

    expect(result.imported).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.errors[0]).toContain('Invalid memory id')
  })

  it('should skip existing IDs by default instead of replacing local memories', async () => {
    const existing = await createMemory(basePath, {
      type: 'knowledge',
      scope: 'project',
      content: 'Keep local memory',
    })
    const inputPath = join(tempDir, 'collision.json')
    await writeFile(
      inputPath,
      JSON.stringify(
        {
          memories: [
            {
              metadata: {
                id: existing.metadata.id,
                type: 'knowledge',
                scope: 'project',
                status: 'active',
                tags: [],
                source: 'import',
              },
              content: 'Imported replacement',
            },
          ],
        },
        null,
        2
      ),
      'utf-8'
    )

    const result = await importMemories({ format: 'json', inputPath, basePath })
    const memories = await listMemories(basePath)

    expect(result.imported).toBe(0)
    expect(result.skipped).toBe(1)
    expect(memories).toHaveLength(1)
    expect(memories[0].content).toBe('Keep local memory')
  })

  it('should support replacing colliding IDs explicitly', async () => {
    const existing = await createMemory(basePath, {
      type: 'knowledge',
      scope: 'project',
      content: 'Old memory',
    })
    const inputPath = join(tempDir, 'replace.json')
    await writeFile(
      inputPath,
      JSON.stringify({
        memories: [
          {
            metadata: {
              id: existing.metadata.id,
              type: 'decision',
              scope: 'project',
              status: 'active',
              tags: [],
              source: 'import',
            },
            content: 'Replacement memory',
          },
        ],
      }),
      'utf-8'
    )

    const result = await importMemories({
      format: 'json',
      inputPath,
      basePath,
      collision: 'replace',
    })

    expect(result.imported).toBe(1)
    const memories = await listMemories(basePath)
    expect(memories).toHaveLength(1)
    expect(memories[0].metadata.id).toBe(existing.metadata.id)
    expect(memories[0].metadata.type).toBe('decision')
    expect(memories[0].content).toBe('Replacement memory')
  })

  it('should support renaming colliding IDs explicitly', async () => {
    const existing = await createMemory(basePath, {
      type: 'knowledge',
      scope: 'project',
      content: 'Existing memory',
    })
    const inputPath = join(tempDir, 'rename.json')
    await writeFile(
      inputPath,
      JSON.stringify({
        memories: [
          {
            metadata: {
              id: existing.metadata.id,
              type: 'knowledge',
              scope: 'project',
              status: 'active',
              tags: [],
              source: 'import',
            },
            content: 'Renamed import',
          },
        ],
      }),
      'utf-8'
    )

    const result = await importMemories({
      format: 'json',
      inputPath,
      basePath,
      collision: 'rename',
    })

    expect(result.imported).toBe(1)
    const memories = await listMemories(basePath)
    expect(memories).toHaveLength(2)
    expect(memories.some((memory) => memory.metadata.id === existing.metadata.id)).toBe(true)
    expect(memories.some((memory) => memory.content === 'Renamed import')).toBe(true)
  })

  it('should support superseding colliding IDs explicitly', async () => {
    const existing = await createMemory(basePath, {
      type: 'knowledge',
      scope: 'project',
      tags: ['local'],
      content: 'Old local memory',
    })
    const inputPath = join(tempDir, 'supersede.json')
    await writeFile(
      inputPath,
      JSON.stringify({
        memories: [
          {
            metadata: {
              id: existing.metadata.id,
              type: 'decision',
              scope: 'project',
              status: 'active',
              tags: ['imported'],
              source: 'import',
            },
            content: 'Superseding imported memory',
          },
        ],
      }),
      'utf-8'
    )

    const result = await importMemories({
      format: 'json',
      inputPath,
      basePath,
      collision: 'supersede',
    })
    const memories = await listMemories(basePath, { includeArchived: true })
    const chain = await getSupersessionChain(basePath, existing.metadata.id)
    const replacement = chain[1]

    expect(result.imported).toBe(1)
    expect(result.skipped).toBe(0)
    expect(memories).toHaveLength(2)
    expect(chain).toHaveLength(2)
    expect(chain[0].metadata.status).toBe('archived')
    expect(chain[0].metadata.superseded_by).toBe(replacement.metadata.id)
    expect(replacement.metadata.id).not.toBe(existing.metadata.id)
    expect(replacement.metadata.supersedes).toBe(existing.metadata.id)
    expect(replacement.metadata.type).toBe('decision')
    expect(replacement.metadata.status).toBe('active')
    expect(replacement.metadata.tags).toEqual(['imported'])
    expect(replacement.content).toBe('Superseding imported memory')
  })

  it('should reject Markdown imports with unsafe IDs', async () => {
    const inputPath = join(tempDir, 'unsafe.md')
    await writeFile(
      inputPath,
      `---
id: mem_bad\\path
type: knowledge
scope: project
status: active
created_at: '2026-01-01T00:00:00.000Z'
updated_at: '2026-01-01T00:00:00.000Z'
tags: []
source: import
---
Unsafe Markdown memory
`,
      'utf-8'
    )

    const result = await importMemories({ format: 'markdown', inputPath, basePath })

    expect(result.imported).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.errors[0]).toContain('Invalid memory id')
  })

  it('should generate an ID when Markdown import has no ID', async () => {
    const inputPath = join(tempDir, 'missing-id.md')
    await writeFile(
      inputPath,
      `---
type: knowledge
scope: project
status: active
created_at: '2026-01-01T00:00:00.000Z'
updated_at: '2026-01-01T00:00:00.000Z'
tags: []
source: import
---
Missing ID memory
`,
      'utf-8'
    )

    const result = await importMemories({ format: 'markdown', inputPath, basePath })
    const memories = await listMemories(basePath)
    const written = await readFile(
      join(basePath, 'knowledge', `${memories[0].metadata.id}.md`),
      'utf-8'
    )

    expect(result.imported).toBe(1)
    expect(memories[0].metadata.id).toMatch(/^mem_/)
    expect(written).toContain('Missing ID memory')
  })
})
