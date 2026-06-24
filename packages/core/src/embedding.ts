export interface EmbeddingProvider {
  generate(text: string): Promise<number[]>
  getDimensions(): number
}

type FeatureExtractionPipeline = (
  text: string,
  options: { pooling: 'mean'; normalize: boolean }
) => Promise<{ data: Iterable<number> }>

type TransformersModule = {
  env: {
    allowLocalModels: boolean
    useBrowserCache: boolean
  }
  pipeline(task: 'feature-extraction', model: string): Promise<FeatureExtractionPipeline>
}

const LOCAL_EMBEDDINGS_PACKAGE = '@xenova/transformers'

export class HashEmbeddingProvider implements EmbeddingProvider {
  private dimensions: number

  constructor(dimensions = 384) {
    this.dimensions = dimensions
  }

  async generate(text: string): Promise<number[]> {
    const vector = new Array(this.dimensions).fill(0) as number[]
    const tokens = tokenize(text)

    for (const token of tokens) {
      const hash = hashToken(token)
      const index = Math.abs(hash) % this.dimensions
      vector[index] += hash < 0 ? -1 : 1
    }

    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
    if (!magnitude) return vector
    return vector.map((value) => value / magnitude)
  }

  getDimensions(): number {
    return this.dimensions
  }
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
  private model: FeatureExtractionPipeline | null = null
  private modelName: string
  private dimensions: number

  constructor(modelName = 'Xenova/all-MiniLM-L6-v2', dimensions = 384) {
    this.modelName = modelName
    this.dimensions = dimensions
  }

  async generate(text: string): Promise<number[]> {
    if (!this.model) {
      const transformers = await loadTransformers()
      transformers.env.allowLocalModels = false
      transformers.env.useBrowserCache = false
      this.model = await transformers.pipeline('feature-extraction', this.modelName)
    }

    const model = this.model
    const output = await model(text, {
      pooling: 'mean',
      normalize: true,
    })

    return Array.from(output.data, Number)
  }

  getDimensions(): number {
    return this.dimensions
  }
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private apiKey: string
  private model: string
  private dimensions: number

  constructor(apiKey?: string, model = 'text-embedding-3-small', dimensions = 1536) {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || ''
    this.model = model
    this.dimensions = dimensions

    if (!this.apiKey) {
      throw new Error('OpenAI API key is required. Set OPENAI_API_KEY environment variable.')
    }
  }

  async generate(text: string): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        input: text,
        model: this.model,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`)
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>
    }
    return data.data[0].embedding
  }

  getDimensions(): number {
    return this.dimensions
  }
}

export function createEmbeddingProvider(config?: {
  type?: 'hash' | 'local' | 'openai'
  openaiApiKey?: string
  openaiModel?: string
}): EmbeddingProvider {
  const type = config?.type || process.env.EMBEDDING_PROVIDER || 'hash'

  if (type === 'openai') {
    return new OpenAIEmbeddingProvider(config?.openaiApiKey, config?.openaiModel)
  }

  if (type === 'local') {
    return new LocalEmbeddingProvider()
  }

  return new HashEmbeddingProvider()
}

async function loadTransformers(): Promise<TransformersModule> {
  try {
    return (await import(LOCAL_EMBEDDINGS_PACKAGE)) as TransformersModule
  } catch (error) {
    if (isMissingOptionalDependency(error)) {
      throw new Error(
        [
          'Local semantic search requires the optional @xenova/transformers package.',
          'Install it next to PAM with: npm install -g @xenova/transformers',
          'Or use OpenAI embeddings by setting EMBEDDING_PROVIDER=openai and OPENAI_API_KEY.',
        ].join(' ')
      )
    }

    throw error
  }
}

function isMissingOptionalDependency(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND' &&
    error.message.includes(LOCAL_EMBEDDINGS_PACKAGE)
  )
}

function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .match(/[a-z0-9][a-z0-9_.+#-]*/g) ?? []
  )
}

function hashToken(token: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash | 0
}
