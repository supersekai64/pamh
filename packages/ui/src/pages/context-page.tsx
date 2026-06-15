import { FileText } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface ContextSource {
  id: string
  created_at: string
  updated_at: string
}

interface ContextExclusion {
  id: string
  type: string
  reason: string
}

interface ContextPreview {
  content: string
  tokenEstimate: number
  memoryCount: number
  sources: ContextSource[]
  generatedAt: string
  exclusions: ContextExclusion[]
}

export function ContextPage({
  contextPreview,
  focusedConcept,
}: {
  contextPreview: ContextPreview | null
  focusedConcept: string
}) {
  const copyContext = async () => {
    if (!contextPreview?.content) return
    await navigator.clipboard.writeText(contextPreview.content)
  }
  const sources = contextPreview?.sources ?? []
  const createdDates = sources
    .map((source) => source.created_at)
    .filter(Boolean)
    .sort()
  const updatedDates = sources
    .map((source) => source.updated_at)
    .filter(Boolean)
    .sort()
  const firstCreated = createdDates[0]
  const lastUpdated = updatedDates.at(-1)

  return (
    <section className="grid grid-cols-[minmax(26rem,1.2fr)_minmax(18rem,0.6fr)] gap-4 max-xl:grid-cols-1">
      <Panel
        eyebrow={focusedConcept ? 'Focused LLM context' : 'General LLM context'}
        title="What the LLM would read"
        toolbar={
          <Hint label="Copy the LLM context block to the clipboard.">
            <Button size="sm" variant="outline" onClick={copyContext}>
              <FileText />
              Copy
            </Button>
          </Hint>
        }
      >
        <pre className="h-184 overflow-auto rounded-md border border-border bg-background/60 p-4 text-sm leading-6 text-foreground">
          {contextPreview?.content || 'No active project memory available for context.'}
        </pre>
      </Panel>
      <Panel title="Context metadata" eyebrow="LLM context">
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            <MetaTile
              label={nounLabel(contextPreview?.tokenEstimate ?? 0, 'Token', 'Tokens')}
              value={String(contextPreview?.tokenEstimate ?? 0)}
            />
            <MetaTile
              label={nounLabel(contextPreview?.memoryCount ?? 0, 'Source', 'Sources')}
              value={String(contextPreview?.memoryCount ?? 0)}
            />
            <MetaTile
              label="Generated"
              value={contextPreview?.generatedAt ? formatDate(contextPreview.generatedAt) : '-'}
            />
            <MetaTile label="First created" value={firstCreated ? formatDate(firstCreated) : '-'} />
            <MetaTile label="Last updated" value={lastUpdated ? formatDate(lastUpdated) : '-'} />
            <MetaTile
              label={nounLabel(contextPreview?.exclusions.length ?? 0, 'Exclusion', 'Exclusions')}
              value={String(contextPreview?.exclusions.length ?? 0)}
            />
          </div>
          <div className="rounded-md border border-border bg-background/50 p-3">
            <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Focus
            </p>
            <p className="mt-2 text-sm leading-6 text-foreground">
              {focusedConcept || 'General project memory'}
            </p>
          </div>
        </div>
      </Panel>
    </section>
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

function MetaTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/35 p-3">
      <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-base font-medium text-foreground">{value}</p>
    </div>
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

function formatDate(value: string): string {
  if (!value) return '-'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
    new Date(value)
  )
}

function nounLabel(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural
}
