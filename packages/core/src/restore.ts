import { readFile, writeFile } from 'node:fs/promises'
import { parseMarkdown, serializeMarkdown } from './markdown.js'
import { findLatestMemoryBackup, findMemoryFile, writeMemoryFile } from './storage.js'
import { MemoryIndex } from './indexer.js'
import { recordMemoryDebugEvent, summarizeMemoryForDebug } from './memory-debug.js'

export async function restoreMemory(basePath: string, id: string): Promise<boolean> {
  const filePath = await findMemoryFile(basePath, id)
  if (!filePath) {
    return restoreMemoryBackup(basePath, id)
  }

  const raw = await readFile(filePath, 'utf-8')
  const memory = parseMarkdown(raw)

  if (
    memory.metadata.status !== 'deleted' &&
    memory.metadata.status !== 'archived' &&
    memory.metadata.status !== 'noise' &&
    !hasNoiseTag(memory.metadata.tags)
  ) {
    await recordMemoryDebugEvent(basePath, {
      action: 'memory.restore',
      outcome: 'skipped',
      memory_id: id,
      source: memory.metadata.source,
      details: {
        reason: 'not_restorable',
        file_path: filePath,
        status: memory.metadata.status,
      },
      before: summarizeMemoryForDebug(memory),
    })
    return false
  }

  const before = summarizeMemoryForDebug(memory)
  memory.metadata.status = 'active'
  memory.metadata.tags = memory.metadata.tags.filter((tag) => !isNoiseTag(tag))
  memory.metadata.updated_at = new Date().toISOString()

  await writeFile(filePath, serializeMarkdown(memory), 'utf-8')

  const index = new MemoryIndex(basePath)
  index.indexMemory(memory, filePath)
  index.rebuildThemeCompilations()
  index.close()

  await recordMemoryDebugEvent(basePath, {
    action: 'memory.restore',
    outcome: 'ok',
    memory_id: id,
    source: memory.metadata.source,
    details: { file_path: filePath },
    before,
    after: summarizeMemoryForDebug(memory),
  })

  return true
}

async function restoreMemoryBackup(basePath: string, id: string): Promise<boolean> {
  const backupPath = await findLatestMemoryBackup(basePath, id)
  if (!backupPath) {
    await recordMemoryDebugEvent(basePath, {
      action: 'memory.restore',
      outcome: 'skipped',
      memory_id: id,
      details: { reason: 'not_found' },
    })
    return false
  }

  const raw = await readFile(backupPath, 'utf-8')
  const memory = parseMarkdown(raw)
  if (memory.metadata.id !== id) {
    await recordMemoryDebugEvent(basePath, {
      action: 'memory.restore.backup',
      outcome: 'skipped',
      memory_id: id,
      details: {
        reason: 'backup_id_mismatch',
        backup_path: backupPath,
        backup_id: memory.metadata.id,
      },
    })
    return false
  }

  const before = summarizeMemoryForDebug(memory)
  memory.metadata.status = 'active'
  memory.metadata.tags = memory.metadata.tags.filter((tag) => !isNoiseTag(tag))
  memory.metadata.updated_at = new Date().toISOString()

  const targetPath = await writeMemoryFile(basePath, memory)

  const index = new MemoryIndex(basePath)
  index.indexMemory(memory, targetPath)
  index.rebuildThemeCompilations()
  index.close()

  await recordMemoryDebugEvent(basePath, {
    action: 'memory.restore.backup',
    outcome: 'ok',
    memory_id: id,
    source: memory.metadata.source,
    details: { backup_path: backupPath, file_path: targetPath },
    before,
    after: summarizeMemoryForDebug(memory),
  })

  return true
}

function hasNoiseTag(tags: string[]): boolean {
  return tags.some(isNoiseTag)
}

function isNoiseTag(tag: string): boolean {
  return ['noise', 'ignored', 'pam-noise'].includes(tag)
}
