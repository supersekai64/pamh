import Database from 'better-sqlite3'
import { join } from 'node:path'
import type { Memory } from './types.js'

interface DbMemoryRow {
  id: string
  type: string
  scope: string
  status: string
  created_at: string
  updated_at: string
  source: string
  content: string
  file_path: string
  tags: string | null
}

interface CountRow {
  count: number
}

interface GroupCountRow {
  type?: string
  scope?: string
  tag?: string
  count: number
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL,
  content TEXT NOT NULL,
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
    this.db.exec(FTS_SCHEMA)
  }

  clear() {
    const transaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM tags').run()
      this.db.prepare('DELETE FROM chunks').run()
      this.db.prepare('DELETE FROM deletions').run()
      this.db.prepare('DELETE FROM memories_fts').run()
      this.db.prepare('DELETE FROM memories').run()
    })

    transaction()
  }

  indexMemory(memory: Memory, filePath: string) {
    const { id, type, scope, status, created_at, updated_at, source, tags } = memory.metadata
    const { content } = memory

    const insertMemory = this.db.prepare(`
      INSERT OR REPLACE INTO memories (id, type, scope, status, created_at, updated_at, source, content, file_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const deleteTags = this.db.prepare('DELETE FROM tags WHERE memory_id = ?')
    const insertTag = this.db.prepare('INSERT INTO tags (memory_id, tag) VALUES (?, ?)')

    const deleteFts = this.db.prepare('DELETE FROM memories_fts WHERE id = ?')
    const insertFts = this.db.prepare(
      'INSERT INTO memories_fts (id, content, tags) VALUES (?, ?, ?)'
    )

    const transaction = this.db.transaction(() => {
      insertMemory.run(id, type, scope, status, created_at, updated_at, source, content, filePath)

      deleteTags.run(id)
      for (const tag of tags) {
        insertTag.run(id, tag)
      }

      deleteFts.run(id)
      insertFts.run(id, content, tags.join(' '))
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

  search(options: SearchOptions): SearchResult[] {
    const { query, type, scope, tag, limit = 50 } = options

    if (query) {
      return this.searchFullText(query, type, scope, tag, limit)
    }

    return this.searchByFilters(type, scope, tag, limit)
  }

  private searchFullText(
    query: string,
    type?: string,
    scope?: string,
    tag?: string,
    limit: number = 50
  ): SearchResult[] {
    let sql = `
      SELECT m.*, GROUP_CONCAT(t.tag) as tags
      FROM memories_fts fts
      JOIN memories m ON m.id = fts.id
      LEFT JOIN tags t ON t.memory_id = m.id
      WHERE memories_fts MATCH ?
    `

    const params: (string | number)[] = [escapeFtsQuery(query)]

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

    sql += ' AND m.status = ?'
    params.push('active')

    sql += ' GROUP BY m.id ORDER BY rank LIMIT ?'
    params.push(limit)

    const stmt = this.db.prepare(sql)
    const rows = stmt.all(...params) as DbMemoryRow[]

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      scope: row.scope,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      source: row.source,
      content: row.content,
      file_path: row.file_path,
      tags: row.tags ? row.tags.split(',') : [],
    }))
  }

  private searchByFilters(
    type?: string,
    scope?: string,
    tag?: string,
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

    sql += ' GROUP BY m.id ORDER BY m.updated_at DESC LIMIT ?'
    params.push(limit)

    const stmt = this.db.prepare(sql)
    const rows = stmt.all(...params) as DbMemoryRow[]

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      scope: row.scope,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      source: row.source,
      content: row.content,
      file_path: row.file_path,
      tags: row.tags ? row.tags.split(',') : [],
    }))
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
      tags: allTags.reduce(
        (acc: Record<string, number>, row) => (row.tag ? { ...acc, [row.tag]: row.count } : acc),
        {}
      ),
    }
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

    if (!row) return null

    return {
      id: row.id,
      type: row.type,
      scope: row.scope,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      source: row.source,
      content: row.content,
      file_path: row.file_path,
      tags: row.tags ? row.tags.split(',') : [],
    }
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

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      scope: row.scope,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      source: row.source,
      content: row.content,
      file_path: row.file_path,
      tags: row.tags ? row.tags.split(',') : [],
    }))
  }

  close() {
    this.db.close()
  }
}

export interface SearchOptions {
  query?: string
  type?: string
  scope?: string
  tag?: string
  limit?: number
}

export interface SearchResult {
  id: string
  type: string
  scope: string
  status: string
  created_at: string
  updated_at: string
  source: string
  content: string
  file_path: string
  tags: string[]
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
  tags: Record<string, number>
}

function escapeFtsQuery(query: string): string {
  return query
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .map((term) => `"${term.replace(/"/g, '""')}"`)
    .join(' ')
}
