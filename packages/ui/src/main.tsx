import './styles.css'

import {
  IconBrain,
  IconClipboardCheck,
  IconClipboardCopy,
  IconLoader2,
  IconInfoCircle,
  IconPlus,
  IconRefresh,
  IconSettings,
} from '@tabler/icons-react'
import {
  type FormEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createRoot } from 'react-dom/client'

import { AppSidebar, viewToPath, type RuntimeView } from '@/components/app-sidebar'
import { ChartAreaInteractive } from '@/components/chart-area-interactive'
import { DataTable, type MemoryRowAction, type MemoryTableRow } from '@/components/data-table'
import { SectionCards } from '@/components/section-cards'
import { SiteHeader } from '@/components/site-header'
import { SQLiteIndexCards } from '@/components/sqlite-index-cards'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Toaster } from '@/components/ui/sonner'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ApiError, api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type {
  ApiConceptGraph,
  AutoCaptureMode,
  ContextPreview,
  IndexDiagnosticsResponse,
  KnowledgeGraphResponse,
  MemoriesResponse,
  Memory,
  MemoryMetadata,
  MemoryStatus,
  MemoryStatusFilter,
  MemoryType,
  PamConfigResponse,
  PackageVersionsResponse,
  SearchResult,
  StatsResponse,
} from '@/types'

document.documentElement.classList.add('dark')

const PROJECT_STORE = 'project'
const EMPTY_STATE_CLASS = 'rounded-lg border border-dashed p-4 text-sm text-muted-foreground'

const memoryTypes: MemoryType[] = [
  'decision',
  'knowledge',
  'mistake',
  'rule',
  'preference',
  'session',
  'exchange',
  'task',
  'client',
  'pattern',
]

const defaultCreateForm = {
  title: '',
  type: 'knowledge' as MemoryType,
  content: '',
  tags: '',
}

const captureModeCopy: Record<AutoCaptureMode, { label: string }> = {
  auto: {
    label: 'Automatic',
  },
  assisted: {
    label: 'Assisted',
  },
  manual: {
    label: 'Manual',
  },
}

const SETTINGS_API_UNAVAILABLE_MESSAGE =
  'Settings are not available on the running PAM API. This usually means the UI is newer than the API process. Restart the PAM server after rebuilding or reinstalling PAM, then reopen Settings.'

const REBUILD_INDEX_API_UNAVAILABLE_MESSAGE =
  'Index rebuild is not available on the running PAM API. Restart the PAM server after rebuilding or reinstalling PAM, or run `pam index rebuild` in this workspace.'

type ConfigForm = {
  mode: AutoCaptureMode
  ignoredConcepts: string
  runtime: {
    autoVectorize: boolean
    deferThemeRebuild: boolean
    debug: boolean
  }
}

