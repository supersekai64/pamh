import { randomBytes } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import { basename, dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MemoryIndex,
  analyzeDistillation,
  applyDistillationProposal,
  applyRecommendation,
  approveMemory,
  archiveMemory,
  buildKnowledgeGraph,
  composeContextSources as composeCoreContextSources,
  createMemory,
  deferRecommendation,
  deleteMemory,
  extractConceptCandidates,
  formatConceptLabel,
  generateRecommendations,
  getProjectMemoryPath,
  getMemoryDebugStatus,
  indexAllMemories,
  listMemories,
  loadAutoCaptureConfig,
  normalizeConcept,
  preferContradictionRecommendation,
  recordMemoryDebugEvent,
  readMemory,
  rejectRecommendation,
  rejectMemory,
  seedIntelligenceEvaluationDataset,
  restoreMemory,
  saveAutoCaptureConfig,
  setMemoryDebugMode,
  tokenizeConceptText,
  updateMemory,
  type AutoCaptureConfig,
  type AutoCaptureMode,
  isMemoryScope,
  isMemoryStatus,
  isMemoryType,
  matchesNaturalSearch,
  type CreateMemoryInput,
  type Memory,
  type SearchResult,
  type UpdateMemoryInput,
} from '@helloworlkd/pam-core'

export interface LocalApiServerOptions {
  cwd?: string
  host?: string
  port?: number
  sessionToken?: string
  staticDir?: string
}

export interface LocalApiServer {
  server: Server
  sessionToken: string
  url: string
  close: () => Promise<void>
}

interface ApiErrorResponse {
  error: string
}

interface ConceptNode {
  id: string
  title: string
  category: 'tag' | 'keyword'
  rank: number
  score: number
  occurrences: number
  searchTerm: string
  evidence: string[]
  samples: ConceptSample[]
  typeCounts: Record<string, number>
  scopeCounts: Record<string, number>
  sourceCounts: Record<string, number>
  lastUpdated: string | null
}

interface ConceptEdge {
  source: string
  target: string
  weight: number
}

interface ConceptSample {
  id: string
  type: string
  scope: string
  status: string
  source: string
  created_at: string
  updated_at: string
  tags: string[]
  content: string
}

interface ContextSource extends ConceptSample {
  section: string
  reasons: string[]
}

interface ContextExclusion {
  id: string
  type: string
  status: string
  updated_at: string
  reason: string
}

interface ViewStats {
  total: number
  active: number
  deleted: number
  archived: number
  proposed: number
  noise: number
  byType: Record<string, number>
  byScope: Record<string, number>
  tags: Record<string, number>
}

interface IndexDiagnosticsResponse {
  database: {
    sizeBytes: number
    files: Array<{ name: string; sizeBytes: number }>
  }
  sqlite: {
    memoryRows: number
    tagRows: number
    chunkRows: number
    ftsRows: number
    latestMemoryUpdatedAt: string | null
  }
  markdown: {
    memoryFiles: number
  }
  vectors: {
    candidates: number
    indexed: number
    missing: number
    coverage: number
    latestUpdatedAt: string | null
  }
  health: {
    status: 'ok' | 'needs-sync'
    missingInIndex: number
    orphanedInIndex: number
    missingVectors: number
  }
}

interface VisibleMemoryView {
  memories: SearchResult[]
  excludedNoise: number
  rawTotal: number
}

interface NoiseConfig {
  ignoredConcepts: string[]
}

interface RuntimeConfig {
  autoVectorize: boolean
  deferThemeRebuild: boolean
  debug: boolean
}

interface PamConfigResponse {
  project: {
    name: string
    path: string
    memoryPath: string
  }
  autoCapture: AutoCaptureConfig
  noise: NoiseConfig
  runtime: {
    autoVectorize: boolean
    deferThemeRebuild: boolean
    debug: boolean
  }
}

type PackageVersionStatus = 'up-to-date' | 'update-available' | 'ahead' | 'unknown'

interface PackageBuildVersion {
  name: string
  label: string
  currentVersion: string | null
  latestVersion: string | null
  status: PackageVersionStatus
  error?: string
}

interface PackageVersionsResponse {
  packages: PackageBuildVersion[]
  checkedAt: string
  updateCount: number
}

interface PackageVersionSpec {
  name: string
  label: string
  workspaceManifest: string
}

interface LocalPackageManifest {
  version: string
  repositoryUrl: string | null
}

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 3939
const SERVER_DIST_DIR = dirname(fileURLToPath(import.meta.url))
const nodeRequire = createRequire(import.meta.url)

function resolveDefaultStaticDir(): string {
  const candidates = [
    resolvePublishedUiStaticDir(),
    join(SERVER_DIST_DIR, '../../ui/dist/public'),
    join(SERVER_DIST_DIR, '../../pam-ui/dist/public'),
    join(SERVER_DIST_DIR, '../../@helloworlkd/pam-ui/dist/public'),
    join(SERVER_DIST_DIR, '../node_modules/@helloworlkd/pam-ui/dist/public'),
  ].filter((candidate): candidate is string => Boolean(candidate))

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  return candidates[0]
}

function resolvePublishedUiStaticDir(): string | null {
  try {
    const uiEntry = resolvePackageImport('@helloworlkd/pam-ui')
    return join(dirname(uiEntry), 'public')
  } catch {
    return null
  }
}

function resolvePackageImport(specifier: string): string {
  const resolved = import.meta.resolve(specifier)
  if (resolved.startsWith('file:')) return fileURLToPath(resolved)
  return resolved
}

const DEFAULT_STATIC_DIR = resolveDefaultStaticDir()
const NOISE_CONFIG_FILE = 'ui-noise.json'
const RUNTIME_CONFIG_FILE = 'runtime.json'
const PROJECT_SCOPE = 'project'
const PAM_HEALTH_NAME = 'PAM'
const SESSION_HEADER = 'x-pam-session'
const PACKAGE_VERSION_CACHE_TTL_MS = 10 * 60 * 1000
const NPM_VERSION_TIMEOUT_MS = 3000
const PACKAGE_VERSION_SPECS: PackageVersionSpec[] = [
  { name: '@helloworlkd/pam-core', label: 'Core', workspaceManifest: '../../core/package.json' },
  {
    name: '@helloworlkd/pam-protocol',
    label: 'Protocol',
    workspaceManifest: '../../mcp/package.json',
  },
  { name: '@helloworlkd/pam-ui', label: 'UI', workspaceManifest: '../../ui/package.json' },
  { name: '@helloworlkd/pam-api', label: 'API', workspaceManifest: '../package.json' },
  { name: '@helloworlkd/pam-cli', label: 'CLI', workspaceManifest: '../../cli/package.json' },
]

let packageVersionsCache: {
  expiresAt: number
  response: PackageVersionsResponse
} | null = null

