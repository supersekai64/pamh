import Database from 'better-sqlite3'
import { join } from 'node:path'
import { expandNaturalQuery } from './query.js'
import { formatMemoryTheme, inferMemoryTheme, normalizeMemoryTheme } from './themes.js'
import type { Memory } from './types.js'

interface DbMemoryRow {
  id: string
  title: string | null
  type: string
  scope: string
  status: string
  theme: string | null
  created_at: string
  updated_at: string
  source: string
  content: string
  file_path: string
  tags: string | null
  concepts: string | null
}

interface CountRow {
  count: number
}

interface GroupCountRow {
  type?: string
  scope?: string
  theme?: string
  tag?: string
  count: number
}

interface UpdatedAtRow {
  updated_at: string | null
}

interface ThemeCompilationRow {
  theme: string
  title: string
  content: string
  source_ids: string
  source_count: number
  token_estimate: number
  updated_at: string
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL,
  theme TEXT NOT NULL DEFAULT 'fact',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  concepts TEXT,
  file_path TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  memory_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE,
  PRIMARY KEY (memory_id, tag)
);

CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  memory_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS deletions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  memory_id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  reason TEXT
);

CREATE TABLE IF NOT EXISTS theme_compilations (
  theme TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_ids TEXT NOT NULL,
  source_count INTEGER NOT NULL,
  token_estimate INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope);
CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);
CREATE INDEX IF NOT EXISTS idx_chunks_memory_id ON chunks(memory_id);
`

const FTS_SCHEMA = `
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  id,
  content,
  tags,
  tokenize='porter unicode61'
);
`

export class MemoryIndex {
  private db: Database.Database

  constructor(basePath: string) {
    const dbPath = join(basePath, 'memory.db')
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.initialize()
  }

  private initialize() {
    this.db.exec(SCHEMA)
    this.ensureColumn('memories', 'title', 'TEXT')
    this.ensureColumn('memories', 'theme', "TEXT NOT NULL DEFAULT 'fact'")
    this.ensureColumn('memories', 'concepts', 'TEXT')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_memories_theme ON memories(theme)')
    this.db.exec(FTS_SCHEMA)
  }

  private ensureColumn(table: string, column: string, definition: string) {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    if (!columns.some((item) => item.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    }
  }

  clear() {
    const transaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM tags').run()
      this.db.prepare('DELETE FROM chunks').run()
      this.db.prepare('DELETE FROM deletions').run()
      this.db.prepare('DELETE FROM theme_compilations').run()
      this.db.prepare('DELETE FROM memories_fts').run()
      this.db.prepare('DELETE FROM memories').run()
    })

    transaction()
  }

  indexMemory(memory: Memory, filePath: string) {
    const { id, title, type, scope, status, created_at, updated_at, source, tags, concepts } =
      memory.metadata
    const theme =
      memory.metadata.theme ?? inferMemoryTheme({ type, content: memory.content, tags, source })
    const { content } = memory

    const insertMemory = this.db.prepare(`
      INSERT OR REPLACE INTO memories
        (id, title, type, scope, status, theme, created_at, updated_at, source, content, concepts, file_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const deleteTags = this.db.prepare('DELETE FROM tags WHERE memory_id = ?')
    const insertTag = this.db.prepare('INSERT INTO tags (memory_id, tag) VALUES (?, ?)')

    const deleteFts = this.db.prepare('DELETE FROM memories_fts WHERE id = ?')
    const insertFts = this.db.prepare(
      'INSERT INTO memories_fts (id, content, tags) VALUES (?, ?, ?)'
    )

    const transaction = this.db.transaction(() => {
      insertMemory.run(
        id,
        title ?? null,
        type,
        scope,
        status,
        theme,
        created_at,
        updated_at,
        source,
        content,
        concepts?.join(',') ?? null,
        filePath
      )

      deleteTags.run(id)
      for (const tag of tags) {
        insertTag.run(id, tag)
      }

      deleteFts.run(id)
      insertFts.run(id, content, [theme, ...tags, ...(concepts ?? [])].join(' '))
    })

    transaction()
  }

  removeMemory(id: string, reason?: string) {
    const deleteDeletions = this.db.prepare('DELETE FROM deletions WHERE memory_id = ?')
    const insertDeletion = this.db.prepare(
      'INSERT INTO deletions (memory_id, deleted_at, reason) VALUES (?, ?, ?)'
    )
    const deleteFts = this.db.prepare('DELETE FROM memories_fts WHERE id = ?')
    const deleteMemory = this.db.prepare('DELETE FROM memories WHERE id = ?')

    const transaction = this.db.transaction(() => {
      deleteDeletions.run(id)
      insertDeletion.run(id, new Date().toISOString(), reason || null)
      deleteFts.run(id)
      deleteMemory.run(id)
    })

    transaction()
  }

  rebuildThemeCompilations(): ThemeCompilation[] {
    const rows = this.db
      .prepare(
        `
      SELECT m.*, GROUP_CONCAT(t.tag) as tags
      FROM memories m
      LEFT JOIN tags t ON t.memory_id = m.id
      WHERE m.status = 'active'
      GROUP BY m.id
      ORDER BY m.updated_at DESC
    `
      )
      .all() as DbMemoryRow[]

    const memories = rows.map(rowToSearchResult).filter((memory) => !isNoiseSearchResult(memory))
    const grouped = new Map<string, SearchResult[]>()

    for (const memory of memories) {
      const theme =
        memory.theme ??
        inferMemoryTheme({
          type: memory.type,
          content: memory.content,
          tags: memory.tags,
          source: memory.source,
        })
      grouped.set(theme, [...(grouped.get(theme) ?? []), memory])
    }

    const now = new Date().toISOString()
    const compilations = [...grouped.entries()]
      .map(([theme, themeMemories]) => buildThemeCompilation(theme, themeMemories, now))
      .sort((a, b) => b.source_count - a.source_count || a.theme.localeCompare(b.theme))

    const transaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM theme_compilations').run()
      const upsert = this.db.prepare(`
        INSERT OR REPLACE INTO theme_compilations
          (theme, title, content, source_ids, source_count, token_estimate, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)

      for (const compilation of compilations) {
        upsert.run(
          compilation.theme,
          compilation.title,
          compilation.content,
          JSON.stringify(compilation.source_ids),
          compilation.source_count,
          compilation.token_estimate,
          compilation.updated_at
        )
      }
    })

    transaction()
    return compilations
  }

  getThemeCompilations(): ThemeCompilation[] {
    const rows = this.db
      .prepare(
        `
      SELECT theme, title, content, source_ids, source_count, token_estimate, updated_at
      FROM theme_compilations
      ORDER BY source_count DESC, theme ASC
    `
      )
      .all() as ThemeCompilationRow[]

    return rows.map((row) => ({
      theme: row.theme,
      title: row.title,
      content: row.content,
      source_ids: parseSourceIds(row.source_ids),
      source_count: row.source_count,
      token_estimate: row.token_estimate,
      updated_at: row.updated_at,
    }))
  }

  search(options: SearchOptions): SearchResult[] {
    const { query, type, scope, tag, theme, limit = 50, natural = true } = options
    const normalizedTheme = normalizeMemoryTheme(theme) ?? theme

    if (query) {
      const exactResults = this.searchFullText(query, type, scope, tag, normalizedTheme, limit)
      if (exactResults.length > 0 || !natural) return exactResults
      return this.searchNaturalText(query, type, scope, tag, normalizedTheme, limit)
    }

    return this.searchByFilters(type, scope, tag, normalizedTheme, limit)
  }

  private searchFullText(
    query: string,
    type?: string,
    scope?: string,
    tag?: string,
    theme?: string,
    limit: number = 50
  ): SearchResult[] {
    return this.searchFts(escapeFtsQuery(query), type, scope, tag, theme, limit)
  }

  private searchNaturalText(
    query: string,
    type?: string,
    scope?: string,
    tag?: string,
    theme?: string,
    limit: number = 50
  ): SearchResult[] {
    const { terms } = expandNaturalQuery(query)
    if (terms.length === 0) return []

    return this.searchFts(
      terms.map((term) => quoteFtsTerm(term)).join(' OR '),
      type,
      scope,
      tag,
      theme,
      limit
    )
  }

  private searchFts(
    ftsQuery: string,
    type?: string,
    scope?: string,
    tag?: string,
    theme?: string,
    limit: number = 50
  ): SearchResult[] {
    if (!ftsQuery.trim()) return []

    let sql = `
      SELECT m.*, GROUP_CONCAT(t.tag) as tags
      FROM memories_fts fts
      JOIN memories m ON m.id = fts.id
      LEFT JOIN tags t ON t.memory_id = m.id
      WHERE memories_fts MATCH ?
    `

    const params: (string | number)[] = [ftsQuery]

    if (type) {
      sql += ' AND m.type = ?'
      params.push(type)
    }

    if (scope) {
      sql += ' AND m.scope = ?'
      params.push(scope)
    }

    if (tag) {
      sql += ' AND m.id IN (SELECT memory_id FROM tags WHERE tag = ?)'
      params.push(tag)
    }

    if (theme) {
      sql += ' AND m.theme = ?'
      params.push(theme)
    }

    sql += ' AND m.status = ?'
    params.push('active')

    sql += ' GROUP BY m.id ORDER BY rank LIMIT ?'
    params.push(limit)

    const stmt = this.db.prepare(sql)
    const rows = stmt.all(...params) as DbMemoryRow[]

    return rows.map(rowToSearchResult)
  }

  private searchByFilters(
    type?: string,
    scope?: string,
    tag?: string,
    theme?: string,
    limit: number = 50
  ): SearchResult[] {
    let sql = `
      SELECT m.*, GROUP_CONCAT(t.tag) as tags
      FROM memories m
      LEFT JOIN tags t ON t.memory_id = m.id
      WHERE m.status = 'active'
    `

    const params: (string | number)[] = []

    if (type) {
      sql += ' AND m.type = ?'
      params.push(type)
    }

    if (scope) {
      sql += ' AND m.scope = ?'
      params.push(scope)
    }

    if (tag) {
      sql += ' AND m.id IN (SELECT memory_id FROM tags WHERE tag = ?)'
      params.push(tag)
    }

    if (theme) {
      sql += ' AND m.theme = ?'
      params.push(theme)
    }

    sql += ' GROUP BY m.id ORDER BY m.updated_at DESC LIMIT ?'
    params.push(limit)

    const stmt = this.db.prepare(sql)
    const rows = stmt.all(...params) as DbMemoryRow[]

    return rows.map(rowToSearchResult)
  }

  getStats(): IndexStats {
    const totalMemories = this.db
      .prepare('SELECT COUNT(*) as count FROM memories')
      .get() as CountRow
    const activeMemories = this.db
      .prepare("SELECT COUNT(*) as count FROM memories WHERE status = 'active'")
      .get() as CountRow
    const deletedMemories = this.db
      .prepare("SELECT COUNT(*) as count FROM memories WHERE status = 'deleted'")
      .get() as CountRow
    const archivedMemories = this.db
      .prepare("SELECT COUNT(*) as count FROM memories WHERE status = 'archived'")
      .get() as CountRow
    const proposedMemories = this.db
      .prepare("SELECT COUNT(*) as count FROM memories WHERE status = 'proposed'")
      .get() as CountRow
    const noiseMemories = this.db
      .prepare("SELECT COUNT(*) as count FROM memories WHERE status = 'noise'")
      .get() as CountRow

    const byType = this.db
      .prepare('SELECT type, COUNT(*) as count FROM memories GROUP BY type')
      .all() as GroupCountRow[]
    const byScope = this.db
      .prepare('SELECT scope, COUNT(*) as count FROM memories GROUP BY scope')
      .all() as GroupCountRow[]
    const byTheme = this.db
      .prepare('SELECT theme, COUNT(*) as count FROM memories GROUP BY theme')
      .all() as GroupCountRow[]
    const allTags = this.db
      .prepare('SELECT tag, COUNT(*) as count FROM tags GROUP BY tag')
      .all() as GroupCountRow[]

    return {
      total: totalMemories.count,
      active: activeMemories.count,
      deleted: deletedMemories.count,
      archived: archivedMemories.count,
      proposed: proposedMemories.count,
      noise: noiseMemories.count,
      byType: byType.reduce(
        (acc: Record<string, number>, row) => (row.type ? { ...acc, [row.type]: row.count } : acc),
        {}
      ),
      byScope: byScope.reduce(
        (acc: Record<string, number>, row) =>
          row.scope ? { ...acc, [row.scope]: row.count } : acc,
        {}
      ),
      byTheme: byTheme.reduce(
        (acc: Record<string, number>, row) =>
          row.theme ? { ...acc, [row.theme]: row.count } : acc,
        {}
      ),
      tags: allTags.reduce(
        (acc: Record<string, number>, row) => (row.tag ? { ...acc, [row.tag]: row.count } : acc),
        {}
      ),
    }
  }

  getSqliteStats(): SqliteIndexStats {
    const semanticTableExists = this.tableExists('semantic_embeddings')

    return {
      memoryRows: this.countRows('memories'),
      tagRows: this.countRows('tags'),
      chunkRows: this.countRows('chunks'),
      ftsRows: this.countRows('memories_fts'),
      semanticEmbeddingRows: semanticTableExists ? this.countRows('semantic_embeddings') : 0,
      latestMemoryUpdatedAt: this.getLatestUpdatedAt('memories'),
      latestSemanticUpdatedAt: semanticTableExists
        ? this.getLatestUpdatedAt('semantic_embeddings')
        : null,
    }
  }

  getSemanticEmbeddingIds(): string[] {
    if (!this.tableExists('semantic_embeddings')) return []

    const rows = this.db
      .prepare('SELECT memory_id FROM semantic_embeddings ORDER BY memory_id')
      .all() as Array<{ memory_id: string }>

    return rows.map((row) => row.memory_id)
  }

  getMemoryById(id: string): SearchResult | null {
    const row = this.db
      .prepare(
        `
      SELECT m.*, GROUP_CONCAT(t.tag) as tags
      FROM memories m
      LEFT JOIN tags t ON t.memory_id = m.id
      WHERE m.id = ?
      GROUP BY m.id
    `
      )
      .get(id) as DbMemoryRow | undefined

    return row ? rowToSearchResult(row) : null
  }

  getAllMemories(): SearchResult[] {
    const rows = this.db
      .prepare(
        `
      SELECT m.*, GROUP_CONCAT(t.tag) as tags
      FROM memories m
      LEFT JOIN tags t ON t.memory_id = m.id
      GROUP BY m.id
      ORDER BY m.updated_at DESC
    `
      )
      .all() as DbMemoryRow[]

    return rows.map(rowToSearchResult)
  }

  close() {
    this.db.close()
  }

  private tableExists(table: string): boolean {
    const row = this.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type IN ('table', 'virtual table') AND name = ?"
      )
      .get(table) as { name: string } | undefined

    return Boolean(row)
  }

  private countRows(table: string): number {
    if (!this.tableExists(table)) return 0
    const row = this.db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as CountRow
    return row.count
  }

  private getLatestUpdatedAt(table: string): string | null {
    if (!this.tableExists(table)) return null
    const row = this.db.prepare(`SELECT MAX(updated_at) as updated_at FROM ${table}`).get() as
      | UpdatedAtRow
      | undefined

    return row?.updated_at ?? null
  }
}

export interface SearchOptions {
  query?: string
  type?: string
  scope?: string
  tag?: string
  theme?: string
  limit?: number
  natural?: boolean
}

export interface SearchResult {
  id: string
  title?: string
  type: string
  scope: string
  status: string
  theme?: string
  created_at: string
  updated_at: string
  source: string
  content: string
  file_path: string
  tags: string[]
  concepts: string[]
}

export interface IndexStats {
  total: number
  active: number
  deleted: number
  archived: number
  proposed: number
  noise: number
  byType: Record<string, number>
  byScope: Record<string, number>
  byTheme: Record<string, number>
  tags: Record<string, number>
}

export interface SqliteIndexStats {
  memoryRows: number
  tagRows: number
  chunkRows: number
  ftsRows: number
  semanticEmbeddingRows: number
  latestMemoryUpdatedAt: string | null
  latestSemanticUpdatedAt: string | null
}

export interface ThemeCompilation {
  theme: string
  title: string
  content: string
  source_ids: string[]
  source_count: number
  token_estimate: number
  updated_at: string
}

function rowToSearchResult(row: DbMemoryRow): SearchResult {
  return {
    id: row.id,
    title: row.title ?? undefined,
    type: row.type,
    scope: row.scope,
    status: row.status,
    theme: row.theme ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    source: row.source,
    content: row.content,
    file_path: row.file_path,
    tags: row.tags ? row.tags.split(',').filter(Boolean) : [],
    concepts: row.concepts ? row.concepts.split(',').filter(Boolean) : [],
  }
}

function buildThemeCompilation(
  theme: string,
  memories: SearchResult[],
  updatedAt: string
): ThemeCompilation {
  const title = formatMemoryTheme(theme)
  const sourceIds = memories.map((memory) => memory.id)
  const typeCounts = countBy(memories, (memory) => memory.type)
  const typeSummary = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([type, count]) => `${type}: ${count}`)
    .join(', ')

  const evidence = memories.slice(0, 12).map((memory) => {
    return `- ${memory.id} (${memory.type}): ${truncate(memory.content.replace(/\s+/g, ' '), 220)}`
  })

  const content = [
    `${title} is a compiled PAM memory theme generated from ${memories.length} active memories.`,
    '',
    'Durable summary:',
    `- Theme: ${title}`,
    `- Source mix: ${typeSummary || 'unknown'}`,
    '- Use this compact theme before reading individual raw memory fragments.',
    '',
    'Evidence:',
    ...evidence,
  ].join('\n')

  return {
    theme,
    title,
    content,
    source_ids: sourceIds,
    source_count: memories.length,
    token_estimate: Math.ceil(content.length / 4),
    updated_at: updatedAt,
  }
}

function isNoiseSearchResult(memory: SearchResult): boolean {
  return (
    memory.status === 'noise' ||
    memory.tags.includes('noise') ||
    memory.tags.includes('pam-noise') ||
    memory.source === 'noise'
  )
}

function parseSourceIds(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

function countBy<T>(items: T[], getKey: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = getKey(item)
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
}

function truncate(value: string, limit: number): string {
  const normalized = value.trim()
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit).trim()}...`
}

function escapeFtsQuery(query: string): string {
  return query
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .map(quoteFtsTerm)
    .join(' ')
}

function quoteFtsTerm(term: string): string {
  return `"${term.replace(/"/g, '""')}"`
}
