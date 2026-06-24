import { describe, it, expect } from 'vitest'
import { parseMarkdown, serializeMarkdown } from './markdown.js'
import type { Memory } from './types.js'

describe('parseMarkdown', () => {
  it('should parse frontmatter and content', () => {
    const raw = `---
id: mem_abc123
title: Database architecture
type: decision
scope: global
status: active
theme: decision
created_at: '2026-01-01T00:00:00.000Z'
updated_at: '2026-01-01T00:00:00.000Z'
tags:
  - architecture
  - backend
concepts:
  - UI
source: manual
---

This is the memory content.`

    const memory = parseMarkdown(raw)

    expect(memory.metadata.id).toBe('mem_abc123')
    expect(memory.metadata.title).toBe('Database architecture')
    expect(memory.metadata.type).toBe('decision')
    expect(memory.metadata.scope).toBe('project')
    expect(memory.metadata.status).toBe('active')
    expect(memory.metadata.theme).toBe('decision')
    expect(memory.metadata.tags).toEqual(['architecture', 'backend'])
    expect(memory.metadata.concepts).toEqual(['ui'])
    expect(memory.metadata.source).toBe('manual')
    expect(memory.content).toBe('This is the memory content.')
  })

  it('should parse lifecycle metadata', () => {
    const raw = `---
id: mem_child
type: decision
scope: project
status: active
created_at: '2026-01-01T00:00:00.000Z'
updated_at: '2026-01-01T00:00:00.000Z'
tags: []
source: manual
supersedes: mem_parent
superseded_by: mem_next
salience: 0.8
access_count: 3
last_accessed_at: '2026-01-02T00:00:00.000Z'
---

Lifecycle content.`

    const memory = parseMarkdown(raw)

    expect(memory.metadata.supersedes).toBe('mem_parent')
    expect(memory.metadata.superseded_by).toBe('mem_next')
    expect(memory.metadata.salience).toBe(0.8)
    expect(memory.metadata.access_count).toBe(3)
    expect(memory.metadata.last_accessed_at).toBe('2026-01-02T00:00:00.000Z')
  })

  it('should ignore invalid optional numeric lifecycle metadata', () => {
    const raw = `---
id: mem_bad_numbers
salience: nope
access_count: -1
---

Content.`

    const memory = parseMarkdown(raw)

    expect(memory.metadata.salience).toBeUndefined()
    expect(memory.metadata.access_count).toBeUndefined()
  })

  it('should normalize legacy scopes to project when reading markdown', () => {
    const raw = `---
id: mem_legacy_scope
type: knowledge
scope: temporary
---

Legacy scope content.`

    const memory = parseMarkdown(raw)

    expect(memory.metadata.scope).toBe('project')
  })

  it('should normalize legacy project type to knowledge when reading markdown', () => {
    const raw = `---
id: mem_legacy_type
type: project
scope: project
---

Legacy project type content.`

    const memory = parseMarkdown(raw)

    expect(memory.metadata.type).toBe('knowledge')
  })

  it('should use defaults for missing fields', () => {
    const raw = `---
id: mem_xyz
---

Simple content.`

    const memory = parseMarkdown(raw)

    expect(memory.metadata.id).toBe('mem_xyz')
    expect(memory.metadata.type).toBe('knowledge')
    expect(memory.metadata.scope).toBe('project')
    expect(memory.metadata.status).toBe('active')
    expect(memory.metadata.tags).toEqual([])
    expect(memory.metadata.source).toBe('manual')
    expect(memory.content).toBe('Simple content.')
  })
})

describe('serializeMarkdown', () => {
  it('should serialize memory to markdown with frontmatter', () => {
    const memory: Memory = {
      metadata: {
        id: 'mem_test',
        type: 'knowledge',
        scope: 'project',
        status: 'active',
        theme: 'decision',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        tags: ['test'],
        source: 'manual',
      },
      content: 'Test content',
    }

    const result = serializeMarkdown(memory)

    expect(result).toContain('id: mem_test')
    expect(result).toContain('type: knowledge')
    expect(result).toContain('scope: project')
    expect(result).toContain('Test content')
  })

  it('should round-trip correctly', () => {
    const original: Memory = {
      metadata: {
        id: 'mem_round',
        title: 'Round-trip title',
        type: 'decision',
        scope: 'project',
        status: 'active',
        theme: 'decision',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        tags: ['round', 'trip'],
        concepts: ['UI', 'Settings Button'],
        source: 'manual',
        supersedes: 'mem_old',
        superseded_by: 'mem_new',
        salience: 0.7,
        access_count: 2,
        last_accessed_at: '2026-01-02T00:00:00.000Z',
      },
      content: 'Round trip content',
    }

    const serialized = serializeMarkdown(original)
    const parsed = parseMarkdown(serialized)

    expect(parsed.metadata.id).toBe(original.metadata.id)
    expect(parsed.metadata.title).toBe(original.metadata.title)
    expect(parsed.metadata.type).toBe(original.metadata.type)
    expect(parsed.metadata.theme).toBe(original.metadata.theme)
    expect(parsed.metadata.tags).toEqual(original.metadata.tags)
    expect(parsed.metadata.concepts).toEqual(['ui', 'setting button'])
    expect(parsed.metadata.supersedes).toBe(original.metadata.supersedes)
    expect(parsed.metadata.superseded_by).toBe(original.metadata.superseded_by)
    expect(parsed.metadata.salience).toBe(original.metadata.salience)
    expect(parsed.metadata.access_count).toBe(original.metadata.access_count)
    expect(parsed.metadata.last_accessed_at).toBe(original.metadata.last_accessed_at)
    expect(parsed.content).toBe(original.content)
  })
})