export function createLocalApiServer(options: LocalApiServerOptions = {}): Server {
  const cwd = options.cwd ?? process.cwd()
  const sessionToken = options.sessionToken ?? generateSessionToken()
  const staticDir = options.staticDir ?? DEFAULT_STATIC_DIR

  return createServer(async (request, response) => {
    try {
      await handleRequest(request, response, cwd, staticDir, sessionToken)
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  })
}

export async function startLocalApiServer(
  options: LocalApiServerOptions = {}
): Promise<LocalApiServer> {
  const host = options.host ?? DEFAULT_HOST
  const port = options.port ?? DEFAULT_PORT
  const sessionToken = options.sessionToken ?? generateSessionToken()
  const server = createLocalApiServer({ ...options, sessionToken })

  await new Promise<void>((resolveServer, rejectServer) => {
    server.once('error', rejectServer)
    server.listen(port, host, () => {
      server.removeListener('error', rejectServer)
      resolveServer()
    })
  })

  return {
    server,
    sessionToken,
    url: `http://${host}:${port}`,
    close: () => new Promise((resolveClose) => server.close(() => resolveClose())),
  }
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  cwd: string,
  staticDir: string,
  sessionToken: string
): Promise<void> {
  const method = request.method ?? 'GET'
  const url = new URL(request.url ?? '/', 'http://localhost')

  if (url.pathname.startsWith('/api/')) {
    await handleApiRequest(request, response, method, url, cwd, sessionToken)
    return
  }

  await serveStatic(response, staticDir, url.pathname)
}

async function handleApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  method: string,
  url: URL,
  cwd: string,
  sessionToken: string
): Promise<void> {
  const basePath = getProjectMemoryPath(cwd)

  if (method === 'GET' && url.pathname === '/api/health') {
    sendJson(response, 200, {
      ok: true,
      name: PAM_HEALTH_NAME,
      projectPath: cwd,
      memoryPath: basePath,
    })
    return
  }

  if (method === 'GET' && url.pathname === '/api/session') {
    sendJson(response, 200, { token: sessionToken })
    return
  }

  if (isMutableMethod(method) && !authorizeMutableRequest(request, response, sessionToken)) {
    return
  }

  if (method === 'POST' && url.pathname === '/api/shutdown') {
    sendJson(response, 200, { ok: true })
    setImmediate(() => process.exit(0))
    return
  }

  const storeParam = url.searchParams.get('store')
  if (storeParam && storeParam !== 'project') {
    sendJson(response, 400, { error: 'Unsupported store parameter. PAM is project-only.' })
    return
  }

  if (method === 'POST' && url.pathname === '/api/debug/reset') {
    if (process.env.PAM_ENABLE_DEBUG_RESET !== '1') {
      sendJson(response, 404, { error: 'Not found' })
      return
    }

    const body = (await readJson(request)) as { confirm?: string } | null
    if (body?.confirm !== 'RESET') {
      sendJson(response, 400, {
        error: 'Missing confirmation. POST { "confirm": "RESET" } to wipe the store.',
      })
      return
    }
    let removed = false
    if (existsSync(basePath)) {
      await rm(basePath, { recursive: true, force: true })
      removed = true
    }
    sendJson(response, 200, { ok: true, basePath, removed })
    return
  }

  if (method === 'GET' && url.pathname === '/api/recommendations') {
    const report = await generateRecommendations(basePath)
    sendJson(response, 200, report)
    return
  }

  if (method === 'GET' && url.pathname === '/api/config') {
    sendJson(response, 200, await buildPamConfig(cwd, basePath))
    return
  }

  if (method === 'PATCH' && url.pathname === '/api/config') {
    const parsed = parsePamConfigPatch(await readJson(request))
    if (!parsed.ok) return sendJson(response, 400, { error: parsed.error })

    if (parsed.value.autoCapture) {
      await saveAutoCaptureConfig(basePath, parsed.value.autoCapture)
    }
    if (parsed.value.noise) {
      await writeNoiseConfig(basePath, parsed.value.noise)
    }
    if (parsed.value.runtime) {
      await writeRuntimeConfig(basePath, parsed.value.runtime)
      applyRuntimeConfig(parsed.value.runtime)
      await setMemoryDebugMode(basePath, parsed.value.runtime.debug, {
        agent: '@helloworlkd/pam-ui',
      })
    }

    sendJson(response, 200, await buildPamConfig(cwd, basePath))
    return
  }

  const recommendationMatch = url.pathname.match(
    /^\/api\/recommendations\/([^/]+)\/(apply|reject|defer)$/
  )
  if (recommendationMatch && method === 'POST') {
    const id = decodeURIComponent(recommendationMatch[1])
    const action = recommendationMatch[2]

    if (action === 'apply') {
      const result = await applyRecommendation(basePath, id, {
        confirmPhysicalDelete: parseBoolean(url.searchParams.get('confirmPhysicalDelete')),
      })
      sendJson(response, 200, result)
      return
    }

    const recommendation =
      action === 'reject'
        ? await rejectRecommendation(basePath, id)
        : await deferRecommendation(basePath, id)
    if (!recommendation)
      return sendJson(response, 404, { error: `Recommendation not found: ${id}` })
    sendJson(response, 200, { recommendation })
    return
  }

  const preferRecommendationMatch = url.pathname.match(/^\/api\/recommendations\/([^/]+)\/prefer$/)
  if (preferRecommendationMatch && method === 'POST') {
    const id = decodeURIComponent(preferRecommendationMatch[1])
    const body = (await readJson(request)) as { preferredId?: unknown }
    if (typeof body.preferredId !== 'string' || !body.preferredId.trim()) {
      sendJson(response, 400, { error: 'Missing preferredId' })
      return
    }
    const result = await preferContradictionRecommendation(basePath, id, body.preferredId)
    sendJson(response, 200, result)
    return
  }

  if (method === 'GET' && url.pathname === '/api/distillation') {
    const proposals = await analyzeDistillation(basePath)
    sendJson(response, 200, { proposals })
    return
  }

  if (method === 'POST' && url.pathname === '/api/distillation/apply') {
    const body = (await readJson(request)) as { proposal?: unknown }
    if (!body.proposal || typeof body.proposal !== 'object') {
      sendJson(response, 400, { error: 'Missing proposal' })
      return
    }
    const memory = await applyDistillationProposal(
      basePath,
      body.proposal as Parameters<typeof applyDistillationProposal>[1]
    )
    sendJson(response, 201, { memory })
    return
  }

  if (method === 'GET' && url.pathname === '/api/knowledge-graph') {
    const graph = await buildKnowledgeGraph(basePath)
    sendJson(response, 200, graph)
    return
  }

  if (method === 'POST' && url.pathname === '/api/intelligence/evaluation-dataset') {
    const result = await seedIntelligenceEvaluationDataset(basePath)
    sendJson(response, 201, result)
    return
  }

  if (method === 'GET' && url.pathname === '/api/concepts') {
    const limit = clampNumber(Number(url.searchParams.get('limit') ?? 24), 8, 100)
    const query = url.searchParams.get('query') ?? undefined
    const includeNoise = parseBoolean(url.searchParams.get('includeNoise'))
    const maxMemories = clampNumber(Number(url.searchParams.get('maxMemories') ?? 18), 6, 48)
    const rawMemories = await getIndexedMemories(basePath)
    const noiseConfig = await readNoiseConfig(basePath)
    const view = getVisibleMemories(rawMemories, { includeNoise })
    const ignoredConcepts = getContextIgnoredConcepts(query, noiseConfig.ignoredConcepts)
    const composition = composeCoreContextSources(view.memories, query, maxMemories)
    const conceptGraph = filterContextConceptGraph(
      buildConceptGraph(
        composition.selected.map((source) => source.memory),
        limit,
        ignoredConcepts
      ),
      query
    )
    await recordMemoryDebugEvent(basePath, {
      action: 'memory.analyze.concepts',
      outcome: 'ok',
      tool: 'ui-api',
      details: {
        limit,
        query,
        includeNoise,
        maxMemories,
        rawTotal: view.rawTotal,
        excludedNoise: view.excludedNoise,
        totalMemories: conceptGraph.totalMemories,
        source_ids: composition.selected.map((source) => source.memory.id),
        exclusion_count: composition.exclusions.length,
        concept_count: conceptGraph.concepts.length,
        edge_count: conceptGraph.edges.length,
        top_concepts: conceptGraph.concepts.slice(0, 10).map((concept) => ({
          title: concept.title,
          occurrences: concept.occurrences,
          score: concept.score,
        })),
      },
    })
    sendJson(response, 200, {
      ...conceptGraph,
      rawTotalMemories: view.rawTotal,
      excludedNoiseMemories: view.excludedNoise,
      ignoredConcepts: noiseConfig.ignoredConcepts,
      exclusions: composition.exclusions.map(({ memory, reason }) => ({
        id: memory.id,
        type: memory.type,
        status: memory.status,
        updated_at: memory.updated_at,
        reason,
      })),
      calculation:
        'Concept strength combines tag weight, keyword recurrence, frequency, and co-occurrence across the memories selected for the current LLM context. Context exclusions match the LLM context preview policy.',
    })
    return
  }

  if (method === 'GET' && url.pathname === '/api/memories') {
    const query = url.searchParams.get('query') ?? undefined
    const type = url.searchParams.get('type') ?? undefined
    const scope = url.searchParams.get('scope') ?? undefined
    const tag = url.searchParams.get('tag') ?? undefined
    const status = url.searchParams.get('status') ?? undefined
    const limit = Number(url.searchParams.get('limit') ?? 100)
    const includeNoise = parseBoolean(url.searchParams.get('includeNoise'))
    const rawMemories = await getIndexedMemories(basePath)
    const view = getVisibleMemories(rawMemories, { includeNoise })
    const filteredMemories = filterMemories(view.memories, { query, type, scope, tag, status })
    const limitedMemories = filteredMemories.slice(0, Number.isFinite(limit) ? limit : 100)

    await recordMemoryDebugEvent(basePath, {
      action: query || type || scope || tag || status ? 'memory.search' : 'memory.list',
      outcome: 'ok',
      tool: 'ui-api',
      details: {
        query,
        type,
        scope,
        tag,
        status,
        limit,
        includeNoise,
        rawTotal: view.rawTotal,
        excludedNoise: view.excludedNoise,
        result_count: limitedMemories.length,
        total_matching: filteredMemories.length,
        result_ids: limitedMemories.slice(0, 25).map((memory) => memory.id),
      },
    })

    sendJson(response, 200, {
      memories: limitedMemories.map(normalizeNoiseSearchResult),
      totalMatching: filteredMemories.length,
      rawTotalMemories: view.rawTotal,
      excludedNoiseMemories: view.excludedNoise,
    })
    return
  }

  if (method === 'GET' && url.pathname === '/api/context-preview') {
    const query = url.searchParams.get('query') ?? undefined
    const includeNoise = parseBoolean(url.searchParams.get('includeNoise'))
    const maxMemories = clampNumber(Number(url.searchParams.get('maxMemories') ?? 18), 6, 48)
    const rawMemories = await getIndexedMemories(basePath)
    const noiseConfig = await readNoiseConfig(basePath)
    const view = getVisibleMemories(rawMemories, { includeNoise })
    const preview = buildContextPreview(
      view.memories,
      query,
      maxMemories,
      getContextIgnoredConcepts(query, noiseConfig.ignoredConcepts)
    )

    await recordMemoryDebugEvent(basePath, {
      action: 'context.preview',
      outcome: 'ok',
      tool: 'ui-api',
      details: {
        query,
        includeNoise,
        maxMemories,
        memory_count: preview.memoryCount,
        token_estimate: preview.tokenEstimate,
        source_ids: preview.sources.map((memory) => memory.id),
        exclusion_count: preview.exclusions.length,
      },
    })

    sendJson(response, 200, preview)
    return
  }

  const conceptActionMatch = url.pathname.match(/^\/api\/concepts\/([^/]+)\/(ignore|consolidate)$/)
  if (conceptActionMatch && method === 'POST') {
    const concept = decodeURIComponent(conceptActionMatch[1])
    const action = conceptActionMatch[2]
    const normalizedConcept = normalizeConcept(concept) ?? concept.toLowerCase().trim()
    const rawMemories = await getIndexedMemories(basePath)
    const view = getVisibleMemories(rawMemories, {
      includeNoise: true,
    })
    const matchingMemories = filterMemories(view.memories, {
      query: normalizedConcept,
      status: 'active',
    }).slice(0, 40)

    if (action === 'ignore') {
      const config = await readNoiseConfig(basePath)
      const ignoredConcepts = Array.from(new Set([...config.ignoredConcepts, normalizedConcept]))
      await writeNoiseConfig(basePath, { ignoredConcepts })
      await recordMemoryDebugEvent(basePath, {
        action: 'concept.ignore',
        outcome: 'ok',
        tool: 'ui-api',
        details: { concept: normalizedConcept, ignoredConcepts },
      })
      sendJson(response, 200, { ignoredConcepts })
      return
    }

    const memory = await createMemory(basePath, {
      type: 'knowledge',
      scope: 'project',
      source: 'ui-consolidation',
      tags: ['consolidated', 'llm-context', normalizedConcept.replace(/\s+/g, '-')],
      content: buildConsolidatedMemoryContent(normalizedConcept, matchingMemories),
      salience: 0.82,
    })
    await recordMemoryDebugEvent(basePath, {
      action: 'concept.consolidate',
      outcome: 'ok',
      tool: 'ui-api',
      memory_id: memory.metadata.id,
      details: {
        concept: normalizedConcept,
        source_memory_count: matchingMemories.length,
        source_memory_ids: matchingMemories.map((item) => item.id),
      },
    })
    sendJson(response, 201, { memory })
    return
  }

  if (method === 'POST' && url.pathname === '/api/memories') {
    const parsed = parseCreateMemoryPayload(await readJson(request))
    if (!parsed.ok) return sendJson(response, 400, { error: parsed.error })

    const memory = await createMemory(basePath, parsed.value)
    sendJson(response, 201, { memory })
    return
  }

  const memoryMatch = url.pathname.match(
    /^\/api\/memories\/([^/]+)(?:\/(archive|restore|approve|reject|mark-noise))?$/
  )
  if (memoryMatch) {
    const id = decodeURIComponent(memoryMatch[1])
    const action = memoryMatch[2]

    if (method === 'GET' && !action) {
      const memory = await readMemory(basePath, id)
      if (!memory) return sendJson(response, 404, notFound(id))
      sendJson(response, 200, { memory: normalizeNoiseMemory(memory) })
      return
    }

    if (method === 'PATCH' && !action) {
      const parsed = parseUpdateMemoryPayload(await readJson(request))
      if (!parsed.ok) return sendJson(response, 400, { error: parsed.error })

      const memory = await updateMemory(basePath, id, parsed.value)
      if (!memory) return sendJson(response, 404, notFound(id))
      sendJson(response, 200, { memory: normalizeNoiseMemory(memory) })
      return
    }

    if (method === 'DELETE' && !action) {
      const deleted = await deleteMemory(basePath, id, {
        physical: url.searchParams.get('physical') === 'true',
      })
      if (!deleted) return sendJson(response, 404, notFound(id))
      sendJson(response, 200, { deleted: true })
      return
    }

    if (method === 'POST' && action === 'archive') {
      const archived = await archiveMemory(basePath, id)
      if (!archived) return sendJson(response, 404, notFound(id))
      const memory = await readMemory(basePath, id)
      sendJson(response, 200, {
        archived: true,
        memory: memory ? normalizeNoiseMemory(memory) : null,
      })
      return
    }

    if (method === 'POST' && action === 'restore') {
      const restored = await restoreMemory(basePath, id)
      if (!restored) return sendJson(response, 404, notFound(id))
      const memory = await readMemory(basePath, id)
      sendJson(response, 200, {
        restored: true,
        memory: memory ? normalizeNoiseMemory(memory) : null,
      })
      return
    }

    if (method === 'POST' && action === 'approve') {
      const approved = await approveMemory(basePath, id)
      if (!approved) return sendJson(response, 404, notFound(id))
      const memory = await readMemory(basePath, id)
      sendJson(response, 200, {
        approved: true,
        memory: memory ? normalizeNoiseMemory(memory) : null,
      })
      return
    }

    if (method === 'POST' && action === 'reject') {
      const rejected = await rejectMemory(basePath, id)
      if (!rejected) return sendJson(response, 404, notFound(id))
      const memory = await readMemory(basePath, id)
      sendJson(response, 200, {
        rejected: true,
        memory: memory ? normalizeNoiseMemory(memory) : null,
      })
      return
    }

    if (method === 'POST' && action === 'mark-noise') {
      const memory = await updateMemory(basePath, id, { status: 'noise' })
      if (!memory) return sendJson(response, 404, notFound(id))
      sendJson(response, 200, {
        markedNoise: true,
        memory: normalizeNoiseMemory(memory),
      })
      return
    }
  }

  if (method === 'GET' && url.pathname === '/api/stats') {
    const includeNoise = parseBoolean(url.searchParams.get('includeNoise'))
    const rawMemories = await getIndexedMemories(basePath)
    const view = getVisibleMemories(rawMemories, { includeNoise })
    const stats = computeStats(view.memories)
    sendJson(response, 200, {
      project: {
        name: basename(cwd),
        path: cwd,
        memoryPath: basePath,
      },
      stats,
      rawStats: computeStats(rawMemories),
      rawTotalMemories: view.rawTotal,
      excludedNoiseMemories: view.excludedNoise,
    })
    return
  }

  if (method === 'GET' && url.pathname === '/api/index-stats') {
    sendJson(response, 200, await buildIndexDiagnostics(basePath))
    return
  }

  if (method === 'GET' && url.pathname === '/api/package-versions') {
    sendJson(response, 200, await buildPackageVersions())
    return
  }

  if (method === 'POST' && url.pathname === '/api/index/rebuild') {
    const indexed = await indexAllMemories(basePath)
    sendJson(response, 200, { indexed })
    return
  }

  sendJson(response, 404, { error: 'Not found' })
}

