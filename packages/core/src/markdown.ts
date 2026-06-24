import matter from 'gray-matter'
import {
  assertMemoryStatus,
  type Memory,
  type MemoryMetadata,
  normalizeStoredMemoryScope,
  normalizeStoredMemoryType,
} from './types.js'
import { normalizeConceptList } from './concepts.js'
import { inferMemoryTheme, normalizeMemoryTheme } from './themes.js'

export function parseMarkdown(raw: string): Memory {
  const { data, content } = matter(raw)

  const metadata: MemoryMetadata = {
    id: String(data.id ?? ''),
    title: parseOptionalString(data.title),
    type: normalizeStoredMemoryType(data.type ?? 'knowledge'),
    scope: normalizeStoredMemoryScope(data.scope),
    status: assertMemoryStatus(data.status ?? 'active'),
    theme:
      normalizeMemoryTheme(data.theme) ??
      inferMemoryTheme({
        type: normalizeStoredMemoryType(data.type ?? 'knowledge'),
        content,
        tags: Array.isArray(data.tags) ? data.tags : [],
        source: data.source,
      }),
    created_at: data.created_at ?? new Date().toISOString(),
    updated_at: data.updated_at ?? new Date().toISOString(),
    tags: Array.isArray(data.tags) ? data.tags : [],
    concepts: normalizeConceptList(
      Array.isArray(data.concepts) ? data.concepts.map((item) => String(item)) : undefined
    ),
    source: data.source ?? 'manual',
    supersedes: data.supersedes ? String(data.supersedes) : undefined,
    superseded_by: data.superseded_by ? String(data.superseded_by) : undefined,
    source_ids: Array.isArray(data.source_ids)
      ? data.source_ids.map((item) => String(item)).filter(Boolean)
      : undefined,
    salience: parseOptionalNumber(data.salience, (value) => value >= 0 && value <= 1),
    access_count: parseOptionalNumber(
      data.access_count,
      (value) => Number.isInteger(value) && value >= 0
    ),
    last_accessed_at: data.last_accessed_at ? String(data.last_accessed_at) : undefined,
  }

  return {
    metadata,
    content: content.trim(),
  }
}

export function serializeMarkdown(memory: Memory): string {
  const frontmatter: Record<string, unknown> = {
    id: memory.metadata.id,
    title: memory.metadata.title,
    type: memory.metadata.type,
    scope: memory.metadata.scope,
    status: memory.metadata.status,
    theme: memory.metadata.theme,
    created_at: memory.metadata.created_at,
    updated_at: memory.metadata.updated_at,
    tags: memory.metadata.tags,
    concepts: memory.metadata.concepts,
    source: memory.metadata.source,
    supersedes: memory.metadata.supersedes,
    superseded_by: memory.metadata.superseded_by,
    source_ids: memory.metadata.source_ids,
    salience: memory.metadata.salience,
    access_count: memory.metadata.access_count,
    last_accessed_at: memory.metadata.last_accessed_at,
  }

  for (const key of Object.keys(frontmatter)) {
    if (frontmatter[key] === undefined) {
      delete frontmatter[key]
    }
  }

  return matter.stringify(memory.content, frontmatter)
}

function parseOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function parseOptionalNumber(
  value: unknown,
  isValid: (value: number) => boolean
): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  const number = Number(value)
  return Number.isFinite(number) && isValid(number) ? number : undefined
}
