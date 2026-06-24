import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applyDistillationProposal,
  createMemory,
  initProjectMemory,
  type DistillationProposal,
} from '../../core/src/index.js'
import { createLocalApiServer, type LocalApiServerOptions } from './server.js'

describe('local API concepts', () => {
  let tempDir: string
  let memoryPath: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pam-api-test-'))
    memoryPath = await initProjectMemory(tempDir)
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('builds concepts from the same selected memories as context preview', async () => {
    await createMemory(memoryPath, {
      type: 'decision',
      scope: 'project',
      status: 'active',
      tags: ['alpha-context'],
      content: 'Alpha context decides the active LLM map signal. Alpha context is durable.',
    })
    await createMemory(memoryPath, {
      type: 'preference',
      scope: 'project',
      status: 'active',
      tags: ['alpha-context'],
      content: 'Alpha context should remain visible in the LLM map when it is selected.',
    })
    await createMemory(memoryPath, {
      type: 'decision',
      scope: 'project',
      status: 'archived',
      tags: ['archived-only'],
      content: 'Archived only should never appear in the LLM context concept map.',
    })
    await createMemory(memoryPath, {
      type: 'decision',
      scope: 'project',
      status: 'proposed',
      tags: ['proposed-only'],
      content: 'Proposed only should never appear in the LLM context concept map.',
    })
    await createMemory(memoryPath, {
      type: 'knowledge',
      scope: 'project',
      status: 'noise',
      tags: ['noise-only', 'pam-noise'],
      content: 'Noise only should never appear in the LLM context concept map.',
    })

    const { baseUrl, close } = await startTestServer({ cwd: tempDir })
    try {
      const concepts = await getJson<ApiConceptGraph>(
        `${baseUrl}/api/concepts?store=project&limit=24&maxMemories=6`
      )
      const preview = await getJson<ContextPreview>(
        `${baseUrl}/api/context-preview?store=project&maxMemories=6`
      )

      expect(concepts.totalMemories).toBe(preview.memoryCount)
      expect(concepts.concepts.map((concept) => concept.title)).toContain('Alpha-Context')
      expect(concepts.concepts.map((concept) => concept.title)).not.toContain('Archived-Only')
      expect(concepts.concepts.map((concept) => concept.title)).not.toContain('Proposed-Only')
      expect(concepts.concepts.map((concept) => concept.title)).not.toContain('Noise-Only')
      expect(concepts.excludedNoiseMemories).toBe(1)
      expect(concepts.exclusions.map((exclusion) => exclusion.reason)).toEqual(
        expect.arrayContaining(['not active (archived)', 'not active (proposed)'])
      )
      expect(concepts.exclusions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ status: 'archived' }),
          expect.objectContaining({ status: 'proposed' }),
        ])
      )
      expect(concepts.concepts.slice(0, 10).map(toTopConcept)).toEqual(preview.topConcepts)
    } finally {
      await close()
    }
  })

  it('respects focused query and lower-ranked durable overflow', async () => {
    await createMemory(memoryPath, {
      type: 'decision',
      scope: 'project',
      status: 'active',
      tags: ['focus-alpha'],
      content: 'Focus alpha anchors the focused LLM context. Focus alpha appears twice.',
    })
    await createMemory(memoryPath, {
      type: 'knowledge',
      scope: 'project',
      status: 'active',
      tags: ['outside-beta'],
      content: 'Outside beta is active but belongs to an unrelated review topic.',
    })
    const overflowTagsById = new Map<string, string>()
    for (let index = 0; index < 7; index += 1) {
      const memory = await createMemory(memoryPath, {
        type: 'decision',
        scope: 'project',
        status: 'active',
        tags: [`overflow-${index}`],
        content: `Overflow ${index} active durable memory matches overflow query.`,
      })
      overflowTagsById.set(memory.metadata.id, `Overflow-${index}`)
    }

    const { baseUrl, close } = await startTestServer({ cwd: tempDir })
    try {
      const focused = await getJson<ApiConceptGraph>(
        `${baseUrl}/api/concepts?store=project&query=focus&limit=24&maxMemories=6`
      )
      expect(focused.concepts.map((concept) => concept.title)).toContain('Focus-Alpha')
      expect(focused.concepts.map((concept) => concept.title)).not.toContain('Outside-Beta')
      expect(focused.exclusions.map((exclusion) => exclusion.reason)).toContain(
        'does not match focused query'
      )

      const overflow = await getJson<ApiConceptGraph>(
        `${baseUrl}/api/concepts?store=project&query=overflow&limit=24&maxMemories=6`
      )
      expect(overflow.exclusions.map((exclusion) => exclusion.reason)).toContain(
        'lower-ranked durable memory overflow'
      )
      const overflowed = overflow.exclusions.find(
        (exclusion) => exclusion.reason === 'lower-ranked durable memory overflow'
      )
      expect(overflowed).toBeDefined()
      expect(overflow.concepts.map((concept) => concept.title)).not.toContain(
        overflowTagsById.get(overflowed!.id)
      )
    } finally {
      await close()
    }
  })

  it('filters French stopwords from context concepts', async () => {
    const contents = [
      'La sauvegarde localStorage est restaurée dans le navigateur avec une grille durable.',
      'Le serveur Sudoku est lancé dans le navigateur avec une configuration locale.',
      'La mémoire projet est disponible dans le dossier local avec une sauvegarde durable.',
    ]

    for (const content of contents) {
      await createMemory(memoryPath, {
        type: 'knowledge',
        scope: 'project',
        status: 'active',
        tags: [],
        content,
      })
    }

    const { baseUrl, close } = await startTestServer({ cwd: tempDir })
    try {
      const concepts = await getJson<ApiConceptGraph>(
        `${baseUrl}/api/concepts?store=project&limit=24&maxMemories=6`
      )
      const titles = concepts.concepts.map((concept) => concept.title)

      expect(titles).not.toContain('Est')
      expect(titles).not.toContain('Avec')
      expect(titles).not.toContain('Dans')
    } finally {
      await close()
    }
  })

  it('keeps unsupported capture tags out of strong context concepts', async () => {
    const contents = [
      'Expose activeMemoryCount from /api/context-preview so UI labels compare selected prompt sources with total active memories.',
      'For the fixed non-collapsible PAM sidebar, use viewport-height layout so the sidebar fills the screen.',
      'The SQLite index page should show technical storage and index health cards rather than Dashboard summary cards.',
      'Use the shared SelectContent component default to disable select alignment globally.',
      'Use scoped important utilities on the SQLite index search input instead of changing global form controls.',
      'Do not replace the Database size card badge with indexed row count.',
      'Use indexed memory row count as the Database size card badge.',
      'Keep the sidebar byte formatting local to AppSidebar for this display-only badge.',
      'Runtime settings are saved through the existing config endpoint.',
      'PAM top bar left controls should be ordered as project badge, refresh action, then updated timestamp.',
      'Use explanatory UI tooltips on detail cards because those fields need clarification.',
      'Top bar layout keeps New as the only right-aligned action.',
      'PAM UI sidebar should be fixed and non-collapsible.',
      'Filter Memory inventory rows client-side over the loaded table dataset.',
      'Runtime navigation makes LLM context and SQLite index sidebar clicks switch page views.',
      'Remove the page-level New memory button from the page header.',
      'Settings page select menus align consistently to their trigger edge.',
      'Add a Copy context button on the LLM context page UI.',
    ]

    for (const [index, content] of contents.entries()) {
      await createMemory(memoryPath, {
        type: 'decision',
        scope: 'project',
        status: 'active',
        source: 'mcp-checkpoint:codex',
        tags: [
          ...(content.includes('UI') ? ['ui'] : []),
          'agent-codex',
          'checkpoint',
          ...(index < 4 ? ['contradiction-resolved'] : []),
          'decision',
          'model-gpt-5',
        ],
        content,
      })
    }

    const { baseUrl, close } = await startTestServer({ cwd: tempDir })
    try {
      const concepts = await getJson<ApiConceptGraph>(
        `${baseUrl}/api/concepts?store=project&limit=24&maxMemories=18`
      )
      const preview = await getJson<ContextPreview>(
        `${baseUrl}/api/context-preview?store=project&maxMemories=18`
      )
      const conceptTitles = concepts.concepts.map((concept) => concept.title)
      const previewConceptTitles = preview.topConcepts.map((concept) => concept.title)

      expect(conceptTitles).toContain('UI')
      expect(previewConceptTitles).toContain('UI')
      expect(preview.content).toContain('- UI:')
      expect(conceptTitles).not.toEqual([])
      expect(previewConceptTitles).not.toEqual([])
      expect(preview.content).not.toContain('- Agent-Codex:')
      expect(preview.content).not.toContain('- Checkpoint:')
      expect(preview.content).not.toContain('- Decision:')
      expect(preview.content).not.toContain('- Model-Gpt-5:')
      expect(preview.content).not.toContain('- Contradiction-Resolved:')
      expect(preview.content).not.toContain('- Pam:')
    } finally {
      await close()
    }
  })

  it('uses client-provided concepts instead of detail-level extracted candidates', async () => {
    const inputs = [
      'The setting button should keep text-sm typography on the settings page.',
      'The save settings button should not show a loader after a click.',
      'The rebuild index button should keep the same text-sm treatment.',
    ]

    for (const content of inputs) {
      await createMemory(memoryPath, {
        type: 'preference',
        scope: 'project',
        status: 'active',
        tags: ['setting-button'],
        concepts: ['UI'],
        content,
      })
    }

    const { baseUrl, close } = await startTestServer({ cwd: tempDir })
    try {
      const concepts = await getJson<ApiConceptGraph>(
        `${baseUrl}/api/concepts?store=project&limit=24&maxMemories=6`
      )
      const preview = await getJson<ContextPreview>(
        `${baseUrl}/api/context-preview?store=project&maxMemories=6`
      )
      const conceptTitles = concepts.concepts.map((concept) => concept.title)
      const previewConceptTitles = preview.topConcepts.map((concept) => concept.title)

      expect(conceptTitles).toContain('UI')
      expect(previewConceptTitles).toContain('UI')
      expect(conceptTitles).not.toContain('Setting Button')
      expect(previewConceptTitles).not.toContain('Setting Button')
    } finally {
      await close()
    }
  })

  it('applies Settings ignored concepts to the LLM context concepts', async () => {
    for (const content of [
      'The UI context preview should keep copy controls near the generated prompt text.',
      'The UI settings page should persist ignored concepts without requiring CLI edits.',
      'The UI concepts panel should reflect the same ignored concepts as the preview.',
    ]) {
      await createMemory(memoryPath, {
        type: 'preference',
        scope: 'project',
        status: 'active',
        tags: ['ui'],
        content,
      })
    }

    const { baseUrl, close, token } = await startTestServer({ cwd: tempDir })
    try {
      const before = await getJson<ApiConceptGraph>(
        `${baseUrl}/api/concepts?store=project&limit=24&maxMemories=6`
      )
      expect(before.concepts.map((concept) => concept.title)).toContain('UI')

      await patchJson<PamConfig>(`${baseUrl}/api/config`, token, {
        noise: { ignoredConcepts: ['ui'] },
      })

      const concepts = await getJson<ApiConceptGraph>(
        `${baseUrl}/api/concepts?store=project&limit=24&maxMemories=6`
      )
      const preview = await getJson<ContextPreview>(
        `${baseUrl}/api/context-preview?store=project&maxMemories=6`
      )

      expect(concepts.concepts.map((concept) => concept.title)).not.toContain('UI')
      expect(preview.topConcepts.map((concept) => concept.title)).not.toContain('UI')
      expect(preview.content).not.toContain('- UI:')
    } finally {
      await close()
    }
  })

  it('includes an active distilled memory in the LLM context after sources are archived', async () => {
    const sourceIds: string[] = []
    for (let index = 0; index < 6; index += 1) {
      const memory = await createMemory(memoryPath, {
        type: 'decision',
        scope: 'project',
        status: 'active',
        tags: ['agent-codex', 'decision'],
        content: `Agent Codex decision ${index + 1}: keep the Sudoku localStorage save reliable.`,
      })
      sourceIds.push(memory.metadata.id)
    }
    const proposal: DistillationProposal = {
      id: 'distill-agent-codex-test',
      concept: 'Agent-Codex',
      type: 'knowledge',
      scope: 'project',
      tags: ['agent-codex', 'distilled', 'decision'],
      content:
        'Agent-Codex is a recurring project signal supported by source memories.\n\nDurable summary:\n- Keep the Sudoku localStorage save reliable.',
      source_ids: sourceIds,
      source_count: sourceIds.length,
      compression_ratio: 0.4,
      reason: 'Agent-Codex appears repeatedly.',
    }

    const distilled = await applyDistillationProposal(memoryPath, proposal)

    const { baseUrl, close } = await startTestServer({ cwd: tempDir })
    try {
      const afterDistill = await getJson<ContextPreview>(
        `${baseUrl}/api/context-preview?store=project&maxMemories=6`
      )
      expect(afterDistill.sources.map((source) => source.id)).toContain(distilled.metadata.id)
      expect(afterDistill.content).toContain('Agent-Codex is a recurring project signal')
    } finally {
      await close()
    }
  })

  it('identifies the PAM API through health metadata', async () => {
    const { baseUrl, close } = await startTestServer({ cwd: tempDir })
    try {
      const health = await getJson<{
        ok: boolean
        name: string
        projectPath: string
        memoryPath: string
      }>(`${baseUrl}/api/health`)

      expect(health.ok).toBe(true)
      expect(health.name).toBe('PAM')
      expect(health.projectPath).toBe(tempDir)
      expect(health.memoryPath).toBe(memoryPath)
    } finally {
      await close()
    }
  })

  it('rejects mutable requests without the PAM session token', async () => {
    const { baseUrl, close } = await startTestServer({ cwd: tempDir })
    try {
      const response = await fetch(`${baseUrl}/api/memories?store=project`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'knowledge',
          scope: 'project',
          content: 'No token',
        }),
      })

      expect(response.status).toBe(403)
      await expect(response.json()).resolves.toMatchObject({
        error: 'Missing or invalid PAM session token.',
      })
    } finally {
      await close()
    }
  })

  it('validates memory creation payloads before calling the core store', async () => {
    const { baseUrl, close, token } = await startTestServer({ cwd: tempDir })
    try {
      const invalid = await fetch(`${baseUrl}/api/memories?store=project`, {
        method: 'POST',
        headers: { 'x-pam-session': token },
        body: JSON.stringify({
          type: 'knowledge',
          scope: 'project',
          content: 'Invalid tags',
          tags: 'not-an-array',
        }),
      })

      expect(invalid.status).toBe(400)
      await expect(invalid.json()).resolves.toMatchObject({
        error: 'Field "tags" must be an array of strings when provided.',
      })

      const valid = await postJson<{ memory: { metadata: { id: string; title?: string } } }>(
        `${baseUrl}/api/memories?store=project`,
        token,
        {
          type: 'knowledge',
          scope: 'project',
          title: 'API-created memory',
          content: 'Valid API memory',
          tags: ['api'],
        }
      )
      expect(valid.memory.metadata.id).toMatch(/^mem_/)
      expect(valid.memory.metadata.title).toBe('API-created memory')
    } finally {
      await close()
    }
  })

  it('reports SQLite index diagnostics', async () => {
    await createMemory(memoryPath, {
      type: 'knowledge',
      scope: 'project',
      status: 'active',
      content: 'Index diagnostics should count this active memory.',
    })
    await createMemory(memoryPath, {
      type: 'decision',
      scope: 'project',
      status: 'archived',
      content: 'Archived memory still exists in the markdown store.',
    })

    const { baseUrl, close } = await startTestServer({ cwd: tempDir })
    try {
      const diagnostics = await getJson<IndexDiagnostics>(
        `${baseUrl}/api/index-stats?store=project`
      )

      expect(diagnostics.database.sizeBytes).toBeGreaterThan(0)
      expect(diagnostics.markdown.memoryFiles).toBe(2)
      expect(diagnostics.sqlite.memoryRows).toBe(2)
      expect(diagnostics.sqlite.ftsRows).toBe(2)
      expect(diagnostics.vectors.candidates).toBe(1)
      expect(diagnostics.health.missingInIndex).toBe(0)
      expect(diagnostics.health.orphanedInIndex).toBe(0)
    } finally {
      await close()
    }
  })

  it('reads and updates PAM configuration from the UI API', async () => {
    const { baseUrl, close, token } = await startTestServer({ cwd: tempDir })
    try {
      const initial = await getJson<PamConfig>(`${baseUrl}/api/config`)
      expect(initial.autoCapture.mode).toBe('auto')
      expect(initial.noise.ignoredConcepts).toEqual([])

      const updated = await patchJson<PamConfig>(`${baseUrl}/api/config`, token, {
        autoCapture: { mode: 'manual' },
        noise: { ignoredConcepts: ['migration', 'phase-2'] },
        runtime: {
          autoVectorize: false,
          deferThemeRebuild: true,
          debug: true,
        },
      })

      expect(updated.autoCapture.mode).toBe('manual')
      expect(updated.noise.ignoredConcepts).toEqual(['migration', 'phase-2'])
      expect(updated.runtime).toEqual({
        autoVectorize: false,
        deferThemeRebuild: true,
        debug: true,
      })

      const persisted = await getJson<PamConfig>(`${baseUrl}/api/config`)
      expect(persisted.runtime).toEqual({
        autoVectorize: false,
        deferThemeRebuild: true,
        debug: true,
      })

      const rebuilt = await postJson<{ indexed: number }>(`${baseUrl}/api/index/rebuild`, token)
      expect(rebuilt.indexed).toBe(0)
    } finally {
      await close()
    }
  })

  it('reports package versions and available npm updates', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.startsWith('https://registry.npmjs.org/')) {
        const packageName = decodeURIComponent(url.split('/').at(-2) ?? '')
        const latestVersions: Record<string, string> = {
          '@helloworlkd/pam-core': '0.1.10',
          '@helloworlkd/pam-protocol': '0.1.10',
          '@helloworlkd/pam-ui': '1.0.0',
          '@helloworlkd/pam-api': '0.1.17',
          '@helloworlkd/pam-cli': '0.1.18',
        }

        return new Response(
          JSON.stringify({
            version: latestVersions[packageName],
            repository: { url: 'git+https://github.com/supersekai64/pam.git' },
          }),
          {
            headers: { 'content-type': 'application/json' },
          }
        )
      }

      return originalFetch(input, init)
    }) satisfies typeof fetch

    const { baseUrl, close } = await startTestServer({ cwd: tempDir })
    try {
      const versions = await getJson<PackageVersions>(`${baseUrl}/api/package-versions`)
      const cli = versions.packages.find((item) => item.name === '@helloworlkd/pam-cli')

      expect(versions.updateCount).toBe(0)
      expect(cli).toMatchObject({
        currentVersion: '0.1.18',
        latestVersion: '0.1.18',
        status: 'up-to-date',
      })
      expect(versions.packages.map((item) => item.name)).toEqual([
        '@helloworlkd/pam-core',
        '@helloworlkd/pam-protocol',
        '@helloworlkd/pam-ui',
        '@helloworlkd/pam-api',
        '@helloworlkd/pam-cli',
      ])
    } finally {
      globalThis.fetch = originalFetch
      await close()
    }
  })

  it('validates memory update payloads before mutating', async () => {
    const memory = await createMemory(memoryPath, {
      type: 'knowledge',
      scope: 'project',
      content: 'Original',
    })
    const { baseUrl, close, token } = await startTestServer({ cwd: tempDir })
    try {
      const response = await fetch(`${baseUrl}/api/memories/${memory.metadata.id}?store=project`, {
        method: 'PATCH',
        headers: { 'x-pam-session': token },
        body: JSON.stringify({ status: 'unknown' }),
      })

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({
        error: 'Field "status" must be a valid pam status when provided.',
      })

      const updated = await fetch(`${baseUrl}/api/memories/${memory.metadata.id}?store=project`, {
        method: 'PATCH',
        headers: { 'x-pam-session': token },
        body: JSON.stringify({ title: 'API-updated title' }),
      })

      expect(updated.status).toBe(200)
      await expect(updated.json()).resolves.toMatchObject({
        memory: { metadata: { title: 'API-updated title' } },
      })
    } finally {
      await close()
    }
  })

  it('rejects cross-origin mutable requests', async () => {
    const { baseUrl, close, token } = await startTestServer({ cwd: tempDir })
    try {
      const response = await fetch(`${baseUrl}/api/memories?store=project`, {
        method: 'POST',
        headers: {
          origin: 'http://example.test',
          'x-pam-session': token,
        },
        body: JSON.stringify({
          type: 'knowledge',
          scope: 'project',
          content: 'Wrong origin',
        }),
      })

      expect(response.status).toBe(403)
      await expect(response.json()).resolves.toMatchObject({
        error: 'Cross-origin mutation blocked.',
      })
    } finally {
      await close()
    }
  })

  it('hides the destructive debug reset endpoint by default', async () => {
    const { baseUrl, close, token } = await startTestServer({ cwd: tempDir })
    try {
      const response = await fetch(`${baseUrl}/api/debug/reset?store=project`, {
        method: 'POST',
        headers: { 'x-pam-session': token },
        body: JSON.stringify({ confirm: 'RESET' }),
      })

      expect(response.status).toBe(404)
    } finally {
      await close()
    }
  })
})

