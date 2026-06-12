import { readFile, writeFile } from 'node:fs/promises'
import { parseMarkdown, serializeMarkdown } from './markdown.js'
import { findMemoryFile } from './storage.js'
import { MemoryIndex } from './indexer.js'
import { recordMemoryDebugEvent, summarizeMemoryForDebug } from './memory-debug.js'

export async function approveMemory(basePath: string, id: string): Promise<boolean> {
  const filePath = await findMemoryFile(basePath, id)
  if (!filePath) {
    await recordMemoryDebugEvent(basePath, {
      action: 'memory.approve',
      outcome: 'skipped',
      memory_id: id,
      details: { reason: 'not_found' },
    })
    return false
  }

  const raw = await readFile(filePath, 'utf-8')
  const memory = parseMarkdown(raw)

  if (memory.metadata.status !== 'proposed') {
    await recordMemoryDebugEvent(basePath, {
      action: 'memory.approve',
      outcome: 'skipped',
      memory_id: id,
      source: memory.metadata.source,
      details: { reason: 'not_proposed', file_path: filePath, status: memory.metadata.status },
      before: summarizeMemoryForDebug(memory),
    })
    return false
  }

  const before = summarizeMemoryForDebug(memory)
  memory.metadata.status = 'active'
  memory.metadata.updated_at = new Date().toISOString()

  await writeFile(filePath, serializeMarkdown(memory), 'utf-8')

  const index = new MemoryIndex(basePath)
  index.indexMemory(memory, filePath)
  index.close()

  await recordMemoryDebugEvent(basePath, {
    action: 'memory.approve',
    outcome: 'ok',
    memory_id: id,
    source: memory.metadata.source,
    details: { file_path: filePath },
    before,
    after: summarizeMemoryForDebug(memory),
  })

  return true
}

export async function rejectMemory(basePath: string, id: string): Promise<boolean> {
  const filePath = await findMemoryFile(basePath, id)
  if (!filePath) {
    await recordMemoryDebugEvent(basePath, {
      action: 'memory.reject',
      outcome: 'skipped',
      memory_id: id,
      details: { reason: 'not_found' },
    })
    return false
  }

  const raw = await readFile(filePath, 'utf-8')
  const memory = parseMarkdown(raw)

  if (memory.metadata.status !== 'proposed') {
    await recordMemoryDebugEvent(basePath, {
      action: 'memory.reject',
      outcome: 'skipped',
      memory_id: id,
      source: memory.metadata.source,
      details: { reason: 'not_proposed', file_path: filePath, status: memory.metadata.status },
      before: summarizeMemoryForDebug(memory),
    })
    return false
  }

  const before = summarizeMemoryForDebug(memory)
  memory.metadata.status = 'deleted'
  memory.metadata.updated_at = new Date().toISOString()

  await writeFile(filePath, serializeMarkdown(memory), 'utf-8')

  const index = new MemoryIndex(basePath)
  index.indexMemory(memory, filePath)
  index.close()

  await recordMemoryDebugEvent(basePath, {
    action: 'memory.reject',
    outcome: 'ok',
    memory_id: id,
    source: memory.metadata.source,
    details: { file_path: filePath },
    before,
    after: summarizeMemoryForDebug(memory),
  })

  return true
}
