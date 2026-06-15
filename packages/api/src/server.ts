import { createReadStream, existsSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
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
  createMemory,
  deferRecommendation,
  deleteMemory,
  generateRecommendations,
  getProjectMemoryPath,
  indexAllMemories,
  preferContradictionRecommendation,
  recordMemoryDebugEvent,
  readMemory,
  rejectRecommendation,
  rejectMemory,
  seedIntelligenceEvaluationDataset,
  restoreMemory,
  updateMemory,
  type CreateMemoryInput,
  type Memory,
  type SearchResult,
  type UpdateMemoryInput,
} from 'pamh-core'

export interface LocalApiServerOptions {
  cwd?: string
  host?: string
  port?: number
  staticDir?: string
}

export interface LocalApiServer {
  server: Server
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

interface VisibleMemoryView {
  memories: SearchResult[]
  excludedNoise: number
  rawTotal: number
}

interface NoiseConfig {
  ignoredConcepts: string[]
}

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 3939
const SERVER_DIST_DIR = dirname(fileURLToPath(import.meta.url))

function resolveDefaultStaticDir(): string {
  const candidates = [
    join(SERVER_DIST_DIR, '../../ui/dist/public'),
    join(SERVER_DIST_DIR, '../../pamh-ui/dist/public'),
    join(SERVER_DIST_DIR, '../node_modules/pamh-ui/dist/public'),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  return candidates[0]
}

const DEFAULT_STATIC_DIR = resolveDefaultStaticDir()
const NOISE_CONFIG_FILE = 'ui-noise.json'
const PROJECT_SCOPE = 'project'
const MAX_GENERAL_CONTEXT_SESSIONS = 0
const MAX_FOCUSED_CONTEXT_SESSIONS = 4
const GENERAL_CONTEXT_IGNORED_CONCEPTS = ['migration', 'phase-2', 'pnpm', 'scope', 'project-only']

const CONTEXT_TYPE_WEIGHTS: Record<string, number> = {
  rule: 1000,
  decision: 930,
  preference: 900,
  knowledge: 830,
  mistake: 730,
  task: 700,
  pattern: 660,
  client: 600,
  session: 160,
}

const CONTEXT_SECTION_TITLES: Record<string, string> = {
  rule: 'Current Project Rules',
  decision: 'Active Decisions',
  preference: 'Durable Preferences',
  knowledge: 'Project Knowledge',
  mistake: 'Known Pitfalls',
  task: 'Open Tasks',
  pattern: 'Reusable Patterns',
  client: 'Client Context',
  session: 'Recent Activity',
}

export function createLocalApiServer(options: LocalApiServerOptions = {}): Server {
  const cwd = options.cwd ?? process.cwd()
  const staticDir = options.staticDir ?? DEFAULT_STATIC_DIR

  return createServer(async (request, response) => {
    try {
      await handleRequest(request, response, cwd, staticDir)
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
  const server = createLocalApiServer(options)

  await new Promise<void>((resolveServer, rejectServer) => {
    server.once('error', rejectServer)
    server.listen(port, host, () => {
      server.removeListener('error', rejectServer)
      resolveServer()
    })
  })

  return {
    server,
    url: `http://${host}:${port}`,
    close: () => new Promise((resolveClose) => server.close(() => resolveClose())),
  }
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  cwd: string,
  staticDir: string
): Promise<void> {
  const method = request.method ?? 'GET'
  const url = new URL(request.url ?? '/', 'http://localhost')

  if (url.pathname.startsWith('/api/')) {
    await handleApiRequest(request, response, method, url, cwd)
    return
  }

  await serveStatic(response, staticDir, url.pathname)
}

async function handleApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  method: string,
  url: URL,
  cwd: string
): Promise<void> {
  if (method === 'GET' && url.pathname === '/api/health') {
    sendJson(response, 200, { ok: true })
    return
  }

  if (method === 'POST' && url.pathname === '/api/shutdown') {
    sendJson(response, 200, { ok: true })
    setImmediate(() => process.exit(0))
    return
  }

  const storeParam = url.searchParams.get('store')
  if (storeParam && storeParam !== 'project') {
    sendJson(response, 400, { error: 'Unsupported store parameter. PAMH is project-only.' })
    return
  }

  const basePath = getProjectMemoryPath(cwd)

  if (method === 'POST' && url.pathname === '/api/debug/reset') {
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
    const composition = composeContextSources(view.memories, query, maxMemories)
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
    const body = (await readJson(request)) as CreateMemoryInput
    const memory = await createMemory(basePath, body)
    sendJson(response, 201, { memory })
    return
  }

  const memoryMatch = url.pathname.match(
    /^\/api\/memories\/([^/]+)(?:\/(archive|restore|approve|reject))?$/
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
      const body = (await readJson(request)) as UpdateMemoryInput
      const memory = await updateMemory(basePath, id, body)
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

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'))
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
  const normalizedQuery = normalizeConcept(query) ?? query.toLowerCase().trim()
  if (!normalizedQuery) return true
  const terms = normalizedQuery.split(/\s+/).filter(Boolean)
  const blob = [
    memory.id,
    memory.type,
    memory.scope,
    memory.status,
    memory.source,
    memory.content,
    ...memory.tags,
  ]
    .join(' ')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')

  return terms.every((term) => blob.includes(term))
}

function isNoiseMemory(memory: SearchResult): boolean {
  return (
    memory.status === 'noise' ||
    memory.tags.includes('noise') ||
    memory.tags.includes('ignored') ||
    memory.tags.includes('pamh-noise') ||
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
    tags.includes('pamh-noise')

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

function parseBoolean(value: string | null): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').toLowerCase())
}

const IMPORTANT_SHORT_CONCEPTS = new Set(['ai', 'api', 'db', 'ui', 'ux'])
const STOP_CONCEPTS = new Set([
  'about',
  'active',
  'after',
  'also',
  'and',
  'are',
  'as',
  'avec',
  'browser',
  'but',
  'can',
  'ces',
  'cet',
  'cette',
  'content',
  'created',
  'dans',
  'deleted',
  'des',
  'donc',
  'each',
  'elle',
  'elles',
  'eux',
  'from',
  'global',
  'has',
  'have',
  'indexed',
  'into',
  'is',
  'its',
  'local',
  'longer',
  'manual',
  'memory',
  'memories',
  'not',
  'now',
  'of',
  'only',
  'on',
  'or',
  'par',
  'pas',
  'pamh',
  'pour',
  'project',
  'proposed',
  'quand',
  'que',
  'qui',
  'session',
  'should',
  'source',
  'status',
  'store',
  'sur',
  'the',
  'this',
  'through',
  'to',
  'une',
  'updated',
  'use',
  'user',
  'with',
])

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

    memory.tags.forEach((tag) => addConceptCandidate(candidates, tag, 'tag', 4.75, ignored))
    extractKeywords(memory.content).forEach((keyword) =>
      addConceptCandidate(candidates, keyword, 'keyword', 1, ignored)
    )

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
        memory.tags
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

function addConceptCandidate(
  candidates: Map<string, { category: 'tag' | 'keyword'; title: string; weight: number }>,
  value: string,
  category: 'tag' | 'keyword',
  weight: number,
  ignoredConcepts: Set<string>
): void {
  const normalized = normalizeConcept(value)
  if (!normalized) return
  if (ignoredConcepts.has(normalized)) return

  const current = candidates.get(normalized)
  candidates.set(normalized, {
    category: current?.category === 'tag' ? 'tag' : category,
    title: formatConceptLabel(normalized),
    weight: (current?.weight ?? 0) + weight,
  })
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

function extractKeywords(content: string): string[] {
  const counts = new Map<string, number>()
  const words = content.match(/[\p{L}\p{N}][\p{L}\p{N}.+#-]{1,}/gu) ?? []

  words.forEach((word) => {
    const normalized = normalizeConcept(word)
    if (!normalized) return
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
  })

  return [...counts.entries()]
    .filter(([keyword, count]) => count > 1 || IMPORTANT_SHORT_CONCEPTS.has(keyword))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 24)
    .map(([keyword]) => keyword)
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
  sources: ContextSource[]
  topConcepts: Array<{ title: string; occurrences: number; score: number }>
  generatedAt: string
  exclusions: ContextExclusion[]
} {
  const generatedAt = new Date().toISOString()
  const composition = composeContextSources(memories, query, maxMemories)
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
    'Policy: active durable memories first; noise, deleted, archived, proposed, duplicate implementation summaries, and lower-ranked overflow are excluded.',
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
      reason,
    })),
  }
}

function composeContextSources(
  memories: SearchResult[],
  query: string | undefined,
  maxMemories: number
): {
  selected: Array<{ memory: SearchResult; section: string; reasons: string[]; score: number }>
  exclusions: Array<{ memory: SearchResult; reason: string }>
} {
  const exclusions: Array<{ memory: SearchResult; reason: string }> = []
  const focused = Boolean(query?.trim())
  const maxSessions = focused ? MAX_FOCUSED_CONTEXT_SESSIONS : MAX_GENERAL_CONTEXT_SESSIONS
  const activeCandidates = memories.filter((memory) => {
    if (memory.status !== 'active') {
      exclusions.push({ memory, reason: `not active (${memory.status})` })
      return false
    }
    if (isNoiseMemory(memory)) {
      exclusions.push({ memory, reason: 'marked as noise' })
      return false
    }
    if (query && !memoryMatchesQuery(memory, query)) {
      exclusions.push({ memory, reason: 'does not match focused query' })
      return false
    }
    return true
  })

  const ranked = activeCandidates
    .map((memory) => ({
      memory,
      section: getContextSection(memory),
      reasons: getContextReasons(memory, focused),
      score: getContextScore(memory, focused),
    }))
    .sort((a, b) => b.score - a.score || b.memory.updated_at.localeCompare(a.memory.updated_at))

  const durable = ranked.filter((item) => item.memory.type !== 'session')
  const sessions = ranked.filter((item) => item.memory.type === 'session')
  const durableLimit = Math.max(0, maxMemories - Math.min(maxSessions, sessions.length))
  const selected = durable.slice(0, durableLimit)
  const selectedIds = new Set(selected.map((item) => item.memory.id))

  durable.slice(durableLimit).forEach((item) => {
    exclusions.push({ memory: item.memory, reason: 'lower-ranked durable memory overflow' })
  })

  const sessionCandidates = sessions.filter((item) => {
    if (
      !isDuplicateImplementationSummary(
        item.memory,
        selected.map((source) => source.memory)
      )
    ) {
      return true
    }
    exclusions.push({
      memory: item.memory,
      reason: 'duplicate implementation summary covered by a durable memory',
    })
    return false
  })

  const selectedSessions = sessionCandidates.slice(0, Math.max(0, maxMemories - selected.length))
  selectedSessions.slice(0, maxSessions).forEach((item) => {
    selected.push(item)
    selectedIds.add(item.memory.id)
  })

  sessionCandidates.forEach((item) => {
    if (!selectedIds.has(item.memory.id)) {
      exclusions.push({ memory: item.memory, reason: 'recent activity overflow' })
    }
  })

  return { selected, exclusions }
}

function getContextScore(memory: SearchResult, focused: boolean): number {
  const typeScore = CONTEXT_TYPE_WEIGHTS[memory.type] ?? 500
  const recencyScore = getRecencyScore(memory.updated_at)
  const tagScore = Math.min(memory.tags.length, 6) * 4
  const generalMetaPenalty =
    !focused && memory.tags.some((tag) => GENERAL_CONTEXT_IGNORED_CONCEPTS.includes(tag)) ? 80 : 0
  const implementationPenalty = !focused && isImplementationSummary(memory) ? 120 : 0

  return typeScore + recencyScore + tagScore - generalMetaPenalty - implementationPenalty
}

function getRecencyScore(updatedAt: string): number {
  const timestamp = Date.parse(updatedAt)
  if (!Number.isFinite(timestamp)) return 0
  const ageDays = Math.max(0, (Date.now() - timestamp) / 86_400_000)
  return Math.max(0, 70 - ageDays)
}

function getContextSection(memory: SearchResult): string {
  return CONTEXT_SECTION_TITLES[memory.type] ?? 'Project Knowledge'
}

function getContextReasons(memory: SearchResult, focused: boolean): string[] {
  const reasons = [`active ${memory.type}`]
  if (['rule', 'decision', 'preference', 'knowledge'].includes(memory.type)) {
    reasons.push('durable context')
  }
  if (memory.type === 'session') {
    reasons.push('limited recent activity')
  }
  if (focused) {
    reasons.push('matches focused query')
  }
  return reasons
}

function isDuplicateImplementationSummary(memory: SearchResult, selected: SearchResult[]): boolean {
  if (!isImplementationSummary(memory)) return false

  return selected.some((candidate) => {
    if (candidate.type === 'session') return false
    return countSharedTags(memory.tags, candidate.tags) >= 2
  })
}

function isImplementationSummary(memory: SearchResult): boolean {
  return (
    memory.type === 'session' &&
    /^(added|built|changed|completed|created|fixed|implemented|removed|updated|verified)\b/i.test(
      memory.content.trim()
    )
  )
}

function countSharedTags(left: string[], right: string[]): number {
  const rightTags = new Set(right)
  return left.filter((tag) => rightTags.has(tag)).length
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
  if (query?.trim()) {
    return ignoredConcepts
  }

  return [...new Set([...ignoredConcepts, ...GENERAL_CONTEXT_IGNORED_CONCEPTS])]
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

function normalizeConcept(value: string): string | null {
  const normalized = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/three\.?js/g, 'threejs')
    .replace(/[^a-z0-9+#.\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.#-]+|[.#-]+$/g, '')
  const canonical = canonicalizeConcept(normalized)

  if (!canonical || /^\d+$/.test(canonical)) return null
  if (canonical.length < 3 && !IMPORTANT_SHORT_CONCEPTS.has(canonical)) return null
  if (STOP_CONCEPTS.has(canonical)) return null
  return canonical
}

function canonicalizeConcept(value: string): string {
  return value
    .split(/(\s+|-)/)
    .map((part) => {
      if (/^\s+$|^-+$/.test(part)) return part
      return singularizeEnglishConcept(part)
    })
    .join('')
}

function singularizeEnglishConcept(value: string): string {
  const irregular: Record<string, string> = {
    analyses: 'analysis',
    children: 'child',
    criteria: 'criterion',
    data: 'data',
    indices: 'index',
    people: 'person',
  }
  if (irregular[value]) return irregular[value]
  if (IMPORTANT_SHORT_CONCEPTS.has(value)) return value
  if (/^(css|ss|status|threejs|webgl|kubernetes)$/.test(value)) return value
  if (value.length <= 3) return value
  if (value.endsWith('ies') && value.length > 4) return `${value.slice(0, -3)}y`
  if (/(ches|shes|xes|zes)$/.test(value) && value.length > 5) return value.slice(0, -2)
  if (value.endsWith('ses') && !value.endsWith('sses') && value.length > 5)
    return value.slice(0, -2)
  if (value.endsWith('s') && !/(ss|us|is)$/.test(value) && value.length > 4) {
    return value.slice(0, -1)
  }
  return value
}

function formatConceptLabel(value: string): string {
  const special: Record<string, string> = {
    ai: 'AI',
    api: 'API',
    db: 'DB',
    llm: 'LLM',
    mcp: 'MCP',
    sqlite: 'SQLite',
    threejs: 'Three.js',
    ui: 'UI',
    ux: 'UX',
    webgl: 'WebGL',
  }

  if (special[value]) return special[value]

  return value
    .split(/([\s-]+)/)
    .map((part) => {
      if (/^[\s-]+$/.test(part)) return part
      return special[part] ?? part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join('')
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
  if (memoryCount < 20) return 1
  if (memoryCount < 100) return 2
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
