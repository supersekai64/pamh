import { mkdir, readFile, writeFile, readdir, stat, rm } from 'node:fs/promises'
import { join, dirname, parse } from 'node:path'
import { homedir } from 'node:os'
import { existsSync } from 'node:fs'
import { parseMarkdown, serializeMarkdown } from './markdown.js'
import { generateId } from './id.js'
import { MemoryIndex, type SearchResult } from './indexer.js'
import {
  assertMemoryScope,
  assertMemoryStatus,
  assertMemoryType,
  type CreateMemoryInput,
  type Memory,
  type UpdateMemoryInput,
} from './types.js'

export const GLOBAL_MEMORY_DIR = '.ai-memory'
export const PROJECT_MEMORY_DIR = '.ai-memory'

export const GLOBAL_SUBDIRS = [
  'identity',
  'preferences',
  'knowledge',
  'decisions',
  'patterns',
  'mistakes',
  'projects',
  'control',
  'exports',
  'docs',
] as const

export function getGlobalMemoryPath(): string {
  return join(homedir(), 'ai-memory')
}

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

export async function initGlobalMemory(): Promise<string> {
  const basePath = getGlobalMemoryPath()

  await mkdir(basePath, { recursive: true })

  for (const subdir of GLOBAL_SUBDIRS) {
    await mkdir(join(basePath, subdir), { recursive: true })
  }

  return basePath
}

export async function initProjectMemory(projectPath: string): Promise<string> {
  const basePath = join(projectPath, PROJECT_MEMORY_DIR)

  await mkdir(basePath, { recursive: true })
  await mkdir(join(basePath, 'sessions'), { recursive: true })

  const defaultFiles = [
    'project.md',
    'architecture.md',
    'current-state.md',
    'decisions.md',
    'mistakes.md',
    'tasks.md',
  ]

  for (const file of defaultFiles) {
    const filePath = join(basePath, file)
    if (!existsSync(filePath)) {
      await writeFile(filePath, '', 'utf-8')
    }
  }

  return basePath
}

export async function createMemory(basePath: string, input: CreateMemoryInput): Promise<Memory> {
  const type = assertMemoryType(input.type)
  const scope = assertMemoryScope(input.scope)
  const status = input.status ? assertMemoryStatus(input.status) : 'active'
  const id = generateId()
  const now = new Date().toISOString()

  const memory: Memory = {
    metadata: {
      id,
      type,
      scope,
      status,
      created_at: now,
      updated_at: now,
      tags: input.tags ?? [],
      source: input.source ?? 'manual',
    },
    content: input.content,
  }

  const subdir = getSubdirForType(type)
  const dirPath = join(basePath, subdir)
  await mkdir(dirPath, { recursive: true })

  const filePath = join(dirPath, `${id}.md`)
  await writeFile(filePath, serializeMarkdown(memory), 'utf-8')

  const index = new MemoryIndex(basePath)
  index.indexMemory(memory, filePath)
  index.close()

  return memory
}

export async function readMemory(basePath: string, id: string): Promise<Memory | null> {
  const filePath = await findMemoryFile(basePath, id)
  if (!filePath) return null

  const raw = await readFile(filePath, 'utf-8')
  return parseMarkdown(raw)
}

export async function updateMemory(
  basePath: string,
  id: string,
  input: UpdateMemoryInput
): Promise<Memory | null> {
  const filePath = await findMemoryFile(basePath, id)
  if (!filePath) return null

  const raw = await readFile(filePath, 'utf-8')
  const memory = parseMarkdown(raw)

  if (input.content !== undefined) {
    memory.content = input.content
  }
  if (input.tags !== undefined) {
    memory.metadata.tags = input.tags
  }
  if (input.type !== undefined) {
    memory.metadata.type = assertMemoryType(input.type)
  }
  if (input.scope !== undefined) {
    memory.metadata.scope = assertMemoryScope(input.scope)
  }

  memory.metadata.updated_at = new Date().toISOString()

  await writeFile(filePath, serializeMarkdown(memory), 'utf-8')

  const index = new MemoryIndex(basePath)
  index.indexMemory(memory, filePath)
  index.close()

  return memory
}

export interface DeleteMemoryOptions {
  physical?: boolean
}

export async function deleteMemory(
  basePath: string,
  id: string,
  options: DeleteMemoryOptions = {}
): Promise<boolean> {
  const filePath = await findMemoryFile(basePath, id)
  if (!filePath) return false

  if (options.physical) {
    await rm(filePath, { force: true })

    const index = new MemoryIndex(basePath)
    index.removeMemory(id, 'physical deletion')
    index.close()

    return true
  }

  const raw = await readFile(filePath, 'utf-8')
  const memory = parseMarkdown(raw)

  memory.metadata.status = 'deleted'
  memory.metadata.updated_at = new Date().toISOString()

  await writeFile(filePath, serializeMarkdown(memory), 'utf-8')

  const index = new MemoryIndex(basePath)
  index.indexMemory(memory, filePath)
  index.close()

  return true
}

export async function archiveMemory(basePath: string, id: string): Promise<boolean> {
  const filePath = await findMemoryFile(basePath, id)
  if (!filePath) return false

  const raw = await readFile(filePath, 'utf-8')
  const memory = parseMarkdown(raw)

  if (memory.metadata.status === 'archived') {
    return false
  }

  memory.metadata.status = 'archived'
  memory.metadata.updated_at = new Date().toISOString()

  await writeFile(filePath, serializeMarkdown(memory), 'utf-8')

  const index = new MemoryIndex(basePath)
  index.indexMemory(memory, filePath)
  index.close()

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
    project: 'projects',
    session: 'sessions',
    task: 'tasks',
    rule: 'rules',
    client: 'clients',
  }

  return typeToSubdir[type] ?? 'knowledge'
}

export async function findMemoryFile(basePath: string, id: string): Promise<string | null> {
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

export async function indexAllMemories(basePath: string): Promise<number> {
  const memories = await listMemories(basePath)
  const index = new MemoryIndex(basePath)
  index.clear()

  let count = 0
  for (const memory of memories) {
    const filePath = await findMemoryFile(basePath, memory.metadata.id)
    if (filePath) {
      index.indexMemory(memory, filePath)
      count++
    }
  }

  index.close()
  return count
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
