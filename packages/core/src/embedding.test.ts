import { describe, it, expect, vi } from 'vitest'
import {
  createEmbeddingProvider,
  HashEmbeddingProvider,
  LocalEmbeddingProvider,
} from './embedding.js'

vi.mock('@xenova/transformers', () => ({
  env: {
    allowLocalModels: true,
    useBrowserCache: true,
  },
  pipeline: vi.fn(async () => async (text: string) => ({
    data: Array.from({ length: 384 }, (_, index) => text.length + index / 1000),
  })),
}))

describe('embedding', () => {
  describe('createEmbeddingProvider', () => {
    it('should create hash provider by default', () => {
      const provider = createEmbeddingProvider()
      expect(provider).toBeInstanceOf(HashEmbeddingProvider)
    })

    it('should create local provider when type is local', () => {
      const provider = createEmbeddingProvider({ type: 'local' })
      expect(provider).toBeInstanceOf(LocalEmbeddingProvider)
    })

    it('should throw error for openai provider without API key', () => {
      const originalKey = process.env.OPENAI_API_KEY
      delete process.env.OPENAI_API_KEY

      expect(() => createEmbeddingProvider({ type: 'openai' })).toThrow(
        'OpenAI API key is required'
      )

      if (originalKey) {
        process.env.OPENAI_API_KEY = originalKey
      }
    })
  })

  describe('LocalEmbeddingProvider', () => {
    it('should have correct dimensions', () => {
      const provider = new LocalEmbeddingProvider()
      expect(provider.getDimensions()).toBe(384)
    })

    it('should generate embedding for text', async () => {
      const provider = new LocalEmbeddingProvider()
      const embedding = await provider.generate('Hello world')

      expect(embedding).toBeInstanceOf(Array)
      expect(embedding.length).toBe(384)
      expect(embedding.every((v) => typeof v === 'number')).toBe(true)
    }, 30000)

    it('should generate different embeddings for different texts', async () => {
      const provider = new LocalEmbeddingProvider()
      const embedding1 = await provider.generate('Hello world')
      const embedding2 = await provider.generate('Goodbye universe')

      expect(embedding1).not.toEqual(embedding2)
    }, 30000)
  })
})
