import './styles.css'

import {
  Archive,
  Ban,
  BrainCircuit,
  Check,
  Circle,
  Database,
  Eye,
  FileText,
  GitBranch,
  ListFilter,
  Merge,
  Plus,
  RotateCcw,
  Save,
  Search,
  Shield,
  Sparkles,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

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
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type Store = 'project'
type WorkspaceView = 'map' | 'evidence' | 'context' | 'governance' | 'knowledge'
type MapLayout = '2d' | '3d'
type ConceptDepth = 'top' | 'expanded'
type MemoryAction =
  | 'archive'
  | 'restore'
  | 'delete'
  | 'physical-delete'
  | 'approve'
  | 'reject'
  | 'mark-noise'

const PROJECT_STORE: Store = 'project'

interface MemoryMetadata {
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

interface Memory {
  metadata: MemoryMetadata
  content: string
}

interface SearchResult extends MemoryMetadata {
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

interface StatsResponse {
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
  updated_at: string
  tags: string[]
  content: string
}

interface ApiConceptNode {
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

interface ApiConceptGraph {
  totalMemories: number
  rawTotalMemories: number
  excludedNoiseMemories: number
  ignoredConcepts: string[]
  calculation: string
  concepts: ApiConceptNode[]
  edges: ApiConceptEdge[]
}

interface ContextPreview {
  content: string
  tokenEstimate: number
  memoryCount: number
  sources: ApiConceptSample[]
  topConcepts: Array<{ title: string; occurrences: number; score: number }>
  generatedAt: string
}

interface MemoryRecommendation {
  id: string
  type: string
  status: string
  title: string
  explanation: string
  evidence_ids: string[]
  action?: string
}

interface RecommendationsResponse {
  recommendations: MemoryRecommendation[]
  metrics: {
    total_memories: number
    active_memories: number
    proposed_recommendations: number
    source_preservation_rate: number
    top_concept_count: number
  }
}

interface DistillationProposal {
  id: string
  concept: string
  type: string
  tags: string[]
  source_ids: string[]
  source_count: number
  compression_ratio: number
  reason: string
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

interface KnowledgeGraphResponse {
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
  'project',
  'pattern',
]
const memoryScopes = ['global', 'project', 'client', 'stack', 'temporary', 'archived']
const statuses = ['active', 'all', 'proposed', 'archived', 'deleted', 'noise']

const navItems: Array<{ icon: LucideIcon; label: string; view: WorkspaceView }> = [
  { icon: BrainCircuit, label: 'Concepts map', view: 'map' },
  { icon: GitBranch, label: 'Knowledge graph', view: 'knowledge' },
  { icon: ListFilter, label: 'Evidence', view: 'evidence' },
  { icon: FileText, label: 'LLM context', view: 'context' },
  { icon: Shield, label: 'Governance', view: 'governance' },
]

function App() {
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('map')
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
  const [distillation, setDistillation] = useState<DistillationProposal[]>([])
  const [knowledgeGraph, setKnowledgeGraph] = useState<KnowledgeGraphResponse | null>(null)
  const [message, setMessage] = useState('')

  const conceptLimit = conceptDepth === 'top' ? 20 : 100
  const activeConcept = getActiveConcept(conceptGraph, focusedConcept)
  const suggestedTags = getSuggestedTags(conceptGraph, focusedConcept)

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
    })
    const response = await api<ApiConceptGraph>(`/api/concepts?${params.toString()}`)
    setConceptGraph(response)
  }, [conceptLimit, includeNoise])

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
    const [recommendationResponse, distillationResponse, graphResponse] = await Promise.all([
      api<RecommendationsResponse>(`/api/recommendations?${params.toString()}`),
      api<{ proposals: DistillationProposal[] }>(`/api/distillation?${params.toString()}`),
      api<KnowledgeGraphResponse>(`/api/knowledge-graph?${params.toString()}`),
    ])
    setRecommendations(recommendationResponse)
    setDistillation(distillationResponse.proposals)
    setKnowledgeGraph(graphResponse)
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

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!selectedId) return
    void selectMemory(selectedId)
  }, [selectMemory, selectedId])

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

  const changeWorkspaceView = (view: WorkspaceView) => {
    if (view !== workspaceView) {
      clearConceptFocus()
    }
    setWorkspaceView(view)
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
        scope: data.get('scope'),
        tags: parseTags(String(data.get('tags') ?? '')),
        content,
        source: 'ui',
      }),
    })
    setMessage(`Created ${response.memory.metadata.id}`)
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
          scope: data.get('scope'),
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
          scope: selected.metadata.scope,
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
    await api(`/api/recommendations/${id}/${action}?store=${PROJECT_STORE}`, { method: 'POST' })
    const labels = { apply: 'Applied', reject: 'Rejected', defer: 'Deferred' }
    setMessage(`${labels[action]} recommendation ${id}`)
    await refresh()
  }

  async function applyDistillation(proposal: DistillationProposal) {
    const response = await api<{ memory: Memory }>(
      `/api/distillation/apply?store=${PROJECT_STORE}`,
      {
        method: 'POST',
        body: JSON.stringify({ proposal }),
      }
    )
    setMessage(`Created distilled memory ${response.memory.metadata.id}`)
    setSelectedId(response.memory.metadata.id)
    setWorkspaceView('evidence')
    await refresh()
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground">
        <div className="grid min-h-screen w-full grid-cols-[16rem_minmax(0,1fr)] gap-3 p-3 max-lg:grid-cols-1">
          <Sidebar
            stats={statsResponse?.stats ?? null}
            view={workspaceView}
            onViewChange={changeWorkspaceView}
          />

          <main className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm">
            <header className="mb-4 flex items-start justify-between gap-4 max-md:grid">
              <div>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
                  Portable AI Memory Hub (Console)
                </h1>
                <p className="mt-2 max-w-3xl text-base leading-6 text-muted-foreground">
                  Current project store, filtered to the active memory signals a LLM would use.
                </p>
              </div>
              <Button
                className="max-md:w-full"
                onClick={() => {
                  setSelected(null)
                  setSelectedId(null)
                  setIsCreating(true)
                  changeWorkspaceView('evidence')
                }}
              >
                <Plus />
                New memory
              </Button>
            </header>

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

            <Overview
              conceptGraph={conceptGraph}
              memoryTotal={memoryTotal}
              statsResponse={statsResponse}
            />

            {workspaceView === 'map' ? (
              <div className="grid gap-4">
                <NeuralMapPanel
                  conceptDepth={conceptDepth}
                  conceptGraph={conceptGraph}
                  focusedConcept={focusedConcept}
                  mapLayout={mapLayout}
                  onClearFocus={clearFocus}
                  onConceptDepthChange={setConceptDepth}
                  onConceptSelect={focusConcept}
                  onMapLayoutChange={setMapLayout}
                />
                <section className="grid grid-cols-[minmax(20rem,0.78fr)_minmax(24rem,1fr)] gap-4 max-xl:grid-cols-1">
                  <ConceptInspector
                    concept={activeConcept}
                    conceptGraph={conceptGraph}
                    focusedConcept={focusedConcept}
                    onConceptSelect={focusConcept}
                    onConsolidate={consolidateConcept}
                    onIgnore={ignoreConcept}
                  />
                  <ContextMiniPanel
                    contextPreview={contextPreview}
                    onOpen={() => changeWorkspaceView('context')}
                  />
                </section>
              </div>
            ) : null}

            {workspaceView === 'evidence' ? (
              <section className="grid grid-cols-[minmax(21rem,0.88fr)_minmax(26rem,1.12fr)] gap-4 max-xl:grid-cols-1">
                <MemoryIndex
                  focusedConcept={focusedConcept}
                  memories={memories}
                  onClearFocus={clearFocus}
                  onQueryChange={(value) => {
                    setFocusedConcept('')
                    setQuery(value)
                  }}
                  onSelect={selectMemory}
                  onStatusChange={setStatus}
                  query={focusedConcept || query}
                  selectedId={selectedId}
                  status={status}
                  totalMatching={memoryTotal}
                />
                <MemoryDetail
                  activeConcept={activeConcept}
                  isCreating={isCreating}
                  onAction={runAction}
                  onCreate={createFromForm}
                  onNew={() => {
                    setSelected(null)
                    setSelectedId(null)
                    setIsCreating(true)
                  }}
                  onUpdate={updateFromForm}
                  selected={selected}
                  suggestedTags={suggestedTags}
                  store={PROJECT_STORE}
                />
              </section>
            ) : null}

            {workspaceView === 'context' ? (
              <ContextPreviewPanel
                contextPreview={contextPreview}
                focusedConcept={focusedConcept}
                memories={memories}
                onEvidence={() => changeWorkspaceView('evidence')}
              />
            ) : null}

            {workspaceView === 'knowledge' ? (
              <KnowledgeGraphPanel graph={knowledgeGraph} onEvidence={selectMemory} />
            ) : null}

            {workspaceView === 'governance' ? (
              <GovernancePanel
                conceptGraph={conceptGraph}
                distillation={distillation}
                includeNoise={includeNoise}
                onApplyDistillation={applyDistillation}
                onIncludeNoiseChange={setIncludeNoise}
                onRecommendationAction={handleRecommendation}
                recommendations={recommendations}
                statsResponse={statsResponse}
              />
            ) : null}
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}

