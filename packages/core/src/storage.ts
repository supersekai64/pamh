import { mkdir, readFile, writeFile, readdir, stat, rm } from 'node:fs/promises'
import { join, dirname, parse } from 'node:path'
import { existsSync } from 'node:fs'
import { parseMarkdown, serializeMarkdown } from './markdown.js'
import { assertMemoryId, generateId, isMemoryId } from './id.js'
import { MemoryIndex, type SearchResult } from './indexer.js'
import { recordMemoryDebugEvent, summarizeMemoryForDebug } from './memory-debug.js'
import { initAutoCaptureConfig } from './auto-capture.js'
import { autoIndexSemanticMemory, removeSemanticMemory } from './semantic.js'
import { inferMemoryTheme } from './themes.js'
import { normalizeConceptList } from './concepts.js'
import { generateMemoryTitle } from './titles.js'
import {
  assertMemoryScope,
  assertMemoryStatus,
  assertMemoryType,
  assertSalience,
  normalizeStoredMemoryScope,
  type CreateMemoryInput,
  type Memory,
  type UpdateMemoryInput,
} from './types.js'

export const PROJECT_MEMORY_DIR = '.ai-memory'
export const MEMORY_BACKUP_DIR = 'backups'

export function findMemoryBase(startPath: string): string | null {
  let currentPath = startPath
  const root = parse(currentPath).root

  while (currentPath !== root) {
    const memoryPath = join(currentPath, PROJECT_MEMORY_DIR)
    if (existsSync(memoryPath)) {
      return memoryPath
    }
    currentPath = dirname(currentPath)
  }

  return null
}

export function getProjectMemoryPath(projectPath: string): string {
  const existing = findMemoryBase(projectPath)
  return existing ?? join(projectPath, PROJECT_MEMORY_DIR)
}

export async function initProjectMemory(projectPath: string): Promise<string> {
  const basePath = join(projectPath, PROJECT_MEMORY_DIR)

  await mkdir(basePath, { recursive: true })
  await mkdir(join(basePath, 'sessions'), { recursive: true })
  await mkdir(join(basePath, 'exchanges'), { recursive: true })

  await initAutoCaptureConfig(basePath)

  return basePath
}

export async function createMemory(basePath: string, input: CreateMemoryInput): Promise<Memory> {
  const type = assertMemoryType(input.type)
  const scope = assertMemoryScope(input.scope)
  const status = input.status ? assertMemoryStatus(input.status) : 'active'
  const salience = assertSalience(input.salience ?? 0.5)
  const id = generateId()
  const now = new Date().toISOString()

  const memory: Memory = {
    metadata: {
      id,
      title: normalizeTitle(input.title) ?? generateMemoryTitle(input.content, id),
      type,
      scope,
      status,
      theme: inferMemoryTheme({
        type,
        content: input.content,
        tags: input.tags,
        source: input.source,
        theme: input.theme,
      }),
      created_at: now,
      updated_at: now,
      tags: input.tags ?? [],
      concepts: normalizeConceptList(input.concepts),
      source: input.source ?? 'manual',
      salience,
      access_count: 0,
      last_accessed_at: now,
      supersedes: input.supersedes,
      source_ids: input.source_ids,
    },
    content: input.content,
  }

  const filePath = await writeMemoryFile(basePath, memory)

  const index = new MemoryIndex(basePath)
  index.indexMemory(memory, filePath)
  maybeRebuildThemeCompilations(index)
  index.close()
  await tryAutoVectorizeMemory(basePath, memory)

  await recordMemoryDebugEvent(basePath, {
    action: 'memory.create',
    outcome: 'ok',
    memory_id: memory.metadata.id,
    source: memory.metadata.source,
    details: {
      file_path: filePath,
      type,
      scope,
      status,
      tags: memory.metadata.tags,
      salience,
    },
    after: summarizeMemoryForDebug(memory),
    content_preview: memory.content,
  })

  return memory
}