interface ApiConceptGraph {
  totalMemories: number
  excludedNoiseMemories: number
  concepts: Array<{ title: string; occurrences: number; score: number }>
  exclusions: Array<{ id: string; type: string; status: string; reason: string }>
}

interface ContextPreview {
  content: string
  memoryCount: number
  sources: Array<{ id: string }>
  topConcepts: Array<{ title: string; occurrences: number; score: number }>
}

interface IndexDiagnostics {
  database: { sizeBytes: number }
  sqlite: { memoryRows: number; ftsRows: number }
  markdown: { memoryFiles: number }
  vectors: { candidates: number }
  health: { missingInIndex: number; orphanedInIndex: number }
}

interface PamConfig {
  autoCapture: { mode: 'auto' | 'assisted' | 'manual' }
  noise: { ignoredConcepts: string[] }
  runtime: { autoVectorize: boolean; deferThemeRebuild: boolean; debug: boolean }
}

interface PackageVersions {
  packages: Array<{
    name: string
    currentVersion: string | null
    latestVersion: string | null
    status: 'up-to-date' | 'update-available' | 'ahead' | 'unknown'
  }>
  updateCount: number
}

async function startTestServer(
  options: LocalApiServerOptions
): Promise<{ baseUrl: string; close: () => Promise<void>; token: string }> {
  const token = options.sessionToken ?? 'test-session-token'
  const server = createLocalApiServer({ ...options, sessionToken: token })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolve()
    })
  })
  const address = server.address() as AddressInfo
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
    token,
  }
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  expect(response.ok).toBe(true)
  return (await response.json()) as T
}

async function postJson<T = unknown>(
  url: string,
  token: string,
  body?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'x-pam-session': token },
    body: body ? JSON.stringify(body) : undefined,
  })
  expect(response.ok).toBe(true)
  return (await response.json()) as T
}

async function patchJson<T = unknown>(
  url: string,
  token: string,
  body: Record<string, unknown>
): Promise<T> {
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'x-pam-session': token,
    },
    body: JSON.stringify(body),
  })
  expect(response.ok).toBe(true)
  return (await response.json()) as T
}

function toTopConcept(concept: { title: string; occurrences: number; score: number }): {
  title: string
  occurrences: number
  score: number
} {
  return {
    title: concept.title,
    occurrences: concept.occurrences,
    score: concept.score,
  }
}
