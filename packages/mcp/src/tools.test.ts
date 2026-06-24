import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { initProjectMemory, listMemories, saveAutoCaptureConfig } from '@supersekai64/pam-core'
import {
  addMemory,
  compileMemoryContext,
  editMemory,
  getMemory,
  memoryCheckpoint,
  removeMemory,
  searchMemory,
  type McpToolContext,
} from './tools.js'

describe('MCP tools', () => {
  let tempDir: string
  let projectDir: string
  let projectMemoryPath: string
  let context: McpToolContext

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pam-mcp-test-'))
    projectDir = join(tempDir, 'project')
    projectMemoryPath = await initProjectMemory(projectDir)
    context = { cwd: projectDir, projectMemoryPath }
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should add, get, edit, search, and delete a memory', async () => {
    const created = await addMemory(
      {
        content: 'Use PostgreSQL for relational data',
        type: 'decision',
        tags: ['database'],
        concepts: ['Architecture'],
        status: 'active',
      },
      context
    )

    const loaded = await getMemory({ id: created.metadata.id }, context)
    expect(loaded?.content).toBe('Use PostgreSQL for relational data')
    expect(loaded?.metadata.access_count).toBe(1)

    const edited = await editMemory(
      {
        id: created.metadata.id,
        title: 'Local pam index',
        content: 'Use SQLite for the local pam index',
        tags: ['sqlite'],
        concepts: ['Storage'],
      },
      context
    )
    expect(edited?.metadata.title).toBe('Local pam index')
    expect(edited?.content).toBe('Use SQLite for the local pam index')
    expect(edited?.metadata.concepts).toEqual(['storage'])

    const results = await searchMemory({ query: 'SQLite' }, context)
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe(created.metadata.id)

    const deleted = await removeMemory({ id: created.metadata.id }, context)
    expect(deleted).toBe(true)

    const afterDelete = await getMemory({ id: created.metadata.id }, context)
    expect(afterDelete?.metadata.status).toBe('deleted')
  })

  it('should compile context', async () => {
    await addMemory(
      {
        content: 'Project architecture uses TypeScript packages',
        type: 'knowledge',
        status: 'active',
      },
      context
    )

    const compiled = await compileMemoryContext({ query: 'architecture' }, context)
    expect(compiled.content).toContain('Compiled Context')
    expect(compiled.content).toContain('Project architecture uses TypeScript packages')
  })

  it('should merge same-theme proposed memories during MCP capture', async () => {
    await saveAutoCaptureConfig(projectMemoryPath, { mode: 'assisted' })

    const first = await addMemory(
      {
        content: 'Maintenance recommendations should be action-first for users.',
        type: 'preference',
        tags: ['diagnostics', 'ui'],
      },
      context
    )

    const second = await addMemory(
      {
        content: 'Maintenance recommendations should explain safety before technical details.',
        type: 'preference',
        tags: ['diagnostics', 'ui'],
      },
      context
    )

    expect(second.metadata.id).toBe(first.metadata.id)
    expect(second.content).toContain('action-first')
    expect(second.content).toContain('explain safety')
    expect(await listMemories(projectMemoryPath)).toHaveLength(1)
  })

  it('should create proposed memories from a checkpoint in assisted mode', async () => {
    await saveAutoCaptureConfig(projectMemoryPath, { mode: 'assisted' })

    const result = await memoryCheckpoint(
      {
        summary: 'Implemented cross-tool pam capture planning.',
        decisions: ['Use assisted capture only when a project needs review before activation.'],
        facts: ['PAM exposes memory_checkpoint through MCP.'],
        concepts: ['Architecture'],
        agent: 'codex',
        model: 'gpt-5',
      },
      context
    )

    expect(result.mode).toBe('assisted')
    expect(result.status).toBe('proposed')
    expect(result.created).toHaveLength(3)
    expect(result.created.map((memory) => memory.metadata.status)).toEqual([
      'proposed',
      'proposed',
      'proposed',
    ])
    expect(result.created[0].metadata.tags).toContain('checkpoint')
    expect(result.created[0].metadata.tags).toContain('agent-codex')
    expect(
      result.created.every((memory) => memory.metadata.concepts?.includes('architecture'))
    ).toBe(true)
  })

  it('should create active checkpoint memories in default auto mode', async () => {
    const result = await memoryCheckpoint(
      {
        summary: 'Implemented automatic pam capture.',
        decisions: ['Default PAM capture mode is auto.'],
        agent: 'codex',
      },
      context
    )

    expect(result.mode).toBe('auto')
    expect(result.status).toBe('active')
    expect(result.created.map((memory) => memory.metadata.status)).toEqual(['active', 'active'])
  })

  it('should supersede an active contradiction in default auto mode', async () => {
    const first = await addMemory(
      {
        content: 'Capture mode should allow automatic pam capture for project decisions.',
        type: 'decision',
        tags: ['capture-mode'],
      },
      context
    )

    const second = await addMemory(
      {
        content: 'Capture mode should deny automatic pam capture for project decisions.',
        type: 'decision',
        tags: ['capture-mode'],
      },
      context
    )

    const archived = await getMemory({ id: first.metadata.id }, context)

    expect(second.metadata.id).not.toBe(first.metadata.id)
    expect(second.metadata.supersedes).toBe(first.metadata.id)
    expect(archived?.metadata.status).toBe('archived')
    expect(archived?.metadata.superseded_by).toBe(second.metadata.id)
  })

  it('should record checkpoint observations without creating memories in manual mode', async () => {
    await saveAutoCaptureConfig(projectMemoryPath, { mode: 'manual' })

    const result = await memoryCheckpoint(
      {
        summary: 'This should stay an observation only.',
        decisions: ['Do not create memory in manual mode.'],
        agent: 'codex',
      },
      context
    )

    expect(result.mode).toBe('manual')
    expect(result.status).toBe('skipped')
    expect(result.created).toHaveLength(0)
  })
})