function App() {
  const [status, setStatus] = useState<MemoryStatusFilter>('active')
  const [activeView, setActiveView] = useState<RuntimeView>(() =>
    pathToView(window.location.pathname)
  )
  const [statsResponse, setStatsResponse] = useState<StatsResponse | null>(null)
  const [memoriesResponse, setMemoriesResponse] = useState<MemoriesResponse | null>(null)
  const [contextPreview, setContextPreview] = useState<ContextPreview | null>(null)
  const [conceptGraph, setConceptGraph] = useState<ApiConceptGraph | null>(null)
  const [knowledgeGraph, setKnowledgeGraph] = useState<KnowledgeGraphResponse | null>(null)
  const [indexStats, setIndexStats] = useState<IndexDiagnosticsResponse | null>(null)
  const [pamConfig, setPamConfig] = useState<PamConfigResponse | null>(null)
  const [packageVersions, setPackageVersions] = useState<PackageVersionsResponse | null>(null)
  const [configForm, setConfigForm] = useState<ConfigForm>({
    mode: 'auto',
    ignoredConcepts: '',
    runtime: {
      autoVectorize: true,
      deferThemeRebuild: false,
      debug: false,
    },
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isIndexStatsLoading, setIsIndexStatsLoading] = useState(false)
  const [isConfigLoading, setIsConfigLoading] = useState(false)
  const [isMemoriesLoading, setIsMemoriesLoading] = useState(false)
  const [isPackageVersionsLoading, setIsPackageVersionsLoading] = useState(false)
  const [isConfigSaving, setIsConfigSaving] = useState(false)
  const [isReindexing, setIsReindexing] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [reindexMessage, setReindexMessage] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState(defaultCreateForm)
  const [createError, setCreateError] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [notice, setNotice] = useState('')
  const [packageVersionsError, setPackageVersionsError] = useState('')
  const hasLoadedRef = useRef(false)

  const includeNoise = status === 'all' || status === 'noise'

  const loadMemoryInventory = useCallback(async () => {
    setError('')
    setIsMemoriesLoading(true)

    const memoryParams = new URLSearchParams({
      store: PROJECT_STORE,
      includeNoise: String(includeNoise),
      limit: '200',
      status,
    })

    try {
      setMemoriesResponse(await api<MemoriesResponse>(`/api/memories?${memoryParams.toString()}`))
    } catch (loadError) {
      setError(errorMessage(loadError))
    } finally {
      setIsMemoriesLoading(false)
    }
  }, [includeNoise, status])

  const loadDashboard = useCallback(async () => {
    setError('')
    setIsRefreshing(true)
    if (!hasLoadedRef.current) setIsLoading(true)

    const memoryParams = new URLSearchParams({
      store: PROJECT_STORE,
      includeNoise: String(includeNoise),
      limit: '200',
      status,
    })

    const contextParams = new URLSearchParams({
      store: PROJECT_STORE,
      includeNoise: 'false',
      maxMemories: '18',
    })

    const conceptParams = new URLSearchParams({
      store: PROJECT_STORE,
      includeNoise: 'false',
      limit: '18',
      maxMemories: '18',
    })

    const statsParams = new URLSearchParams({
      store: PROJECT_STORE,
      includeNoise: String(includeNoise),
    })

    try {
      const [stats, memories, context, concepts, knowledge] = await Promise.all([
        api<StatsResponse>(`/api/stats?${statsParams.toString()}`),
        api<MemoriesResponse>(`/api/memories?${memoryParams.toString()}`),
        api<ContextPreview>(`/api/context-preview?${contextParams.toString()}`),
        api<ApiConceptGraph>(`/api/concepts?${conceptParams.toString()}`),
        api<KnowledgeGraphResponse>('/api/knowledge-graph'),
      ])

      setStatsResponse(stats)
      setMemoriesResponse(memories)
      setContextPreview(context)
      setConceptGraph(concepts)
      setKnowledgeGraph(knowledge)
      setLastUpdated(new Date())
    } catch (loadError) {
      setError(errorMessage(loadError))
    } finally {
      hasLoadedRef.current = true
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [includeNoise, status])

  const loadIndexStats = useCallback(async () => {
    setIsIndexStatsLoading(true)
    try {
      setError('')
      setIndexStats(await api<IndexDiagnosticsResponse>('/api/index-stats'))
    } catch (indexStatsError) {
      if (indexStatsError instanceof ApiError && indexStatsError.status === 404) {
        setError('')
        setIndexStats(buildBasicIndexDiagnostics(statsResponse, memoriesResponse))
      } else {
        setError(errorMessage(indexStatsError))
      }
    } finally {
      setIsIndexStatsLoading(false)
    }
  }, [statsResponse])

  const loadPamConfig = useCallback(async () => {
    setIsConfigLoading(true)
    try {
      setError('')
      const config = await api<PamConfigResponse>('/api/config')
      setPamConfig(config)
      setConfigForm({
        mode: config.autoCapture.mode,
        ignoredConcepts: formatIgnoredConcepts(config.noise.ignoredConcepts),
        runtime: config.runtime,
      })
    } catch (configError) {
      setError(
        apiNotFoundMessage(configError, SETTINGS_API_UNAVAILABLE_MESSAGE) ??
          errorMessage(configError)
      )
    } finally {
      setIsConfigLoading(false)
    }
  }, [])

  const loadPackageVersions = useCallback(async () => {
    setIsPackageVersionsLoading(true)
    try {
      setPackageVersionsError('')
      setPackageVersions(await api<PackageVersionsResponse>('/api/package-versions'))
    } catch (versionsError) {
      setPackageVersions(null)
      setPackageVersionsError(errorMessage(versionsError))
    } finally {
      setIsPackageVersionsLoading(false)
    }
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadDashboard()
    }, 180)

    return () => window.clearTimeout(timeout)
  }, [])

  useEffect(() => {
    if (!hasLoadedRef.current) return

    const timeout = window.setTimeout(() => {
      void loadMemoryInventory()
    }, 120)

    return () => window.clearTimeout(timeout)
  }, [loadMemoryInventory])

  useEffect(() => {
    void loadPackageVersions()
  }, [loadPackageVersions])

  useEffect(() => {
    if (error) {
      toast.error(error)
      return
    }
    if (notice) {
      toast.success(notice)
    }
  }, [error, notice])

  useEffect(() => {
    void loadIndexStats()
  }, [lastUpdated, loadIndexStats])

  useEffect(() => {
    if (activeView !== 'settings') return
    void loadPamConfig()
  }, [activeView, loadPamConfig])

  useEffect(() => {
    const handlePopState = () => {
      setActiveView(pathToView(window.location.pathname))
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const rows = useMemo(
    () => (memoriesResponse?.memories ?? []).map(toMemoryTableRow),
    [memoriesResponse]
  )

  const pageCopy = getPageCopy(activeView)

  const handleStatusChange = useCallback((nextStatus: MemoryStatusFilter) => {
    setStatus(nextStatus)
  }, [])

  const handleViewChange = useCallback(
    (view: RuntimeView, event?: MouseEvent<HTMLAnchorElement>) => {
      event?.preventDefault()
      const nextPath = viewToPath(view)
      if (window.location.pathname !== nextPath) {
        window.history.pushState(null, '', nextPath)
      }
      setActiveView(view)
    },
    []
  )

  const handleMemoryAction = useCallback(
    async (id: string, action: MemoryRowAction) => {
      setNotice('')
      setError('')
      try {
        await api(`/api/memories/${encodeURIComponent(id)}/${action}`, { method: 'POST' })
        setNotice(memoryActionLabel(action))
        await loadDashboard()
      } catch (actionError) {
        setError(errorMessage(actionError))
      }
    },
    [loadDashboard]
  )

  const handleCreate = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setCreateError('')

      if (!createForm.content.trim()) {
        setCreateError('Content is required.')
        return
      }

      setIsCreating(true)
      try {
        const response = await api<{ memory: Memory }>('/api/memories', {
          method: 'POST',
          body: JSON.stringify({
            type: createForm.type,
            scope: PROJECT_STORE,
            status: 'active' satisfies MemoryStatus,
            source: 'ui-dashboard',
            title: createForm.title.trim() || undefined,
            content: createForm.content.trim(),
            tags: parseTags(createForm.tags),
          }),
        })
        setCreateForm(defaultCreateForm)
        setIsCreateOpen(false)
        setNotice(`Created ${response.memory.metadata.id}.`)
        await loadDashboard()
      } catch (createFailure) {
        setCreateError(errorMessage(createFailure))
      } finally {
        setIsCreating(false)
      }
    },
    [createForm, loadDashboard]
  )

  const handleConfigSave = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setIsConfigSaving(true)
      setNotice('')
      setError('')
      try {
        const updated = await api<PamConfigResponse>('/api/config', {
          method: 'PATCH',
          body: JSON.stringify({
            autoCapture: {
              mode: configForm.mode,
            },
            noise: {
              ignoredConcepts: parseIgnoredConcepts(configForm.ignoredConcepts),
            },
            runtime: configForm.runtime,
          }),
        })
        setPamConfig(updated)
        setConfigForm({
          mode: updated.autoCapture.mode,
          ignoredConcepts: formatIgnoredConcepts(updated.noise.ignoredConcepts),
          runtime: updated.runtime,
        })
        setNotice('PAM settings saved.')
      } catch (saveError) {
        setError(
          apiNotFoundMessage(saveError, SETTINGS_API_UNAVAILABLE_MESSAGE) ?? errorMessage(saveError)
        )
      } finally {
        setIsConfigSaving(false)
      }
    },
    [configForm]
  )

  const handleRebuildIndex = useCallback(async () => {
    setIsReindexing(true)
    setReindexMessage('')
    setNotice('')
    setError('')
    try {
      const result = await api<{ indexed: number }>('/api/index/rebuild', { method: 'POST' })
      const message = `Rebuilt SQLite index with ${result.indexed.toLocaleString()} memories.`
      setReindexMessage(message)
      await loadDashboard()
      await loadIndexStats()
    } catch (reindexError) {
      const message =
        apiNotFoundMessage(reindexError, REBUILD_INDEX_API_UNAVAILABLE_MESSAGE) ??
        errorMessage(reindexError)
      setReindexMessage(message)
    } finally {
      setIsReindexing(false)
    }
  }, [loadDashboard, loadIndexStats])

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar
          activeView={activeView}
          contextPreview={contextPreview}
          indexStats={indexStats}
          isContextLoading={isLoading}
          isIndexStatsLoading={isLoading || isIndexStatsLoading}
          packageVersions={packageVersions}
          isPackageVersionsLoading={isPackageVersionsLoading}
          packageVersionsError={packageVersionsError}
          onViewChange={handleViewChange}
        />
        <SidebarInset>
          <SiteHeader
            isRefreshing={isRefreshing}
            lastUpdated={lastUpdated}
            projectName={statsResponse?.project.name ?? 'MemoryHub'}
            onCreate={() => setIsCreateOpen(true)}
            onRefresh={() => void loadDashboard()}
          />
          <main className="@container/main flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-normal">{pageCopy.title}</h1>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  {pageCopy.description}
                </p>
              </div>
            </div>
            {activeView === 'dashboard' && (
              <>
                <SectionCards
                  isLoading={isLoading}
                  statsResponse={statsResponse}
                  contextPreview={contextPreview}
                  conceptGraph={conceptGraph}
                />

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                  <ChartAreaInteractive memories={rows} isLoading={isLoading} />
                  <ContextPanel
                    contextPreview={contextPreview}
                    conceptGraph={conceptGraph}
                    knowledgeGraph={knowledgeGraph}
                    isLoading={isLoading}
                    showContextDetails={false}
                  />
                </div>
              </>
            )}

            {activeView === 'llm-context' && (
              <ContextPanel
                contextPreview={contextPreview}
                conceptGraph={conceptGraph}
                knowledgeGraph={knowledgeGraph}
                isLoading={isLoading}
                showContextDetails
                showCopyAction
              />
            )}

            {activeView === 'sqlite-index' && (
              <>
                <SQLiteIndexCards
                  indexStats={indexStats}
                  isLoading={isLoading || isIndexStatsLoading}
                />
                <DataTable
                  data={rows}
                  isLoading={isLoading || isMemoriesLoading}
                  status={status}
                  totalMatching={memoriesResponse?.totalMatching ?? 0}
                  onAction={handleMemoryAction}
                  onStatusChange={handleStatusChange}
                />
              </>
            )}

            {activeView === 'settings' && (
              <SettingsPage
                config={pamConfig}
                form={configForm}
                isLoading={isConfigLoading}
                isReindexing={isReindexing}
                reindexMessage={reindexMessage}
                isSaving={isConfigSaving}
                onFormChange={setConfigForm}
                onRebuildIndex={handleRebuildIndex}
                onSubmit={handleConfigSave}
              />
            )}
          </main>
        </SidebarInset>

        <CreateMemorySheet
          createError={createError}
          form={createForm}
          isCreating={isCreating}
          open={isCreateOpen}
          onChange={setCreateForm}
          onOpenChange={setIsCreateOpen}
          onSubmit={handleCreate}
        />

        <Toaster position="bottom-right" richColors closeButton />
      </SidebarProvider>
    </TooltipProvider>
  )
}

