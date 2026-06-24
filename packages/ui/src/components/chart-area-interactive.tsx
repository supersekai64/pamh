'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts'

import { useIsMobile } from '@/hooks/use-mobile'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { MemoryTableRow } from '@/components/data-table'

type PresetRange = '90d' | '30d' | '7d'
type RangeSelectValue = PresetRange | 'custom'
type MemoryActivityPoint = {
  date: string
  active: number
  proposed: number
  archived: number
}
type ResolvedDateRange = {
  from: Date
  to: Date
}

const chartConfig = {
  active: {
    label: 'Active',
    color: 'var(--chart-1)',
  },
  proposed: {
    label: 'Proposed',
    color: 'var(--chart-2)',
  },
  archived: {
    label: 'Archived',
    color: 'var(--chart-3)',
  },
} satisfies ChartConfig

export function ChartAreaInteractive({
  memories,
  isLoading,
}: {
  memories: MemoryTableRow[]
  isLoading: boolean
}) {
  const isMobile = useIsMobile()
  const [timeRange, setTimeRange] = React.useState<PresetRange | null>('30d')
  const [dateRange, setDateRange] = React.useState<DateRange>(() => getPresetDateRange('30d'))
  const [timeZone, setTimeZone] = React.useState<string>()

  const applyPresetRange = React.useCallback((range: PresetRange) => {
    setTimeRange(range)
    setDateRange(getPresetDateRange(range))
  }, [])

  const applyCustomRange = React.useCallback((range: DateRange | undefined) => {
    if (!range?.from) return
    setTimeRange(null)
    setDateRange(range)
  }, [])

  React.useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  }, [])

  React.useEffect(() => {
    if (isMobile) applyPresetRange('7d')
  }, [applyPresetRange, isMobile])

  const chartData = React.useMemo(
    () => buildMemoryActivity(memories, dateRange),
    [memories, dateRange]
  )
  const dateRangeLabel = formatDateRangeLabel(dateRange)

  return (
    <Card className="@container/card h-full min-h-[420px]">
      <CardHeader className="shrink-0">
        <CardTitle>Memory activity</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/card:block">New and updated memories by status</span>
          <span className="@[540px]/card:hidden">Updates by status</span>
        </CardDescription>
        <CardAction className="flex max-w-full flex-col items-end gap-2 @[540px]/card:flex-row @[540px]/card:items-center">
          <ToggleGroup
            value={timeRange ? [timeRange] : []}
            onValueChange={(value) => {
              const nextRange = value[0]
              if (nextRange) applyPresetRange(nextRange as PresetRange)
            }}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:px-4! @[767px]/card:flex"
          >
            <ToggleGroupItem value="90d">90 days</ToggleGroupItem>
            <ToggleGroupItem value="30d">30 days</ToggleGroupItem>
            <ToggleGroupItem value="7d">7 days</ToggleGroupItem>
          </ToggleGroup>
          <Select
            value={(timeRange ?? 'custom') satisfies RangeSelectValue}
            onValueChange={(value) => {
              if (value !== 'custom') applyPresetRange(value as PresetRange)
            }}
          >
            <SelectTrigger
              className="flex w-32 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"
              size="sm"
              aria-label="Select time range"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="90d">90 days</SelectItem>
              <SelectItem value="30d">30 days</SelectItem>
              <SelectItem value="7d">7 days</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  aria-label={`Date range: ${dateRangeLabel}`}
                  data-empty={!dateRange.from}
                  variant="outline"
                  className="w-40 justify-start text-left font-normal data-[empty=true]:text-muted-foreground @[540px]/card:w-[230px]"
                />
              }
            >
              <CalendarIcon data-icon="inline-start" />
              <span className="truncate">{dateRangeLabel}</span>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-0">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={applyCustomRange}
                defaultMonth={dateRange.from}
                numberOfMonths={isMobile ? 1 : 2}
                timeZone={timeZone}
                disabled={{ after: new Date() }}
              />
              <div className="flex justify-end border-t p-2">
                <Button size="sm" variant="ghost" onClick={() => applyPresetRange('30d')}>
                  Reset
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </CardAction>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 px-2 pt-4 sm:px-6 sm:pt-6">
        {isLoading ? (
          <Skeleton className="min-h-[250px] flex-1" />
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-full min-h-[250px] flex-1">
            <AreaChart accessibilityLayer data={chartData}>
              <defs>
                <linearGradient id="fillActive" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-active)" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="var(--color-active)" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="fillProposed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-proposed)" stopOpacity={0.7} />
                  <stop offset="95%" stopColor="var(--color-proposed)" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="fillArchived" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-archived)" stopOpacity={0.7} />
                  <stop offset="95%" stopColor="var(--color-archived)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tickFormatter={formatDateLabel}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="dot" labelFormatter={formatDateLabel} />}
              />
              <Area
                dataKey="archived"
                type="natural"
                dot={<ActivityDot />}
                activeDot={{ r: 4 }}
                fill="url(#fillArchived)"
                stroke="var(--color-archived)"
                strokeWidth={2}
                stackId="a"
              />
              <Area
                dataKey="proposed"
                type="natural"
                dot={<ActivityDot />}
                activeDot={{ r: 4 }}
                fill="url(#fillProposed)"
                stroke="var(--color-proposed)"
                strokeWidth={2}
                stackId="a"
              />
              <Area
                dataKey="active"
                type="natural"
                dot={<ActivityDot />}
                activeDot={{ r: 4 }}
                fill="url(#fillActive)"
                stroke="var(--color-active)"
                strokeWidth={2}
                stackId="a"
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

