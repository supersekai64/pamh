import {
  IconAlertTriangle,
  IconCircleCheck,
  IconDatabase,
  IconFileDatabase,
  IconVectorBezier,
} from '@tabler/icons-react'

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
import type { IndexDiagnosticsResponse } from '@/types'

export function SQLiteIndexCards({
  indexStats,
  isLoading,
}: {
  indexStats: IndexDiagnosticsResponse | null
  isLoading: boolean
}) {
  const healthOk = indexStats?.health.status === 'ok'
  const isBasicMode = indexStats?.health.status === 'unknown'
  const vectorCoverage = indexStats ? Math.round(indexStats.vectors.coverage * 100) : 0
  const cards = [
    {
      label: 'Database size',
      value: isBasicMode
        ? 'Unavailable'
        : indexStats
          ? formatBytes(indexStats.database.sizeBytes)
          : '0 B',
      badge: null,
      icon: IconFileDatabase,
      footer: isBasicMode
        ? 'Restart the PAM API to load file-level diagnostics.'
        : 'SQLite database size including active journal files.',
    },
    {
      label: 'Indexed memories',
      value: indexStats
        ? `${indexStats.sqlite.memoryRows.toLocaleString()} / ${indexStats.markdown.memoryFiles.toLocaleString()}`
        : '0 / 0',
      badge: isBasicMode ? 'basic count' : `${indexStats?.sqlite.ftsRows ?? 0} FTS rows`,
      icon: IconDatabase,
      footer: isBasicMode
        ? 'Derived from loaded memory and stats responses.'
        : 'Markdown memories present in the SQLite index.',
    },
    {
      label: 'Vector coverage',
      value: isBasicMode ? 'Unavailable' : `${vectorCoverage}%`,
      badge: isBasicMode ? 'basic mode' : `${indexStats?.vectors.indexed ?? 0} embedded`,
      icon: IconVectorBezier,
      footer: isBasicMode
        ? 'Vector coverage requires the index diagnostics endpoint.'
        : `${indexStats?.vectors.missing ?? 0} active memories waiting for vectors.`,
    },
    {
      label: 'Index health',
      value: isBasicMode ? 'Basic mode' : healthOk ? 'OK' : 'Needs sync',
      badge: isBasicMode ? 'partial' : healthOk ? 'clean' : 'action needed',
      icon: isBasicMode || healthOk ? IconCircleCheck : IconAlertTriangle,
      footer: isBasicMode
        ? 'Detailed index health is unavailable on this API build.'
        : `${indexStats?.health.missingInIndex ?? 0} missing, ${indexStats?.health.orphanedInIndex ?? 0} orphaned.`,
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon

        return (
          <Card key={card.label} className="@container/card">
            <CardHeader>
              <CardDescription>{card.label}</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                {isLoading ? <Skeleton className="h-8 w-24" /> : card.value}
              </CardTitle>
              {card.badge && (
                <CardAction>
                  <Badge variant="outline" className="gap-1.5">
                    <Icon className="size-3.5" />
                    {card.badge}
                  </Badge>
                </CardAction>
              )}
            </CardHeader>
            <CardFooter className="items-start gap-2 text-sm text-muted-foreground">
              <Icon className="mt-0.5 size-4 shrink-0" />
              <span className="line-clamp-2 min-w-0 leading-5 text-left">{card.footer}</span>
            </CardFooter>
          </Card>
        )
      })}
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const maximumFractionDigits = value >= 10 || unitIndex === 0 ? 0 : 1
  return `${value.toLocaleString(undefined, { maximumFractionDigits })} ${units[unitIndex]}`
}