function Sidebar({
  onViewChange,
  stats,
  view,
}: {
  onViewChange: (view: WorkspaceView) => void
  stats: Stats | null
  view: WorkspaceView
}) {
  return (
    <aside className="sticky top-3 flex h-[calc(100vh-1.5rem)] flex-col gap-4 rounded-xl border border-border bg-sidebar p-4 shadow-sm max-lg:static max-lg:h-auto">
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-md bg-primary text-sm font-black text-primary-foreground">
          MH
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">PAMH</p>
          <h2 className="text-lg font-semibold text-foreground">Project Memory</h2>
        </div>
      </div>

      <nav className="grid gap-1 text-sm">
        {navItems.map(({ icon: NavIcon, label, view: itemView }) => (
          <button
            key={itemView}
            className={cn(
              'flex h-9 items-center gap-2 rounded-md px-3 text-left text-muted-foreground transition hover:bg-muted/50 hover:text-foreground',
              view === itemView && 'bg-primary/10 text-primary'
            )}
            type="button"
            onClick={() => onViewChange(itemView)}
          >
            <NavIcon className="size-4" />
            {label}
          </button>
        ))}
      </nav>

      <Separator className="bg-muted" />

      <div className="grid gap-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Project store
        </p>
        <div className="rounded-md border border-primary/20 bg-primary/8 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Database className="size-4" />
            .ai-memory
          </div>
          <p className="mt-2 text-sm leading-5 text-muted-foreground">
            Project-local memory only. Global memory is not mixed into this map.
          </p>
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Status
        </p>
        {[
          ['Active', stats?.active ?? 0, 'text-primary'],
          ['Proposed', stats?.proposed ?? 0, 'text-secondary-foreground'],
          ['Archived', stats?.archived ?? 0, 'text-muted-foreground'],
          ['Noise', stats?.noise ?? 0, 'text-accent-foreground'],
          ['Deleted', stats?.deleted ?? 0, 'text-destructive'],
        ].map(([label, value, className]) => (
          <div
            key={String(label)}
            className="flex items-center justify-between rounded-md border border-border bg-muted/35 px-3 py-2 text-sm"
          >
            <span className="text-muted-foreground">{label}</span>
            <strong className={String(className)}>{value}</strong>
          </div>
        ))}
      </div>

      <div className="mt-auto rounded-md border border-border bg-muted/35 px-3 py-2 text-sm text-muted-foreground">
        Project-local memory only.
      </div>
    </aside>
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
        <Button size="sm" variant="outline" onClick={() => onConsolidate(concept)}>
          <Merge />
          Consolidate
        </Button>
        <Button size="sm" variant="outline" onClick={() => onIgnore(concept)}>
          <Ban />
          Mark noise
        </Button>
        <Button size="sm" variant="outline" onClick={onClear}>
          <X />
          Clear focus
        </Button>
      </div>
    </div>
  )
}

