import { Circle, Search, X } from 'lucide-react'
import type { ReactNode } from 'react'

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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getStatusTone } from '@/lib/status-tone'
import { cn } from '@/lib/utils'

interface MemoryMetadata {
  id: string
  type: string
  status: string
  updated_at: string
  tags: string[]
}

interface Memory {
  metadata: MemoryMetadata
  content: string
}

interface SearchResult extends MemoryMetadata {
  content: string
}

interface ApiConceptNode {
  title: string
  occurrences: number
  typeCounts: Record<string, number>
}

const memoryTypes = ['decision', 'knowledge', 'mistake', 'rule', 'preference', 'session', 'task']
const memoryTypePriority = new Map(memoryTypes.map((type, index) => [type, index]))
const statuses = ['active', 'all', 'proposed', 'archived', 'deleted', 'noise']

const statusHints: Record<string, string> = {
  all: 'Show every status (active, proposed, archived, noise, deleted) in the evidence list.',
  active: 'Default view: only approved memories loaded into the LLM context.',
  proposed: 'Awaiting your approval before joining the LLM context.',
  archived: 'Excluded from the LLM context but kept for history.',
  noise: 'Marked irrelevant. Hidden from the LLM context.',
  deleted: 'Soft-deleted. Still restorable.',
}

const typeHints: Record<string, string> = {
  decision: 'A technical choice made for the project (library, pattern, schema, protocol).',
  knowledge: 'A reusable fact, constraint or gotcha about the codebase.',
  mistake: 'A lesson learned from an error or regression, used to avoid repeating it.',
  rule: 'A durable workflow requirement.',
  preference: 'A stylistic, UX, naming or architectural choice that should apply broadly.',
  session: 'A short summary of completed work.',
  task: 'Follow-up work identified but not done yet.',
}

export function EvidencePage({
  activeConcept,
  focusedConcept,
  memories,
  onClearFocus,
  onQueryChange,
  onSelect,
  onStatusChange,
  query,
  selectedId,
  status,
  totalMatching,
}: {
  activeConcept: ApiConceptNode | null
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
  return (
    <section>
      <MemoryIndex
        activeConcept={activeConcept}
        focusedConcept={focusedConcept}
        memories={memories}
        onClearFocus={onClearFocus}
        onQueryChange={onQueryChange}
        onSelect={onSelect}
        onStatusChange={onStatusChange}
        query={query}
        selectedId={selectedId}
        status={status}
        totalMatching={totalMatching}
      />
    </section>
  )
}

function MemoryIndex({
  activeConcept,
  focusedConcept,
  memories,
  onClearFocus,
  onQueryChange,
  onSelect,
  onStatusChange,
  query,
  selectedId,
  status,
  totalMatching,
}: {
  activeConcept: ApiConceptNode | null
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
        <Hint label="This view streams from the local PAMH store and updates on every change.">
          <Badge className="gap-1 bg-primary/10 text-primary hover:bg-primary/10">
            <Circle className="size-2 fill-current" />
            Live
          </Badge>
        </Hint>
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
                <SelectItem key={item} value={item} title={statusHints[item]}>
                  {item === 'all' ? 'All statuses' : item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {activeConcept ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/35 p-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium text-foreground">{activeConcept.title}</p>
              <p className="mt-1 text-muted-foreground">
                {countLabel(activeConcept.occurrences, 'evidence memory', 'evidence memories')} /{' '}
                {Object.keys(activeConcept.typeCounts).length} categories
              </p>
            </div>
            <Button variant="outline" onClick={onClearFocus}>
              <X />
              Clear focus
            </Button>
          </div>
        ) : null}

        <div className="min-h-120 overflow-x-auto">
          <div
            className="grid min-h-120 gap-3"
            style={{
              gridAutoColumns: groups.length ? 'minmax(min(22rem, 100%), 1fr)' : '1fr',
              gridAutoFlow: 'column',
            }}
          >
            {groups.length ? (
              groups.map(([group, items]) => (
                <section
                  key={group}
                  className="flex h-[calc(100vh-26rem)] min-h-112 min-w-0 flex-col overflow-hidden rounded-md border border-border bg-background/35"
                >
                  <div className="flex min-h-18 items-start justify-between gap-3 border-b border-border bg-muted/25 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {group}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm leading-4 text-muted-foreground">
                        {typeHints[group] ?? 'Project memory category.'}
                      </p>
                    </div>
                    <Badge className="shrink-0 rounded-full bg-background px-2 text-foreground hover:bg-background">
                      {items.length}
                    </Badge>
                  </div>
                  <ScrollArea className="min-h-0 flex-1">
                    <div className="grid gap-2 p-2.5">
                      {items.map((memory) => (
                        <MemoryCard
                          key={getMetadata(memory).id}
                          focusedConcept={focusedConcept}
                          memory={memory}
                          selected={getMetadata(memory).id === selectedId}
                          onSelect={onSelect}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                </section>
              ))
            ) : (
              <div className="grid min-h-104 place-items-center rounded-md border border-dashed border-border bg-muted/25 p-6 text-center">
                <p className="text-sm text-muted-foreground">No memory matches this view.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Panel>
  )
}

function MemoryCard({
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
  const visibleTags = metadata.tags.slice(0, 4)
  const hiddenTagCount = metadata.tags.length - visibleTags.length

  return (
    <button
      className={cn(
        'grid min-h-34 gap-2 rounded-sm border border-border bg-card/70 p-3 text-left shadow-sm transition hover:border-primary/40 hover:bg-muted/45',
        selected && 'border-primary bg-primary/10 shadow-none'
      )}
      type="button"
      onClick={() => onSelect(metadata.id)}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="line-clamp-2 font-medium leading-5 text-foreground">{title}</span>
          <span className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{formatDate(metadata.updated_at)}</span>
            {focusedConcept ? <span>matches {focusedConcept}</span> : null}
          </span>
        </span>
        <StatusBadge status={metadata.status} />
      </span>
      <span className="line-clamp-3 text-sm leading-5 text-muted-foreground">{memory.content}</span>
      <span className="flex flex-wrap gap-1.5">
        {visibleTags.map((tag) => (
          <Badge key={tag} className="bg-muted/70 text-foreground hover:bg-muted/70">
            {tag}
          </Badge>
        ))}
        {hiddenTagCount > 0 ? (
          <Badge className="bg-muted/45 text-muted-foreground hover:bg-muted/45">
            +{hiddenTagCount}
          </Badge>
        ) : null}
      </span>
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
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">{title}</h2>
        </div>
        {toolbar ? <div className="flex shrink-0 gap-2">{toolbar}</div> : null}
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

function StatusBadge({ status }: { status: string }) {
  const tone = getStatusTone(status)
  return <Badge className={cn('shrink-0 rounded-full border', tone.badge)}>{status}</Badge>
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
    const key = metadata.type
    groups.set(key, [...(groups.get(key) ?? []), memory])
  })
  return [...groups.entries()].sort((a, b) => {
    const priorityA = memoryTypePriority.get(a[0]) ?? Number.MAX_SAFE_INTEGER
    const priorityB = memoryTypePriority.get(b[0]) ?? Number.MAX_SAFE_INTEGER
    return priorityA - priorityB || b[1].length - a[1].length || a[0].localeCompare(b[0])
  })
}

function formatDate(value: string): string {
  if (!value) return '-'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
    new Date(value)
  )
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function getMemoryTitle(content: string): string {
  const firstLine =
    content
      .split('\n')
      .find((line) => line.trim())
      ?.trim() ?? 'Untitled memory'
  return firstLine.length > 92 ? `${firstLine.slice(0, 89)}...` : firstLine
}