function notFound(id: string): ApiErrorResponse {
  return { error: `Memory not found: ${id}` }
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(body))
}

function generateSessionToken(): string {
  return randomBytes(24).toString('base64url')
}

async function buildIndexDiagnostics(basePath: string): Promise<IndexDiagnosticsResponse> {
  const [indexedMemories, fileMemories] = await Promise.all([
    getIndexedMemories(basePath),
    listMemories(basePath),
  ])
  const database = await getDatabaseFilesSize(basePath)

  const index = new MemoryIndex(basePath)
  try {
    const sqlite = index.getSqliteStats()
    const vectorIds = new Set(index.getSemanticEmbeddingIds())
    const fileIds = new Set(fileMemories.map((memory) => memory.metadata.id))
    const indexedIds = new Set(indexedMemories.map((memory) => memory.id))
    const vectorCandidates = indexedMemories.filter(
      (memory) => memory.status === 'active' && !isNoiseMemory(memory)
    )
    const missingVectors = vectorCandidates.filter((memory) => !vectorIds.has(memory.id)).length
    const missingInIndex = [...fileIds].filter((id) => !indexedIds.has(id)).length
    const orphanedInIndex = [...indexedIds].filter((id) => !fileIds.has(id)).length

    return {
      database,
      sqlite: {
        memoryRows: sqlite.memoryRows,
        tagRows: sqlite.tagRows,
        chunkRows: sqlite.chunkRows,
        ftsRows: sqlite.ftsRows,
        latestMemoryUpdatedAt: sqlite.latestMemoryUpdatedAt,
      },
      markdown: {
        memoryFiles: fileMemories.length,
      },
      vectors: {
        candidates: vectorCandidates.length,
        indexed: vectorCandidates.length - missingVectors,
        missing: missingVectors,
        coverage:
          vectorCandidates.length === 0
            ? 1
            : (vectorCandidates.length - missingVectors) / vectorCandidates.length,
        latestUpdatedAt: sqlite.latestSemanticUpdatedAt,
      },
      health: {
        status:
          missingInIndex === 0 && orphanedInIndex === 0 && missingVectors === 0
            ? 'ok'
            : 'needs-sync',
        missingInIndex,
        orphanedInIndex,
        missingVectors,
      },
    }
  } finally {
    index.close()
  }
}