function Overview({
  conceptGraph,
  memoryTotal,
  statsResponse,
}: {
  conceptGraph: ApiConceptGraph | null
  memoryTotal: number
  statsResponse: StatsResponse | null
}) {
  const stats = statsResponse?.stats
  const excluded = statsResponse?.excludedNoiseMemories ?? 0

  return (
    <section className="mb-4 grid grid-cols-[0.9fr_0.9fr_0.9fr_1.15fr] gap-3 max-xl:grid-cols-2 max-md:grid-cols-1">
      <MetricPanel
        tone="primary"
        label={nounLabel(stats?.active ?? 0, 'LLM candidate', 'LLM candidates')}
        value={stats?.active ?? '-'}
        detail={countLabel(stats?.total ?? 0, 'visible project memory', 'visible project memories')}
      />
      <MetricPanel
        tone="secondary"
        label={nounLabel(conceptGraph?.concepts.length ?? 0, 'Strong concept', 'Strong concepts')}
        value={conceptGraph?.concepts.length ?? '-'}
        detail={`from ${countLabel(
          conceptGraph?.totalMemories ?? 0,
          'visible memory',
          'visible memories'
        )}`}
      />
      <MetricPanel
        tone="muted"
        label="Evidence set"
        value={memoryTotal}
        detail="current query and status"
      />
      <div className="rounded-md border border-border bg-card p-4">
        <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Excluded noise
        </p>
        <div className="mt-2 flex items-end justify-between gap-3">
          <strong className="text-3xl font-semibold text-foreground">{excluded}</strong>
          <span className="text-right text-sm leading-5 text-muted-foreground">
            {countLabel(statsResponse?.excludedNoiseMemories ?? 0, 'noise item', 'noise items')}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
          <MiniBreakdown label="Types" values={stats?.byType} />
          <MiniBreakdown label="Scopes" values={stats?.byScope} />
          <MiniBreakdown label="Tags" values={stats?.tags} />
        </div>
      </div>
    </section>
  )
}

