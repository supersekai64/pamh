import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { listMemories } from './storage.js'
import { MemoryIndex } from './indexer.js'
import type { Memory, MemoryScope, MemoryStatus, MemoryType } from './types.js'

export interface CompileContextOptions {
  query?: string
  maxTokens?: number
  includeGlobal?: boolean
  includeProject?: boolean
  includeSearch?: boolean
}

export interface CompiledContext {
  content: string
  tokenCount: number
  sources: {
    global: Memory[]
    project: Memory[]
    search: Memory[]
  }
}

const DEFAULT_MAX_TOKENS = 4000
const CHARS_PER_TOKEN = 4

export async function compileContext(
  globalBasePath: string,
  projectBasePath: string,
  options: CompileContextOptions = {}
): Promise<CompiledContext> {
  const {
    query,
    maxTokens = DEFAULT_MAX_TOKENS,
    includeGlobal = true,
    includeProject = true,
    includeSearch = true,
  } = options

  const sources = {
    global: [] as Memory[],
    project: [] as Memory[],
    search: [] as Memory[],
  }

  let currentTokens = 0

  if (includeGlobal && existsSync(globalBasePath)) {
    const globalMemories = await listMemories(globalBasePath)
    const activeGlobal = globalMemories.filter((m) => m.metadata.status === 'active')

    for (const memory of activeGlobal) {
      const memoryTokens = estimateTokens(memory.content)
      if (currentTokens + memoryTokens <= maxTokens) {
        sources.global.push(memory)
        currentTokens += memoryTokens
      }
    }
  }

  if (includeProject && existsSync(projectBasePath)) {
    const projectMemories = await listMemories(projectBasePath)
    const activeProject = projectMemories.filter((m) => m.metadata.status === 'active')

    for (const memory of activeProject) {
      const memoryTokens = estimateTokens(memory.content)
      if (currentTokens + memoryTokens <= maxTokens) {
        sources.project.push(memory)
        currentTokens += memoryTokens
      }
    }
  }

  if (includeSearch && query && existsSync(projectBasePath)) {
    try {
      const index = new MemoryIndex(projectBasePath)
      const searchResults = index.search({ query, limit: 10 })
      index.close()

      for (const result of searchResults) {
        if (result.status === 'active') {
          const memoryTokens = estimateTokens(result.content)
          if (currentTokens + memoryTokens <= maxTokens) {
            sources.search.push({
              metadata: {
                id: result.id,
                type: result.type as MemoryType,
                scope: result.scope as MemoryScope,
                status: result.status as MemoryStatus,
                created_at: result.created_at,
                updated_at: result.updated_at,
                tags: result.tags,
                source: result.source,
              },
              content: result.content,
            })
            currentTokens += memoryTokens
          }
        }
      }
    } catch (error) {
      console.warn(`Warning: Search failed during context compilation: ${error}`)
    }
  }

  const content = formatCompiledContext(sources, query)

  return {
    content,
    tokenCount: currentTokens,
    sources,
  }
}

export async function writeCompiledContext(
  projectBasePath: string,
  compiled: CompiledContext
): Promise<string> {
  const outputPath = join(projectBasePath, 'compiled-context.md')
  await writeFile(outputPath, compiled.content, 'utf-8')
  return outputPath
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

function formatCompiledContext(sources: CompiledContext['sources'], query?: string): string {
  let content = '# Compiled Context\n\n'
  content += `Generated at: ${new Date().toISOString()}\n`
  if (query) {
    content += `Query: ${query}\n`
  }
  content += '\n---\n\n'

  if (sources.global.length > 0) {
    content += '## Global Memory\n\n'
    for (const memory of sources.global) {
      content += formatMemory(memory)
    }
    content += '\n'
  }

  if (sources.project.length > 0) {
    content += '## Project Memory\n\n'
    for (const memory of sources.project) {
      content += formatMemory(memory)
    }
    content += '\n'
  }

  if (sources.search.length > 0) {
    content += '## Search Results\n\n'
    for (const memory of sources.search) {
      content += formatMemory(memory)
    }
    content += '\n'
  }

  return content
}

function formatMemory(memory: Memory): string {
  let output = `### ${memory.metadata.id}\n\n`
  output += `- **Type**: ${memory.metadata.type}\n`
  output += `- **Scope**: ${memory.metadata.scope}\n`
  if (memory.metadata.tags.length > 0) {
    output += `- **Tags**: ${memory.metadata.tags.join(', ')}\n`
  }
  output += `\n${memory.content}\n\n---\n\n`
  return output
}