async function buildPackageVersions(): Promise<PackageVersionsResponse> {
  if (packageVersionsCache && packageVersionsCache.expiresAt > Date.now()) {
    return packageVersionsCache.response
  }

  const packages = await Promise.all(
    PACKAGE_VERSION_SPECS.map(async (spec) => {
      const [localManifest, latest] = await Promise.all([
        readPackageManifest(spec),
        fetchLatestNpmVersion(spec.name),
      ])
      const repositoryError = getPackageRepositoryError(
        localManifest,
        latest.version,
        latest.repositoryUrl
      )
      const currentVersion = localManifest?.version ?? null
      const latestVersion = repositoryError ? null : latest.version
      const status = getPackageVersionStatus(currentVersion, latestVersion)
      const errors = [
        currentVersion ? null : 'Local package manifest unavailable.',
        latest.error,
        repositoryError,
      ]
        .filter((item): item is string => Boolean(item))
        .join(' ')

      return {
        name: spec.name,
        label: spec.label,
        currentVersion,
        latestVersion,
        status,
        ...(errors ? { error: errors } : {}),
      } satisfies PackageBuildVersion
    })
  )

  const response: PackageVersionsResponse = {
    packages,
    checkedAt: new Date().toISOString(),
    updateCount: packages.filter((item) => item.status === 'update-available').length,
  }

  packageVersionsCache = {
    expiresAt: Date.now() + PACKAGE_VERSION_CACHE_TTL_MS,
    response,
  }

  return response
}

async function readPackageManifest(spec: PackageVersionSpec): Promise<LocalPackageManifest | null> {
  const manifestPaths = [
    join(SERVER_DIST_DIR, spec.workspaceManifest),
    resolveInstalledPackageManifest(spec.name),
  ].filter((item): item is string => Boolean(item))

  for (const manifestPath of manifestPaths) {
    try {
      const parsed = JSON.parse(await readFile(manifestPath, 'utf-8')) as {
        name?: unknown
        version?: unknown
        repository?: unknown
      }
      if (parsed.name === spec.name && typeof parsed.version === 'string') {
        return {
          version: parsed.version,
          repositoryUrl: getRepositoryUrl(parsed.repository),
        }
      }
    } catch {
      // Published installs can lack the monorepo workspace layout.
    }
  }

  return null
}

function resolveInstalledPackageManifest(packageName: string): string | null {
  try {
    return join(dirname(nodeRequire.resolve(packageName)), '../package.json')
  } catch {
    return null
  }
}