export async function readMemory(basePath: string, id: string): Promise<Memory | null> {
  const filePath = await findMemoryFile(basePath, id)
  if (!filePath) {
    await recordMemoryDebugEvent(basePath, {
      action: 'memory.read',
      outcome: 'skipped',
      memory_id: id,
      details: { reason: 'not_found' },
    })
    return null
  }

  const raw = await readFile(filePath, 'utf-8')
  const memory = parseMarkdown(raw)

  await recordMemoryDebugEvent(basePath, {
    action: 'memory.read',
    outcome: 'ok',
    memory_id: id,
    source: memory.metadata.source,
    details: { file_path: filePath, status: memory.metadata.status },
    after: summarizeMemoryForDebug(memory),
  })

  return memory
}

export async function updateMemory(
  basePath: string,
  id: string,
  input: UpdateMemoryInput
): Promise<Memory | null> {
  const filePath = await findMemoryFile(basePath, id)
  if (!filePath) {
    await recordMemoryDebugEvent(basePath, {
      action: 'memory.update',
      outcome: 'skipped',
      memory_id: id,
      details: { reason: 'not_found', attempted_fields: Object.keys(input) },
    })
    return null
  }

  const raw = await readFile(filePath, 'utf-8')
  const memory = parseMarkdown(raw)
  const before = summarizeMemoryForDebug(memory)
  const originalFilePath = filePath

  if (input.content !== undefined) {
    memory.content = input.content
  }
  if (input.title !== undefined) {
    memory.metadata.title = normalizeTitle(input.title)
  }
  if (input.tags !== undefined) {
    memory.metadata.tags = input.tags
  }
  if (input.concepts !== undefined) {
    memory.metadata.concepts = normalizeConceptList(input.concepts)
  }
  if (input.type !== undefined) {
    memory.metadata.type = assertMemoryType(input.type)
  }
  if (input.scope !== undefined) {
    memory.metadata.scope = assertMemoryScope(input.scope)
  } else {
    memory.metadata.scope = normalizeStoredMemoryScope(memory.metadata.scope)
  }
  if (input.status !== undefined) {
    memory.metadata.status = assertMemoryStatus(input.status)
  }
  if (input.theme !== undefined) {
    memory.metadata.theme = inferMemoryTheme({
      type: memory.metadata.type,
      content: memory.content,
      tags: memory.metadata.tags,
      source: memory.metadata.source,
      theme: input.theme,
    })
  } else if (
    input.content !== undefined ||
    input.tags !== undefined ||
    input.type !== undefined ||
    !memory.metadata.theme
  ) {
    memory.metadata.theme = inferMemoryTheme({
      type: memory.metadata.type,
      content: memory.content,
      tags: memory.metadata.tags,
      source: memory.metadata.source,
      theme: memory.metadata.theme,
    })
  }
  if (input.source_ids !== undefined) {
    memory.metadata.source_ids = input.source_ids
  }
  if (input.superseded_by !== undefined) {
    memory.metadata.superseded_by = input.superseded_by
  }

  memory.metadata.updated_at = new Date().toISOString()
  assertMemoryId(memory.metadata.id)

  const nextFilePath = getMemoryFilePath(basePath, memory)
  await writeMemoryUpdate(originalFilePath, nextFilePath, serializeMarkdown(memory))

  const index = new MemoryIndex(basePath)
  index.indexMemory(memory, nextFilePath)
  maybeRebuildThemeCompilations(index)
  index.close()
  await tryAutoVectorizeMemory(basePath, memory)

  await recordMemoryDebugEvent(basePath, {
    action: 'memory.update',
    outcome: 'ok',
    memory_id: id,
    source: memory.metadata.source,
    details: {
      file_path: nextFilePath,
      previous_file_path: originalFilePath !== nextFilePath ? originalFilePath : undefined,
      changed_fields: Object.keys(input).filter(
        (key) => input[key as keyof UpdateMemoryInput] !== undefined
      ),
    },
    before,
    after: summarizeMemoryForDebug(memory),
    content_preview: input.content,
  })

  return memory
}

function normalizeTitle(title: string | undefined): string | undefined {
  const trimmed = title?.replace(/\s+/g, ' ').trim()
  return trimmed || undefined
}

export interface DeleteMemoryOptions {
  physical?: boolean
  backup?: boolean
}

