import { IconArchive, IconBrain, IconDatabase, IconGitBranch, IconInbox } from '@tabler/icons-react'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { ApiConceptGraph, ContextPreview, StatsResponse } from '@/types'

export function SectionCards({
  statsResponse,
  contextPreview,
  conceptGraph,
  isLoading,
}: {
  statsResponse: StatsResponse | null
  contextPreview: ContextPreview | null
  conceptGraph: ApiConceptGraph | null
  isLoading: boolean
}) {
  const stats = statsResponse?.stats
  const cards = [
    {
      label: 'Active memories',
      value: stats?.active ?? 0,
      badge: `${stats?.total ?? 0} indexed`,
      icon: IconDatabase,
      footer: 'Available to compose the agent context.',
    },
    {
      label: 'Selected prompt sources',
      value: contextPreview?.memoryCount ?? 0,
      badge: `${formatMetric(contextPreview?.tokenEstimate ?? 0)} tokens`,
      icon: IconBrain,
      footer: 'Ranked subset for the current prompt preview.',
    },
    {
      label: 'Proposed',
      value: stats?.proposed ?? 0,
      badge: 'review mode',
      icon: IconInbox,
      footer: 'Should stay near zero when auto mode is enabled.',
    },
    {
      label: 'Concept links',
      value: conceptGraph?.edges.length ?? 0,
      badge: `${conceptGraph?.concepts.length ?? 0} concepts`,
      icon: IconGitBranch,
      footer: 'Archived memories are kept as history.',
      secondaryIcon: IconArchive,
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon
        const SecondaryIcon = card.secondaryIcon

        return (
          <Card key={card.label} className="@container/card">
            <CardHeader>
              <CardDescription>{card.label}</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                {isLoading ? (
                  <Skeleton className="h-8 w-20 @[250px]/card:h-9" />
                ) : (
                  formatMetric(card.value)
                )}
              </CardTitle>
              <CardAction>
                <Badge variant="outline" className="gap-1.5">
                  <Icon className="size-3.5" />
                  {isLoading ? <Skeleton className="h-3 w-16" /> : card.badge}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardFooter className="items-start gap-2 text-sm text-muted-foreground">
              {SecondaryIcon ? (
                <SecondaryIcon className="mt-0.5 size-4 shrink-0" />
              ) : (
                <Icon className="mt-0.5 size-4 shrink-0" />
              )}
              <span className="line-clamp-2 min-w-0 leading-5 text-left">{card.footer}</span>
            </CardFooter>
          </Card>
        )
      })}
    </div>
  )
}

function formatMetric(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString() : '0'
}
