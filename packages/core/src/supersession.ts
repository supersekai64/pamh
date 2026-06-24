import { readFile, writeFile } from 'node:fs/promises'
import { parseMarkdown, serializeMarkdown } from './markdown.js'
import { findMemoryFile } from './storage.js'
import { MemoryIndex } from './indexer.js'
import { autoIndexSemanticMemory } from './semantic.js'
import { inferMemoryTheme } from './themes.js'
import { normalizeConceptList } from './concepts.js'
import {
  assertMemoryScope,
  assertMemoryStatus,
  assertMemoryType,
  assertSalience,
  type Memory,
  type CreateMemoryInput,
} from './types.js'
import { generateId } from './id.js'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'

/**
 * Supersede an existing memory with a new one.
 * Creates a new memory and marks the old one as superseded.
 */
export async function supersedeMemory(
  basePath: string,
  oldId: string,
  newInput: CreateMemoryInput
): Promise<{ oldMemory: Memory; newMemory: Memory } | null> {
  // Find the old memory
  const oldFilePath = await findMemoryFile(basePath, oldId)
  if (!oldFilePath) return null

  const oldRaw = await readFile(oldFilePath, 'utf-8')
  const oldMemory = parseMarkdown(oldRaw)

  // Check if already superseded
  if (oldMemory.metadata.superseded_by) {
    throw new Error(`Memory ${oldId} is already superseded by ${oldMemory.metadata.superseded_by}`)
  }

  // Create the new memory with supersedes field
  const newId = generateId()
  const now = new Date().toISOString()
  const type = assertMemoryType(newInput.type)
  const scope = assertMemoryScope(newInput.scope)
  const status = newInput.status ? assertMemoryStatus(newInput.status) : 'active'
  const salience = assertSalience(newInput.salience ?? 0.5)

  const newMemory: Memory = {
    metadata: {
      id: newId,
      title: newInput.title,
      type,
      scope,
      status,
      theme: inferMemoryTheme({
        type,
        content: newInput.content,
        tags: newInput.tags,
        source: newInput.source,
        theme: newInput.theme,
      }),
      created_at: now,
      updated_at: now,
      tags: newInput.tags ?? [],
      concepts: normalizeConceptList(newInput.concepts),
      source: newInput.source ?? 'manual',
      supersedes: oldId,
      source_ids: newInput.source_ids,
      salience,
      access_count: 0,
      last_accessed_at: now,
    },
    content: newInput.content,
  }

  // Write new memory
  const subdir = getSubdirForType(newMemory.metadata.type)
  const dirPath = join(basePath, subdir)
  await mkdir(dirPath, { recursive: true })

  const newFilePath = join(dirPath, `${newId}.md`)
  await writeFile(newFilePath, serializeMarkdown(newMemory), 'utf-8')

  // Update old memory with superseded_by
  oldMemory.metadata.superseded_by = newId
  oldMemory.metadata.status = 'archived'
  oldMemory.metadata.updated_at = now

  await writeFile(oldFilePath, serializeMarkdown(oldMemory), 'utf-8')

  // Update index
  const index = new MemoryIndex(basePath)
  index.indexMemory(newMemory, newFilePath)
  index.indexMemory(oldMemory, oldFilePath)
  index.rebuildThemeCompilations()
  index.close()
  await autoIndexSemanticMemory(basePath, newMemory)

  return { oldMemory, newMemory }
}

/**
 * Get the supersession chain for a memory (all versions from oldest to newest)
 */
export async function getSupersessionChain(basePath: string, memoryId: string): Promise<Memory[]> {
  const chain: Memory[] = []
  let currentId: string | undefined = memoryId

  // Walk backwards to find the oldest version
  const visited = new Set<string>()
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    const filePath = await findMemoryFile(basePath, currentId)
    if (!filePath) break

    const raw = await readFile(filePath, 'utf-8')
    const memory = parseMarkdown(raw)
    chain.unshift(memory) // Add to beginning

    // Follow supersedes chain backwards
    currentId = memory.metadata.supersedes
  }

  // Now walk forwards from the oldest to the newest
  if (chain.length > 0) {
    const result: Memory[] = [chain[0]]
    let nextId = chain[0].metadata.superseded_by
    const forwardVisited = new Set<string>([chain[0].metadata.id])

    while (nextId && !forwardVisited.has(nextId)) {
      forwardVisited.add(nextId)
      const filePath = await findMemoryFile(basePath, nextId)
      if (!filePath) break

      const raw = await readFile(filePath, 'utf-8')
      const memory = parseMarkdown(raw)
      result.push(memory)

      nextId = memory.metadata.superseded_by
    }

    return result
  }

  return chain
}

/**
 * Get the latest version of a memory (follows superseded_by chain)
 */
export async function getLatestVersion(basePath: string, memoryId: string): Promise<Memory | null> {
  let currentId = memoryId
  const visited = new Set<string>()

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    const filePath = await findMemoryFile(basePath, currentId)
    if (!filePath) return null

    const raw = await readFile(filePath, 'utf-8')
    const memory = parseMarkdown(raw)

    if (!memory.metadata.superseded_by) {
      return memory // This is the latest version
    }

    currentId = memory.metadata.superseded_by
  }

  return null
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
  }

  return typeToSubdir[type] ?? 'knowledge'
}