export async function deleteMemory(
  basePath: string,
  id: string,
  options: DeleteMemoryOptions = {}
): Promise<boolean> {
  const filePath = await findMemoryFile(basePath, id)
  if (!filePath) {
    await recordMemoryDebugEvent(basePath, {
      action: options.physical ? 'memory.delete.physical' : 'memory.delete',
      outcome: 'skipped',
      memory_id: id,
      details: { reason: 'not_found' },
    })
    return false
  }

  if (options.physical) {
    const raw = await readFile(filePath, 'utf-8')
    const memory = parseMarkdown(raw)
    const backupPath =
      options.backup === false
        ? undefined
        : await writeMemoryBackup(basePath, memory, 'physical-delete', raw)
    await rm(filePath, { force: true })

    const index = new MemoryIndex(basePath)
    index.removeMemory(id, 'physical deletion')
    maybeRebuildThemeCompilations(index)
    index.close()
    await tryRemoveVector(basePath, id)

    await recordMemoryDebugEvent(basePath, {
      action: 'memory.delete.physical',
      outcome: 'ok',
      memory_id: id,
      source: memory.metadata.source,
      details: { file_path: filePath, backup_path: backupPath },
      before: summarizeMemoryForDebug(memory),
    })

    return true
  }

  const raw = await readFile(filePath, 'utf-8')
  const memory = parseMarkdown(raw)
  const before = summarizeMemoryForDebug(memory)

  memory.metadata.status = 'deleted'
  memory.metadata.updated_at = new Date().toISOString()

  await writeFile(filePath, serializeMarkdown(memory), 'utf-8')

  const index = new MemoryIndex(basePath)
  index.indexMemory(memory, filePath)
  maybeRebuildThemeCompilations(index)
  index.close()
  await tryRemoveVector(basePath, id)

  await recordMemoryDebugEvent(basePath, {
    action: 'memory.delete',
    outcome: 'ok',
    memory_id: id,
    source: memory.metadata.source,
    details: { file_path: filePath },
    before,
    after: summarizeMemoryForDebug(memory),
  })

  return true
}

export async function backupMemory(
  basePath: string,
  id: string,
  reason = 'manual'
): Promise<string | null> {
  const filePath = await findMemoryFile(basePath, id)
  if (!filePath) return null

  const raw = await readFile(filePath, 'utf-8')
  const memory = parseMarkdown(raw)
  return writeMemoryBackup(basePath, memory, reason, raw)
}

export async function archiveMemory(basePath: string, id: string): Promise<boolean> {
  const filePath = await findMemoryFile(basePath, id)
  if (!filePath) {
    await recordMemoryDebugEvent(basePath, {
      action: 'memory.archive',
      outcome: 'skipped',
      memory_id: id,
      details: { reason: 'not_found' },
    })
    return false
  }

  const raw = await readFile(filePath, 'utf-8')
  const memory = parseMarkdown(raw)

  if (memory.metadata.status === 'archived') {
    await recordMemoryDebugEvent(basePath, {
      action: 'memory.archive',
      outcome: 'skipped',
      memory_id: id,
      source: memory.metadata.source,
      details: { reason: 'already_archived', file_path: filePath },
      before: summarizeMemoryForDebug(memory),
    })
    return false
  }

  const before = summarizeMemoryForDebug(memory)
  memory.metadata.status = 'archived'
  memory.metadata.updated_at = new Date().toISOString()

  await writeFile(filePath, serializeMarkdown(memory), 'utf-8')

  const index = new MemoryIndex(basePath)
  index.indexMemory(memory, filePath)
  maybeRebuildThemeCompilations(index)
  index.close()
  await tryAutoVectorizeMemory(basePath, memory)

  await recordMemoryDebugEvent(basePath, {
    action: 'memory.archive',
    outcome: 'ok',
    memory_id: id,
    source: memory.metadata.source,
    details: { file_path: filePath },
    before,
    after: summarizeMemoryForDebug(memory),
  })

  return true
}

