import {
  BrainCircuit,
  CircleAlert,
  FileText,
  GitBranch,
  LayoutDashboard,
  ListFilter,
  Shield,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getStatusTone } from '@/lib/status-tone'
import { cn } from '@/lib/utils'

type WorkspaceView = 'dashboard' | 'map' | 'evidence' | 'context' | 'governance' | 'knowledge'

interface Stats {
  active: number
  proposed: number
  archived: number
  deleted: number
  noise: number
}

const navItems: Array<{ icon: LucideIcon; label: string; view: WorkspaceView }> = [
  { icon: LayoutDashboard, label: 'Dashboard', view: 'dashboard' },
  { icon: BrainCircuit, label: 'Concepts map', view: 'map' },
  { icon: GitBranch, label: 'Knowledge graph', view: 'knowledge' },
  { icon: ListFilter, label: 'Evidence', view: 'evidence' },
  { icon: FileText, label: 'LLM context', view: 'context' },
  { icon: Shield, label: 'Governance', view: 'governance' },
]

const navHints: Record<WorkspaceView, string> = {
  dashboard:
    'Project overview with store identity, memory counts, current context concepts, and evidence set size.',
  map: 'Force-directed map of the strongest concepts (tags + keywords) extracted from the current LLM context. Click a node to focus its evidence.',
  knowledge:
    'Typed graph of entities and relations inferred across memories (decisions, components, people, etc.) with evidence links.',
  evidence:
    'Filterable list of individual memories that back the current view. This is where you read, edit, approve, archive or delete records.',
  context:
    'Exact text the LLM would receive as project memory right now, with token estimate and the contributing sources.',
  governance:
    'Hygiene controls: noise visibility, distillation proposals, and assisted recommendations to keep the memory store clean.',
}

const statusHints: Record<string, string> = {
  Active: 'Approved, durable memories that are loaded into the LLM context.',
  Proposed:
    'Memories captured automatically or by an agent. They need your approval before becoming Active.',
  Archived:
    'Memories kept for history but excluded from the LLM context. Can be restored at any time.',
  Noise: 'Marked irrelevant. Hidden from the working map and the LLM context, but kept for audit.',
  Deleted: 'Soft-deleted memories. Restorable until you run a physical delete.',
}

export function Sidebar({
  onReset,
  onStatusSelect,
  onViewChange,
  selectedStatus,
  stats,
  view,
}: {
  onReset: () => void
  onStatusSelect: (status: string) => void
  onViewChange: (view: WorkspaceView) => void
  selectedStatus: string
  stats: Stats | null
  view: WorkspaceView
}) {
  return (
    <aside className="sticky top-3 flex h-[calc(100vh-1.5rem)] flex-col gap-4 rounded-md bg-sidebar p-4 shadow-sm max-lg:static max-lg:h-auto">
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
          <Hint key={itemView} side="right" label={navHints[itemView]}>
            <button
              className={cn(
                'flex h-9 items-center gap-2 rounded-sm px-3 text-left text-muted-foreground transition hover:bg-muted/50 hover:text-foreground',
                view === itemView && 'bg-primary/10 text-primary'
              )}
              type="button"
              onClick={() => onViewChange(itemView)}
            >
              <NavIcon className="size-4" />
              {label}
            </button>
          </Hint>
        ))}
      </nav>

      <Separator className="bg-muted" />

      <div className="grid gap-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Status
        </p>
        {[
          ['active', 'Active', stats?.active ?? 0],
          ['proposed', 'Proposed', stats?.proposed ?? 0],
          ['archived', 'Archived', stats?.archived ?? 0],
          ['noise', 'Noise', stats?.noise ?? 0],
          ['deleted', 'Deleted', stats?.deleted ?? 0],
        ].map(([statusKey, label, value]) => (
          <Hint
            key={String(label)}
            side="right"
            label={`${statusHints[String(label)]} Click to open Evidence filtered to ${String(label)} memories.`}
          >
            <button
              className={cn(
                'flex items-center justify-between rounded-md border border-transparent bg-muted/35 px-3 py-2 text-left text-sm transition hover:border-border hover:bg-muted/55 hover:text-foreground',
                view === 'evidence' &&
                  selectedStatus === statusKey &&
                  'border-primary/25 bg-primary/10 text-foreground',
                statusKey === 'proposed' &&
                  Number(value) > 0 &&
                  'border-sky-400/35 bg-sky-400/10 text-sky-100 shadow-[inset_0_0_0_1px_rgb(56_189_248_/_0.12)] hover:border-sky-300/50 hover:bg-sky-400/15'
              )}
              type="button"
              onClick={() => onStatusSelect(String(statusKey))}
            >
              <span className="flex min-w-0 items-center gap-2">
                {statusKey === 'proposed' && Number(value) > 0 ? (
                  <CircleAlert className="size-3.5 shrink-0 text-sky-200" />
                ) : null}
                <span
                  className={cn(
                    'truncate text-muted-foreground',
                    statusKey === 'proposed' && Number(value) > 0 && 'font-medium text-sky-50'
                  )}
                >
                  {label}
                </span>
              </span>
              <StatusCount status={String(statusKey)} value={Number(value)} />
            </button>
          </Hint>
        ))}
      </div>

      <Hint
        side="right"
        label="DEBUG - Deletes the entire .ai-memory directory of the current project. Irreversible. To be removed before release."
      >
        <button
          className="flex items-center justify-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive transition hover:bg-destructive/20"
          type="button"
          onClick={onReset}
        >
          <Trash2 className="size-4" />
          Reset project memory
          <Badge className="ml-1 bg-destructive/20 text-destructive hover:bg-destructive/20">
            debug
          </Badge>
        </button>
      </Hint>
    </aside>
  )
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

function StatusCount({ status, value }: { status: string; value: number }) {
  const tone = getStatusTone(status)
  return (
    <strong className={cn('rounded-full border px-2 py-0.5 text-xs tabular-nums', tone.badge)}>
      {value}
    </strong>
  )
}
