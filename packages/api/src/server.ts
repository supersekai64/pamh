import { createReadStream, existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
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
  getGlobalMemoryPath,
  getProjectMemoryPath,
  indexAllMemories,
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
import { getUiDistPath } from 'pamh-ui'

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

type Store = 'global' | 'project'

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
  updated_at: string
  tags: string[]
  content: string
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
const NOISE_CONFIG_FILE = 'ui-noise.json'

export function createLocalApiServer(options: LocalApiServerOptions = {}): Server {
  const cwd = options.cwd ?? process.cwd()
  const staticDir = options.staticDir ?? getUiDistPath()

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

  await new Promise<void>((resolveServer) => server.listen(port, host, resolveServer))

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

  const store = parseStore(url)
  const basePath = resolveBasePath(cwd, store)

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
    const includeNoise = parseBoolean(url.searchParams.get('includeNoise'))
    const rawMemories = await getIndexedMemories(basePath)
    const noiseConfig = await readNoiseConfig(basePath)
    const view = getVisibleMemories(rawMemories, { includeNoise })
    const conceptGraph = buildConceptGraph(view.memories, limit, noiseConfig.ignoredConcepts)
    await recordMemoryDebugEvent(basePath, {
      action: 'memory.analyze.concepts',
      outcome: 'ok',
      tool: 'ui-api',
      details: {
        limit,
        includeNoise,
        rawTotal: view.rawTotal,
        excludedNoise: view.excludedNoise,
        totalMemories: conceptGraph.totalMemories,
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
      calculation:
        'Concept strength combines tag weight, keyword recurrence, status weight, frequency, and co-occurrence across active project memories. Noise memories are excluded by default.',
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
    const contextMemories = filterMemories(view.memories, {
      query,
      status: 'active',
    }).slice(0, maxMemories)
    const concepts = buildConceptGraph(view.memories, 12, noiseConfig.ignoredConcepts).concepts
    const preview = buildContextPreview(contextMemories, concepts, query)

    await recordMemoryDebugEvent(basePath, {
      action: 'context.preview',
      outcome: 'ok',
      tool: 'ui-api',
      details: {
        query,
        includeNoise,
        maxMemories,
        memory_count: contextMemories.length,
        token_estimate: preview.tokenEstimate,
        source_ids: contextMemories.map((memory) => memory.id),
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
      stats,
      rawStats: computeStats(rawMemories),
      rawTotalMemories: view.rawTotal,
      excludedNoiseMemories: view.excludedNoise,
    })
    return
  }

  sendJson(response, 404, { error: 'Not found' })
}

function parseStore(url: URL): Store {
  return url.searchParams.get('store') === 'global' ? 'global' : 'project'
}

function resolveBasePath(cwd: string, store: Store): string {
  return store === 'global' ? getGlobalMemoryPath() : getProjectMemoryPath(cwd)
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
  return memories
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
  concepts: ConceptNode[],
  query?: string
): {
  content: string
  tokenEstimate: number
  memoryCount: number
  sources: ConceptSample[]
  topConcepts: Array<{ title: string; occurrences: number; score: number }>
  generatedAt: string
} {
  const generatedAt = new Date().toISOString()
  const lines = [
    '# Project Memory Context Preview',
    '',
    `Generated at: ${generatedAt}`,
    query ? `Focused concept/query: ${query}` : 'Focused concept/query: general project memory',
    '',
    '## Strong Concepts',
    '',
  ]

  concepts.slice(0, 10).forEach((concept) => {
    lines.push(
      `- ${concept.title}: ${countLabel(concept.occurrences, 'memory', 'memories')}, strength ${Math.round(concept.score)}`
    )
  })

  lines.push('', '## Representative Memories', '')
  memories.forEach((memory) => {
    lines.push(
      `### ${memory.id}`,
      '',
      `- Type: ${memory.type}`,
      `- Scope: ${memory.scope}`,
      `- Updated: ${memory.updated_at}`,
      memory.tags.length ? `- Tags: ${memory.tags.join(', ')}` : '- Tags: none',
      '',
      truncateText(memory.content.trim(), 900),
      '',
      '---',
      ''
    )
  })

  const content = lines.join('\n')
  return {
    content,
    tokenEstimate: Math.ceil(content.length / 4),
    memoryCount: memories.length,
    sources: memories.map(toConceptSample),
    topConcepts: concepts.slice(0, 10).map((concept) => ({
      title: concept.title,
      occurrences: concept.occurrences,
      score: concept.score,
    })),
    generatedAt,
  }
}

function buildConsolidatedMemoryContent(concept: string, memories: SearchResult[]): string {
  const typeCounts = countBy(memories, (memory) => memory.type)
  const scopeCounts = countBy(memories, (memory) => memory.scope)
  const dominantTypes = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([type, count]) => `${type} (${count})`)
    .join(', ')
  const dominantScopes = Object.entries(scopeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([scope, count]) => `${scope} (${count})`)
    .join(', ')

  const lines = [
    `Consolidated memory for concept "${formatConceptLabel(concept)}".`,
    '',
    `This synthetic memory was generated from ${countLabel(memories.length, 'active project memory', 'active project memories')} so the LLM can read the concept as one compact signal instead of many repeated fragments.`,
    '',
    'Dominant distribution:',
    `- Types: ${dominantTypes || 'unknown'}`,
    `- Scopes: ${dominantScopes || 'unknown'}`,
    '',
    'Representative evidence:',
  ]

  memories.slice(0, 10).forEach((memory) => {
    lines.push(
      `- ${memory.type}/${memory.scope} ${memory.id}: ${truncateText(memory.content.replace(/\s+/g, ' ').trim(), 220)}`
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