export async function listMemories(basePath: string): Promise<Memory[]> {
  const memories: Memory[] = []

  async function scanDir(dir: string) {
    if (!existsSync(dir)) return

    const entries = await readdir(dir)

    for (const entry of entries) {
      const fullPath = join(dir, entry)
      const stats = await stat(fullPath)

      if (stats.isDirectory()) {
        await scanDir(fullPath)
      } else if (entry.endsWith('.md')) {
        try {
          const raw = await readFile(fullPath, 'utf-8')
          if (raw.trim()) {
            const memory = parseMarkdown(raw)
            if (memory.metadata.id) {
              memories.push(memory)
            }
          }
        } catch {
          // Skip invalid files
        }
      }
    }
  }

  await scanDir(basePath)

  return memories
}

function getSubdirForType(type: string): string {
  const typeToSubdir: Record<string, string> = {
    decision: 'decisions',
    knowledge: 'knowledge',
    mistake: 'mistakes',
    pattern: 'patterns',
    preference: 'preferences',
    session: 'sessions',
    task: 'tasks',
    rule: 'rules',
    client: 'clients',
    exchange: 'exchanges',
  }

  return typeToSubdir[type] ?? 'knowledge'
}

export async function findMemoryFile(basePath: string, id: string): Promise<string | null> {
  if (!isMemoryId(id)) return null

  async function searchDir(dir: string): Promise<string | null> {
    if (!existsSync(dir)) return null

    const entries = await readdir(dir)

    for (const entry of entries) {
      const fullPath = join(dir, entry)
      const stats = await stat(fullPath)

      if (stats.isDirectory()) {
        const found = await searchDir(fullPath)
        if (found) return found
      } else if (entry === `${id}.md`) {
        return fullPath
      }
    }

    return null
  }

  return searchDir(basePath)
}

function getMemoryFilePath(basePath: string, memory: Memory): string {
  return join(basePath, getSubdirForType(memory.metadata.type), `${memory.metadata.id}.md`)
}

export async function writeMemoryFile(basePath: string, memory: Memory): Promise<string> {
  assertMemoryId(memory.metadata.id)

  const filePath = getMemoryFilePath(basePath, memory)
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, serializeMarkdown(memory), 'utf-8')
  return filePath
}

export async function findLatestMemoryBackup(basePath: string, id: string): Promise<string | null> {
  if (!isMemoryId(id)) return null

  const backupDir = join(basePath, MEMORY_BACKUP_DIR)
  if (!existsSync(backupDir)) return null

  const entries = await readdir(backupDir)
  const candidates: Array<{ path: string; mtimeMs: number }> = []

  for (const entry of entries) {
    if (!entry.endsWith(`-${id}.bak`)) continue

    const filePath = join(backupDir, entry)
    try {
      const stats = await stat(filePath)
      if (stats.isFile()) {
        candidates.push({ path: filePath, mtimeMs: stats.mtimeMs })
      }
    } catch {
      // Ignore concurrently removed backup files.
    }
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return candidates[0]?.path ?? null
}

async function writeMemoryBackup(
  basePath: string,
  memory: Memory,
  reason: string,
  raw: string
): Promise<string> {
  assertMemoryId(memory.metadata.id)

  const backupDir = join(basePath, MEMORY_BACKUP_DIR)
  await mkdir(backupDir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const safeReason = sanitizeBackupReason(reason)
  const filePath = join(backupDir, `${timestamp}-${safeReason}-${memory.metadata.id}.bak`)
  await writeFile(filePath, raw, 'utf-8')

  return filePath
}

function sanitizeBackupReason(reason: string): string {
  return (
    reason
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-|-$/g, '') || 'backup'
  )
}

async function writeMemoryUpdate(
  currentFilePath: string,
  nextFilePath: string,
  content: string
): Promise<void> {
  if (currentFilePath === nextFilePath) {
    await writeFile(currentFilePath, content, 'utf-8')
    return
  }

  await mkdir(dirname(nextFilePath), { recursive: true })
  try {
    await writeFile(nextFilePath, content, 'utf-8')
    await rm(currentFilePath, { force: true })
  } catch (error) {
    await rm(nextFilePath, { force: true })
    throw error
  }
}

export async function indexAllMemories(basePath: string): Promise<number> {
  const index = new MemoryIndex(basePath)
  index.clear()

  let count = 0

  async function scanDir(dir: string) {
    if (!existsSync(dir)) return

    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry)

      let stats
      try {
        stats = await stat(fullPath)
      } catch {
        continue
      }

      if (stats.isDirectory()) {
        await scanDir(fullPath)
      } else if (entry.endsWith('.md')) {
        try {
          const raw = await readFile(fullPath, 'utf-8')
          if (!raw.trim()) continue

          const memory = parseMarkdown(raw)
          if (memory.metadata.id) {
            index.indexMemory(memory, fullPath)
            count++
          }
        } catch {
          // Skip invalid or concurrently changed files.
        }
      }
    }
  }

  await scanDir(basePath)
  index.rebuildThemeCompilations()
  index.close()

  await recordMemoryDebugEvent(basePath, {
    action: 'memory.index_all',
    outcome: 'ok',
    details: { indexed_count: count },
  })

  return count
}