async function fetchLatestNpmVersion(
  packageName: string
): Promise<{ version: string | null; repositoryUrl: string | null; error?: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), NPM_VERSION_TIMEOUT_MS)

  try {
    const response = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`,
      {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      }
    )
    if (!response.ok) {
      return { version: null, repositoryUrl: null, error: `npm returned ${response.status}.` }
    }

    const body = (await response.json()) as { version?: unknown; repository?: unknown }
    if (typeof body.version !== 'string') {
      return {
        version: null,
        repositoryUrl: null,
        error: 'npm latest version is missing.',
      }
    }

    return {
      version: body.version,
      repositoryUrl: getRepositoryUrl(body.repository),
    }
  } catch (error) {
    return {
      version: null,
      repositoryUrl: null,
      error: error instanceof Error ? error.message : 'npm version check failed.',
    }
  } finally {
    clearTimeout(timeout)
  }
}

function getPackageRepositoryError(
  localManifest: LocalPackageManifest | null,
  latestVersion: string | null,
  latestRepositoryUrl: string | null
): string | null {
  if (!localManifest || !latestVersion) return null
  if (!localManifest.repositoryUrl || !latestRepositoryUrl) {
    return 'npm package metadata could not be verified.'
  }
  if (repositoriesMatch(localManifest.repositoryUrl, latestRepositoryUrl)) return null
  return 'npm package metadata does not match this repository.'
}

function repositoriesMatch(left: string | null, right: string | null): boolean {
  const normalizedLeft = normalizeRepositoryUrl(left)
  const normalizedRight = normalizeRepositoryUrl(right)
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight)
}

function normalizeRepositoryUrl(url: string | null): string | null {
  if (!url) return null

  return url
    .trim()
    .toLowerCase()
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^ssh:\/\/git@github\.com\//, 'https://github.com/')
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/\.git$/, '')
}

function getRepositoryUrl(repository: unknown): string | null {
  if (typeof repository === 'string') return repository
  if (
    repository &&
    typeof repository === 'object' &&
    'url' in repository &&
    typeof repository.url === 'string'
  ) {
    return repository.url
  }

  return null
}

function getPackageVersionStatus(
  currentVersion: string | null,
  latestVersion: string | null
): PackageVersionStatus {
  if (!currentVersion || !latestVersion) return 'unknown'

  const comparison = compareSemver(currentVersion, latestVersion)
  if (comparison === null) return currentVersion === latestVersion ? 'up-to-date' : 'unknown'
  if (comparison < 0) return 'update-available'
  if (comparison > 0) return 'ahead'
  return 'up-to-date'
}

function compareSemver(left: string, right: string): number | null {
  const leftVersion = parseSemver(left)
  const rightVersion = parseSemver(right)
  if (!leftVersion || !rightVersion) return null

  const leftParts = [leftVersion.major, leftVersion.minor, leftVersion.patch]
  const rightParts = [rightVersion.major, rightVersion.minor, rightVersion.patch]

  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] > rightParts[index] ? 1 : -1
    }
  }

  if (leftVersion.prerelease === rightVersion.prerelease) return 0
  if (!leftVersion.prerelease) return 1
  if (!rightVersion.prerelease) return -1
  return leftVersion.prerelease.localeCompare(rightVersion.prerelease)
}

function parseSemver(
  version: string
): { major: number; minor: number; patch: number; prerelease: string } | null {
  const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/)
  if (!match) return null

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? '',
  }
}

async function buildPamConfig(cwd: string, basePath: string): Promise<PamConfigResponse> {
  const [autoCapture, noise, runtime, debugStatus] = await Promise.all([
    loadAutoCaptureConfig(basePath),
    readNoiseConfig(basePath),
    readRuntimeConfig(basePath),
    getMemoryDebugStatus(basePath),
  ])
  const effectiveRuntime = {
    ...runtime,
    debug: debugStatus.enabled,
  }
  applyRuntimeConfig(effectiveRuntime)

  return {
    project: {
      name: basename(cwd),
      path: cwd,
      memoryPath: basePath,
    },
    autoCapture,
    noise,
    runtime: effectiveRuntime,
  }
}

async function getDatabaseFilesSize(
  basePath: string
): Promise<IndexDiagnosticsResponse['database']> {
  const names = ['memory.db', 'memory.db-wal', 'memory.db-shm']
  const files: Array<{ name: string; sizeBytes: number }> = []

  for (const name of names) {
    try {
      const fileStats = await stat(join(basePath, name))
      if (fileStats.isFile()) {
        files.push({ name, sizeBytes: fileStats.size })
      }
    } catch {
      // Missing WAL/SHM files are normal.
    }
  }

  return {
    sizeBytes: files.reduce((total, file) => total + file.sizeBytes, 0),
    files,
  }
}

function isMutableMethod(method: string): boolean {
  return method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE'
}

function authorizeMutableRequest(
  request: IncomingMessage,
  response: ServerResponse,
  sessionToken: string
): boolean {
  if (!isSameOriginRequest(request)) {
    sendJson(response, 403, { error: 'Cross-origin mutation blocked.' })
    return false
  }

  const headerValue = request.headers[SESSION_HEADER]
  const token = Array.isArray(headerValue) ? headerValue[0] : headerValue
  if (token !== sessionToken) {
    sendJson(response, 403, { error: 'Missing or invalid PAM session token.' })
    return false
  }

  return true
}

function isSameOriginRequest(request: IncomingMessage): boolean {
  const origin = request.headers.origin
  if (!origin) return true

  const host = request.headers.host
  if (!host) return false

  try {
    const parsedOrigin = new URL(origin)
    return (
      parsedOrigin.host === host &&
      (parsedOrigin.protocol === 'http:' || parsedOrigin.protocol === 'https:')
    )
  } catch {
    return false
  }
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'))
}

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string }

function parsePamConfigPatch(value: unknown): ValidationResult<{
  autoCapture?: AutoCaptureConfig
  noise?: NoiseConfig
  runtime?: RuntimeConfig
}> {
  if (!isPlainObject(value)) return validationError('Request body must be a JSON object.')

  const unknown = unknownKeys(value, ['autoCapture', 'noise', 'runtime'])
  if (unknown.length) return validationError(`Unknown field(s): ${unknown.join(', ')}`)

  const next: { autoCapture?: AutoCaptureConfig; noise?: NoiseConfig; runtime?: RuntimeConfig } = {}

  if (value.autoCapture !== undefined) {
    if (!isPlainObject(value.autoCapture)) {
      return validationError('Field "autoCapture" must be an object when provided.')
    }
    const autoCaptureUnknown = unknownKeys(value.autoCapture, ['mode', 'rules', 'exclude'])
    if (autoCaptureUnknown.length) {
      return validationError(`Unknown autoCapture field(s): ${autoCaptureUnknown.join(', ')}`)
    }
    if (!isAutoCaptureMode(value.autoCapture.mode)) {
      return validationError('Field "autoCapture.mode" must be auto, assisted, or manual.')
    }
    next.autoCapture = {
      mode: value.autoCapture.mode,
    }
  }

  if (value.noise !== undefined) {
    if (!isPlainObject(value.noise)) {
      return validationError('Field "noise" must be an object when provided.')
    }
    const noiseUnknown = unknownKeys(value.noise, ['ignoredConcepts'])
    if (noiseUnknown.length) {
      return validationError(`Unknown noise field(s): ${noiseUnknown.join(', ')}`)
    }
    if (!Array.isArray(value.noise.ignoredConcepts)) {
      return validationError('Field "noise.ignoredConcepts" must be an array.')
    }
    const ignoredConcepts = value.noise.ignoredConcepts
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
    if (ignoredConcepts.length !== value.noise.ignoredConcepts.length) {
      return validationError('Field "noise.ignoredConcepts" must contain only non-empty strings.')
    }
    next.noise = {
      ignoredConcepts: Array.from(new Set(ignoredConcepts)),
    }
  }

  if (value.runtime !== undefined) {
    if (!isPlainObject(value.runtime)) {
      return validationError('Field "runtime" must be an object when provided.')
    }
    const runtimeUnknown = unknownKeys(value.runtime, [
      'autoVectorize',
      'deferThemeRebuild',
      'debug',
    ])
    if (runtimeUnknown.length) {
      return validationError(`Unknown runtime field(s): ${runtimeUnknown.join(', ')}`)
    }
    if (
      typeof value.runtime.autoVectorize !== 'boolean' ||
      typeof value.runtime.deferThemeRebuild !== 'boolean' ||
      typeof value.runtime.debug !== 'boolean'
    ) {
      return validationError(
        'Fields "runtime.autoVectorize", "runtime.deferThemeRebuild", and "runtime.debug" must be booleans.'
      )
    }
    next.runtime = {
      autoVectorize: value.runtime.autoVectorize,
      deferThemeRebuild: value.runtime.deferThemeRebuild,
      debug: value.runtime.debug,
    }
  }

  return { ok: true, value: next }
}

function isAutoCaptureMode(value: unknown): value is AutoCaptureMode {
  return value === 'auto' || value === 'assisted' || value === 'manual'
}

function parseCreateMemoryPayload(value: unknown): ValidationResult<CreateMemoryInput> {
  if (!isPlainObject(value)) return validationError('Request body must be a JSON object.')

  const unknown = unknownKeys(value, [
    'type',
    'scope',
    'title',
    'content',
    'tags',
    'concepts',
    'source',
    'status',
    'theme',
    'salience',
    'supersedes',
    'source_ids',
  ])
  if (unknown.length) return validationError(`Unknown field(s): ${unknown.join(', ')}`)

  if (!isMemoryType(value.type)) return validationError('Field "type" must be a valid memory type.')
  if (value.scope !== undefined && !isMemoryScope(value.scope)) {
    return validationError('Field "scope" must be "project" when provided.')
  }
  if (typeof value.content !== 'string') {
    return validationError('Field "content" must be a string.')
  }
  if (value.title !== undefined && typeof value.title !== 'string') {
    return validationError('Field "title" must be a string when provided.')
  }

  const tags = parseOptionalStringArray(value.tags, 'tags')
  if (!tags.ok) return tags

  const concepts = parseOptionalStringArray(value.concepts, 'concepts')
  if (!concepts.ok) return concepts

  const sourceIds = parseOptionalStringArray(value.source_ids, 'source_ids')
  if (!sourceIds.ok) return sourceIds

  if (value.source !== undefined && typeof value.source !== 'string') {
    return validationError('Field "source" must be a string when provided.')
  }
  if (value.status !== undefined && !isMemoryStatus(value.status)) {
    return validationError('Field "status" must be a valid pam status when provided.')
  }
  if (value.theme !== undefined && typeof value.theme !== 'string') {
    return validationError('Field "theme" must be a string when provided.')
  }
  if (value.supersedes !== undefined && typeof value.supersedes !== 'string') {
    return validationError('Field "supersedes" must be a string when provided.')
  }
  if (value.salience !== undefined && !isValidSalience(value.salience)) {
    return validationError('Field "salience" must be a number between 0 and 1 when provided.')
  }

  return {
    ok: true,
    value: {
      type: value.type,
      scope: value.scope ?? 'project',
      title: value.title,
      content: value.content,
      tags: tags.value,
      concepts: concepts.value,
      source: value.source,
      status: value.status,
      theme: value.theme,
      salience: value.salience,
      supersedes: value.supersedes,
      source_ids: sourceIds.value,
    },
  }
}

function parseUpdateMemoryPayload(value: unknown): ValidationResult<UpdateMemoryInput> {
  if (!isPlainObject(value)) return validationError('Request body must be a JSON object.')

  const unknown = unknownKeys(value, [
    'content',
    'title',
    'tags',
    'concepts',
    'type',
    'scope',
    'status',
    'theme',
    'source_ids',
    'superseded_by',
  ])
  if (unknown.length) return validationError(`Unknown field(s): ${unknown.join(', ')}`)

  if (value.content !== undefined && typeof value.content !== 'string') {
    return validationError('Field "content" must be a string when provided.')
  }
  if (value.title !== undefined && typeof value.title !== 'string') {
    return validationError('Field "title" must be a string when provided.')
  }
  if (value.type !== undefined && !isMemoryType(value.type)) {
    return validationError('Field "type" must be a valid memory type when provided.')
  }
  if (value.scope !== undefined && !isMemoryScope(value.scope)) {
    return validationError('Field "scope" must be "project" when provided.')
  }
  if (value.status !== undefined && !isMemoryStatus(value.status)) {
    return validationError('Field "status" must be a valid pam status when provided.')
  }
  if (value.theme !== undefined && typeof value.theme !== 'string') {
    return validationError('Field "theme" must be a string when provided.')
  }
  if (value.superseded_by !== undefined && typeof value.superseded_by !== 'string') {
    return validationError('Field "superseded_by" must be a string when provided.')
  }

  const tags = parseOptionalStringArray(value.tags, 'tags')
  if (!tags.ok) return tags

  const concepts = parseOptionalStringArray(value.concepts, 'concepts')
  if (!concepts.ok) return concepts

  const sourceIds = parseOptionalStringArray(value.source_ids, 'source_ids')
  if (!sourceIds.ok) return sourceIds

  const update: UpdateMemoryInput = {
    content: value.content,
    title: value.title,
    tags: tags.value,
    concepts: concepts.value,
    type: value.type,
    scope: value.scope,
    status: value.status,
    theme: value.theme,
    source_ids: sourceIds.value,
    superseded_by: value.superseded_by,
  }

  const hasField = Object.values(update).some((field) => field !== undefined)
  if (!hasField) return validationError('At least one update field is required.')

  return { ok: true, value: update }
}

function parseOptionalStringArray(
  value: unknown,
  field: string
): ValidationResult<string[] | undefined> {
  if (value === undefined) return { ok: true, value: undefined }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    return validationError(`Field "${field}" must be an array of strings when provided.`)
  }
  return { ok: true, value }
}

function validationError(error: string): ValidationResult<never> {
  return { ok: false, error }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function unknownKeys(value: Record<string, unknown>, allowed: string[]): string[] {
  const allowedSet = new Set(allowed)
  return Object.keys(value).filter((key) => !allowedSet.has(key))
}

function isValidSalience(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

async function serveStatic(
  response: ServerResponse,
  staticDir: string,
  pathname: string
): Promise<void> {
  const requestedPath = pathname === '/' ? '/index.html' : pathname
  const filePath = resolveStaticPath(staticDir, requestedPath)
  const pathToServe = existsSync(filePath) ? filePath : join(staticDir, 'index.html')

  if (!existsSync(pathToServe)) {
    sendJson(response, 404, { error: 'UI build not found. Run pnpm build first.' })
    return
  }

  response.writeHead(200, { 'content-type': getContentType(pathToServe) })
  createReadStream(pathToServe).pipe(response)
}

function resolveStaticPath(staticDir: string, pathname: string): string {
  const safePath = normalize(pathname).replace(/^([/\\])+/, '')
  const filePath = resolve(staticDir, safePath)
  const root = resolve(staticDir)

  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    return join(staticDir, 'index.html')
  }

  return filePath
}

function getContentType(filePath: string): string {
  switch (extname(filePath)) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    default:
      return 'application/octet-stream'
  }
}

interface MemoryFilterOptions {
  includeNoise?: boolean
}

interface MemoryQueryOptions {
  query?: string
  type?: string
  scope?: string
  tag?: string
  status?: string
}

async function getIndexedMemories(basePath: string): Promise<SearchResult[]> {
  let index = new MemoryIndex(basePath)
  let memories = index.getAllMemories()

  if (!memories.length) {
    index.close()
    await indexAllMemories(basePath)
    index = new MemoryIndex(basePath)
    memories = index.getAllMemories()
  }

  index.close()
  return memories.map(normalizeIndexedSearchResult)
}

function normalizeIndexedSearchResult(memory: SearchResult): SearchResult {
  return {
    ...memory,
    type: memory.type === 'project' ? 'knowledge' : memory.type,
    scope: PROJECT_SCOPE,
  }
}

function getVisibleMemories(
  memories: SearchResult[],
  options: MemoryFilterOptions = {}
): VisibleMemoryView {
  const includeNoise = options.includeNoise ?? false
  let excludedNoise = 0

  const visible = memories.filter((memory) => {
    if (!includeNoise && isNoiseMemory(memory)) {
      excludedNoise += 1
      return false
    }

    return true
  })

  return {
    memories: visible,
    excludedNoise,
    rawTotal: memories.length,
  }
}

function filterMemories(memories: SearchResult[], options: MemoryQueryOptions): SearchResult[] {
  return memories.filter((memory) => {
    if (options.status && options.status !== 'all') {
      if (options.status === 'noise' && !isNoiseMemory(memory)) return false
      if (options.status === 'active' && (memory.status !== 'active' || isNoiseMemory(memory))) {
        return false
      }
      if (
        options.status !== 'noise' &&
        options.status !== 'active' &&
        memory.status !== options.status
      ) {
        return false
      }
    }
    if (options.type && memory.type !== options.type) return false
    if (options.scope && memory.scope !== options.scope) return false
    if (options.tag && !memory.tags.includes(options.tag)) return false
    if (options.query && !memoryMatchesQuery(memory, options.query)) return false
    return true
  })
}

function memoryMatchesQuery(memory: SearchResult, query: string): boolean {
  const blob = [
    memory.id,
    memory.type,
    memory.scope,
    memory.status,
    memory.source,
    memory.content,
    ...memory.tags,
    ...memory.concepts,
  ]
    .join(' ')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')

  const normalizedQuery = normalizeConcept(query) ?? query.toLowerCase().trim()
  if (!normalizedQuery) return true
  const terms = normalizedQuery.split(/\s+/).filter(Boolean)
  if (terms.every((term) => blob.includes(term))) return true

  return matchesNaturalSearch(blob, query)
}

function isNoiseMemory(memory: SearchResult): boolean {
  return (
    memory.status === 'noise' ||
    memory.tags.includes('noise') ||
    memory.tags.includes('ignored') ||
    memory.tags.includes('pam-noise') ||
    memory.source === 'noise'
  )
}

function normalizeNoiseSearchResult(memory: SearchResult): SearchResult {
  return isNoiseMemory(memory) ? { ...memory, status: 'noise' } : memory
}

function normalizeNoiseMemory(memory: Memory): Memory {
  const tags = memory.metadata.tags
  const hasNoiseMarker =
    memory.metadata.status === 'noise' ||
    tags.includes('noise') ||
    tags.includes('ignored') ||
    tags.includes('pam-noise')

  return hasNoiseMarker ? { ...memory, metadata: { ...memory.metadata, status: 'noise' } } : memory
}

function computeStats(memories: SearchResult[]): ViewStats {
  return {
    total: memories.length,
    active: memories.filter((memory) => memory.status === 'active' && !isNoiseMemory(memory))
      .length,
    deleted: memories.filter((memory) => memory.status === 'deleted').length,
    archived: memories.filter((memory) => memory.status === 'archived').length,
    proposed: memories.filter((memory) => memory.status === 'proposed').length,
    noise: memories.filter(isNoiseMemory).length,
    byType: countBy(memories, (memory) => memory.type),
    byScope: countBy(memories, (memory) => memory.scope),
    tags: memories.reduce<Record<string, number>>((acc, memory) => {
      memory.tags.forEach((tag) => {
        acc[tag] = (acc[tag] ?? 0) + 1
      })
      return acc
    }, {}),
  }
}

function countBy(
  memories: SearchResult[],
  getKey: (memory: SearchResult) => string
): Record<string, number> {
  return memories.reduce<Record<string, number>>((acc, memory) => {
    const key = getKey(memory)
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
}

async function readNoiseConfig(basePath: string): Promise<NoiseConfig> {
  const filePath = join(basePath, NOISE_CONFIG_FILE)
  if (!existsSync(filePath)) return { ignoredConcepts: [] }

  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf-8')) as Partial<NoiseConfig>
    return {
      ignoredConcepts: Array.isArray(parsed.ignoredConcepts)
        ? parsed.ignoredConcepts.filter((item): item is string => typeof item === 'string')
        : [],
    }
  } catch {
    return { ignoredConcepts: [] }
  }
}

async function writeNoiseConfig(basePath: string, config: NoiseConfig): Promise<void> {
  await writeFile(join(basePath, NOISE_CONFIG_FILE), JSON.stringify(config, null, 2), 'utf-8')
}

async function readRuntimeConfig(basePath: string): Promise<RuntimeConfig> {
  const fallback = getRuntimeConfigFromEnv()
  const filePath = join(basePath, RUNTIME_CONFIG_FILE)
  if (!existsSync(filePath)) return fallback

  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf-8')) as Partial<RuntimeConfig>
    return {
      autoVectorize:
        typeof parsed.autoVectorize === 'boolean' ? parsed.autoVectorize : fallback.autoVectorize,
      deferThemeRebuild:
        typeof parsed.deferThemeRebuild === 'boolean'
          ? parsed.deferThemeRebuild
          : fallback.deferThemeRebuild,
      debug: typeof parsed.debug === 'boolean' ? parsed.debug : fallback.debug,
    }
  } catch {
    return fallback
  }
}

async function writeRuntimeConfig(basePath: string, config: RuntimeConfig): Promise<void> {
  await writeFile(join(basePath, RUNTIME_CONFIG_FILE), JSON.stringify(config, null, 2), 'utf-8')
}

function getRuntimeConfigFromEnv(): RuntimeConfig {
  return {
    autoVectorize: process.env.PAM_AUTO_VECTORIZE !== '0',
    deferThemeRebuild: process.env.PAM_DEFER_THEME_REBUILD === '1',
    debug: ['1', 'true', 'yes', 'on'].includes((process.env.PAM_DEBUG ?? '').toLowerCase()),
  }
}

function applyRuntimeConfig(config: RuntimeConfig): void {
  process.env.PAM_AUTO_VECTORIZE = config.autoVectorize ? '1' : '0'
  process.env.PAM_DEFER_THEME_REBUILD = config.deferThemeRebuild ? '1' : '0'
  process.env.PAM_DEBUG = config.debug ? '1' : '0'
}

function parseBoolean(value: string | null): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').toLowerCase())
}

function buildConceptGraph(
  memories: SearchResult[],
  limit: number,
  ignoredConcepts: string[] = []
): {
  totalMemories: number
  concepts: ConceptNode[]
  edges: ConceptEdge[]
} {
  const ignored = new Set(
    ignoredConcepts.map((concept) => normalizeConcept(concept)).filter(Boolean) as string[]
  )
  const visibleMemories = memories.filter(
    (memory) => memory.status !== 'deleted' && !isNoiseMemory(memory)
  )
  const buckets = new Map<
    string,
    {
      category: 'tag' | 'keyword'
      evidence: Set<string>
      occurrenceIds: Set<string>
      samples: ConceptSample[]
      score: number
      scopeCounts: Map<string, number>
      sourceCounts: Map<string, number>
      title: string
      typeCounts: Map<string, number>
      lastUpdated: string | null
    }
  >()
  const perMemoryConcepts: Array<{ concepts: Set<string>; strength: number }> = []

  visibleMemories.forEach((memory) => {
    const strength = getMemoryStrength(memory)
    const candidates = new Map<
      string,
      { category: 'tag' | 'keyword'; title: string; weight: number }
    >()
    const clientConcepts = getClientConceptCandidates(memory)
    const semanticTags = clientConcepts.length ? [] : getContentSupportedTags(memory)

    const extractedCandidates = clientConcepts.length
      ? clientConcepts
      : extractConceptCandidates(memory.content, semanticTags)

    for (const candidate of extractedCandidates) {
      const concept = mapContextConceptCandidate(candidate, memory)
      if (!concept) continue
      if (ignored.has(concept.id)) continue
      const current = candidates.get(concept.id)
      candidates.set(concept.id, {
        category: current?.category === 'tag' ? 'tag' : concept.category,
        title: concept.title,
        weight: (current?.weight ?? 0) + concept.weight,
      })
    }

    const conceptIds = new Set<string>()
    ;[...candidates.entries()]
      .sort((a, b) => b[1].weight - a[1].weight)
      .slice(0, 12)
      .forEach(([id, candidate]) => {
        const bucket = buckets.get(id) ?? {
          category: candidate.category,
          evidence: new Set<string>(),
          occurrenceIds: new Set<string>(),
          samples: [],
          score: 0,
          scopeCounts: new Map<string, number>(),
          sourceCounts: new Map<string, number>(),
          title: candidate.title,
          typeCounts: new Map<string, number>(),
          lastUpdated: null,
        }

        bucket.score += candidate.weight * strength
        bucket.occurrenceIds.add(memory.id)
        bucket.typeCounts.set(memory.type, (bucket.typeCounts.get(memory.type) ?? 0) + 1)
        bucket.scopeCounts.set(memory.scope, (bucket.scopeCounts.get(memory.scope) ?? 0) + 1)
        bucket.sourceCounts.set(memory.source, (bucket.sourceCounts.get(memory.source) ?? 0) + 1)
        if (!bucket.lastUpdated || memory.updated_at > bucket.lastUpdated) {
          bucket.lastUpdated = memory.updated_at
        }
        if (bucket.samples.length < 6) bucket.samples.push(toConceptSample(memory))
        semanticTags
          .filter((tag) => normalizeConcept(tag))
          .slice(0, 4)
          .forEach((tag) => bucket.evidence.add(formatConceptLabel(tag)))
        buckets.set(id, bucket)
        conceptIds.add(id)
      })

    if (conceptIds.size) perMemoryConcepts.push({ concepts: conceptIds, strength })
  })

  const minOccurrences = getMinimumConceptOccurrences(visibleMemories.length)
  const sortedBuckets = [...buckets.entries()].sort((a, b) => b[1].score - a[1].score)
  const selectedBuckets = sortedBuckets
    .filter(([, bucket]) => bucket.occurrenceIds.size >= minOccurrences)
    .slice(0, limit)
  const selectedIds = new Set(selectedBuckets.map(([id]) => id))
  const edgeWeights = new Map<string, number>()

  perMemoryConcepts.forEach(({ concepts, strength }) => {
    const selectedConcepts = [...concepts]
      .filter((id) => selectedIds.has(id))
      .sort((a, b) => (buckets.get(b)?.score ?? 0) - (buckets.get(a)?.score ?? 0))
      .slice(0, 7)

    for (let i = 0; i < selectedConcepts.length; i += 1) {
      for (let j = i + 1; j < selectedConcepts.length; j += 1) {
        const key = pairKey(selectedConcepts[i], selectedConcepts[j])
        edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + strength)
      }
    }
  })

  const edgeFloor = Math.max(2, Math.min(40, visibleMemories.length * 0.01))
  const edges = [...edgeWeights.entries()]
    .map(([key, weight]) => {
      const [source, target] = key.split('|||')
      return { source, target, weight }
    })
    .filter((edge) => edge.weight >= edgeFloor)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit * 2)

  return {
    totalMemories: visibleMemories.length,
    concepts: selectedBuckets.map(([id, bucket], index) => ({
      id,
      title: bucket.title,
      category: bucket.category,
      rank: index + 1,
      score: Number(bucket.score.toFixed(2)),
      occurrences: bucket.occurrenceIds.size,
      searchTerm: getConceptSearchTerm(id),
      evidence: [...bucket.evidence].slice(0, 4),
      samples: bucket.samples,
      typeCounts: mapToSortedRecord(bucket.typeCounts),
      scopeCounts: mapToSortedRecord(bucket.scopeCounts),
      sourceCounts: mapToSortedRecord(bucket.sourceCounts),
      lastUpdated: bucket.lastUpdated,
    })),
    edges,
  }
}

function mapContextConceptCandidate(
  candidate: { id: string; title: string; category: 'tag' | 'keyword'; weight: number },
  memory: SearchResult
): { id: string; title: string; category: 'tag' | 'keyword'; weight: number } | null {
  if (isMemoryFieldConcept(candidate.id, memory)) return null

  return candidate
}

function getContentSupportedTags(memory: SearchResult): string[] {
  return memory.tags.filter((tag) => {
    const normalized = normalizeConcept(tag)
    if (!normalized) return false
    if (isMemoryFieldConcept(normalized, memory)) return false
    return contentSupportsConcept(memory.content, normalized)
  })
}

function getClientConceptCandidates(
  memory: SearchResult
): Array<{ id: string; title: string; category: 'tag'; weight: number }> {
  return memory.concepts
    .map((concept) => normalizeConcept(concept))
    .filter((concept): concept is string => Boolean(concept))
    .filter((concept) => !isMemoryFieldConcept(concept, memory))
    .map((concept) => ({
      id: concept,
      title: formatConceptLabel(concept),
      category: 'tag' as const,
      weight: 8,
    }))
}

function contentSupportsConcept(content: string, concept: string): boolean {
  const normalized = normalizeConcept(concept)
  if (!normalized) return false

  const conceptParts = normalized.split(/[\s-]+/).filter(Boolean)
  const tokens = tokenizeConceptText(content)
  if (!conceptParts.length || !tokens.length) return false

  if (conceptParts.length === 1) return tokens.includes(conceptParts[0])

  for (let index = 0; index <= tokens.length - conceptParts.length; index += 1) {
    if (conceptParts.every((part, offset) => tokens[index + offset] === part)) return true
  }

  const conceptSignature = getConceptSignature(normalized)
  if (!conceptSignature) return false

  return extractConceptCandidates(content)
    .map((candidate) => getConceptSignature(candidate.id))
    .some((signature) => signature === conceptSignature)
}

function isMemoryFieldConcept(value: string, memory: SearchResult): boolean {
  const normalized = normalizeConcept(value)
  if (!normalized) return true
  if (isMemoryType(normalized) || isMemoryScope(normalized) || isMemoryStatus(normalized))
    return true

  const facetIds = getMemoryFacetConceptIds(memory)
  const signature = getConceptSignature(normalized)
  return facetIds.has(normalized) || Boolean(signature && facetIds.has(signature))
}

function getMemoryFacetConceptIds(memory: SearchResult): Set<string> {
  const ids = new Set<string>()
  const add = (value: string | undefined) => {
    if (!value) return
    const normalized = normalizeConcept(value)
    if (!normalized) return
    ids.add(normalized)
    const signature = getConceptSignature(normalized)
    if (signature) ids.add(signature)
  }

  add(memory.type)
  add(memory.scope)
  add(memory.status)
  add(memory.theme)
  add(memory.source)

  memory.source
    .split(/[^A-Za-z0-9+#.]+/)
    .filter(Boolean)
    .forEach(add)

  return ids
}

function getConceptSignature(value: string): string | null {
  const normalized = normalizeConcept(value)
  if (!normalized) return null
  const signature = normalized.replace(/[\s-]+/g, '')
  return signature || null
}

function filterContextConceptGraph(
  graph: { totalMemories: number; concepts: ConceptNode[]; edges: ConceptEdge[] },
  query: string | undefined
): { totalMemories: number; concepts: ConceptNode[]; edges: ConceptEdge[] } {
  const concepts = graph.concepts.filter((concept) => query?.trim() || concept.occurrences > 1)
  const conceptIds = new Set(concepts.map((concept) => concept.id))
  return {
    ...graph,
    concepts,
    edges: graph.edges.filter((edge) => conceptIds.has(edge.source) && conceptIds.has(edge.target)),
  }
}

function toConceptSample(memory: SearchResult): ConceptSample {
  return {
    id: memory.id,
    type: memory.type,
    scope: memory.scope,
    status: memory.status,
    source: memory.source,
    created_at: memory.created_at,
    updated_at: memory.updated_at,
    tags: memory.tags.slice(0, 8),
    content: truncateText(memory.content.replace(/\s+/g, ' ').trim(), 220),
  }
}

function mapToSortedRecord(map: Map<string, number>): Record<string, number> {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .reduce<Record<string, number>>((acc, [key, value]) => {
      acc[key] = value
      return acc
    }, {})
}

function buildContextPreview(
  memories: SearchResult[],
  query: string | undefined,
  maxMemories: number,
  ignoredConcepts: string[]
): {
  content: string
  tokenEstimate: number
  memoryCount: number
  activeMemoryCount: number
  sources: ContextSource[]
  topConcepts: Array<{ title: string; occurrences: number; score: number }>
  generatedAt: string
  exclusions: ContextExclusion[]
} {
  const generatedAt = new Date().toISOString()
  const composition = composeCoreContextSources(memories, query, maxMemories)
  const activeMemoryCount = memories.filter(
    (memory) => memory.status === 'active' && !isNoiseMemory(memory)
  ).length
  const concepts = filterContextConceptGraph(
    buildConceptGraph(
      composition.selected.map((source) => source.memory),
      12,
      ignoredConcepts
    ),
    query
  ).concepts
  const lines = [
    '# Project LLM Context',
    '',
    `Generated at: ${generatedAt}`,
    query ? `Focused concept/query: ${query}` : 'Focused concept/query: general project memory',
    'Store: project',
    `Selected prompt sources: ${countLabel(composition.selected.length, 'source', 'sources')} from ${countLabel(activeMemoryCount, 'active memory', 'active memories')}.`,
    'Selection policy: active durable memories are ranked first; noise, deleted, archived, proposed, duplicate implementation summaries, and lower-ranked overflow are excluded.',
    '',
    '## Strong Concepts',
    '',
  ]

  if (concepts.length) {
    concepts.slice(0, 10).forEach((concept) => {
      lines.push(
        `- ${concept.title}: ${countLabel(concept.occurrences, 'memory', 'memories')}, strength ${Math.round(concept.score)}`
      )
    })
  } else {
    lines.push('- No strong concepts selected for the current context.')
  }

  const grouped = groupContextSources(composition.selected)
  const orderedSources = grouped.flatMap(([, sources]) => sources)
  grouped.forEach(([section, sources]) => {
    lines.push('', `## ${section}`, '')
    sources.forEach((source) => {
      const { memory } = source
      lines.push(
        `### ${memory.id}`,
        '',
        `- Type: ${memory.type}`,
        `- Updated: ${memory.updated_at}`,
        memory.tags.length ? `- Tags: ${memory.tags.join(', ')}` : '- Tags: none',
        `- Included because: ${source.reasons.join('; ')}`,
        '',
        truncateText(memory.content.trim(), 900),
        '',
        '---',
        ''
      )
    })
  })

  const content = lines.join('\n')
  return {
    content,
    tokenEstimate: Math.ceil(content.length / 4),
    memoryCount: composition.selected.length,
    activeMemoryCount,
    sources: orderedSources.map((source) => ({
      ...toConceptSample(source.memory),
      section: source.section,
      reasons: source.reasons,
    })),
    topConcepts: concepts.slice(0, 10).map((concept) => ({
      title: concept.title,
      occurrences: concept.occurrences,
      score: concept.score,
    })),
    generatedAt,
    exclusions: composition.exclusions.map(({ memory, reason }) => ({
      id: memory.id,
      type: memory.type,
      status: memory.status,
      updated_at: memory.updated_at,
      reason,
    })),
  }
}

