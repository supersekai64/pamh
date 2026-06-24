import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  beginHandoff,
  acceptHandoff,
  getOpenHandoff,
  listHandoffs,
  initProjectMemory,
} from './index.js'

describe('handoff', () => {
  let tempDir: string
  let basePath: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pam-handoff-test-'))
    basePath = await initProjectMemory(tempDir)
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should begin a handoff', async () => {
    const handoff = await beginHandoff(
      basePath,
      'Working on database migration',
      'claude-code',
      ['What about indexes?'],
      ['Run migration script']
    )

    expect(handoff.id).toBeDefined()
    expect(handoff.status).toBe('open')
    expect(handoff.summary).toBe('Working on database migration')
    expect(handoff.agent_from).toBe('claude-code')
    expect(handoff.open_questions).toEqual(['What about indexes?'])
    expect(handoff.next_steps).toEqual(['Run migration script'])
  })

  it('should accept a handoff', async () => {
    const handoff = await beginHandoff(basePath, 'Test summary', 'claude-code')

    const accepted = await acceptHandoff(basePath, handoff.id, 'codex')

    expect(accepted).not.toBeNull()
    expect(accepted!.status).toBe('accepted')
    expect(accepted!.agent_to).toBe('codex')
    expect(accepted!.accepted_at).toBeDefined()
  })

  it('should get open handoff', async () => {
    await beginHandoff(basePath, 'First handoff', 'claude-code')
    const handoff2 = await beginHandoff(basePath, 'Second handoff', 'codex')

    const open = await getOpenHandoff(basePath)

    expect(open).not.toBeNull()
    expect(open!.id).toBe(handoff2.id)
    expect(open!.summary).toBe('Second handoff')
  })

  it('should list handoffs', async () => {
    await beginHandoff(basePath, 'First', 'claude-code')
    await beginHandoff(basePath, 'Second', 'codex')

    const handoffs = await listHandoffs(basePath)

    expect(handoffs).toHaveLength(2)
  })

  it('should filter open handoffs by project path', async () => {
    const projectA = join(tempDir, 'project-a')
    const projectB = join(tempDir, 'project-b')

    const handoffA = await beginHandoff(
      basePath,
      'Project A',
      'claude-code',
      undefined,
      undefined,
      projectA
    )
    await beginHandoff(basePath, 'Project B', 'codex', undefined, undefined, projectB)

    const openA = await getOpenHandoff(basePath, projectA)
    const listA = await listHandoffs(basePath, undefined, projectA)

    expect(openA?.id).toBe(handoffA.id)
    expect(listA).toHaveLength(1)
    expect(listA[0].project_path).toBe(projectA)
  })

  it('should filter handoffs by status', async () => {
    const h1 = await beginHandoff(basePath, 'First', 'claude-code')
    await beginHandoff(basePath, 'Second', 'codex')

    await acceptHandoff(basePath, h1.id, 'opencode')

    const open = await listHandoffs(basePath, 'open')
    const accepted = await listHandoffs(basePath, 'accepted')

    expect(open).toHaveLength(1)
    expect(accepted).toHaveLength(1)
  })

  it('should reject unsafe handoff ids', async () => {
    await expect(acceptHandoff(basePath, '../outside', 'opencode')).rejects.toThrow(
      'Invalid handoffId'
    )
  })
})