function ContextPanel({
  contextPreview,
  conceptGraph,
  knowledgeGraph,
  isLoading,
  showContextDetails = true,
  showCopyAction = false,
}: {
  contextPreview: ContextPreview | null
  conceptGraph: ApiConceptGraph | null
  knowledgeGraph: KnowledgeGraphResponse | null
  isLoading: boolean
  showContextDetails?: boolean
  showCopyAction?: boolean
}) {
  const [hasCopied, setHasCopied] = useState(false)
  const canCopyContext = Boolean(
    !isLoading && contextPreview?.content && contextPreview.memoryCount > 0
  )

  useEffect(() => {
    if (!hasCopied) return

    const timeout = window.setTimeout(() => setHasCopied(false), 1800)
    return () => window.clearTimeout(timeout)
  }, [hasCopied])

  const handleCopyContext = useCallback(async () => {
    if (!contextPreview?.content || contextPreview.memoryCount === 0) return

    try {
      await copyTextToClipboard(contextPreview.content)
      setHasCopied(true)
      toast.success('LLM context copied.')
    } catch (copyError) {
      toast.error(errorMessage(copyError))
    }
  }, [contextPreview])

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>LLM context</h2>
          </CardTitle>
          <CardDescription>
            {isLoading && !contextPreview ? (
              <Skeleton className="h-4 w-64 max-w-full" />
            ) : (
              formatContextPreviewSummary(contextPreview)
            )}
          </CardDescription>
          <CardAction>
            {showCopyAction ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!canCopyContext}
                      aria-label="Copy LLM context to clipboard"
                      onClick={() => void handleCopyContext()}
                    >
                      {hasCopied ? (
                        <IconClipboardCheck data-icon="inline-start" />
                      ) : (
                        <IconClipboardCopy data-icon="inline-start" />
                      )}
                      {hasCopied ? 'Copied' : 'Copy context'}
                    </Button>
                  }
                />
                <TooltipContent>
                  {canCopyContext ? 'Copy the generated LLM context' : 'No LLM context to copy'}
                </TooltipContent>
              </Tooltip>
            ) : (
              <IconBrain className="size-4 text-muted-foreground" />
            )}
          </CardAction>
        </CardHeader>
        {showContextDetails && (
          <CardContent>
            {isLoading ? (
              <LoadingTextSkeleton />
            ) : contextPreview?.content && contextPreview.memoryCount > 0 ? (
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
                {contextPreview.content}
              </pre>
            ) : (
              <div className={EMPTY_STATE_CLASS}>
                No context selected yet. Add active memories to populate the prompt input.
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Concepts</h2>
          </CardTitle>
          <CardDescription>
            {isLoading && !conceptGraph ? (
              <Skeleton className="h-4 w-64 max-w-full" />
            ) : (
              formatConceptGraphSummary(conceptGraph, contextPreview)
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingTextSkeleton />
          ) : (conceptGraph?.concepts.length ?? 0) > 0 ? (
            <div className="flex flex-wrap gap-2">
              {(conceptGraph?.concepts ?? []).slice(0, 10).map((concept) => (
                <Badge key={concept.id} variant="secondary" className="max-w-full truncate">
                  {concept.title}
                  <span className="text-muted-foreground">{concept.occurrences}</span>
                </Badge>
              ))}
            </div>
          ) : !isLoading ? (
            <div className={EMPTY_STATE_CLASS}>No strong concepts yet.</div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Knowledge graph</h2>
          </CardTitle>
          <CardDescription>Entity and relation extraction from memory evidence</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <Metric
              label="Entities"
              value={knowledgeGraph?.metrics.entity_count ?? 0}
              isLoading={isLoading}
            />
            <Metric
              label="Relations"
              value={knowledgeGraph?.metrics.relation_count ?? 0}
              isLoading={isLoading}
            />
            <Metric
              label="Coverage"
              value={`${Math.round((knowledgeGraph?.metrics.evidence_coverage ?? 0) * 100)}%`}
              isLoading={isLoading}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function LoadingTextSkeleton() {
  return (
    <div className="grid gap-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-10/12" />
      <Skeleton className="h-4 w-7/12" />
    </div>
  )
}

function getPageCopy(view: RuntimeView) {
  if (view === 'settings') {
    return {
      title: 'Settings',
      description: 'Configure local PAM capture, context filtering, and index maintenance.',
    }
  }

  if (view === 'llm-context') {
    return {
      title: 'LLM context',
      description:
        'Ranked prompt-source preview, concepts, and relation evidence from active project memory.',
    }
  }

  if (view === 'sqlite-index') {
    return {
      title: 'SQLite index',
      description: 'Indexed local memories and status counts for this workspace.',
    }
  }

  return {
    title: 'PAM Dashboard',
    description: 'Local memory, compiled context, and indexed evidence for this workspace.',
  }
}

function Metric({
  label,
  value,
  isLoading = false,
}: {
  label: string
  value: number | string
  isLoading?: boolean
}) {
  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      {isLoading ? (
        <Skeleton className="mt-1 h-5 w-10" />
      ) : (
        <div className="mt-1 font-medium tabular-nums">{value}</div>
      )}
    </div>
  )
}

function formatContextPreviewSummary(contextPreview: ContextPreview | null): string {
  if (!contextPreview) return 'Ranked subset selected from active project memory'

  const selectedSources = formatCount(contextPreview.memoryCount, 'selected prompt source')
  const activeMemories = formatCount(
    contextPreview.activeMemoryCount,
    'active memory',
    'active memories'
  )
  const tokenEstimate = contextPreview.tokenEstimate.toLocaleString()

  return `${selectedSources} from ${activeMemories}, about ${tokenEstimate} tokens`
}

function formatConceptGraphSummary(
  conceptGraph: ApiConceptGraph | null,
  contextPreview: ContextPreview | null
): string {
  const concepts = formatCount(conceptGraph?.concepts.length ?? 0, 'concept')
  const links = formatCount(conceptGraph?.edges.length ?? 0, 'link')
  const selectedSources = formatCount(
    contextPreview?.memoryCount ?? conceptGraph?.totalMemories ?? 0,
    'selected source'
  )

  return `${concepts} and ${links} from ${selectedSources}`
}

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`
}

function SettingsPage({
  config,
  form,
  isLoading,
  isReindexing,
  reindexMessage,
  isSaving,
  onFormChange,
  onRebuildIndex,
  onSubmit,
}: {
  config: PamConfigResponse | null
  form: ConfigForm
  isLoading: boolean
  isReindexing: boolean
  reindexMessage: string
  isSaving: boolean
  onFormChange: (form: ConfigForm) => void
  onRebuildIndex: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <form onSubmit={onSubmit} className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Capture</h2>
            </CardTitle>
            <CardDescription className="text-sm">
              Default behavior for new agent exchanges and checkpoints.
            </CardDescription>
            <CardAction>
              <IconSettings className="size-4 text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="capture-mode">Capture mode</Label>
              <Select
                value={form.mode}
                onValueChange={(value) => onFormChange({ ...form, mode: value as AutoCaptureMode })}
              >
                <SelectTrigger id="capture-mode" className="w-full" disabled={isLoading}>
                  <span>{captureModeCopy[form.mode].label}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {Object.entries(captureModeCopy).map(([value, copy]) => (
                      <SelectItem key={value} value={value}>
                        {copy.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ignored-concepts">Ignored concepts</Label>
              <Textarea
                id="ignored-concepts"
                value={form.ignoredConcepts}
                disabled={isLoading}
                onChange={(event) => onFormChange({ ...form, ignoredConcepts: event.target.value })}
                placeholder="concept; another concept; internal term"
                className="min-h-32"
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isLoading || isSaving} className="text-sm">
                Save settings
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Maintenance</h2>
            </CardTitle>
            <CardDescription className="text-sm">
              Local index operations for the current workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-sm text-muted-foreground">
              Rebuild the SQLite index from Markdown memories.
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <Button
                type="button"
                variant="outline"
                disabled={isReindexing}
                className="text-sm"
                onClick={onRebuildIndex}
              >
                {isReindexing ? <IconLoader2 className="animate-spin" /> : <IconRefresh />}
                Rebuild index
              </Button>
              {reindexMessage ? (
                <div
                  className={cn(
                    'text-xs',
                    reindexMessage.startsWith('Rebuilt ')
                      ? 'text-muted-foreground'
                      : 'text-destructive'
                  )}
                >
                  {reindexMessage}
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </form>

      <div className="grid content-start gap-4">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Workspace</h2>
            </CardTitle>
            <CardDescription>{config?.project.name ?? 'Local project'}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <PathRow label="Project" value={config?.project.path} />
            <PathRow label="Memory store" value={config?.project.memoryPath} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Runtime</h2>
            </CardTitle>
            <CardDescription>Project runtime behavior for this server process.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <RuntimeRow
              label="Auto vectorize"
              enabled={form.runtime.autoVectorize}
              disabled={isLoading}
              tooltip="Automatically creates semantic vectors when memories are created or updated. Disable it to avoid embedding work during bulk imports or debugging."
              onToggle={() =>
                onFormChange({
                  ...form,
                  runtime: {
                    ...form.runtime,
                    autoVectorize: !form.runtime.autoVectorize,
                  },
                })
              }
            />
            <RuntimeRow
              label="Theme rebuild deferred"
              enabled={form.runtime.deferThemeRebuild}
              disabled={isLoading}
              tooltip="Skips immediate compiled theme rebuilds during writes. Enable it for bulk changes, then rebuild the index when finished."
              onToggle={() =>
                onFormChange({
                  ...form,
                  runtime: {
                    ...form.runtime,
                    deferThemeRebuild: !form.runtime.deferThemeRebuild,
                  },
                })
              }
            />
            <RuntimeRow
              label="Debug logging"
              enabled={form.runtime.debug}
              disabled={isLoading}
              tooltip="Writes detailed PAM operation events to the project debug log. Keep it off unless you are diagnosing behavior."
              onToggle={() =>
                onFormChange({
                  ...form,
                  runtime: {
                    ...form.runtime,
                    debug: !form.runtime.debug,
                  },
                })
              }
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function PathRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <code className="break-all rounded-md bg-muted/40 px-2 py-1 text-xs">
        {value ?? 'Unavailable'}
      </code>
    </div>
  )
}

function RuntimeRow({
  label,
  enabled,
  disabled,
  tooltip,
  onToggle,
}: {
  label: string
  enabled: boolean
  disabled: boolean
  tooltip: string
  onToggle: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate">{label}</span>
        <Tooltip>
          <TooltipTrigger
            aria-label={`${label} details`}
            className="inline-flex size-4 shrink-0 cursor-help items-center justify-center text-muted-foreground"
          >
            <IconInfoCircle className="size-4" />
          </TooltipTrigger>
          <TooltipContent side="left">{tooltip}</TooltipContent>
        </Tooltip>
      </div>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={enabled}
        disabled={disabled}
        onClick={onToggle}
        className={cn(
          'inline-flex h-6 w-11 shrink-0 items-center rounded-full border px-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          enabled ? 'border-primary bg-primary' : 'border-border bg-muted'
        )}
      >
        <span
          className={cn(
            'size-4 rounded-full bg-background shadow-sm transition-transform',
            enabled ? 'translate-x-5' : 'translate-x-0'
          )}
        />
      </button>
    </div>
  )
}

function CreateMemorySheet({
  createError,
  form,
  isCreating,
  open,
  onChange,
  onOpenChange,
  onSubmit,
}: {
  createError: string
  form: typeof defaultCreateForm
  isCreating: boolean
  open: boolean
  onChange: (form: typeof defaultCreateForm) => void
  onOpenChange: (open: boolean) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <form className="flex h-full flex-col" onSubmit={onSubmit}>
          <SheetHeader>
            <SheetTitle>New memory</SheetTitle>
            <SheetDescription>Create an active project memory in the local store.</SheetDescription>
          </SheetHeader>

          <div className="grid flex-1 content-start gap-4 overflow-auto px-4">
            <div className="grid gap-2">
              <Label htmlFor="memory-title">Title</Label>
              <Input
                id="memory-title"
                value={form.title}
                onChange={(event) => onChange({ ...form, title: event.target.value })}
                placeholder="Short display label"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="memory-type">Type</Label>
              <Select
                value={form.type}
                onValueChange={(value) => onChange({ ...form, type: value as MemoryType })}
              >
                <SelectTrigger id="memory-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {memoryTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="memory-tags">Tags</Label>
              <Input
                id="memory-tags"
                value={form.tags}
                onChange={(event) => onChange({ ...form, tags: event.target.value })}
                placeholder="ui, context, decision"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="memory-content">Content</Label>
              <Textarea
                id="memory-content"
                required
                value={form.content}
                onChange={(event) => onChange({ ...form, content: event.target.value })}
                placeholder="Write a concise, durable memory..."
                className="min-h-40"
              />
            </div>

            {createError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {createError}
              </div>
            )}
          </div>

          <SheetFooter>
            <Button type="submit" disabled={isCreating}>
              {isCreating ? <IconLoader2 className="animate-spin" /> : <IconPlus />}
              Create memory
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

function toMemoryTableRow(memory: Memory | SearchResult): MemoryTableRow {
  const metadata = getMemoryMetadata(memory)

  return {
    id: metadata.id,
    title: metadata.id,
    type: metadata.type,
    status: metadata.status,
    theme: metadata.theme,
    source: metadata.source,
    tags: metadata.tags,
    content: memory.content,
    createdAt: metadata.created_at,
    updatedAt: metadata.updated_at,
    salience: metadata.salience,
  }
}

function buildBasicIndexDiagnostics(
  statsResponse: StatsResponse | null,
  memoriesResponse: MemoriesResponse | null
): IndexDiagnosticsResponse {
  const memoryCount =
    statsResponse?.rawTotalMemories ??
    memoriesResponse?.rawTotalMemories ??
    memoriesResponse?.totalMatching ??
    0
  const activeCount = statsResponse?.rawStats.active ?? 0
  const latestMemoryUpdatedAt =
    memoriesResponse?.memories
      .map((memory) => getMemoryMetadata(memory).updated_at)
      .sort()
      .at(-1) ?? null

  return {
    database: {
      sizeBytes: 0,
      files: [],
    },
    sqlite: {
      memoryRows: memoryCount,
      tagRows: 0,
      chunkRows: 0,
      ftsRows: memoryCount,
      latestMemoryUpdatedAt,
    },
    markdown: {
      memoryFiles: memoryCount,
    },
    vectors: {
      candidates: activeCount,
      indexed: 0,
      missing: 0,
      coverage: 0,
      latestUpdatedAt: null,
    },
    health: {
      status: 'unknown',
      missingInIndex: 0,
      orphanedInIndex: 0,
      missingVectors: 0,
    },
  }
}

function pathToView(pathname: string): RuntimeView {
  if (pathname === '/llm-context') return 'llm-context'
  if (pathname === '/sqlite-index') return 'sqlite-index'
  if (pathname === '/settings') return 'settings'
  return 'dashboard'
}

function getMemoryMetadata(memory: Memory | SearchResult): MemoryMetadata {
  return 'metadata' in memory ? memory.metadata : memory
}

function formatIgnoredConcepts(concepts: string[]): string {
  return concepts.join('; ')
}

function parseIgnoredConcepts(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[;\r\n]+/)
        .map((concept) => concept.trim())
        .filter(Boolean)
    )
  )
}

function parseTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
}

function memoryActionLabel(action: MemoryRowAction): string {
  if (action === 'archive') return 'Memory archived.'
  if (action === 'restore') return 'Memory restored.'
  if (action === 'approve') return 'Memory approved.'
  if (action === 'mark-noise') return 'Memory marked as noise.'
  return 'Memory rejected.'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected UI error.'
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Fall back to the older browser API below.
    }
  }

  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.setAttribute('readonly', '')
  textArea.style.position = 'fixed'
  textArea.style.left = '-9999px'
  textArea.style.opacity = '0'
  document.body.appendChild(textArea)
  textArea.focus()
  textArea.select()

  try {
    const copied = document.execCommand('copy')
    if (!copied) throw new Error('Unable to copy LLM context to clipboard.')
  } finally {
    textArea.remove()
  }
}

function apiNotFoundMessage(error: unknown, message: string): string | null {
  return error instanceof ApiError && error.status === 404 ? message : null
}

createRoot(document.getElementById('app')!).render(<App />)