function groupContextSources(
  sources: Array<{ memory: SearchResult; section: string; reasons: string[]; score: number }>
): Array<
  [string, Array<{ memory: SearchResult; section: string; reasons: string[]; score: number }>]
> {
  const order = [
    'Current Project Rules',
    'Active Decisions',
    'Durable Preferences',
    'Project Knowledge',
    'Known Pitfalls',
    'Open Tasks',
    'Reusable Patterns',
    'Client Context',
    'Recent Activity',
  ]
  const groups = new Map<
    string,
    Array<{ memory: SearchResult; section: string; reasons: string[]; score: number }>
  >()

  sources.forEach((source) => {
    groups.set(source.section, [...(groups.get(source.section) ?? []), source])
  })

  return [...groups.entries()].sort(
    (a, b) => order.indexOf(a[0]) - order.indexOf(b[0]) || a[0].localeCompare(b[0])
  )
}

function getContextIgnoredConcepts(query: string | undefined, ignoredConcepts: string[]): string[] {
  void query
  return [...new Set(ignoredConcepts)]
}

function buildConsolidatedMemoryContent(concept: string, memories: SearchResult[]): string {
  const typeCounts = countBy(memories, (memory) => memory.type)
  const dominantTypes = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([type, count]) => `${type} (${count})`)
    .join(', ')

  const lines = [
    `Consolidated memory for concept "${formatConceptLabel(concept)}".`,
    '',
    `This synthetic memory was generated from ${countLabel(memories.length, 'active project memory', 'active project memories')} so the LLM can read the concept as one compact signal instead of many repeated fragments.`,
    '',
    'Dominant distribution:',
    `- Types: ${dominantTypes || 'unknown'}`,
    '',
    'Representative evidence:',
  ]

  memories.slice(0, 10).forEach((memory) => {
    lines.push(
      `- ${memory.type} ${memory.id}: ${truncateText(memory.content.replace(/\s+/g, ' ').trim(), 220)}`
    )
  })

  lines.push(
    '',
    'Curation note: review this memory after creation. It is a compact heuristic summary, not an LLM-authored semantic merge.'
  )

  return lines.join('\n')
}

function getConceptSearchTerm(value: string): string {
  return value.replace(/[.+#-]+/g, ' ').trim() || value
}

function getMemoryStrength(memory: SearchResult): number {
  const statusWeights: Record<string, number> = {
    active: 1,
    archived: 0.42,
    deleted: 0,
    proposed: 0.7,
  }

  return statusWeights[memory.status] ?? 0.8
}

function getMinimumConceptOccurrences(memoryCount: number): number {
  if (memoryCount < 8) return 1
  if (memoryCount < 100) return 3
  return Math.max(5, Math.min(40, Math.ceil(memoryCount * 0.018)))
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|||${b}` : `${b}|||${a}`
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

function truncateText(value: string, limit: number): string {
  if (value.length <= limit) return value
  return `${value.slice(0, limit).trim()}...`
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}
