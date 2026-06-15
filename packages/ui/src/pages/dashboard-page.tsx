import type { ReactNode } from 'react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface Stats {
  total: number
  active: number
}

interface StatsResponse {
  project: {
    name: string
    path: string
    memoryPath: string
  }
  stats: Stats
}

interface ApiConceptGraph {
  totalMemories: number
  concepts: unknown[]
}

export function DashboardPage({
  conceptGraph,
  memoryTotal,
  statsResponse,
}: {
  conceptGraph: ApiConceptGraph | null
  memoryTotal: number
  statsResponse: StatsResponse | null
}) {
  const stats = statsResponse?.stats
  const project = statsResponse?.project

  return (
    <section className="grid gap-4">
      <Panel title="Project overview" eyebrow="Dashboard">
        <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-4 max-lg:grid-cols-1">
          <div className="rounded-md border border-border bg-background/45 p-4">
            <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Current project
            </p>
            <h2 className="mt-3 truncate text-3xl font-semibold tracking-tight text-foreground">
              {project?.name || 'Unknown project'}
            </h2>
            <p className="mt-3 break-all text-sm leading-6 text-muted-foreground">
              {project?.path || 'Project path unavailable'}
            </p>
          </div>
          <div className="rounded-md border border-border bg-muted/25 p-4">
            <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Memory store
            </p>
            <p className="mt-3 break-all text-sm leading-6 text-foreground">
              {project?.memoryPath || '.ai-memory'}
            </p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Project-local store used by CLI, MCP, API, and this console.
            </p>
          </div>
        </div>
      </Panel>

      <section className="grid grid-cols-[0.9fr_0.9fr_0.9fr_1.15fr] gap-3 max-xl:grid-cols-2 max-md:grid-cols-1">
        <Hint label="Active memories that would be included in the LLM context window right now.">
          <div>
            <MetricPanel
              tone="primary"
              label={nounLabel(stats?.active ?? 0, 'LLM candidate', 'LLM candidates')}
              value={stats?.active ?? '-'}
              detail={countLabel(
                stats?.total ?? 0,
                'visible project memory',
                'visible project memories'
              )}
            />
          </div>
        </Hint>
        <Hint label="Tags and keywords that recur across the current LLM context. They are the backbone of the concepts map.">
          <div>
            <MetricPanel
              tone="secondary"
              label={nounLabel(
                conceptGraph?.concepts.length ?? 0,
                'Context concept',
                'Context concepts'
              )}
              value={conceptGraph?.concepts.length ?? '-'}
              detail={`from ${countLabel(
                conceptGraph?.totalMemories ?? 0,
                'context memory',
                'context memories'
              )}`}
            />
          </div>
        </Hint>
        <Hint label="Memories matching the current search query and status filter - what you would inspect or edit.">
          <div>
            <MetricPanel
              tone="muted"
              label="Evidence set"
              value={memoryTotal}
              detail="current query and status"
            />
          </div>
        </Hint>
        <div aria-hidden="true" className="rounded-md border border-border bg-card" />
      </section>
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
    primary: 'bg-primary text-primary-foreground',
    secondary: 'bg-secondary text-secondary-foreground',
    muted: 'bg-muted text-foreground',
  }

  return (
    <div className={cn('rounded-md p-4', classes[tone])}>
      <p className="text-sm font-bold uppercase tracking-widest opacity-65">{label}</p>
      <strong className="mt-2 block text-4xl font-semibold tracking-tight">{value}</strong>
      <p className="mt-2 text-sm opacity-75">{detail}</p>
    </div>
  )
}

function Panel({
  children,
  eyebrow,
  title,
}: {
  children: ReactNode
  eyebrow: string
  title: string
}) {
  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function Hint({ children, label }: { children: ReactNode; label: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-xs text-left leading-5">{label}</TooltipContent>
    </Tooltip>
  )
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function nounLabel(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural
}
