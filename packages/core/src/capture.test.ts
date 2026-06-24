import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createIntelligentMemory, splitMemorySignals } from './capture.js'
import { approveMemory } from './approve.js'
import { initProjectMemory, createMemory, listMemories, readMemory } from './storage.js'

describe('intelligent capture', () => {
  let tempDir: string
  let basePath: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pam-capture-test-'))
    basePath = await initProjectMemory(tempDir)
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('merges a same-theme proposed memory instead of creating a duplicate', async () => {
    const existing = await createMemory(basePath, {
      type: 'preference',
      scope: 'project',
      status: 'proposed',
      tags: ['diagnostics', 'ui'],
      content: 'Maintenance recommendations should be action-first for users.',
    })

    const result = await createIntelligentMemory(basePath, {
      type: 'preference',
      scope: 'project',
      status: 'proposed',
      tags: ['diagnostics', 'ui'],
      content: 'Maintenance recommendations should explain safety before technical details.',
    })

    expect(result.action).toBe('merged_proposed')
    expect(result.memory.metadata.id).toBe(existing.metadata.id)
    expect(result.memory.content).toContain(
      'Maintenance recommendations should be action-first for users.'
    )
    expect(result.memory.content).toContain(
      'Maintenance recommendations should explain safety before technical details.'
    )
    expect(await listMemories(basePath)).toHaveLength(1)
  })

  it('creates a proposed supersession when a new proposed memory matches active guidance', async () => {
    const active = await createMemory(basePath, {
      type: 'decision',
      scope: 'project',
      status: 'active',
      tags: ['capture', 'merge'],
      content: 'PAM capture should preserve evidence when merging related memories.',
    })

    const result = await createIntelligentMemory(basePath, {
      type: 'decision',
      scope: 'project',
      status: 'proposed',
      tags: ['capture', 'merge'],
      content: 'PAM capture should merge related memories while keeping evidence links.',
    })

    expect(result.action).toBe('proposed_supersession')
    expect(result.memory.metadata.status).toBe('proposed')
    expect(result.memory.metadata.supersedes).toBe(active.metadata.id)
    expect(result.memory.metadata.source_ids).toContain(active.metadata.id)
    expect(result.memory.metadata.tags).toContain('intelligent-merge')

    const reloadedActive = await readMemory(basePath, active.metadata.id)
    expect(reloadedActive?.metadata.status).toBe('active')
  })

  it('does not merge unrelated checkpoint memories just because metadata tags match', async () => {
    await createIntelligentMemory(basePath, {
      type: 'decision',
      scope: 'project',
      status: 'proposed',
      tags: ['checkpoint', 'decision', 'agent-codex', 'model-gpt-5'],
      content: 'Use SQLite for the local index backing the memory store.',
    })

    const result = await createIntelligentMemory(basePath, {
      type: 'decision',
      scope: 'project',
      status: 'proposed',
      tags: ['checkpoint', 'decision', 'agent-codex', 'model-gpt-5'],
      content: 'Require same-origin checks for mutable local API requests.',
    })

    expect(result.action).toBe('created')
    expect(await listMemories(basePath)).toHaveLength(2)
  })

  it('archives the old active memory when a proposed supersession is approved', async () => {
    const active = await createMemory(basePath, {
      type: 'decision',
      scope: 'project',
      status: 'active',
      tags: ['capture', 'reuse'],
      content: 'PAM capture should preserve source evidence during reuse.',
    })
    const result = await createIntelligentMemory(basePath, {
      type: 'decision',
      scope: 'project',
      status: 'proposed',
      tags: ['capture', 'reuse'],
      content: 'PAM capture should preserve source evidence during intelligent reuse.',
    })

    expect(await approveMemory(basePath, result.memory.metadata.id)).toBe(true)

    const approved = await readMemory(basePath, result.memory.metadata.id)
    const archived = await readMemory(basePath, active.metadata.id)
    expect(approved?.metadata.status).toBe('active')
    expect(archived?.metadata.status).toBe('archived')
    expect(archived?.metadata.superseded_by).toBe(result.memory.metadata.id)
  })

  it('can supersede active memory directly when auto capture allows it', async () => {
    const active = await createMemory(basePath, {
      type: 'knowledge',
      scope: 'project',
      status: 'active',
      title: 'Context reuse',
      tags: ['context', 'reuse'],
      content: 'PAM context reuse should prioritize durable memories.',
    })

    const result = await createIntelligentMemory(
      basePath,
      {
        type: 'knowledge',
        scope: 'project',
        status: 'active',
        tags: ['context', 'reuse'],
        content: 'PAM context reuse should prioritize durable memories and merged knowledge.',
      },
      { autoSupersedeActive: true }
    )

    expect(result.action).toBe('superseded_active')
    expect(result.memory.metadata.supersedes).toBe(active.metadata.id)
    expect(result.memory.metadata.title).toBe('Context reuse')

    const archived = await readMemory(basePath, active.metadata.id)
    expect(archived?.metadata.status).toBe('archived')
    expect(archived?.metadata.superseded_by).toBe(result.memory.metadata.id)
  })

  it('splits bullet-list checkpoint content into independent signals', () => {
    expect(
      splitMemorySignals(
        [
          '- Maintenance recommendations should be action-first.',
          '- Capture should merge same-theme memories automatically.',
        ].join('\n')
      )
    ).toEqual([
      'Maintenance recommendations should be action-first.',
      'Capture should merge same-theme memories automatically.',
    ])
  })
})