async function tryAutoVectorizeMemory(basePath: string, memory: Memory): Promise<void> {
  if (process.env.PAM_AUTO_VECTORIZE === '0') return

  try {
    await autoIndexSemanticMemory(basePath, memory)
  } catch (error) {
    await recordMemoryDebugEvent(basePath, {
      action: 'memory.semantic_index',
      outcome: 'error',
      memory_id: memory.metadata.id,
      source: memory.metadata.source,
      details: { message: formatError(error) },
    })
  }
}

function maybeRebuildThemeCompilations(index: MemoryIndex): void {
  if (process.env.PAM_DEFER_THEME_REBUILD === '1') return
  index.rebuildThemeCompilations()
}

async function tryRemoveVector(basePath: string, id: string): Promise<void> {
  if (process.env.PAM_AUTO_VECTORIZE === '0') return

  try {
    removeSemanticMemory(basePath, id)
  } catch (error) {
    await recordMemoryDebugEvent(basePath, {
      action: 'memory.semantic_remove',
      outcome: 'error',
      memory_id: id,
      details: { message: formatError(error) },
    })
  }
}

export async function checkIndexConsistency(basePath: string): Promise<ConsistencyReport> {
  const memories = await listMemories(basePath)
  const index = new MemoryIndex(basePath)
  const indexedMemories = index.getAllMemories()

  const fileIds = new Set<string>(memories.map((m: Memory) => m.metadata.id))
  const indexIds = new Set<string>(indexedMemories.map((m: SearchResult) => m.id))

  const missingInIndex: string[] = []
  const missingInFiles: string[] = []

  for (const id of fileIds) {
    if (!indexIds.has(id)) {
      missingInIndex.push(id)
    }
  }

  for (const id of indexIds) {
    if (!fileIds.has(id)) {
      missingInFiles.push(id)
    }
  }

  index.close()

  return {
    totalFiles: memories.length,
    totalIndexed: indexedMemories.length,
    missingInIndex,
    missingInFiles,
  }
}

export interface ConsistencyReport {
  totalFiles: number
  totalIndexed: number
  missingInIndex: string[]
  missingInFiles: string[]
}

export interface MemoryFileIssue {
  path: string
  error: string
}

export async function scanMemoryFileIssues(basePath: string): Promise<MemoryFileIssue[]> {
  const issues: MemoryFileIssue[] = []

  async function scanDir(dir: string) {
    if (!existsSync(dir)) return

    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch (error) {
      issues.push({ path: dir, error: `Cannot read directory: ${formatError(error)}` })
      return
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry)

      let stats
      try {
        stats = await stat(fullPath)
      } catch (error) {
        issues.push({ path: fullPath, error: `Cannot stat file: ${formatError(error)}` })
        continue
      }

      if (stats.isDirectory()) {
        await scanDir(fullPath)
        continue
      }

      if (!entry.endsWith('.md')) continue

      try {
        const raw = await readFile(fullPath, 'utf-8')
        if (!raw.trim()) continue

        const memory = parseMarkdown(raw)
        if (!memory.metadata.id) {
          issues.push({ path: fullPath, error: 'Missing memory id in frontmatter.' })
        } else if (!isMemoryId(memory.metadata.id)) {
          issues.push({ path: fullPath, error: `Invalid memory id: ${memory.metadata.id}` })
        }
      } catch (error) {
        issues.push({ path: fullPath, error: formatError(error) })
      }
    }
  }

  await scanDir(basePath)
  return issues
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
