import './styles.css'

import {
  Archive,
  Ban,
  Check,
  Circle,
  FileText,
  ListFilter,
  Merge,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import { ConsoleHeader } from '@/components/console-header'
import { Sidebar } from '@/components/sidebar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { ConceptsPage as ConceptsRoutePage } from '@/pages/concepts-page'
import { ContextPage } from '@/pages/context-page'
import { DashboardPage } from '@/pages/dashboard-page'
import { EvidencePage } from '@/pages/evidence-page'
import { GovernancePage as GovernanceRoutePage } from '@/pages/governance-page'
import { KnowledgePage as KnowledgeRoutePage } from '@/pages/knowledge-page'

type Store = 'project'
type WorkspaceView = 'dashboard' | 'map' | 'evidence' | 'context' | 'governance' | 'knowledge'
export type MapLayout = '2d' | '3d'
export type ConceptDepth = 'top' | 'expanded'
type MemoryAction =
  | 'archive'
  | 'restore'
  | 'delete'
  | 'physical-delete'
  | 'approve'
  | 'reject'
  | 'mark-noise'

const PROJECT_STORE: Store = 'project'

const EMPTY_STATS: Stats = {
  total: 0,
  active: 0,
  deleted: 0,
  archived: 0,
  proposed: 0,
  noise: 0,
  byType: {},
  byScope: {},
  tags: {},
}

const EMPTY_STATS_RESPONSE: StatsResponse = {
  project: {
    name: '',
    path: '',
    memoryPath: '',
  },
  stats: EMPTY_STATS,
  rawStats: EMPTY_STATS,
  rawTotalMemories: 0,
  excludedNoiseMemories: 0,
}

const EMPTY_CONCEPT_GRAPH: ApiConceptGraph = {
  totalMemories: 0,
  rawTotalMemories: 0,
  excludedNoiseMemories: 0,
  ignoredConcepts: [],
  calculation: '',
  concepts: [],
  edges: [],
  exclusions: [],
}

const EMPTY_CONTEXT_PREVIEW: ContextPreview = {
  content: '',
  tokenEstimate: 0,
  memoryCount: 0,
  sources: [],
  topConcepts: [],
  generatedAt: '',
  exclusions: [],
}

const EMPTY_RECOMMENDATIONS: RecommendationsResponse = {
  recommendations: [],
  metrics: {
    total_memories: 0,
    active_memories: 0,
    proposed_recommendations: 0,
    source_preservation_rate: 1,
    top_concept_count: 0,
  },
}

const EMPTY_KNOWLEDGE_GRAPH: KnowledgeGraphResponse = {
  entities: [],
  relations: [],
  metrics: {
    entity_count: 0,
    relation_count: 0,
    evidence_coverage: 0,
  },
}

export interface MemoryMetadata {
  id: string
  type: string
  scope: string
  status: string
  created_at: string
  updated_at: string
  tags: string[]
  source: string
  salience?: number
}

export interface Memory {
  metadata: MemoryMetadata
  content: string
}

export interface SearchResult extends MemoryMetadata {
  content: string
  file_path: string
}

interface Stats {
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

export interface StatsResponse {
  project: {
    name: string
    path: string
    memoryPath: string
  }
  stats: Stats
  rawStats: Stats
  rawTotalMemories: number
  excludedNoiseMemories: number
}

interface MemoriesResponse {
  memories: Array<Memory | SearchResult>
  totalMatching: number
  rawTotalMemories: number
  excludedNoiseMemories: number
}

interface ApiConceptSample {
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

interface ContextSource extends ApiConceptSample {
  section: string
  reasons: string[]
}

interface ContextExclusion {
  id: string
  type: string
  reason: string
}

export interface ApiConceptNode {
  id: string
  title: string
  category: 'tag' | 'keyword'
  rank: number
  score: number
  occurrences: number
  searchTerm: string
  evidence: string[]
  samples: ApiConceptSample[]
  typeCounts: Record<string, number>
  scopeCounts: Record<string, number>
  sourceCounts: Record<string, number>
  lastUpdated: string | null
}

interface ApiConceptEdge {
  source: string
  target: string
  weight: number
}

export interface ApiConceptGraph {
  totalMemories: number
  rawTotalMemories: number
  excludedNoiseMemories: number
  ignoredConcepts: string[]
  calculation: string
  concepts: ApiConceptNode[]
  edges: ApiConceptEdge[]
  exclusions: ContextExclusion[]
}

export interface ContextPreview {
  content: string
  tokenEstimate: number
  memoryCount: number
  sources: ContextSource[]
  topConcepts: Array<{ title: string; occurrences: number; score: number }>
  generatedAt: string
  exclusions: ContextExclusion[]
}

interface MemoryRecommendation {
  id: string
  type: string
  status: string
  title: string
  explanation: string
  evidence_ids: string[]
  action?: string
  payload?: {
    source_ids?: string[]
    target_id?: string
    replacement_id?: string
    left_id?: string
    right_id?: string
    concept?: string
    count?: number
    compression_ratio?: number
  }
}

export interface RecommendationsResponse {
  recommendations: MemoryRecommendation[]
  metrics: {
    total_memories: number
    active_memories: number
    proposed_recommendations: number
    source_preservation_rate: number
    top_concept_count: number
  }
}

interface KnowledgeEntity {
  id: string
  label: string
  type: string
  evidence_ids: string[]
}

interface KnowledgeRelation {
  id: string
  source: string
  target: string
  type: string
  evidence_ids: string[]
  explanation: string
}

export interface KnowledgeGraphResponse {
  entities: KnowledgeEntity[]
  relations: KnowledgeRelation[]
  metrics: {
    entity_count: number
    relation_count: number
    evidence_coverage: number
  }
}

interface GraphDatum {
  id: string
  title: string
  category: 'tag' | 'keyword'
  color: number
  radius: number
  position: THREE.Vector3
  searchTerm: string
  score: number
  occurrences: number
  labelVisible: boolean
  detailHtml: string
}

interface GraphEdge {
  source: string
  target: string
  weight: number
}

interface ConceptGraph {
  nodes: GraphDatum[]
  edges: GraphEdge[]
  maxEdgeWeight: number
}

const memoryTypes = [
  'decision',
  'knowledge',
  'mistake',
  'rule',
  'preference',
  'session',
  'task',
  'client',
  'pattern',
]

const typeHints: Record<string, string> = {
  decision: 'A technical choice made for the project (library, pattern, schema, protocol).',
  knowledge: 'A reusable fact, constraint or gotcha about the codebase.',
  mistake: 'A lesson learned from an error or regression — used to avoid repeating it.',
  rule: 'A durable workflow requirement ("always …", "never …").',
  preference: 'A stylistic, UX, naming or architectural choice that should apply broadly.',
  session: 'A short summary of completed work.',
  task: 'Follow-up work identified but not done yet.',
  client: 'Memory scoped to a specific client / customer.',
  pattern: 'A recurring pattern observed in code or workflow.',
}

const conceptHints = {
  llmCandidates: 'Active memories that would be included in the LLM context window right now.',
  strongConcepts:
    'Tags and keywords that recur across the current LLM context. They are the backbone of the concepts map.',
  evidenceSet:
    'Memories matching the current search query and status filter — what you would inspect or edit.',
  excludedNoise:
    'Memories marked as Noise. Hidden from the LLM and the map, but still stored for audit.',
  focusedConcept:
    'A concept you clicked in the map. The Evidence and Context views become filtered to it.',
  consolidate:
    'Promote this concept into a distilled "knowledge" memory that summarizes its evidence.',
  markNoise:
    'Tell PAMH this concept (or memory) is irrelevant. It will be hidden from future LLM context.',
  contextPreview:
    'The exact block of text that would be sent to the LLM as project memory right now.',
  tokenEstimate: 'Approximate token count of the current context block (rough heuristic).',
  approve: 'Promote this proposed memory to Active so the LLM can use it.',
  reject: 'Discard this proposed memory. It will be soft-deleted.',
  archive: 'Remove from the LLM context but keep for history. Restorable.',
  restore: 'Bring this memory back to Active so the LLM can use it again.',
  softDelete: 'Mark as deleted. Hidden everywhere but still restorable.',
  physicalDelete: 'Permanently remove the file from disk. This cannot be undone.',
  save: 'Save your edits to the memory content, type and tags.',
  distillation:
    'Group of related memories that could be merged into a single, denser "knowledge" memory.',
  recommendation:
    'Assisted suggestion produced by PAMH based on your current store (merges, deletions, promotions).',
  showNoise: 'Toggle visibility of memories marked as noise across the whole console.',
  knowledgeGraph:
    'Typed relations (decision → component, person → owns → module, etc.) extracted across memories.',
  copyContext: 'Copy the LLM context block to the clipboard.',
}

function Hint({
  children,
  label,
  side = 'top',
}: {
  children: ReactNode
  label: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-xs text-left leading-5" side={side}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function App() {
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>(() => getInitialWorkspaceView())
  const [mapLayout, setMapLayout] = useState<MapLayout>('3d')
  const [conceptDepth, setConceptDepth] = useState<ConceptDepth>('top')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('active')
  const [focusedConcept, setFocusedConcept] = useState('')
  const [includeNoise, setIncludeNoise] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Memory | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [memories, setMemories] = useState<Array<Memory | SearchResult>>([])
  const [memoryTotal, setMemoryTotal] = useState(0)
  const [conceptGraph, setConceptGraph] = useState<ApiConceptGraph | null>(null)
  const [contextPreview, setContextPreview] = useState<ContextPreview | null>(null)
  const [statsResponse, setStatsResponse] = useState<StatsResponse | null>(null)
  const [recommendations, setRecommendations] = useState<RecommendationsResponse | null>(null)
  const [knowledgeGraph, setKnowledgeGraph] = useState<KnowledgeGraphResponse | null>(null)
  const [memoryDirectory, setMemoryDirectory] = useState<Map<string, Memory | SearchResult>>(
    () => new Map()
  )
  const [message, setMessage] = useState('')

  const conceptLimit = conceptDepth === 'top' ? 20 : 100
  const activeConcept = getActiveConcept(conceptGraph, focusedConcept)

  const loadStats = useCallback(async () => {
    const params = new URLSearchParams({
      store: PROJECT_STORE,
      includeNoise: String(includeNoise),
    })
    const response = await api<StatsResponse>(`/api/stats?${params.toString()}`)
    setStatsResponse(response)
  }, [includeNoise])

  const loadMemories = useCallback(async () => {
    const params = new URLSearchParams({
      store: PROJECT_STORE,
      includeNoise: String(includeNoise),
      limit: '120',
      status,
    })
    const effectiveQuery = focusedConcept || query
    if (effectiveQuery) params.set('query', effectiveQuery)
    const response = await api<MemoriesResponse>(`/api/memories?${params.toString()}`)
    setMemories(response.memories)
    setMemoryTotal(response.totalMatching)
  }, [focusedConcept, includeNoise, query, status])

  const loadConceptGraph = useCallback(async () => {
    const params = new URLSearchParams({
      store: PROJECT_STORE,
      includeNoise: String(includeNoise),
      limit: String(conceptLimit),
      maxMemories: '18',
    })
    const effectiveQuery = focusedConcept || query
    if (effectiveQuery) params.set('query', effectiveQuery)
    const response = await api<ApiConceptGraph>(`/api/concepts?${params.toString()}`)
    setConceptGraph(response)
  }, [conceptLimit, focusedConcept, includeNoise, query])

  const loadContextPreview = useCallback(async () => {
    const params = new URLSearchParams({
      store: PROJECT_STORE,
      includeNoise: String(includeNoise),
      maxMemories: '18',
    })
    const effectiveQuery = focusedConcept || query
    if (effectiveQuery) params.set('query', effectiveQuery)
    const response = await api<ContextPreview>(`/api/context-preview?${params.toString()}`)
    setContextPreview(response)
  }, [focusedConcept, includeNoise, query])

  const loadIntelligence = useCallback(async () => {
    const params = new URLSearchParams({ store: PROJECT_STORE })
    const directoryParams = new URLSearchParams({
      store: PROJECT_STORE,
      includeNoise: 'true',
      status: 'all',
      limit: '2000',
    })
    const [recommendationResponse, graphResponse, directoryResponse] = await Promise.all([
      api<RecommendationsResponse>(`/api/recommendations?${params.toString()}`),
      api<KnowledgeGraphResponse>(`/api/knowledge-graph?${params.toString()}`),
      api<MemoriesResponse>(`/api/memories?${directoryParams.toString()}`),
    ])
    setRecommendations(recommendationResponse)
    setKnowledgeGraph(graphResponse)
    setMemoryDirectory(
      new Map(directoryResponse.memories.map((memory) => [getMetadata(memory).id, memory]))
    )
  }, [])

  const refresh = useCallback(async () => {
    await Promise.all([
      loadStats(),
      loadMemories(),
      loadConceptGraph(),
      loadContextPreview(),
      loadIntelligence(),
    ])
  }, [loadConceptGraph, loadContextPreview, loadIntelligence, loadMemories, loadStats])

  const selectMemory = useCallback(async (id: string) => {
    setSelectedId(id)
    setIsCreating(false)
    const response = await api<{ memory: Memory }>(`/api/memories/${id}?store=${PROJECT_STORE}`)
    setSelected(response.memory)
  }, [])

  const closeMemoryModal = useCallback(() => {
    setSelected(null)
    setSelectedId(null)
    setIsCreating(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!selectedId) return
    void selectMemory(selectedId)
  }, [selectMemory, selectedId])

  useEffect(() => {
    const onLocationChange = () => {
      const nextView = getInitialWorkspaceView()
      setWorkspaceView(nextView)
    }

    window.addEventListener('hashchange', onLocationChange)
    window.addEventListener('popstate', onLocationChange)
    return () => {
      window.removeEventListener('hashchange', onLocationChange)
      window.removeEventListener('popstate', onLocationChange)
    }
  }, [])

  const clearFocus = () => {
    setFocusedConcept('')
    setQuery('')
    setStatus('active')
    setSelected(null)
    setSelectedId(null)
    setIsCreating(false)
    setMessage('')
  }

  const clearConceptFocus = () => {
    setFocusedConcept('')
    setQuery('')
    setMessage('')
  }

  const clearLoadedProjectState = () => {
    setSelected(null)
    setSelectedId(null)
    setIsCreating(false)
    setFocusedConcept('')
    setQuery('')
    setStatus('active')
    setMemories([])
    setMemoryTotal(0)
    setConceptGraph(EMPTY_CONCEPT_GRAPH)
    setContextPreview(EMPTY_CONTEXT_PREVIEW)
    setStatsResponse(EMPTY_STATS_RESPONSE)
    setRecommendations(EMPTY_RECOMMENDATIONS)
    setKnowledgeGraph(EMPTY_KNOWLEDGE_GRAPH)
    setMemoryDirectory(new Map())
  }

  const changeWorkspaceView = (view: WorkspaceView) => {
    if (view !== workspaceView) {
      clearConceptFocus()
    }
    setWorkspaceView(view)
    if (window.location.hash !== `#/${view}`) {
      window.history.pushState(null, '', `#/${view}`)
    }
  }

  const openStatusFilter = (nextStatus: string) => {
    setFocusedConcept('')
    setQuery('')
    setStatus(nextStatus)
    setSelected(null)
    setSelectedId(null)
    setIsCreating(false)
    setMessage('')
    setWorkspaceView('evidence')
    if (window.location.hash !== '#/evidence') {
      window.history.pushState(null, '', '#/evidence')
    }
  }

  const focusConcept = (concept: string) => {
    setFocusedConcept(concept)
    setQuery('')
    setStatus('active')
    setSelected(null)
    setSelectedId(null)
    setIsCreating(false)
    setWorkspaceView('evidence')
    setMessage('')
  }

  async function createFromForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const content = String(data.get('content') ?? '').trim()
    if (!content) return

    const response = await api<{ memory: Memory }>(`/api/memories?store=${PROJECT_STORE}`, {
      method: 'POST',
      body: JSON.stringify({
        type: data.get('type'),
        scope: PROJECT_STORE,
        tags: parseTags(String(data.get('tags') ?? '')),
        content,
        source: 'ui',
      }),
    })
    setMessage(`Created ${response.memory.metadata.id}`)
    setSelected(response.memory)
    setSelectedId(response.memory.metadata.id)
    setIsCreating(false)
    form.reset()
    await refresh()
  }

  async function updateFromForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return

    const data = new FormData(event.currentTarget)
    const response = await api<{ memory: Memory }>(
      `/api/memories/${selected.metadata.id}?store=${PROJECT_STORE}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          type: data.get('type'),
          scope: PROJECT_STORE,
          tags: parseTags(String(data.get('tags') ?? '')),
          content: String(data.get('content') ?? ''),
        }),
      }
    )
    setSelected(response.memory)
    setMessage(`Updated ${response.memory.metadata.id}`)
    await refresh()
  }

  async function runAction(action: MemoryAction) {
    if (!selected) return

    const id = selected.metadata.id
    if (action === 'mark-noise') {
      const tags = Array.from(new Set([...selected.metadata.tags, 'pamh-noise']))
      const response = await api<{ memory: Memory }>(`/api/memories/${id}?store=${PROJECT_STORE}`, {
        method: 'PATCH',
        body: JSON.stringify({
          type: selected.metadata.type,
          scope: PROJECT_STORE,
          status: 'noise',
          tags,
          content: selected.content,
        }),
      })
      setSelected(response.memory)
      setMessage(`Marked as noise ${id}`)
      await refresh()
      return
    }

    if (action === 'delete' || action === 'physical-delete') {
      await api(
        `/api/memories/${id}?store=${PROJECT_STORE}&physical=${action === 'physical-delete'}`,
        {
          method: 'DELETE',
        }
      )
      setMessage(action === 'physical-delete' ? `Physically deleted ${id}` : `Deleted ${id}`)
      setSelected(null)
      setSelectedId(null)
    } else {
      const response = await api<{ memory?: Memory }>(
        `/api/memories/${id}/${action}?store=${PROJECT_STORE}`,
        {
          method: 'POST',
        }
      )
      setMessage(`${capitalize(action)}d ${id}`)
      if (response.memory) {
        setSelected(response.memory)
      }
      if (action === 'approve' || action === 'reject') {
        setSelected(null)
        setSelectedId(null)
      }
    }

    await refresh()
  }

  async function ignoreConcept(concept: string) {
    await api(`/api/concepts/${encodeURIComponent(concept)}/ignore?store=${PROJECT_STORE}`, {
      method: 'POST',
    })
    setMessage(`Ignored concept: ${concept}`)
    clearFocus()
    await refresh()
  }

  async function consolidateConcept(concept: string) {
    const response = await api<{ memory: Memory }>(
      `/api/concepts/${encodeURIComponent(concept)}/consolidate?store=${PROJECT_STORE}`,
      { method: 'POST' }
    )
    clearConceptFocus()
    setSelectedId(response.memory.metadata.id)
    setWorkspaceView('evidence')
    setMessage(`Created consolidated memory ${response.memory.metadata.id}`)
    await refresh()
  }

  async function handleRecommendation(id: string, action: 'apply' | 'reject' | 'defer') {
    const response = await api<{ memory?: Memory | null }>(
      `/api/recommendations/${id}/${action}?store=${PROJECT_STORE}`,
      { method: 'POST' }
    )
    const labels = { apply: 'Applied', reject: 'Rejected', defer: 'Deferred' }
    if (action === 'apply' && response.memory) {
      setSelected(response.memory)
      setSelectedId(response.memory.metadata.id)
      setStatus(response.memory.metadata.status)
      setWorkspaceView('evidence')
      setMessage(
        response.memory.metadata.status === 'proposed'
          ? `Created proposed memory ${response.memory.metadata.id}. Approve it to include it in the LLM context.`
          : `Applied recommendation ${id}`
      )
    } else {
      setMessage(`${labels[action]} recommendation ${id}`)
    }
    await refresh()
  }

  async function preferContradiction(id: string, preferredId: string) {
    await api(`/api/recommendations/${id}/prefer?store=${PROJECT_STORE}`, {
      method: 'POST',
      body: JSON.stringify({ preferredId }),
    })
    setMessage(`Resolved contradiction by keeping ${preferredId}`)
    await refresh()
  }

  async function resetProjectMemory() {
    const confirmed = window.confirm(
      'DEBUG: This will permanently delete the entire .ai-memory directory for the current project. Continue?'
    )
    if (!confirmed) return
    const response = await api<{ ok: boolean; basePath: string; removed: boolean }>(
      `/api/debug/reset?store=${PROJECT_STORE}`,
      {
        method: 'POST',
        body: JSON.stringify({ confirm: 'RESET' }),
      }
    )
    clearLoadedProjectState()
    setMessage(
      response.removed
        ? `Project memory reset (${response.basePath}).`
        : `Nothing to reset (${response.basePath} did not exist).`
    )
    await refresh()
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground">
        <div className="grid min-h-screen w-full grid-cols-[16rem_minmax(0,1fr)] gap-3 p-3 max-lg:grid-cols-1">
          <Sidebar
            selectedStatus={status}
            stats={statsResponse?.stats ?? null}
            view={workspaceView}
            onReset={resetProjectMemory}
            onStatusSelect={openStatusFilter}
            onViewChange={changeWorkspaceView}
          />

          <main className="min-w-0 rounded-md bg-card p-4 shadow-sm">
            <ConsoleHeader
              onCreateMemory={() => {
                setSelected(null)
                setSelectedId(null)
                setIsCreating(true)
                changeWorkspaceView('evidence')
              }}
            />

            {message ? (
              <StatusMessage onClose={() => setMessage('')}>{message}</StatusMessage>
            ) : null}

            <FocusBar
              concept={focusedConcept}
              activeConcept={activeConcept}
              onClear={clearFocus}
              onConsolidate={consolidateConcept}
              onIgnore={ignoreConcept}
            />

            <PageRouter
              activeConcept={activeConcept}
              conceptDepth={conceptDepth}
              conceptGraph={conceptGraph}
              contextPreview={contextPreview}
              directory={memoryDirectory}
              focusedConcept={focusedConcept}
              includeNoise={includeNoise}
              knowledgeGraph={knowledgeGraph}
              mapLayout={mapLayout}
              memories={memories}
              recommendations={recommendations}
              selectedId={selectedId}
              statsResponse={statsResponse}
              status={status}
              totalMatching={memoryTotal}
              view={workspaceView}
              query={focusedConcept || query}
              onClearFocus={clearFocus}
              onConceptDepthChange={setConceptDepth}
              onConceptSelect={focusConcept}
              onEvidenceOpen={(id) => {
                void selectMemory(id)
              }}
              onGoToPage={changeWorkspaceView}
              onIgnoreConcept={ignoreConcept}
              onIncludeNoiseChange={setIncludeNoise}
              onMapLayoutChange={setMapLayout}
              onPreferContradiction={preferContradiction}
              onQueryChange={(value) => {
                setFocusedConcept('')
                setQuery(value)
              }}
              onRecommendationAction={handleRecommendation}
              onSelectMemory={selectMemory}
              onStatusChange={setStatus}
              onConsolidateConcept={consolidateConcept}
            />

            <MemoryModal
              eyebrow={selected ? selected.metadata.id : isCreating ? 'Create' : 'Evidence'}
              open={Boolean(selected) || isCreating}
              title={
                selected
                  ? selected.metadata.status === 'proposed'
                    ? 'Review memory'
                    : 'Memory inspector'
                  : 'New memory'
              }
              onClose={closeMemoryModal}
            >
              {selected ? (
                <Editor
                  key={selected.metadata.id}
                  memory={selected}
                  onAction={runAction}
                  onUpdate={updateFromForm}
                />
              ) : isCreating ? (
                <CreateForm onCreate={createFromForm} />
              ) : null}
            </MemoryModal>
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}

function PageRouter({
  activeConcept,
  conceptDepth,
  conceptGraph,
  contextPreview,
  directory,
  focusedConcept,
  includeNoise,
  knowledgeGraph,
  mapLayout,
  memories,
  onClearFocus,
  onConceptDepthChange,
  onConceptSelect,
  onConsolidateConcept,
  onEvidenceOpen,
  onGoToPage,
  onIgnoreConcept,
  onIncludeNoiseChange,
  onMapLayoutChange,
  onPreferContradiction,
  onQueryChange,
  onRecommendationAction,
  onSelectMemory,
  onStatusChange,
  query,
  recommendations,
  selectedId,
  statsResponse,
  status,
  totalMatching,
  view,
}: {
  activeConcept: ApiConceptNode | null
  conceptDepth: ConceptDepth
  conceptGraph: ApiConceptGraph | null
  contextPreview: ContextPreview | null
  directory: Map<string, Memory | SearchResult>
  focusedConcept: string
  includeNoise: boolean
  knowledgeGraph: KnowledgeGraphResponse | null
  mapLayout: MapLayout
  memories: Array<Memory | SearchResult>
  onClearFocus: () => void
  onConceptDepthChange: (depth: ConceptDepth) => void
  onConceptSelect: (concept: string) => void
  onConsolidateConcept: (concept: string) => void
  onEvidenceOpen: (id: string) => void
  onGoToPage: (view: WorkspaceView) => void
  onIgnoreConcept: (concept: string) => void
  onIncludeNoiseChange: (includeNoise: boolean) => void
  onMapLayoutChange: (layout: MapLayout) => void
  onPreferContradiction: (id: string, preferredId: string) => void
  onQueryChange: (query: string) => void
  onRecommendationAction: (id: string, action: 'apply' | 'reject' | 'defer') => void
  onSelectMemory: (id: string) => void
  onStatusChange: (status: string) => void
  query: string
  recommendations: RecommendationsResponse | null
  selectedId: string | null
  statsResponse: StatsResponse | null
  status: string
  totalMatching: number
  view: WorkspaceView
}) {
  if (view === 'dashboard') {
    return (
      <DashboardPage
        conceptGraph={conceptGraph}
        memoryTotal={totalMatching}
        statsResponse={statsResponse}
      />
    )
  }

  if (view === 'map') {
    return (
      <ConceptsRoutePage
        activeConcept={activeConcept}
        components={{
          ConceptInspector,
          ContextMiniPanel,
          NeuralMapPanel,
        }}
        conceptDepth={conceptDepth}
        conceptGraph={conceptGraph}
        contextPreview={contextPreview}
        focusedConcept={focusedConcept}
        mapLayout={mapLayout}
        onClearFocus={onClearFocus}
        onConceptDepthChange={onConceptDepthChange}
        onConceptSelect={onConceptSelect}
        onConsolidate={onConsolidateConcept}
        onContextOpen={() => onGoToPage('context')}
        onIgnore={onIgnoreConcept}
        onMapLayoutChange={onMapLayoutChange}
      />
    )
  }

  if (view === 'evidence') {
    return (
      <EvidencePage
        activeConcept={activeConcept}
        focusedConcept={focusedConcept}
        memories={memories}
        onClearFocus={onClearFocus}
        onQueryChange={onQueryChange}
        onSelect={onSelectMemory}
        onStatusChange={onStatusChange}
        query={query}
        selectedId={selectedId}
        status={status}
        totalMatching={totalMatching}
      />
    )
  }

  if (view === 'context') {
    return <ContextPage contextPreview={contextPreview} focusedConcept={focusedConcept} />
  }

  if (view === 'knowledge') {
    return (
      <KnowledgeRoutePage
        KnowledgeGraphPanel={KnowledgeGraphPanel}
        directory={directory}
        graph={knowledgeGraph}
        onEvidence={onEvidenceOpen}
      />
    )
  }

  return (
    <GovernanceRoutePage
      GovernancePanel={GovernancePanel}
      conceptGraph={conceptGraph}
      directory={directory}
      includeNoise={includeNoise}
      onEvidenceSelect={onEvidenceOpen}
      onIncludeNoiseChange={onIncludeNoiseChange}
      onPreferContradiction={onPreferContradiction}
      onRecommendationAction={onRecommendationAction}
      recommendations={recommendations}
      statsResponse={statsResponse}
    />
  )
}

function StatusMessage({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-sm text-primary">
      <span>{children}</span>
      <button className="text-primary/80 hover:text-foreground" type="button" onClick={onClose}>
        <X className="size-4" />
      </button>
    </div>
  )
}

function FocusBar({
  activeConcept,
  concept,
  onClear,
  onConsolidate,
  onIgnore,
}: {
  activeConcept: ApiConceptNode | null
  concept: string
  onClear: () => void
  onConsolidate: (concept: string) => void
  onIgnore: (concept: string) => void
}) {
  if (!concept) return null

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/25 bg-primary/8 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge className="bg-primary/15 text-primary hover:bg-primary/15">Focused concept</Badge>
        <strong className="text-foreground">{activeConcept?.title ?? concept}</strong>
        <span className="text-muted-foreground">
          {activeConcept
            ? countLabel(activeConcept.occurrences, 'evidence memory', 'evidence memories')
            : 'evidence view'}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Hint label={conceptHints.consolidate}>
          <Button size="sm" variant="outline" onClick={() => onConsolidate(concept)}>
            <Merge />
            Consolidate
          </Button>
        </Hint>
        <Hint label={conceptHints.markNoise}>
          <Button size="sm" variant="outline" onClick={() => onIgnore(concept)}>
            <Ban />
            Mark noise
          </Button>
        </Hint>
        <Hint label="Clear the focused concept and return to the full evidence list.">
          <Button size="sm" variant="outline" onClick={onClear}>
            <X />
            Clear focus
          </Button>
        </Hint>
      </div>
    </div>
  )
}

function NeuralMapPanel({
  conceptDepth,
  conceptGraph,
  focusedConcept,
  mapLayout,
  onClearFocus,
  onConceptDepthChange,
  onConceptSelect,
  onIgnore,
  onMapLayoutChange,
}: {
  conceptDepth: ConceptDepth
  conceptGraph: ApiConceptGraph | null
  focusedConcept: string
  mapLayout: MapLayout
  onClearFocus: () => void
  onConceptDepthChange: (depth: ConceptDepth) => void
  onConceptSelect: (concept: string) => void
  onIgnore: (concept: string) => void
  onMapLayoutChange: (layout: MapLayout) => void
}) {
  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            LLM context map
          </p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">
            {countLabel(conceptGraph?.concepts.length ?? 0, 'concept', 'concepts')} from{' '}
            {countLabel(conceptGraph?.totalMemories ?? 0, 'context memory', 'context memories')}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            options={[
              { label: '2D', value: '2d' },
              { label: '3D', value: '3d' },
            ]}
            value={mapLayout}
            onChange={(value) => onMapLayoutChange(value as MapLayout)}
          />
          <SegmentedControl
            options={[
              { label: 'Top 20', value: 'top' },
              { label: 'Top 100', value: 'expanded' },
            ]}
            value={conceptDepth}
            onChange={(value) => onConceptDepthChange(value as ConceptDepth)}
          />
          {focusedConcept ? (
            <>
              <Hint label={conceptHints.markNoise}>
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => onIgnore(focusedConcept)}
                >
                  <Ban />
                  Mark noise
                </Button>
              </Hint>
              <Button size="sm" type="button" variant="outline" onClick={onClearFocus}>
                <X />
                Clear
              </Button>
            </>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-4 border-b border-border px-4 py-2 text-sm text-muted-foreground">
        <LegendDot className="bg-primary" label="primary concept" />
        <LegendDot className="bg-primary" label="tag signal" />
        <LegendDot className="bg-secondary" label="keyword signal" />
        <LegendLine label="co-occurrence link" />
      </div>
      <MemoryGraph
        conceptGraph={conceptGraph}
        focusedConcept={focusedConcept}
        mapLayout={mapLayout}
        onConceptSelect={onConceptSelect}
      />
    </section>
  )
}

function SegmentedControl({
  onChange,
  options,
  value,
}: {
  onChange: (value: string) => void
  options: Array<{ label: string; value: string }>
  value: string
}) {
  return (
    <div className="flex rounded-md border border-border bg-background/40 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          className={cn(
            'h-8 rounded-sm px-3 text-sm font-medium text-muted-foreground transition hover:text-foreground',
            value === option.value && 'bg-muted text-foreground'
          )}
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function ConceptInspector({
  concept,
  conceptGraph,
  focusedConcept,
  onConceptSelect,
  onConsolidate,
  onIgnore,
}: {
  concept: ApiConceptNode | null
  conceptGraph: ApiConceptGraph | null
  focusedConcept: string
  onConceptSelect: (concept: string) => void
  onConsolidate: (concept: string) => void
  onIgnore: (concept: string) => void
}) {
  if (!concept) {
    return (
      <Panel title="Context concepts" eyebrow="LLM signal">
        <div className="grid gap-2">
          {(conceptGraph?.concepts ?? []).slice(0, 12).map((item) => (
            <button
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-sm border border-border bg-muted/35 px-3 py-2 text-left transition hover:border-primary/35 hover:bg-muted/60"
              type="button"
              onClick={() => onConceptSelect(item.searchTerm)}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">
                  {item.title}
                </span>
                <span className="text-sm text-muted-foreground">
                  {countLabel(item.occurrences, 'memory', 'memories')} /{' '}
                  {Object.keys(item.typeCounts).slice(0, 2).join(', ')}
                </span>
              </span>
              <Badge className="bg-muted text-foreground hover:bg-muted">#{item.rank}</Badge>
            </button>
          ))}
        </div>
      </Panel>
    )
  }

  return (
    <Panel title={concept.title} eyebrow="Focused concept">
      <div className="grid gap-4">
        <div className="grid grid-cols-3 gap-2">
          <MetaTile
            label={nounLabel(concept.occurrences, 'Memory', 'Memories')}
            value={String(concept.occurrences)}
          />
          <MetaTile label="Strength" value={String(Math.round(concept.score))} />
          <MetaTile
            label="Updated"
            value={concept.lastUpdated ? formatDate(concept.lastUpdated) : 'unknown'}
          />
        </div>
        <CountList label="Types" values={concept.typeCounts} />
        <div className="flex flex-wrap gap-2">
          {concept.evidence.map((item) => (
            <Badge key={item} className="bg-primary/10 text-primary hover:bg-primary/10">
              {item}
            </Badge>
          ))}
        </div>
        <div className="grid gap-2">
          {concept.samples.slice(0, 3).map((sample) => (
            <div key={sample.id} className="rounded-md border border-border bg-background/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{sample.type}</span>
                <span className="text-sm text-muted-foreground">
                  {formatDate(sample.updated_at)}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                {sample.content}
              </p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Hint label={conceptHints.consolidate}>
            <Button onClick={() => onConsolidate(focusedConcept)}>
              <Merge />
              Consolidate
            </Button>
          </Hint>
          <Hint label={conceptHints.markNoise}>
            <Button variant="outline" onClick={() => onIgnore(focusedConcept)}>
              <Ban />
              Mark noise
            </Button>
          </Hint>
        </div>
      </div>
    </Panel>
  )
}

function ContextMiniPanel({
  contextPreview,
  onOpen,
}: {
  contextPreview: ContextPreview | null
  onOpen: () => void
}) {
  return (
    <Panel title="LLM context preview" eyebrow="Current read">
      <div className="grid gap-4">
        <div className="grid grid-cols-3 gap-2">
          <MetaTile
            label={nounLabel(contextPreview?.memoryCount ?? 0, 'Source', 'Sources')}
            value={String(contextPreview?.memoryCount ?? 0)}
          />
          <MetaTile
            label={nounLabel(contextPreview?.tokenEstimate ?? 0, 'Token', 'Tokens')}
            value={String(contextPreview?.tokenEstimate ?? 0)}
          />
          <MetaTile
            label="Generated"
            value={contextPreview?.generatedAt ? formatDate(contextPreview.generatedAt) : 'pending'}
          />
        </div>
        <pre className="max-h-56 overflow-hidden rounded-md border border-border bg-background/50 p-3 text-sm leading-5 text-muted-foreground">
          {contextPreview?.content || 'No active project memory available for context.'}
        </pre>
        <Button variant="outline" onClick={onOpen}>
          <FileText />
          Open context view
        </Button>
      </div>
    </Panel>
  )
}

function MemoryModal({
  children,
  eyebrow,
  open,
  onClose,
  title,
}: {
  children: ReactNode
  eyebrow: string
  open: boolean
  onClose: () => void
  title: string
}) {
  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        aria-modal="true"
        className="flex max-h-[calc(100vh-2rem)] w-[min(48rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-md border border-border bg-card shadow-2xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              {eyebrow}
            </p>
            <h2 className="mt-1 truncate text-lg font-semibold text-foreground">{title}</h2>
          </div>
          <Hint label="Close this memory detail modal.">
            <Button size="icon" variant="outline" onClick={onClose}>
              <X />
            </Button>
          </Hint>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="p-4">{children}</div>
        </ScrollArea>
      </section>
    </div>
  )
}

function CreateForm({ onCreate }: { onCreate: (event: FormEvent<HTMLFormElement>) => void }) {
  const [tags, setTags] = useState('')

  return (
    <form className="grid gap-4" onSubmit={onCreate}>
      <TypeScopeFields type="knowledge" />
      <TagField tags={tags} onTagsChange={setTags} />
      <Label text="Memory">
        <Textarea
          className="min-h-56 border-border bg-background/60 text-foreground"
          name="content"
          placeholder="Write a concise, durable memory..."
          required
        />
      </Label>
      <Button className="w-fit" type="submit">
        <Plus />
        Create memory
      </Button>
    </form>
  )
}

function Editor({
  memory,
  onAction,
  onUpdate,
}: {
  memory: Memory
  onAction: (action: MemoryAction) => void
  onUpdate: (event: FormEvent<HTMLFormElement>) => void
}) {
  const isProposed = memory.metadata.status === 'proposed'
  const isArchived = memory.metadata.status === 'archived'
  const isDeleted = memory.metadata.status === 'deleted'
  const isNoise = memory.metadata.status === 'noise'
  const canEdit = !isProposed && !isArchived && !isDeleted && !isNoise
  const [tags, setTags] = useState(memory.metadata.tags.join(', '))
  const [dangerOpen, setDangerOpen] = useState(false)

  useEffect(() => {
    setTags(memory.metadata.tags.join(', '))
  }, [memory.metadata.id, memory.metadata.tags])

  return (
    <form className="grid gap-4" onSubmit={onUpdate}>
      <div className="grid grid-cols-2 gap-2 max-md:grid-cols-1">
        <MetaTile label="Status" value={memory.metadata.status} />
        <MetaTile label="Updated" value={formatDate(memory.metadata.updated_at)} />
      </div>
      <TypeScopeFields disabled={!canEdit} type={memory.metadata.type} />
      <TagField disabled={!canEdit} tags={tags} onTagsChange={setTags} />
      <Label text="Memory">
        <Textarea
          className="min-h-72 border-border bg-background/60 text-foreground"
          defaultValue={memory.content}
          name="content"
          readOnly={!canEdit}
          required
        />
      </Label>

      {isProposed ? (
        <div className="flex flex-wrap gap-2">
          <Hint label={conceptHints.approve}>
            <Button type="button" onClick={() => onAction('approve')}>
              <Check />
              Approve
            </Button>
          </Hint>
          <Hint label={conceptHints.reject}>
            <Button type="button" variant="destructive" onClick={() => onAction('reject')}>
              <X />
              Reject
            </Button>
          </Hint>
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <>
                <Hint label={conceptHints.save}>
                  <Button type="submit">
                    <Save />
                    Save
                  </Button>
                </Hint>
                <Hint label={conceptHints.archive}>
                  <Button type="button" variant="outline" onClick={() => onAction('archive')}>
                    <Archive />
                    Archive
                  </Button>
                </Hint>
                <Hint label={conceptHints.markNoise}>
                  <Button type="button" variant="outline" onClick={() => onAction('mark-noise')}>
                    <Ban />
                    Mark noise
                  </Button>
                </Hint>
              </>
            ) : null}
            {isArchived || isDeleted || isNoise ? (
              <Hint label={conceptHints.restore}>
                <Button type="button" onClick={() => onAction('restore')}>
                  <RotateCcw />
                  Restore
                </Button>
              </Hint>
            ) : null}
          </div>
          <div className="rounded-md border border-destructive/25 bg-destructive/10 p-3">
            <button
              className="flex items-center gap-2 text-sm font-medium text-destructive"
              type="button"
              onClick={() => setDangerOpen(!dangerOpen)}
            >
              <Trash2 className="size-4" />
              Delete actions
            </button>
            {dangerOpen ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Hint label={conceptHints.softDelete}>
                  <Button type="button" variant="outline" onClick={() => onAction('delete')}>
                    <Trash2 />
                    Soft delete
                  </Button>
                </Hint>
                <Hint label={conceptHints.physicalDelete}>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => onAction('physical-delete')}
                  >
                    <Trash2 />
                    Confirm physical delete
                  </Button>
                </Hint>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </form>
  )
}

function TagField({
  disabled = false,
  onTagsChange,
  tags,
}: {
  disabled?: boolean
  onTagsChange: (value: string) => void
  tags: string
}) {
  return (
    <Label text="Tags">
      <Input
        className="border-border bg-background/60 text-foreground"
        disabled={disabled}
        name="tags"
        value={tags}
        onChange={(event) => onTagsChange(event.target.value)}
      />
    </Label>
  )
}

function KnowledgeGraphPanel({
  directory,
  graph,
  onEvidence,
}: {
  directory: Map<string, Memory | SearchResult>
  graph: KnowledgeGraphResponse | null
  onEvidence: (id: string) => void
}) {
  const [selectedRelationId, setSelectedRelationId] = useState<string | null>(null)
  const rawEntities = graph?.entities ?? []
  const rawRelations = graph?.relations ?? []
  const evidenceIds = Array.from(
    new Set([
      ...rawEntities.flatMap((entity) => entity.evidence_ids),
      ...rawRelations.flatMap((relation) => relation.evidence_ids),
    ])
  )
  const relations = rawRelations.filter(isDisplayKnowledgeRelation)
  const relationEntityIds = new Set(
    relations.flatMap((relation) => [relation.source, relation.target])
  )
  const entities = rawEntities.filter((entity) => relationEntityIds.has(entity.id))
  const entityById = new Map((graph?.entities ?? []).map((entity) => [entity.id, entity]))
  const relationTypes = groupBy(relations, (relation) => relation.type)
  const selectedRelation =
    relations.find((relation) => relation.id === selectedRelationId) ?? relations[0] ?? null
  const hasGraph = evidenceIds.length >= 2 && relations.length > 0

  return (
    <section className="grid grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)] gap-4 max-xl:grid-cols-1">
      <Panel
        title="Relation explorer"
        eyebrow="Knowledge graph"
        toolbar={
          <div className="flex flex-wrap justify-end gap-2 text-sm">
            <GraphMetric label="Entities" value={String(entities.length)} />
            <GraphMetric label="Relations" value={String(relations.length)} />
            <GraphMetric label="Evidence" value={String(evidenceIds.length)} />
          </div>
        }
      >
        {hasGraph ? (
          <div className="grid gap-4">
            <ScrollArea className="h-152">
              <div className="grid gap-4 pr-3">
                {Object.entries(relationTypes).map(([type, typedRelations]) => (
                  <section key={type} className="grid gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                        {type}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {countLabel(typedRelations.length, 'relation', 'relations')}
                      </span>
                    </div>

                    <div className="grid gap-2">
                      {typedRelations.slice(0, 16).map((relation) => {
                        const source = entityById.get(relation.source)
                        const target = entityById.get(relation.target)
                        const selected = selectedRelation?.id === relation.id

                        return (
                          <button
                            key={relation.id}
                            className={cn(
                              'grid gap-2 rounded-md border px-3 py-3 text-left transition',
                              selected
                                ? 'border-primary/35 bg-primary/10'
                                : 'border-border bg-muted/20 hover:border-primary/30 hover:bg-muted/35'
                            )}
                            type="button"
                            onClick={() => {
                              setSelectedRelationId(relation.id)
                            }}
                          >
                            <span className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-sm">
                              <span className="truncate font-medium text-foreground">
                                {source?.label ?? relation.source}
                              </span>
                              <span className="text-muted-foreground">-&gt;</span>
                              <span className="truncate font-medium text-foreground">
                                {target?.label ?? relation.target}
                              </span>
                            </span>
                            <span className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                              <span className="truncate">{relation.explanation}</span>
                              <span className="shrink-0">
                                {countLabel(relation.evidence_ids.length, 'evidence', 'evidence')}
                              </span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </ScrollArea>
          </div>
        ) : (
          <div className="grid h-152 place-items-center rounded-md border border-dashed border-border bg-muted/20 p-8 text-center">
            <div className="max-w-md">
              <p className="text-sm font-medium text-foreground">
                Knowledge graph needs at least 2 memories.
              </p>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Add or approve more memories to reveal useful relations between concepts, decisions,
                files, and evidence.
              </p>
              {evidenceIds[0] ? (
                <Button
                  className="mt-4"
                  variant="outline"
                  onClick={() => onEvidence(evidenceIds[0])}
                >
                  <ListFilter />
                  Open current evidence
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Relation detail" eyebrow="Inspector">
        <div className="grid gap-4">
          {selectedRelation ? (
            <div className="grid gap-4">
              <div>
                <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                  {selectedRelation.type}
                </Badge>
                <h3 className="mt-3 text-lg font-semibold leading-7 text-foreground">
                  {entityById.get(selectedRelation.source)?.label ?? selectedRelation.source}
                  <span className="mx-2 text-muted-foreground">-&gt;</span>
                  {entityById.get(selectedRelation.target)?.label ?? selectedRelation.target}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {selectedRelation.explanation}
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                  Evidence
                </p>
                <EvidenceLinks
                  directory={directory}
                  ids={selectedRelation.evidence_ids}
                  onOpen={onEvidence}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Select a relation to inspect.</p>
          )}

          {relations.length ? (
            <div className="rounded-md bg-muted/25 p-3 text-sm leading-6 text-muted-foreground">
              Select a relation on the left to review the exact evidence that produced it.
            </div>
          ) : null}
        </div>
      </Panel>
    </section>
  )
}

function GraphMetric({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-muted/50 px-3 py-1 text-muted-foreground">
      <span>{label}</span>
      <strong className="text-foreground">{value}</strong>
    </span>
  )
}

function isDisplayKnowledgeRelation(relation: KnowledgeRelation): boolean {
  return relation.type !== 'mentions' && relation.source !== relation.target
}

interface RecommendationDescriptor {
  summary: string
  acceptLabel: string
  acceptHint: string
  rejectHint: string
  deferHint: string
  details: Array<{ label: string; value: string }>
}

function describeRecommendation(rec: MemoryRecommendation): RecommendationDescriptor {
  const evidenceCount = rec.evidence_ids.length
  const details: Array<{ label: string; value: string }> = []

  switch (rec.type) {
    case 'distill_candidates': {
      const sources = rec.payload?.source_ids?.length ?? evidenceCount
      if (rec.payload?.concept) details.push({ label: 'Concept', value: rec.payload.concept })
      details.push({ label: 'Sources', value: String(sources) })
      if (typeof rec.payload?.compression_ratio === 'number') {
        details.push({
          label: 'Compression',
          value: `${Math.round(rec.payload.compression_ratio * 100)}%`,
        })
      }
      return {
        summary: `Creates one proposed "knowledge" memory that consolidates ${sources} sources and archives the originals (they leave the LLM context but stay restorable from Evidence). Re-clicking is safe: if the same set was already distilled, no duplicate is created.`,
        acceptLabel: 'Consolidate into one memory',
        acceptHint:
          'Creates the distilled memory and archives the source memories. Idempotent — clicking twice does not duplicate.',
        rejectHint: 'Dismiss this distillation suggestion. It will not be proposed again.',
        deferHint: 'Hide for now. The suggestion may resurface next time you refresh.',
        details,
      }
    }
    case 'noise_candidate': {
      const targetId = rec.payload?.target_id ?? rec.evidence_ids[0]
      if (targetId) details.push({ label: 'Memory', value: targetId })
      return {
        summary:
          'Will mark this low-signal memory as Noise. It is hidden from the LLM context and the map, but kept for audit.',
        acceptLabel: 'Mark as noise',
        acceptHint: 'Move this memory to the Noise bucket. Reversible from the Evidence view.',
        rejectHint: 'Keep this memory visible and stop suggesting it.',
        deferHint: 'Hide for now without changing the memory.',
        details,
      }
    }
    case 'obsolete_candidate': {
      const older = rec.payload?.target_id ?? rec.evidence_ids[0]
      const replacement = rec.payload?.replacement_id ?? rec.evidence_ids[1]
      if (older) details.push({ label: 'Archive', value: older })
      if (replacement) details.push({ label: 'Replaced by', value: replacement })
      return {
        summary:
          'Will archive the older memory because a newer one appears to replace it. Archived memories stay searchable but are not loaded into the LLM context.',
        acceptLabel: 'Archive older',
        acceptHint: 'Archive the older memory. Restorable from the Evidence view.',
        rejectHint: 'Keep both memories Active and stop suggesting this archival.',
        deferHint: 'Hide for now without archiving.',
        details,
      }
    }
    case 'contradiction': {
      const left = rec.payload?.left_id ?? rec.evidence_ids[0]
      const right = rec.payload?.right_id ?? rec.evidence_ids[1]
      if (left) details.push({ label: 'Memory A', value: left })
      if (right) details.push({ label: 'Memory B', value: right })
      return {
        summary:
          'Choose which memory is preferred. PAMH will keep that memory active, archive the opposing memory, and link the archived memory to the preferred one.',
        acceptLabel: 'Inspect',
        acceptHint: 'Open the evidence memories to review the contradiction.',
        rejectHint: 'Dismiss this contradiction warning.',
        deferHint: 'Hide for now. The contradiction will resurface on next refresh.',
        details,
      }
    }
    case 'strong_concept': {
      if (rec.payload?.concept) details.push({ label: 'Concept', value: rec.payload.concept })
      if (typeof rec.payload?.count === 'number')
        details.push({ label: 'Memories', value: String(rec.payload.count) })
      return {
        summary:
          'Heads-up: this concept recurs across the current LLM context. Consider creating a curated knowledge or rule to anchor it.',
        acceptLabel: 'Open evidence',
        acceptHint: 'Open the Evidence view filtered by this concept.',
        rejectHint: 'Dismiss this hint.',
        deferHint: 'Hide for now.',
        details,
      }
    }
    default:
      return {
        summary: rec.action
          ? `Will apply the "${rec.action.replaceAll('_', ' ')}" action on ${evidenceCount} memory${evidenceCount > 1 ? 'ies' : ''}.`
          : 'No automatic action — review the evidence manually.',
        acceptLabel: rec.action ? 'Apply' : 'Inspect',
        acceptHint: 'Apply this recommendation.',
        rejectHint: 'Dismiss this recommendation.',
        deferHint: 'Hide for now.',
        details,
      }
  }
}

function GovernancePanel({
  conceptGraph,
  directory,
  includeNoise,
  onEvidenceSelect,
  onIncludeNoiseChange,
  onPreferContradiction,
  onRecommendationAction,
  recommendations,
  statsResponse,
}: {
  conceptGraph: ApiConceptGraph | null
  directory: Map<string, Memory | SearchResult>
  includeNoise: boolean
  onEvidenceSelect: (id: string) => void
  onIncludeNoiseChange: (include: boolean) => void
  onPreferContradiction: (id: string, preferredId: string) => void
  onRecommendationAction: (id: string, action: 'apply' | 'reject' | 'defer') => void
  recommendations: RecommendationsResponse | null
  statsResponse: StatsResponse | null
}) {
  const recs = recommendations?.recommendations ?? []
  const openCount = recommendations?.metrics.proposed_recommendations ?? recs.length
  const preservationPct = recommendations?.metrics
    ? Math.round(recommendations.metrics.source_preservation_rate * 100)
    : 100

  return (
    <section className="grid gap-4">
      <div className="grid grid-cols-[minmax(22rem,0.7fr)_minmax(28rem,1.3fr)] gap-4 max-xl:grid-cols-1">
        <div className="grid gap-4">
          <Panel title="View hygiene" eyebrow="Governance">
            <div className="grid gap-3">
              <Hint side="right" label={conceptHints.showNoise}>
                <div>
                  <ToggleRow
                    active={includeNoise}
                    icon={Ban}
                    label={`${includeNoise ? 'Hide' : 'Show'} ${countLabel(
                      statsResponse?.excludedNoiseMemories ?? 0,
                      'memory marked as noise',
                      'memories marked as noise'
                    )}`}
                    value={countLabel(
                      statsResponse?.excludedNoiseMemories ?? 0,
                      includeNoise ? 'shown item' : 'hidden item',
                      includeNoise ? 'shown items' : 'hidden items'
                    )}
                    onToggle={() => onIncludeNoiseChange(!includeNoise)}
                  />
                </div>
              </Hint>
              <div className="rounded-md bg-muted/35 p-3">
                <p className="text-sm font-medium text-foreground">Raw project store</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {countLabel(
                    statsResponse?.rawTotalMemories ?? 0,
                    'raw indexed memory',
                    'raw indexed memories'
                  )}{' '}
                  total,{' '}
                  {countLabel(
                    statsResponse?.stats.total ?? 0,
                    'visible memory',
                    'visible memories'
                  )}{' '}
                  in the working map.
                </p>
              </div>
            </div>
          </Panel>
          <Panel title="Ignored concepts" eyebrow="Noise map">
            <div className="flex flex-wrap gap-2">
              {conceptGraph?.ignoredConcepts.length ? (
                conceptGraph.ignoredConcepts.map((concept) => (
                  <Badge
                    key={concept}
                    className="bg-destructive/10 text-destructive hover:bg-destructive/10"
                  >
                    {concept}
                  </Badge>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No ignored concepts yet. Mark a concept as noise from the Concepts map or from a
                  recommendation to keep it out of the LLM context.
                </p>
              )}
            </div>
          </Panel>
        </div>
        <Panel
          title="Recommendations"
          eyebrow="Assisted review"
          toolbar={
            <Hint
              label={`Source preservation rate: % of original memories still reachable after applied recommendations. 100% means nothing has been lost.`}
            >
              <Badge className="bg-muted text-foreground hover:bg-muted">
                {countLabel(openCount, 'open suggestion', 'open suggestions')} · {preservationPct}%
                preserved
              </Badge>
            </Hint>
          }
        >
          <ScrollArea className="h-184">
            <div className="grid gap-3 pr-3">
              {recs.length === 0 ? (
                <div className="grid place-items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 p-8 text-center">
                  <Check className="size-6 text-primary" />
                  <p className="text-sm font-medium text-foreground">All clean!</p>
                  <p className="max-w-sm text-sm leading-5 text-muted-foreground">
                    PAMH has no maintenance suggestion for now. Keep capturing memories — new
                    suggestions will appear here when patterns emerge.
                  </p>
                </div>
              ) : null}
              {recs.slice(0, 30).map((recommendation, index) => {
                const descriptor = describeRecommendation(recommendation)
                const contradictionIds =
                  recommendation.type === 'contradiction'
                    ? [
                        recommendation.payload?.left_id ?? recommendation.evidence_ids[0],
                        recommendation.payload?.right_id ?? recommendation.evidence_ids[1],
                      ].filter((id): id is string => Boolean(id))
                    : []
                return (
                  <div
                    key={recommendation.id}
                    className="grid gap-3 rounded-md border border-border bg-muted/30 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {index === 0 ? (
                          <Hint label="Top suggestion based on impact. Starting here is a safe choice.">
                            <Badge className="bg-primary text-primary-foreground hover:bg-primary">
                              <Sparkles className="size-3" />
                              Suggested next
                            </Badge>
                          </Hint>
                        ) : null}
                        <Hint label={`Recommendation type: ${recommendation.type}`}>
                          <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                            {recommendation.type.replaceAll('_', ' ')}
                          </Badge>
                        </Hint>
                      </div>
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">
                        {recommendation.action
                          ? recommendation.action.replaceAll('_', ' ')
                          : 'manual review'}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-foreground">{recommendation.title}</p>
                    <p className="text-sm leading-5 text-muted-foreground">
                      {recommendation.explanation}
                    </p>
                    <div className="rounded-sm border border-primary/20 bg-primary/8 p-2 text-sm leading-5">
                      <span className="text-xs font-semibold uppercase tracking-widest text-primary/80">
                        If you accept
                      </span>
                      <p className="mt-1 text-foreground">{descriptor.summary}</p>
                    </div>
                    {descriptor.details.length ? (
                      <div className="flex flex-wrap gap-2 text-xs">
                        {descriptor.details.map((detail) => (
                          <span
                            key={detail.label}
                            className="rounded-sm bg-background/60 px-2 py-1 text-muted-foreground"
                          >
                            <span className="uppercase tracking-widest opacity-70">
                              {detail.label}
                            </span>{' '}
                            <span className="text-foreground">{detail.value}</span>
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="grid gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Affected memories ({recommendation.evidence_ids.length})
                      </span>
                      <EvidenceLinks
                        directory={directory}
                        ids={recommendation.evidence_ids}
                        onOpen={onEvidenceSelect}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                      {contradictionIds.length === 2 ? (
                        <>
                          <Hint
                            label={`Keep ${contradictionIds[0]} active and archive ${contradictionIds[1]}.`}
                          >
                            <Button
                              size="sm"
                              onClick={() =>
                                onPreferContradiction(recommendation.id, contradictionIds[0])
                              }
                            >
                              <Check />
                              Keep A
                            </Button>
                          </Hint>
                          <Hint
                            label={`Keep ${contradictionIds[1]} active and archive ${contradictionIds[0]}.`}
                          >
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                onPreferContradiction(recommendation.id, contradictionIds[1])
                              }
                            >
                              <Check />
                              Keep B
                            </Button>
                          </Hint>
                        </>
                      ) : null}
                      {recommendation.action ? (
                        <Hint label={descriptor.acceptHint}>
                          <Button
                            size="sm"
                            onClick={() => onRecommendationAction(recommendation.id, 'apply')}
                          >
                            <Check />
                            {descriptor.acceptLabel}
                          </Button>
                        </Hint>
                      ) : null}
                      <Hint label={descriptor.deferHint}>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onRecommendationAction(recommendation.id, 'defer')}
                        >
                          <Circle />
                          Defer
                        </Button>
                      </Hint>
                      <Hint label={descriptor.rejectHint}>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onRecommendationAction(recommendation.id, 'reject')}
                        >
                          <X />
                          Reject
                        </Button>
                      </Hint>
                    </div>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </Panel>
      </div>
    </section>
  )
}

function EvidenceLinks({
  directory,
  ids,
  onOpen,
}: {
  directory?: Map<string, Memory | SearchResult>
  ids: string[]
  onOpen?: (id: string) => void
}) {
  if (!ids.length) return null

  return (
    <div className="mt-2 grid gap-1.5">
      {ids.slice(0, 10).map((id) => {
        const memory = directory?.get(id)
        const metadata = memory ? getMetadata(memory) : null
        const title = memory ? getMemoryTitle(memory.content) : id
        const subtitle = metadata
          ? `${metadata.type} · ${metadata.status} · ${formatDate(metadata.updated_at)}`
          : 'unknown memory (no longer in this store)'
        return (
          <Hint
            key={id}
            side="top"
            label={
              memory ? (
                <span className="grid gap-1">
                  <span className="font-mono text-xs opacity-70">{id}</span>
                  <span className="line-clamp-4 whitespace-pre-wrap">{memory.content}</span>
                </span>
              ) : (
                <span className="font-mono text-xs">{id}</span>
              )
            }
          >
            <button
              className="grid gap-0.5 rounded-sm border border-border bg-background/70 px-2 py-1.5 text-left transition hover:border-primary/40 hover:bg-background"
              disabled={!onOpen}
              type="button"
              onClick={() => onOpen?.(id)}
            >
              <span className="truncate text-sm font-medium text-foreground">{title}</span>
              <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
            </button>
          </Hint>
        )
      })}
      {ids.length > 10 ? (
        <span className="text-xs text-muted-foreground">+ {ids.length - 10} more</span>
      ) : null}
    </div>
  )
}

function ToggleRow({
  active,
  icon: Icon,
  label,
  onToggle,
  value,
}: {
  active: boolean
  icon: LucideIcon
  label: string
  onToggle: () => void
  value: string
}) {
  return (
    <button
      className={cn(
        'flex items-center justify-between gap-4 rounded-sm border px-3 py-3 text-left transition',
        active
          ? 'border-primary/35 bg-primary/10 text-primary'
          : 'border-border bg-muted/35 text-foreground hover:bg-muted/60'
      )}
      type="button"
      onClick={onToggle}
    >
      <span className="flex min-w-0 items-center gap-3">
        <Icon className="size-4 shrink-0" />
        <span className="truncate text-sm font-medium">{label}</span>
      </span>
      <span className="text-sm text-muted-foreground">{value}</span>
    </button>
  )
}

function Panel({
  children,
  eyebrow,
  title,
  toolbar,
}: {
  children: ReactNode
  eyebrow: string
  title: string
  toolbar?: ReactNode
}) {
  return (
    <section className="rounded-md border border-border bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            {eyebrow}
          </p>
          <h2 className="mt-1 truncate text-lg font-semibold text-foreground">{title}</h2>
        </div>
        {toolbar}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function TypeScopeFields({ disabled = false, type }: { disabled?: boolean; type: string }) {
  return (
    <div className="grid gap-3">
      <Label
        text="Type"
        hint="Category of memory. Determines how PAMH treats it: decision/knowledge/rule/preference are durable; session/task/mistake/pattern have specialized lifecycles."
      >
        <Select defaultValue={type} disabled={disabled} name="type">
          <SelectTrigger className="w-full border-border bg-background/60 text-foreground">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {memoryTypes.map((item) => (
              <SelectItem key={item} value={item} title={typeHints[item]}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Label>
    </div>
  )
}

function Label({ children, text, hint }: { children: ReactNode; text: string; hint?: ReactNode }) {
  return (
    <label className="grid gap-2">
      {hint ? (
        <Hint label={hint}>
          <span className="w-fit cursor-help text-sm font-semibold uppercase tracking-widest text-muted-foreground underline decoration-dotted underline-offset-4">
            {text}
          </span>
        </Hint>
      ) : (
        <span className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          {text}
        </span>
      )}
      {children}
    </label>
  )
}

function MetaTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/35 p-3">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate text-sm text-foreground">{value}</p>
    </div>
  )
}

function CountList({ label, values }: { label: string; values: Record<string, number> }) {
  const entries = Object.entries(values)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
  return (
    <div className="grid gap-2">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <div className="grid gap-1">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-muted-foreground">{key}</span>
            <span className="text-foreground">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center text-sm gap-1.5">
      <span className={cn('size-2 rounded-full', className)} />
      {label}
    </span>
  )
}

function LegendLine({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-px w-5 bg-primary/70" />
      {label}
    </span>
  )
}

function MemoryGraph({
  conceptGraph,
  focusedConcept,
  mapLayout,
  onConceptSelect,
}: {
  conceptGraph: ApiConceptGraph | null
  focusedConcept: string
  mapLayout: MapLayout
  onConceptSelect: (concept: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onConceptSelectRef = useRef(onConceptSelect)

  useEffect(() => {
    onConceptSelectRef.current = onConceptSelect
  }, [onConceptSelect])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const graph = new MemoryGraphView(
      container,
      conceptGraph,
      focusedConcept,
      mapLayout,
      (concept) => {
        onConceptSelectRef.current(concept)
      }
    )
    return () => graph.dispose()
  }, [conceptGraph, focusedConcept, mapLayout])

  return (
    <div
      ref={containerRef}
      className="memory-graph h-144 min-h-112 overflow-hidden max-md:h-112"
      role="img"
      aria-label="Interactive network of strong memory concepts"
    />
  )
}

class MemoryGraphView {
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000)
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  private controls: OrbitControls | null = null
  private readonly root = new THREE.Group()
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private readonly interactive: THREE.Object3D[] = []
  private readonly tooltip = document.createElement('div')
  private readonly resizeObserver: ResizeObserver
  private frame = 0
  private hover: THREE.Object3D | null = null
  private pointerDown: {
    button: number
    object: THREE.Object3D | null
    time: number
    x: number
    y: number
  } | null = null
  private pointerMoved = false

  constructor(
    private readonly container: HTMLDivElement,
    conceptGraph: ApiConceptGraph | null,
    focusedConcept: string,
    private readonly mapLayout: MapLayout,
    private readonly onConceptSelect: (concept: string) => void
  ) {
    this.container.innerHTML = ''
    if (!conceptGraph?.concepts.length) {
      container.innerHTML =
        '<p class="grid h-full min-h-112 place-items-center text-sm text-muted-foreground">No concepts in the current LLM context.</p>'
      this.resizeObserver = new ResizeObserver(() => undefined)
      return
    }

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.domElement.className = 'memory-graph-canvas'
    this.container.append(this.renderer.domElement)

    this.tooltip.className = 'graph-tooltip'
    this.container.append(this.tooltip)

    const controls = new OrbitControls(this.camera, this.renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = true
    controls.enableZoom = true
    controls.enableRotate = mapLayout === '3d'
    controls.autoRotate = mapLayout === '3d'
    controls.autoRotateSpeed = 0.22
    controls.minDistance = 5
    controls.maxDistance = 42
    this.controls = controls

    this.scene.add(this.root)
    this.scene.add(new THREE.AmbientLight(themeColorNumber('--graph-light'), 1.7))
    const keyLight = new THREE.DirectionalLight(themeColorNumber('--graph-light'), 2)
    keyLight.position.set(8, 12, 10)
    this.scene.add(keyLight)

    const graph = this.build(conceptGraph, focusedConcept)
    this.positionCamera(graph, focusedConcept)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.container)
    this.resize()

    this.container.addEventListener('pointerdown', this.handlePointerDown)
    this.container.addEventListener('pointermove', this.handlePointerMove)
    this.container.addEventListener('pointerup', this.handlePointerUp)
    this.container.addEventListener('pointerleave', this.handlePointerLeave)
    this.controls.addEventListener('start', this.handleControlsStart)
    this.controls.addEventListener('end', this.handleControlsEnd)
    this.animate()
  }

  dispose(): void {
    cancelAnimationFrame(this.frame)
    this.resizeObserver.disconnect()
    this.container.removeEventListener('pointerdown', this.handlePointerDown)
    this.container.removeEventListener('pointermove', this.handlePointerMove)
    this.container.removeEventListener('pointerup', this.handlePointerUp)
    this.container.removeEventListener('pointerleave', this.handlePointerLeave)
    this.controls?.removeEventListener('start', this.handleControlsStart)
    this.controls?.removeEventListener('end', this.handleControlsEnd)
    this.controls?.dispose()
    this.root.traverse((object) => {
      const mesh = object as THREE.Mesh
      mesh.geometry?.dispose()
      const material = mesh.material
      if (Array.isArray(material)) material.forEach((item) => item.dispose())
      else material?.dispose()
    })
    this.renderer.dispose()
  }

  private build(conceptGraph: ApiConceptGraph, focusedConcept: string): ConceptGraph {
    const graph = buildClientConceptGraph(conceptGraph, focusedConcept, this.mapLayout)
    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
    const edgePositions: number[] = []

    graph.edges.forEach((edge) => {
      const source = nodeById.get(edge.source)
      const target = nodeById.get(edge.target)
      if (!source || !target) return
      edgePositions.push(
        source.position.x,
        source.position.y,
        source.position.z,
        target.position.x,
        target.position.y,
        target.position.z
      )
    })

    const edgeGeometry = new THREE.BufferGeometry()
    edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3))
    this.root.add(
      new THREE.LineSegments(
        edgeGeometry,
        new THREE.LineBasicMaterial({
          color: themeColorNumber('--graph-link'),
          transparent: true,
          opacity: 0.26,
        })
      )
    )

    graph.nodes.forEach((node, index) => {
      const geometry =
        node.category === 'tag'
          ? new THREE.IcosahedronGeometry(node.radius, 2)
          : new THREE.SphereGeometry(node.radius, 18, 18)
      const material = new THREE.MeshStandardMaterial({
        color: node.color,
        emissive: node.color,
        emissiveIntensity: node.searchTerm === focusedConcept ? 0.45 : index < 5 ? 0.24 : 0.1,
        roughness: 0.42,
        metalness: 0.06,
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.copy(node.position)
      mesh.userData = node
      this.root.add(mesh)
      this.interactive.push(mesh)

      if (node.labelVisible || node.searchTerm === focusedConcept) {
        const label = createTextSprite(node.title, node.searchTerm === focusedConcept)
        label.position.copy(node.position).add(new THREE.Vector3(0, node.radius + 0.32, 0))
        this.root.add(label)
      }

      if (index < 5 || node.searchTerm === focusedConcept) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(node.radius + 0.12, 0.012, 8, 56),
          new THREE.MeshBasicMaterial({
            color:
              node.searchTerm === focusedConcept
                ? themeColorNumber('--graph-primary')
                : themeColorNumber('--graph-accent'),
          })
        )
        ring.position.copy(node.position)
        ring.rotation.x = this.mapLayout === '2d' ? 0 : Math.PI / 2
        this.root.add(ring)
      }
    })

    return graph
  }

  private positionCamera(graph: ConceptGraph, focusedConcept: string): void {
    const focused = graph.nodes.find((node) => node.searchTerm === focusedConcept)
    const target = focused?.position ?? new THREE.Vector3(0, 0, 0)
    const distance = focused ? 9.5 : this.mapLayout === '2d' ? 15 : 17

    if (this.mapLayout === '2d') {
      this.camera.position.set(target.x, target.y, distance)
    } else {
      this.camera.position.set(target.x + 2.5, target.y + 6.5, target.z + distance)
    }
    this.camera.lookAt(target)
    if (this.controls) this.controls.target.copy(target)
  }

  private resize(): void {
    const width = Math.max(this.container.clientWidth, 320)
    const height = Math.max(this.container.clientHeight, 320)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }

  private animate = (): void => {
    this.frame = requestAnimationFrame(this.animate)
    this.controls?.update()
    this.renderer.render(this.scene, this.camera)
  }

  private handleControlsStart = (): void => {
    if (this.controls) this.controls.autoRotate = false
  }

  private handleControlsEnd = (): void => {
    window.setTimeout(() => {
      if (this.controls && this.mapLayout === '3d') this.controls.autoRotate = true
    }, 2500)
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return
    const rect = this.container.getBoundingClientRect()
    this.pointerDown = {
      button: event.button,
      object: this.getHitFromEvent(event, rect),
      time: performance.now(),
      x: event.clientX,
      y: event.clientY,
    }
    this.pointerMoved = false
  }

  private handlePointerMove = (event: PointerEvent): void => {
    if (this.pointerDown) {
      const movement = Math.hypot(
        event.clientX - this.pointerDown.x,
        event.clientY - this.pointerDown.y
      )
      if (movement > 7) this.pointerMoved = true
    }

    const rect = this.container.getBoundingClientRect()
    const hit = this.getHitFromEvent(event, rect)
    if (hit !== this.hover) this.setHover(hit)

    if (hit) {
      const data = hit.userData as GraphDatum
      this.tooltip.innerHTML = data.detailHtml
      this.tooltip.style.left = `${event.clientX - rect.left + 14}px`
      this.tooltip.style.top = `${event.clientY - rect.top + 14}px`
    }
  }

  private handlePointerLeave = (): void => {
    this.pointerDown = null
    this.pointerMoved = false
    this.setHover(null)
  }

  private handlePointerUp = (event: PointerEvent): void => {
    const start = this.pointerDown
    this.pointerDown = null
    if (!start || start.button !== 0) return

    const movement = Math.hypot(event.clientX - start.x, event.clientY - start.y)
    const elapsed = performance.now() - start.time
    if (this.pointerMoved || movement > 7 || elapsed < 90) return

    const rect = this.container.getBoundingClientRect()
    const hit = this.getHitFromEvent(event, rect)
    if (hit !== this.hover) this.setHover(hit)
    if (!hit || hit !== start.object) return

    const data = hit?.userData as GraphDatum | undefined
    if (data) this.onConceptSelect(data.searchTerm)
  }

  private getHitFromEvent(event: PointerEvent, rect: DOMRect): THREE.Object3D | null {
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)

    return this.raycaster.intersectObjects(this.interactive, false)[0]?.object ?? null
  }

  private setHover(object: THREE.Object3D | null): void {
    if (this.hover) this.hover.scale.setScalar(1)
    this.hover = object
    this.tooltip.classList.toggle('visible', Boolean(object))
    this.container.classList.toggle('can-select-concept', Boolean(object))
    if (object) object.scale.setScalar(1.35)
  }
}

const CONCEPT_LABEL_LIMIT = 8

function buildClientConceptGraph(
  conceptGraph: ApiConceptGraph,
  focusedConcept: string,
  mapLayout: MapLayout
): ConceptGraph {
  const maxScore = Math.max(...conceptGraph.concepts.map((concept) => concept.score), 1)
  const nodes = conceptGraph.concepts.map((concept, index): GraphDatum => {
    const normalizedScore = Math.log(concept.score + 1) / Math.log(maxScore + 1)
    const isFocused = concept.searchTerm === focusedConcept

    return {
      id: concept.id,
      title: concept.title,
      category: concept.category,
      color: isFocused
        ? themeColorNumber('--graph-primary')
        : colorForConcept(concept.category, index),
      radius: isFocused ? 0.32 : 0.07 + normalizedScore * 0.18,
      position: new THREE.Vector3(),
      searchTerm: concept.searchTerm,
      score: concept.score,
      occurrences: concept.occurrences,
      labelVisible: isFocused || index < CONCEPT_LABEL_LIMIT,
      detailHtml: conceptTooltipHtml(concept),
    }
  })
  const nodeIds = new Set(nodes.map((node) => node.id))
  const edges = conceptGraph.edges.filter(
    (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)
  )

  positionConceptNodes(nodes, edges, focusedConcept, mapLayout)

  return {
    nodes,
    edges,
    maxEdgeWeight: Math.max(...edges.map((edge) => edge.weight), 1),
  }
}

function conceptTooltipHtml(concept: ApiConceptNode): string {
  const types = Object.entries(concept.typeCounts)
    .slice(0, 3)
    .map(([key, value]) => `${escapeHtml(key)} ${value}`)
    .join(' / ')
  const sample = concept.samples[0]?.content
  return [
    `<strong>${escapeHtml(concept.title)}</strong>`,
    `<span>${escapeHtml(countLabel(concept.occurrences, 'memory', 'memories'))} / strength ${Math.round(concept.score)}</span>`,
    types ? `<span>${types}</span>` : '',
    concept.lastUpdated
      ? `<span>updated ${escapeHtml(formatDate(concept.lastUpdated))}</span>`
      : '',
    sample ? `<span>${escapeHtml(sample)}</span>` : '',
  ]
    .filter(Boolean)
    .join('')
}

function getMetadata(memory: Memory | SearchResult): MemoryMetadata {
  return 'metadata' in memory ? memory.metadata : memory
}

function groupBy<T>(items: T[], getKey: (item: T) => string): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const key = getKey(item)
    acc[key] = [...(acc[key] ?? []), item]
    return acc
  }, {})
}

function getActiveConcept(
  conceptGraph: ApiConceptGraph | null,
  focusedConcept: string
): ApiConceptNode | null {
  if (!conceptGraph) return null
  if (!focusedConcept) return null
  return conceptGraph.concepts.find((concept) => concept.searchTerm === focusedConcept) ?? null
}

function getInitialWorkspaceView(): WorkspaceView {
  const route = window.location.hash.replace(/^#\/?/, '')
  const knownViews = new Set<WorkspaceView>([
    'dashboard',
    'map',
    'evidence',
    'context',
    'governance',
    'knowledge',
  ])
  return knownViews.has(route as WorkspaceView) ? (route as WorkspaceView) : 'dashboard'
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|||${b}` : `${b}|||${a}`
}

function colorForConcept(category: 'tag' | 'keyword', index: number): number {
  if (index === 0) return themeColorNumber('--graph-primary')
  if (index === 1) return themeColorNumber('--graph-secondary')
  if (index === 2) return themeColorNumber('--graph-tertiary')
  if (index === 3) return themeColorNumber('--graph-accent')
  if (index === 4) return themeColorNumber('--graph-link')
  return category === 'tag'
    ? themeColorNumber('--graph-secondary')
    : themeColorNumber('--graph-tertiary')
}

function positionConceptNodes(
  nodes: GraphDatum[],
  edges: GraphEdge[],
  focusedConcept: string,
  mapLayout: MapLayout
): void {
  if (!nodes.length) return

  const edgeWeights = new Map<string, number>()
  edges.forEach((edge) => edgeWeights.set(pairKey(edge.source, edge.target), edge.weight))

  const focusedIndex = focusedConcept
    ? nodes.findIndex((node) => node.searchTerm === focusedConcept)
    : -1
  const orderedNodes =
    focusedIndex > 0
      ? [nodes[focusedIndex], ...nodes.slice(0, focusedIndex), ...nodes.slice(focusedIndex + 1)]
      : nodes

  orderedNodes[0].position.set(0, 0, 0)
  const anchorCount = Math.min(7, orderedNodes.length)
  const anchors = orderedNodes.slice(0, anchorCount)

  anchors.slice(1).forEach((node, index) => {
    const angle = (index / Math.max(anchorCount - 1, 1)) * Math.PI * 2
    const ring = focusedConcept ? 2.6 : 4.4
    node.position.set(
      Math.cos(angle) * ring,
      Math.sin(angle) * ring * (mapLayout === '2d' ? 0.72 : 0.35),
      mapLayout === '2d' ? 0 : Math.sin(angle) * ring
    )
  })

  const clusterCounts = new Map<string, number>()
  const anchorIds = anchors.map((node) => node.id)

  orderedNodes.slice(anchorCount).forEach((node) => {
    const anchor = findBestAnchor(node.id, anchorIds, edgeWeights, orderedNodes)
    const index = clusterCounts.get(anchor.id) ?? 0
    clusterCounts.set(anchor.id, index + 1)

    const angle = index * 2.399963 + hashToUnit(node.id) * Math.PI
    const ring = 1.0 + Math.floor(index / 6) * 0.54 + (0.25 - node.radius) * 0.4
    node.position.set(
      anchor.position.x + Math.cos(angle) * ring,
      anchor.position.y + Math.sin(angle) * ring * (mapLayout === '2d' ? 0.72 : 0.4),
      mapLayout === '2d' ? 0 : anchor.position.z + Math.sin(angle) * ring
    )
  })
}

function findBestAnchor(
  nodeId: string,
  anchorIds: string[],
  edgeWeights: Map<string, number>,
  nodes: GraphDatum[]
): GraphDatum {
  let bestAnchor = nodes[0]
  let bestWeight = -1

  anchorIds.forEach((anchorId) => {
    const weight = edgeWeights.get(pairKey(nodeId, anchorId)) ?? 0
    if (weight > bestWeight) {
      bestWeight = weight
      bestAnchor = nodes.find((node) => node.id === anchorId) ?? nodes[0]
    }
  })

  if (bestWeight <= 0 && anchorIds.length) {
    bestAnchor =
      nodes.find(
        (node) => node.id === anchorIds[Math.floor(hashToUnit(nodeId) * anchorIds.length)]
      ) ?? nodes[0]
  }

  return bestAnchor
}

function hashToUnit(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}

function createTextSprite(text: string, focused: boolean): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) return new THREE.Sprite()

  context.fillStyle = focused
    ? themeColor('--graph-label-background-focused', 'oklch(0.922 0 0 / 14%)')
    : themeColor('--graph-label-background', 'oklch(0.205 0 0 / 82%)')
  roundRect(context, 36, 34, 440, 58, 14)
  context.fill()
  context.strokeStyle = focused
    ? themeColor('--graph-label-border-focused', 'oklch(0.922 0 0 / 56%)')
    : themeColor('--graph-label-border', 'oklch(1 0 0 / 14%)')
  context.lineWidth = 2
  context.stroke()
  context.fillStyle = focused
    ? themeColor('--graph-label-foreground-focused', 'white')
    : themeColor('--graph-label-foreground', 'white')
  context.font = '700 30px Inter, system-ui, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text.slice(0, 22), 256, 64, 410)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }))
  sprite.scale.set(focused ? 2.4 : 2.05, focused ? 0.6 : 0.52, 1)
  return sprite
}

function themeColor(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

function themeColorNumber(name: string): number {
  const value = themeColor(name, '')
  const match = value.match(/^#([0-9a-f]{6})$/i)
  return match ? Number.parseInt(match[1], 16) : Number.parseInt('ffffff', 16)
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.lineTo(x + width - radius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + radius)
  context.lineTo(x + width, y + height - radius)
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  context.lineTo(x + radius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - radius)
  context.lineTo(x, y + radius)
  context.quadraticCurveTo(x, y, x + radius, y)
  context.closePath()
}

async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  })
  const body = (await response.json()) as T & { error?: string }
  if (!response.ok) throw new Error(body.error ?? `Request failed: ${response.status}`)
  return body
}

function parseTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'unknown'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${nounLabel(count, singular, plural)}`
}

function nounLabel(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural
}

function getMemoryTitle(content: string): string {
  const firstLine = content.replace(/\s+/g, ' ').trim()
  if (!firstLine) return 'Untitled memory'
  return firstLine.length > 88 ? `${firstLine.slice(0, 88).trim()}...` : firstLine
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
    }
    return entities[char]
  })
}

const root = document.querySelector<HTMLElement>('#app')
if (!root) throw new Error('App container not found')

createRoot(root).render(<App />)
