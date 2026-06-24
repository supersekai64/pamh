import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { EmbeddingProvider, createEmbeddingProvider } from './embedding.js'
import type { Memory } from './types.js'

interface SemanticMetadataRow {
  dimensions: number
}

interface SemanticEmbeddingRow {
  content_hash: string
}

export class SemanticIndex {
  private db: Database.Database
  private embeddingProvider: EmbeddingProvider
  private dimensions: number

  constructor(basePath: string, embeddingProvider?: EmbeddingProvider) {
    const dbPath = join(basePath, 'memory.db')
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')

    sqliteVec.load(this.db)

    this.embeddingProvider = embeddingProvider || createEmbeddingProvider()
    this.dimensions = this.embeddingProvider.getDimensions()

    this.initialize()
  }

  private initialize() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS semantic_metadata (
        key TEXT PRIMARY KEY,
        dimensions INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS semantic_embeddings (
        memory_id TEXT PRIMARY KEY,
        content_hash TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)

    const metadata = this.db
      .prepare("SELECT dimensions FROM semantic_metadata WHERE key = 'default'")
      .get() as SemanticMetadataRow | undefined

    if (metadata && metadata.dimensions !== this.dimensions) {
      this.db.exec(`
        DROP TABLE IF EXISTS vec_memories;
        DELETE FROM semantic_embeddings;
        DELETE FROM semantic_metadata WHERE key = 'default';
      `)
    }

    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_memories USING vec0(
        id TEXT PRIMARY KEY,
        embedding float[${this.dimensions}]
      )
    `)

    this.db
      .prepare("INSERT OR REPLACE INTO semantic_metadata (key, dimensions) VALUES ('default', ?)")
      .run(this.dimensions)
  }

  async indexMemory(memoryId: string, content: string): Promise<void> {
    const contentHash = hashContent(content)
    const existing = this.db
      .prepare('SELECT content_hash FROM semantic_embeddings WHERE memory_id = ?')
      .get(memoryId) as SemanticEmbeddingRow | undefined

    if (existing?.content_hash === contentHash) {
      return
    }

    const embedding = await this.embeddingProvider.generate(content)

    const vectorStmt = this.db.prepare(`
      INSERT OR REPLACE INTO vec_memories (id, embedding)
      VALUES (?, ?)
    `)

    const metadataStmt = this.db.prepare(`
      INSERT OR REPLACE INTO semantic_embeddings (memory_id, content_hash, updated_at)
      VALUES (?, ?, ?)
    `)

    const transaction = this.db.transaction(() => {
      vectorStmt.run(memoryId, new Float32Array(embedding))
      metadataStmt.run(memoryId, contentHash, new Date().toISOString())
    })

    transaction()
  }

  async search(query: string, limit = 10): Promise<SemanticSearchResult[]> {
    const queryEmbedding = await this.embeddingProvider.generate(query)

    const stmt = this.db.prepare(`
      SELECT id, distance
      FROM vec_memories
      WHERE embedding MATCH ?
      ORDER BY distance
      LIMIT ?
    `)

    const rows = stmt.all(new Float32Array(queryEmbedding), limit) as Array<{
      id: string
      distance: number
    }>

    return rows.map((row) => ({
      id: row.id,
      score: 1 - row.distance,
    }))
  }

  removeMemory(memoryId: string): void {
    const transaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM vec_memories WHERE id = ?').run(memoryId)
      this.db.prepare('DELETE FROM semantic_embeddings WHERE memory_id = ?').run(memoryId)
    })

    transaction()
  }

  close(): void {
    this.db.close()
  }
}

export interface SemanticSearchResult {
  id: string
  score: number
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

export async function autoIndexSemanticMemory(basePath: string, memory: Memory): Promise<void> {
  const index = new SemanticIndex(basePath)
  try {
    if (memory.metadata.status === 'deleted') {
      index.removeMemory(memory.metadata.id)
      return
    }

    await index.indexMemory(memory.metadata.id, semanticMemoryText(memory))
  } finally {
    index.close()
  }
}

export function removeSemanticMemory(basePath: string, memoryId: string): void {
  const index = new SemanticIndex(basePath)
  try {
    index.removeMemory(memoryId)
  } finally {
    index.close()
  }
}

function semanticMemoryText(memory: Memory): string {
  return [
    memory.metadata.title,
    memory.metadata.type,
    memory.metadata.theme,
    memory.metadata.source,
    ...memory.metadata.tags,
    ...(memory.metadata.concepts ?? []),
    memory.content,
  ]
    .filter(Boolean)
    .join('\n')
}
