import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  getRecentEvents,
  getSessionEvents,
  initProjectMemory,
  listMemories,
  recordHookEvent,
} from './index.js'

describe('hooks', () => {
  let tempDir: string
  let basePath: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pamh-hooks-test-'))
    basePath = await initProjectMemory(tempDir)
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should record hook event', async () => {
    const event = await recordHookEvent(basePath, {
      type: 'session-start',
      agent: 'claude-code',
      session_id: 'session-123',
      project_path: tempDir,
      data: { model: 'claude-sonnet-4-6' },
    })

    expect(event.id).toBeDefined()
    expect(event.type).toBe('session-start')
    expect(event.agent).toBe('claude-code')
    expect(event.session_id).toBe('session-123')
  })

  it('should get session events', async () => {
    await recordHookEvent(basePath, {
      type: 'session-start',
      session_id: 'session-123',
      project_path: tempDir,
      data: {},
    })

    await recordHookEvent(basePath, {
      type: 'user-prompt',
      session_id: 'session-123',
      project_path: tempDir,
      data: { text: 'Hello' },
    })

    await recordHookEvent(basePath, {
      type: 'session-end',
      session_id: 'session-123',
      project_path: tempDir,
      data: {},
    })

    const events = await getSessionEvents(basePath, 'session-123')

    expect(events).toHaveLength(3)
    expect(events[0].type).toBe('session-start')
    expect(events[1].type).toBe('user-prompt')
    expect(events[2].type).toBe('session-end')

    const summaryRaw = await readFile(join(basePath, 'sessions', 'session-123.json'), 'utf-8')
    const summary = JSON.parse(summaryRaw)
    expect(summary.session_id).toBe('session-123')
    expect(summary.event_count).toBe(3)

    const memories = await listMemories(basePath)
    const sessionMemory = memories.find((memory) => memory.metadata.source === 'hook')
    expect(sessionMemory?.metadata.status).toBe('proposed')
    expect(sessionMemory?.content).not.toContain('Hello')
  })

  it('should infer proposed rule memories from explicit user correction prompts', async () => {
    await recordHookEvent(basePath, {
      type: 'user-prompt',
      agent: 'codex',
      session_id: 'session-456',
      project_path: tempDir,
      data: {
        text: 'je ne vois pas de nouvelle mémoire. normalement on aurait dû avoir une nouvelle mémoire rule qui indique toujours mettre à jour les documentations suite à une modification',
      },
    })

    const memories = await listMemories(basePath)
    const inferredRules = memories.filter(
      (memory) =>
        memory.metadata.source === 'hook-inference:codex' && memory.metadata.type === 'rule'
    )

    expect(inferredRules).toHaveLength(2)
    expect(inferredRules.every((memory) => memory.metadata.status === 'proposed')).toBe(true)
    expect(
      inferredRules.some((memory) =>
        memory.content.includes('always update the relevant documentation')
      )
    ).toBe(true)
    expect(
      inferredRules.some((memory) =>
        memory.content.includes('should have been remembered automatically')
      )
    ).toBe(true)
  })

  it('should reject unsafe session ids when writing summaries', async () => {
    await expect(
      recordHookEvent(basePath, {
        type: 'session-end',
        session_id: '../outside',
        project_path: tempDir,
        data: {},
      })
    ).rejects.toThrow('Invalid sessionId')
  })

  it('should get recent events', async () => {
    await recordHookEvent(basePath, {
      type: 'session-start',
      session_id: 'session-1',
      project_path: tempDir,
      data: {},
    })

    await recordHookEvent(basePath, {
      type: 'session-start',
      session_id: 'session-2',
      project_path: tempDir,
      data: {},
    })

    const events = await getRecentEvents(basePath, 7)

    expect(events.length).toBeGreaterThanOrEqual(2)
  })
})
