import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SemanticIndex } from './semantic.js'
import { initProjectMemory, createMemory } from './storage.js'
import type { EmbeddingProvider } from './embedding.js'

class TestEmbeddingProvider implements EmbeddingProvider {
  generate(text: string): Promise<number[]> {
    const normalized = text.toLowerCase()
    return Promise.resolve([
      normalized.includes('javascript') || normalized.includes('typescript') ? 1 : 0,
      normalized.includes('python') ? 1 : 0,
      normalized.includes('framework') || normalized.includes('react') || normalized.includes('vue')
        ? 1
        : 0,
      normalized.includes('test') ? 1 : 0,
    ])
  }

  getDimensions(): number {
    return 4
  }
}

describe('semantic', () => {
  let tempDir: string
  let basePath: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pam-semantic-test-'))
    basePath = await initProjectMemory(tempDir)
  })

  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors on Windows
    }
  })

  describe('SemanticIndex', () => {
    it('should index a memory', async () => {
      const memory = await createMemory(basePath, {
        type: 'knowledge',
        scope: 'project',
        content: 'TypeScript is a typed superset of JavaScript',
      })

      const index = new SemanticIndex(basePath, new TestEmbeddingProvider())
      await index.indexMemory(memory.metadata.id, memory.content)
      index.close()
    }, 30000)

    it('should search memories semantically', async () => {
      const memory1 = await createMemory(basePath, {
        type: 'knowledge',
        scope: 'project',
        content: 'TypeScript is a typed superset of JavaScript',
      })

      const memory2 = await createMemory(basePath, {
        type: 'knowledge',
        scope: 'project',
        content: 'Python is a high-level programming language',
      })

      const index = new SemanticIndex(basePath, new TestEmbeddingProvider())
      await index.indexMemory(memory1.metadata.id, memory1.content)
      await index.indexMemory(memory2.metadata.id, memory2.content)

      const results = await index.search('JavaScript programming', 2)

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].id).toBe(memory1.metadata.id)
      expect(typeof results[0].score).toBe('number')

      index.close()
    }, 30000)

    it('should remove a memory from index', async () => {
      const memory = await createMemory(basePath, {
        type: 'knowledge',
        scope: 'project',
        content: 'Test memory to be removed',
      })

      const index = new SemanticIndex(basePath, new TestEmbeddingProvider())
      await index.indexMemory(memory.metadata.id, memory.content)

      const resultsBefore = await index.search('test memory', 10)
      expect(resultsBefore.length).toBeGreaterThan(0)

      index.removeMemory(memory.metadata.id)

      const resultsAfter = await index.search('test memory', 10)
      expect(resultsAfter.length).toBe(0)

      index.close()
    }, 30000)

    it('should handle multiple memories', async () => {
      const memories = []
      const contents = [
        'React is a JavaScript library for building user interfaces',
        'Vue.js is a progressive JavaScript framework',
        'Angular is a platform for building mobile and desktop web applications',
        'Svelte is a radical new approach to building user interfaces',
      ]

      for (const content of contents) {
        const memory = await createMemory(basePath, {
          type: 'knowledge',
          scope: 'project',
          content,
        })
        memories.push(memory)
      }

      const index = new SemanticIndex(basePath, new TestEmbeddingProvider())
      for (const memory of memories) {
        await index.indexMemory(memory.metadata.id, memory.content)
      }

      const results = await index.search('JavaScript framework', 4)

      expect(results.length).toBeGreaterThan(0)
      expect(results.length).toBeLessThanOrEqual(4)

      index.close()
    }, 60000)
  })
})
