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
    tempDir = await mkdtemp(join(tmpdir(), 'pam-hooks-test-'))
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
    const rawExchange = memories.find((memory) => memory.metadata.type === 'exchange')
    expect(rawExchange?.metadata.status).toBe('active')
    expect(rawExchange?.metadata.theme).toBe('conversation')
    expect(rawExchange?.content).toContain('## Simplified')
    expect(rawExchange?.content).toContain('- Summary: Hello')
    expect(rawExchange?.content).toContain('## Raw Exchange')
    expect(rawExchange?.content).toContain('Hello')

    const sessionMemory = memories.find((memory) => memory.metadata.source === 'hook')
    expect(sessionMemory?.metadata.status).toBe('active')
    expect(sessionMemory?.content).not.toContain('Hello')
  })

  it('should redact sensitive hook observation data before writing JSONL logs', async () => {
    const event = await recordHookEvent(basePath, {
      type: 'user-prompt',
      session_id: 'session-secret',
      project_path: tempDir,
      data: {
        text: 'Please remember this. api_key = "test_api_key_value_1234567890"',
        nested: {
          password: 'password = "SuperSecretPassword123!"',
        },
      },
    })

    expect(event.data.text).toContain('[REDACTED_API_KEY]')
    expect(JSON.stringify(event.data)).not.toContain('test_api_key_value_1234567890')
    expect(JSON.stringify(event.data)).not.toContain('SuperSecretPassword123')

    const events = await getSessionEvents(basePath, 'session-secret')
    expect(events).toHaveLength(1)
    expect(JSON.stringify(events[0].data)).toContain('[REDACTED_API_KEY]')
    expect(JSON.stringify(events[0].data)).toContain('[REDACTED_PASSWORD]')
  })

  it('should infer active rule memories from explicit user correction prompts in auto mode', async () => {
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
    expect(inferredRules.every((memory) => memory.metadata.status === 'active')).toBe(true)
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

  it('should attach relevant memory ids when capturing a raw exchange', async () => {
    const decision = await recordHookEvent(basePath, {
      type: 'user-prompt',
      agent: 'codex',
      session_id: 'session-context',
      project_path: tempDir,
      data: { text: 'Always use SQLite for local memory storage.' },
    })
    expect(decision.id).toBeDefined()

    await recordHookEvent(basePath, {
      type: 'user-prompt',
      agent: 'codex',
      session_id: 'session-context',
      project_path: tempDir,
      data: { text: 'What should we use for local memory storage?' },
    })

    const exchanges = (await listMemories(basePath)).filter(
      (memory) => memory.metadata.type === 'exchange'
    )
    const questionExchange = exchanges.find((memory) =>
      memory.content.includes('What should we use for local memory storage?')
    )
    expect(exchanges).toHaveLength(2)
    expect(questionExchange?.metadata.source_ids?.length).toBeGreaterThan(0)
    expect(questionExchange?.content).toContain('Relevant memory IDs before answer')
    expect(questionExchange?.content).toContain('- Signal: question')
  })

  it('should recover an interrupted session summary on the next session start', async () => {
    await recordHookEvent(basePath, {
      type: 'user-prompt',
      agent: 'codex',
      session_id: 'interrupted-session',
      project_path: tempDir,
      data: { text: 'Remember that PAM should recover missing checkpoints.' },
    })

    await recordHookEvent(basePath, {
      type: 'session-start',
      agent: 'codex',
      session_id: 'next-session',
      project_path: tempDir,
      data: {},
    })

    const memories = await listMemories(basePath)
    const recovered = memories.find(
      (memory) =>
        memory.metadata.type === 'session' &&
        memory.metadata.source === 'hook-recovery:codex' &&
        memory.metadata.tags.includes('session-interrupted-session')
    )

    expect(recovered?.metadata.status).toBe('active')
    expect(recovered?.content).toContain('Recovered interrupted session interrupted-session')
    expect(recovered?.content).toContain('no session-end checkpoint was recorded')

    const summaryRaw = await readFile(
      join(basePath, 'sessions', 'interrupted-session.json'),
      'utf-8'
    )
    const summary = JSON.parse(summaryRaw)
    expect(summary.recovered).toBe(true)
    expect(summary.session_id).toBe('interrupted-session')
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
