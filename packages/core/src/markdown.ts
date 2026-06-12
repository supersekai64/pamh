import matter from 'gray-matter'
import {
  assertMemoryScope,
  assertMemoryStatus,
  assertMemoryType,
  type Memory,
  type MemoryMetadata,
} from './types.js'

export function parseMarkdown(raw: string): Memory {
  const { data, content } = matter(raw)

  const metadata: MemoryMetadata = {
    id: String(data.id ?? ''),
    type: assertMemoryType(data.type ?? 'knowledge'),
    scope: assertMemoryScope(data.scope ?? 'global'),
    status: assertMemoryStatus(data.status ?? 'active'),
    created_at: data.created_at ?? new Date().toISOString(),
    updated_at: data.updated_at ?? new Date().toISOString(),
    tags: Array.isArray(data.tags) ? data.tags : [],
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
    type: memory.metadata.type,
    scope: memory.metadata.scope,
    status: memory.metadata.status,
    created_at: memory.metadata.created_at,
    updated_at: memory.metadata.updated_at,
    tags: memory.metadata.tags,
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