function ActivityDot({
  cx,
  cy,
  stroke,
  value,
}: {
  cx?: number
  cy?: number
  stroke?: string
  value?: number | string | [number | string, number | string]
}) {
  const amount = Array.isArray(value) ? Number(value[1]) - Number(value[0]) : Number(value)

  if (cx == null || cy == null || !amount) return null

  return <circle cx={cx} cy={cy} fill={stroke} r={3} stroke="var(--background)" strokeWidth={1.5} />
}

function buildMemoryActivity(memories: MemoryTableRow[], range: DateRange): MemoryActivityPoint[] {
  const { from, to } = normalizeDateRange(range)
  const buckets = new Map<string, MemoryActivityPoint>()

  for (const date = new Date(from); date <= to; date.setDate(date.getDate() + 1)) {
    const key = getLocalDateKey(date)
    buckets.set(key, { date: key, active: 0, proposed: 0, archived: 0 })
  }

  memories.forEach((memory) => {
    const memoryDate = new Date(memory.updatedAt || memory.createdAt)
    if (Number.isNaN(memoryDate.getTime())) return

    const key = getLocalDateKey(memoryDate)
    const bucket = buckets.get(key)
    if (!bucket) return
    if (memory.status === 'proposed') bucket.proposed += 1
    else if (
      memory.status === 'archived' ||
      memory.status === 'deleted' ||
      memory.status === 'noise'
    ) {
      bucket.archived += 1
    } else {
      bucket.active += 1
    }
  })

  return Array.from(buckets.values())
}

function getPresetDateRange(range: PresetRange): ResolvedDateRange {
  const days = range === '90d' ? 90 : range === '30d' ? 30 : 7
  const to = startOfLocalDay(new Date())
  const from = new Date(to)
  from.setDate(to.getDate() - days + 1)

  return { from, to }
}

function normalizeDateRange(range: DateRange): ResolvedDateRange {
  const fallback = startOfLocalDay(new Date())
  const from = startOfLocalDay(range.from ?? fallback)
  const to = startOfLocalDay(range.to ?? range.from ?? fallback)

  return from <= to ? { from, to } : { from: to, to: from }
}

function startOfLocalDay(date: Date) {
  const nextDate = new Date(date)
  nextDate.setHours(0, 0, 0, 0)
  return nextDate
}

function getLocalDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDateRangeLabel(range: DateRange) {
  const { from, to } = normalizeDateRange(range)
  const fromLabel = format(from, 'MMM d, yyyy')
  const toLabel = format(to, 'MMM d, yyyy')

  return fromLabel === toLabel ? fromLabel : `${fromLabel} - ${toLabel}`
}

function formatDateLabel(value: unknown) {
  const [year, month, day] = String(value).split('-').map(Number)
  if (!year || !month || !day) return String(value)

  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}