function MetricPanel({
  detail,
  label,
  tone,
  value,
}: {
  detail: string
  label: string
  tone: 'primary' | 'secondary' | 'muted'
  value: number | string
}) {
  const classes = {
    primary: 'border-border bg-primary text-primary-foreground',
    secondary: 'border-border bg-secondary text-secondary-foreground',
    muted: 'border-border bg-muted text-foreground',
  }

  return (
    <div className={cn('rounded-md border p-4', classes[tone])}>
      <p className="text-sm font-bold uppercase tracking-widest opacity-65">{label}</p>
      <strong className="mt-2 block text-4xl font-semibold tracking-tight">{value}</strong>
      <p className="mt-2 text-sm opacity-75">{detail}</p>
    </div>
  )
}

function MiniBreakdown({ label, values }: { label: string; values?: Record<string, number> }) {
  const entries = Object.entries(values ?? {}).sort((a, b) => b[1] - a[1])
  const top = entries.slice(0, 2)
  const more = Math.max(entries.length - top.length, 0)

  return (
    <div className="min-w-0 rounded-md bg-muted/35 p-2">
      <p className="mb-1 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      {top.length ? (
        top.map(([key, value]) => (
          <div
            key={key}
            className="flex items-center justify-between text-sm gap-2 text-foreground"
          >
            <span className="truncate">{key}</span>
            <span>{value}</span>
          </div>
        ))
      ) : (
        <span className="text-muted-foreground">none</span>
      )}
      {more ? <p className="mt-1 text-muted-foreground">+ {more} more</p> : null}
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
  onMapLayoutChange,
}: {
  conceptDepth: ConceptDepth
  conceptGraph: ApiConceptGraph | null
  focusedConcept: string
  mapLayout: MapLayout
  onClearFocus: () => void
  onConceptDepthChange: (depth: ConceptDepth) => void
  onConceptSelect: (concept: string) => void
  onMapLayoutChange: (layout: MapLayout) => void
}) {
  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Neural map
          </p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">
            {countLabel(conceptGraph?.concepts.length ?? 0, 'concept', 'concepts')} from{' '}
            {countLabel(
              conceptGraph?.totalMemories ?? 0,
              'LLM candidate memory',
              'LLM candidate memories'
            )}
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
            <Button size="sm" type="button" variant="outline" onClick={onClearFocus}>
              <X />
              Clear
            </Button>
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
            'h-8 rounded-[5px] px-3 text-sm font-medium text-muted-foreground transition hover:text-foreground',
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
      <Panel title="Strong concepts" eyebrow="Memory signal">
        <div className="grid gap-2">
          {(conceptGraph?.concepts ?? []).slice(0, 12).map((item) => (
            <button
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/35 px-3 py-2 text-left transition hover:border-primary/35 hover:bg-muted/60"
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
        <CountList label="Scopes" values={concept.scopeCounts} />
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
          <Button onClick={() => onConsolidate(focusedConcept)}>
            <Merge />
            Consolidate
          </Button>
          <Button variant="outline" onClick={() => onIgnore(focusedConcept)}>
            <Ban />
            Mark noise
          </Button>
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

function MemoryIndex({
  focusedConcept,
  memories,
  onQueryChange,
  onSelect,
  onStatusChange,
  query,
  selectedId,
  status,
  totalMatching,
}: {
  focusedConcept: string
  memories: Array<Memory | SearchResult>
  onClearFocus: () => void
  onQueryChange: (query: string) => void
  onSelect: (id: string) => void
  onStatusChange: (status: string) => void
  query: string
  selectedId: string | null
  status: string
  totalMatching: number
}) {
  const groups = groupMemories(memories)

  return (
    <Panel
      eyebrow={focusedConcept ? 'Concept evidence' : 'Memory index'}
      title={countLabel(totalMatching, 'matching memory', 'matching memories')}
      toolbar={
        <Badge className="gap-1 bg-primary/10 text-primary hover:bg-primary/10">
          <Circle className="size-2 fill-current" />
          Live
        </Badge>
      }
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-[1fr_10rem] gap-2 max-md:grid-cols-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="border-border bg-background/60 pl-8 text-foreground placeholder:text-muted-foreground"
              placeholder="Search facts, decisions, rules..."
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
            />
          </div>
          <Select value={status} onValueChange={onStatusChange}>
            <SelectTrigger className="w-full border-border bg-background/60 text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statuses.map((item) => (
                <SelectItem key={item} value={item}>
                  {item === 'all' ? 'All statuses' : item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ScrollArea className="h-176">
          <div className="grid gap-4 pr-3">
            {groups.length ? (
              groups.map(([group, items]) => (
                <section key={group} className="grid gap-2">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {group}
                    </span>
                    <span className="text-muted-foreground">{items.length}</span>
                  </div>
                  {items.map((memory) => (
                    <MemoryRow
                      key={getMetadata(memory).id}
                      focusedConcept={focusedConcept}
                      memory={memory}
                      selected={getMetadata(memory).id === selectedId}
                      onSelect={onSelect}
                    />
                  ))}
                </section>
              ))
            ) : (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No memory matches this view.
              </p>
            )}
          </div>
        </ScrollArea>
      </div>
    </Panel>
  )
}

function MemoryRow({
  focusedConcept,
  memory,
  onSelect,
  selected,
}: {
  focusedConcept: string
  memory: Memory | SearchResult
  onSelect: (id: string) => void
  selected: boolean
}) {
  const metadata = getMetadata(memory)
  const title = getMemoryTitle(memory.content)

  return (
    <button
      className={cn(
        'grid gap-2 rounded-md border border-border bg-muted/35 p-3 text-left transition hover:border-primary/40 hover:bg-muted/60',
        selected && 'border-primary bg-primary/10'
      )}
      type="button"
      onClick={() => onSelect(metadata.id)}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate font-medium text-foreground">{title}</span>
          <span className="mt-1 flex flex-wrap gap-2 text-sm text-muted-foreground">
            <span>{metadata.type}</span>
            <span>{metadata.scope}</span>
            <span>{formatDate(metadata.updated_at)}</span>
            {focusedConcept ? <span>matches {focusedConcept}</span> : null}
          </span>
        </span>
        {metadata.status === 'active' ? (
          <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
        ) : (
          <StatusBadge status={metadata.status} />
        )}
      </span>
      <span className="line-clamp-2 text-sm leading-6 text-muted-foreground">{memory.content}</span>
      <span className="flex flex-wrap gap-1.5">
        {metadata.tags.slice(0, 5).map((tag) => (
          <Badge key={tag} className="bg-muted/70 text-foreground hover:bg-muted/70">
            {tag}
          </Badge>
        ))}
      </span>
    </button>
  )
}

function MemoryDetail({
  activeConcept,
  isCreating,
  onAction,
  onCreate,
  onNew,
  onUpdate,
  selected,
  suggestedTags,
  store,
}: {
  activeConcept: ApiConceptNode | null
  isCreating: boolean
  onAction: (action: MemoryAction) => void
  onCreate: (event: FormEvent<HTMLFormElement>) => void
  onNew: () => void
  onUpdate: (event: FormEvent<HTMLFormElement>) => void
  selected: Memory | null
  suggestedTags: string[]
  store: Store
}) {
  if (selected) {
    return (
      <Panel
        title={selected.metadata.status === 'proposed' ? 'Review memory' : 'Memory inspector'}
        eyebrow={selected.metadata.id}
      >
        <Editor
          memory={selected}
          onAction={onAction}
          onNew={onNew}
          onUpdate={onUpdate}
          suggestedTags={suggestedTags}
        />
      </Panel>
    )
  }

  if (isCreating) {
    return (
      <Panel title="New memory" eyebrow="Create">
        <CreateForm onCreate={onCreate} store={store} suggestedTags={suggestedTags} />
      </Panel>
    )
  }

  return (
    <Panel
      title={activeConcept ? `${activeConcept.title} summary` : 'Inspector'}
      eyebrow="Selection"
    >
      {activeConcept ? (
        <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-2">
            <MetaTile label="Evidence" value={String(activeConcept.occurrences)} />
            <MetaTile
              label="Types"
              value={Object.keys(activeConcept.typeCounts).length.toString()}
            />
            <MetaTile
              label="Sources"
              value={Object.keys(activeConcept.sourceCounts).length.toString()}
            />
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            The list at left is the representative evidence set for this concept.
          </p>
          <Button className="w-fit" onClick={onNew}>
            <Plus />
            Add memory
          </Button>
        </div>
      ) : (
        <EmptyInspector onNew={onNew} />
      )}
    </Panel>
  )
}

function EmptyInspector({ onNew }: { onNew: () => void }) {
  return (
    <div className="grid place-items-center rounded-md border border-dashed border-border bg-muted/35 p-8 text-center">
      <div className="grid max-w-sm gap-3">
        <Eye className="mx-auto size-7 text-muted-foreground" />
        <p className="text-sm leading-6 text-muted-foreground">
          Select an evidence memory or create a durable project memory.
        </p>
        <Button className="mx-auto" onClick={onNew}>
          <Plus />
          New memory
        </Button>
      </div>
    </div>
  )
}

function CreateForm({
  onCreate,
  store,
  suggestedTags,
}: {
  onCreate: (event: FormEvent<HTMLFormElement>) => void
  store: Store
  suggestedTags: string[]
}) {
  const [tags, setTags] = useState(suggestedTags.slice(0, 3).join(', '))

  useEffect(() => {
    if (!tags) setTags(suggestedTags.slice(0, 3).join(', '))
  }, [suggestedTags, tags])

  return (
    <form className="grid gap-4" onSubmit={onCreate}>
      <TypeScopeFields scope={store} type="knowledge" />
      <TagField suggestedTags={suggestedTags} tags={tags} onTagsChange={setTags} />
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
  onNew,
  onUpdate,
  suggestedTags,
}: {
  memory: Memory
  onAction: (action: MemoryAction) => void
  onNew: () => void
  onUpdate: (event: FormEvent<HTMLFormElement>) => void
  suggestedTags: string[]
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
      <div className="flex items-start justify-between gap-3 max-md:grid">
        <div className="grid grid-cols-3 gap-2 max-md:grid-cols-1">
          <MetaTile label="Status" value={memory.metadata.status} />
          <MetaTile label="Scope" value={memory.metadata.scope} />
          <MetaTile label="Updated" value={formatDate(memory.metadata.updated_at)} />
        </div>
        <Button type="button" variant="outline" onClick={onNew}>
          <Plus />
          New
        </Button>
      </div>

      <TypeScopeFields
        disabled={!canEdit}
        scope={memory.metadata.scope}
        type={memory.metadata.type}
      />
      <TagField
        disabled={!canEdit}
        suggestedTags={suggestedTags}
        tags={tags}
        onTagsChange={setTags}
      />
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
          <Button type="button" onClick={() => onAction('approve')}>
            <Check />
            Approve
          </Button>
          <Button type="button" variant="destructive" onClick={() => onAction('reject')}>
            <X />
            Reject
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <>
                <Button type="submit">
                  <Save />
                  Save
                </Button>
                <Button type="button" variant="outline" onClick={() => onAction('archive')}>
                  <Archive />
                  Archive
                </Button>
                <Button type="button" variant="outline" onClick={() => onAction('mark-noise')}>
                  <Ban />
                  Mark noise
                </Button>
              </>
            ) : null}
            {isArchived || isDeleted || isNoise ? (
              <Button type="button" onClick={() => onAction('restore')}>
                <RotateCcw />
                Restore
              </Button>
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
                <Button type="button" variant="outline" onClick={() => onAction('delete')}>
                  <Trash2 />
                  Soft delete
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => onAction('physical-delete')}
                >
                  <Trash2 />
                  Confirm physical delete
                </Button>
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
  suggestedTags,
  tags,
}: {
  disabled?: boolean
  onTagsChange: (value: string) => void
  suggestedTags: string[]
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
      {!disabled && suggestedTags.length ? (
        <span className="flex flex-wrap gap-1.5">
          {suggestedTags.slice(0, 8).map((tag) => (
            <button
              key={tag}
              className="rounded-md border border-border bg-muted/40 px-2 py-1 text-sm text-foreground hover:border-primary/30 hover:text-foreground"
              type="button"
              onClick={() => {
                const current = parseTags(tags)
                if (!current.includes(tag)) onTagsChange([...current, tag].join(', '))
              }}
            >
              {tag}
            </button>
          ))}
        </span>
      ) : null}
    </Label>
  )
}

function ContextPreviewPanel({
  contextPreview,
  focusedConcept,
  memories,
  onEvidence,
}: {
  contextPreview: ContextPreview | null
  focusedConcept: string
  memories: Array<Memory | SearchResult>
  onEvidence: () => void
}) {
  const copyContext = async () => {
    if (!contextPreview?.content) return
    await navigator.clipboard.writeText(contextPreview.content)
  }

  return (
    <section className="grid grid-cols-[minmax(26rem,1.2fr)_minmax(18rem,0.6fr)] gap-4 max-xl:grid-cols-1">
      <Panel
        eyebrow={focusedConcept ? 'Focused LLM context' : 'General LLM context'}
        title="What the LLM would read"
        toolbar={
          <Button size="sm" variant="outline" onClick={copyContext}>
            <FileText />
            Copy
          </Button>
        }
      >
        <pre className="h-184 overflow-auto rounded-md border border-border bg-background/60 p-4 text-sm leading-6 text-foreground">
          {contextPreview?.content || 'No active project memory available for context.'}
        </pre>
      </Panel>
      <Panel
        title={countLabel(contextPreview?.memoryCount ?? 0, 'Context source', 'Context sources')}
        eyebrow={countLabel(
          contextPreview?.memoryCount ?? 0,
          'Selected memory',
          'Selected memories'
        )}
      >
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            <MetaTile
              label={nounLabel(contextPreview?.memoryCount ?? 0, 'Source', 'Sources')}
              value={String(contextPreview?.memoryCount ?? 0)}
            />
            <MetaTile
              label={nounLabel(contextPreview?.tokenEstimate ?? 0, 'Token', 'Tokens')}
              value={String(contextPreview?.tokenEstimate ?? 0)}
            />
          </div>
          <Button variant="outline" onClick={onEvidence}>
            <ListFilter />
            Open evidence
          </Button>
          <ScrollArea className="h-144">
            <div className="grid gap-2 pr-3">
              {memories.slice(0, 18).map((memory) => {
                const metadata = getMetadata(memory)
                return (
                  <div
                    key={metadata.id}
                    className="rounded-md border border-border bg-muted/35 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">{metadata.type}</span>
                      <span className="text-sm text-muted-foreground">
                        {formatDate(metadata.updated_at)}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                      {memory.content}
                    </p>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </div>
      </Panel>
    </section>
  )
}

function KnowledgeGraphPanel({
  graph,
  onEvidence,
}: {
  graph: KnowledgeGraphResponse | null
  onEvidence: (id: string) => void
}) {
  const entityById = new Map((graph?.entities ?? []).map((entity) => [entity.id, entity]))
  const relationTypes = groupBy(graph?.relations ?? [], (relation) => relation.type)

  return (
    <section className="grid grid-cols-[minmax(22rem,0.8fr)_minmax(28rem,1.2fr)] gap-4 max-xl:grid-cols-1">
      <Panel title="Typed relations" eyebrow="Knowledge Graph">
        <div className="grid gap-3">
          <div className="grid grid-cols-3 gap-2 max-md:grid-cols-1">
            <MetaTile label="Entities" value={String(graph?.metrics.entity_count ?? 0)} />
            <MetaTile label="Relations" value={String(graph?.metrics.relation_count ?? 0)} />
            <MetaTile
              label="Evidence"
              value={`${Math.round((graph?.metrics.evidence_coverage ?? 1) * 100)}%`}
            />
          </div>
          <ScrollArea className="h-168">
            <div className="grid gap-3 pr-3">
              {Object.entries(relationTypes).map(([type, relations]) => (
                <div key={type} className="rounded-md border border-border bg-muted/30 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Badge className="bg-primary/10 text-primary hover:bg-primary/10">{type}</Badge>
                    <span className="text-sm text-muted-foreground">
                      {countLabel(relations.length, 'edge', 'edges')}
                    </span>
                  </div>
                  <div className="grid gap-2">
                    {relations.slice(0, 12).map((relation) => (
                      <div key={relation.id} className="rounded-md bg-background/50 p-2">
                        <p className="text-sm leading-5 text-foreground">
                          {entityById.get(relation.source)?.label ?? relation.source}
                          <span className="text-muted-foreground">{' -> '}</span>
                          {entityById.get(relation.target)?.label ?? relation.target}
                        </p>
                        <EvidenceLinks ids={relation.evidence_ids} onOpen={onEvidence} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {!graph?.relations.length ? (
                <p className="text-sm text-muted-foreground">No graph relations available yet.</p>
              ) : null}
            </div>
          </ScrollArea>
        </div>
      </Panel>
      <Panel title="Entities" eyebrow="Inspectable evidence">
        <ScrollArea className="h-184">
          <div className="grid gap-2 pr-3">
            {(graph?.entities ?? []).slice(0, 120).map((entity) => (
              <div key={entity.id} className="rounded-md border border-border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {entity.label}
                  </span>
                  <Badge variant="secondary">{entity.type}</Badge>
                </div>
                <EvidenceLinks ids={entity.evidence_ids} onOpen={onEvidence} />
              </div>
            ))}
          </div>
        </ScrollArea>
      </Panel>
    </section>
  )
}

function GovernancePanel({
  conceptGraph,
  distillation,
  includeNoise,
  onApplyDistillation,
  onIncludeNoiseChange,
  onRecommendationAction,
  recommendations,
  statsResponse,
}: {
  conceptGraph: ApiConceptGraph | null
  distillation: DistillationProposal[]
  includeNoise: boolean
  onApplyDistillation: (proposal: DistillationProposal) => void
  onIncludeNoiseChange: (include: boolean) => void
  onRecommendationAction: (id: string, action: 'apply' | 'reject' | 'defer') => void
  recommendations: RecommendationsResponse | null
  statsResponse: StatsResponse | null
}) {
  return (
    <section className="grid grid-cols-[minmax(22rem,0.7fr)_minmax(28rem,1.3fr)] gap-4 max-xl:grid-cols-1">
      <Panel title="View hygiene" eyebrow="Governance">
        <div className="grid gap-3">
          <ToggleRow
            active={includeNoise}
            icon={Ban}
            label={`Show ${countLabel(
              statsResponse?.excludedNoiseMemories ?? 0,
              'memory marked as noise',
              'memories marked as noise'
            )}`}
            value={countLabel(
              statsResponse?.excludedNoiseMemories ?? 0,
              'hidden item',
              'hidden items'
            )}
            onToggle={() => onIncludeNoiseChange(!includeNoise)}
          />
          <div className="rounded-md border border-border bg-muted/35 p-3">
            <p className="text-sm font-medium text-foreground">Raw project store</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {countLabel(
                statsResponse?.rawTotalMemories ?? 0,
                'raw indexed memory',
                'raw indexed memories'
              )}{' '}
              total,{' '}
              {countLabel(statsResponse?.stats.total ?? 0, 'visible memory', 'visible memories')} in
              the working map.
            </p>
          </div>
        </div>
      </Panel>
      <div className="grid gap-4">
        <Panel title="Recommendations" eyebrow="Assisted review">
          <ScrollArea className="h-96">
            <div className="grid gap-3 pr-3">
              {(recommendations?.recommendations ?? []).slice(0, 30).map((recommendation) => (
                <div
                  key={recommendation.id}
                  className="rounded-md border border-border bg-muted/30 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                      {recommendation.type}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {recommendation.action ?? 'inspect'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-foreground">{recommendation.title}</p>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    {recommendation.explanation}
                  </p>
                  <EvidenceLinks ids={recommendation.evidence_ids} />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {recommendation.action ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onRecommendationAction(recommendation.id, 'apply')}
                      >
                        <Check />
                        Accept
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onRecommendationAction(recommendation.id, 'defer')}
                    >
                      <Circle />
                      Defer
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onRecommendationAction(recommendation.id, 'reject')}
                    >
                      <X />
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
              {!recommendations?.recommendations.length ? (
                <p className="text-sm text-muted-foreground">No recommendations available.</p>
              ) : null}
            </div>
          </ScrollArea>
        </Panel>
        <Panel title="Distillation preview" eyebrow="Synthetic memories">
          <div className="grid gap-2">
            {distillation.slice(0, 6).map((proposal) => (
              <div key={proposal.id} className="rounded-md border border-border bg-muted/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{proposal.concept}</span>
                  <Badge variant="secondary">
                    {countLabel(proposal.source_count, 'source', 'sources')}
                  </Badge>
                </div>
                <p className="mt-2 text-sm leading-5 text-muted-foreground">{proposal.reason}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">
                    ratio {proposal.compression_ratio}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => onApplyDistillation(proposal)}>
                    <Sparkles />
                    Create proposed
                  </Button>
                </div>
              </div>
            ))}
            {!distillation.length ? (
              <p className="text-sm text-muted-foreground">No distillation candidates yet.</p>
            ) : null}
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
              <p className="text-sm text-muted-foreground">No ignored concepts yet.</p>
            )}
          </div>
        </Panel>
      </div>
    </section>
  )
}

function EvidenceLinks({ ids, onOpen }: { ids: string[]; onOpen?: (id: string) => void }) {
  if (!ids.length) return null

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {ids.slice(0, 10).map((id) => (
        <button
          key={id}
          className="rounded-sm bg-background/70 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          type="button"
          onClick={() => onOpen?.(id)}
        >
          {id}
        </button>
      ))}
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
        'flex items-center justify-between gap-4 rounded-md border px-3 py-3 text-left transition',
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

function TypeScopeFields({
  disabled = false,
  type,
  scope,
}: {
  disabled?: boolean
  type: string
  scope: string
}) {
  return (
    <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
      <Label text="Type">
        <Select defaultValue={type} disabled={disabled} name="type">
          <SelectTrigger className="w-full border-border bg-background/60 text-foreground">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {memoryTypes.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Label>
      <Label text="Scope">
        <Select defaultValue={scope} disabled={disabled} name="scope">
          <SelectTrigger className="w-full border-border bg-background/60 text-foreground">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {memoryScopes.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Label>
    </div>
  )
}

function Label({ children, text }: { children: ReactNode; text: string }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
        {text}
      </span>
      {children}
    </label>
  )
}

function MetaTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/35 p-3">
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

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    active: 'bg-primary/12 text-primary',
    proposed: 'bg-secondary text-primary',
    archived: 'bg-muted text-muted-foreground',
    noise: 'bg-accent text-accent-foreground',
    deleted: 'bg-destructive/10 text-destructive',
  }
  return <Badge className={cn(classes[status] ?? 'bg-muted text-foreground')}>{status}</Badge>
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
        '<p class="grid min-h-112 place-items-center text-sm text-muted-foreground">No strong concepts in the current project view.</p>'
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

function groupMemories(
  memories: Array<Memory | SearchResult>
): Array<[string, Array<Memory | SearchResult>]> {
  const groups = new Map<string, Array<Memory | SearchResult>>()
  memories.forEach((memory) => {
    const metadata = getMetadata(memory)
    const key = `${metadata.type} / ${metadata.scope}`
    groups.set(key, [...(groups.get(key) ?? []), memory])
  })
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
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

function getSuggestedTags(conceptGraph: ApiConceptGraph | null, focusedConcept: string): string[] {
  const concept = getActiveConcept(conceptGraph, focusedConcept)
  if (concept) {
    return Array.from(
      new Set([
        concept.searchTerm.replace(/\s+/g, '-'),
        ...concept.evidence.map((item) => item.toLowerCase().replace(/\s+/g, '-')),
      ])
    )
  }

  return (conceptGraph?.concepts ?? [])
    .slice(0, 8)
    .map((concept) => concept.searchTerm.replace(/\s+/g, '-'))
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
