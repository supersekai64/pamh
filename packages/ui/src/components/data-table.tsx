'use client'

import * as React from 'react'
import {
  IconArchive,
  IconCheck,
  IconDotsVertical,
  IconHistory,
  IconInbox,
  IconRestore,
  IconSearch,
  IconTrash,
  IconX,
} from '@tabler/icons-react'

import { useIsMobile } from '@/hooks/use-mobile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { MemoryStatus, MemoryStatusFilter, MemoryType } from '@/types'

export type MemoryTableRow = {
  id: string
  title: string
  type: MemoryType
  status: MemoryStatus
  theme?: string
  source: string
  tags: string[]
  content: string
  createdAt: string
  updatedAt: string
  salience?: number
}

export type MemoryRowAction = 'archive' | 'restore' | 'approve' | 'reject' | 'mark-noise'

const statusTabs: Array<{ value: MemoryStatusFilter; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'proposed', label: 'Proposed' },
  { value: 'archived', label: 'Archived' },
  { value: 'noise', label: 'Noise' },
  { value: 'all', label: 'All' },
]

const PAGE_SIZE = 10

export function DataTable({
  data,
  isLoading,
  status,
  totalMatching,
  onAction,
  onStatusChange,
}: {
  data: MemoryTableRow[]
  isLoading: boolean
  status: MemoryStatusFilter
  totalMatching: number
  onAction: (id: string, action: MemoryRowAction) => void
  onStatusChange: (status: MemoryStatusFilter) => void
}) {
  const [page, setPage] = React.useState(1)
  const [query, setQuery] = React.useState('')
  const filteredData = React.useMemo(() => filterRows(data, query), [data, query])
  const displayTotal = query.trim() ? filteredData.length : totalMatching
  const pageCount = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const startIndex = filteredData.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE
  const endIndex = Math.min(startIndex + PAGE_SIZE, filteredData.length)
  const pageRows = filteredData.slice(startIndex, endIndex)
  const paginationItems = getPaginationItems(safePage, pageCount)
  const hasPagination = filteredData.length > PAGE_SIZE

  React.useEffect(() => {
    setPage(1)
  }, [query, status, totalMatching])

  React.useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, pageCount))
  }, [pageCount])

  function goToPage(nextPage: number) {
    setPage(Math.min(Math.max(nextPage, 1), pageCount))
  }

  return (
    <div className="grid min-w-0 max-w-full gap-3">
      <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-medium">Memory inventory</h2>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? 'Loading memories...'
              : `${displayTotal.toLocaleString()} matching memories`}
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center">
          <div className="relative min-w-0 md:w-80">
            <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search inventory..."
              className="h-8 w-full pl-8 !text-sm placeholder:!text-sm md:!text-sm md:placeholder:!text-sm"
            />
          </div>
          <div className="max-w-full overflow-x-auto">
            <Tabs
              value={status}
              onValueChange={(value) => onStatusChange(value as MemoryStatusFilter)}
            >
              <TabsList className="inline-flex w-max min-w-max text-sm">
                {statusTabs.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value} className="text-sm">
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </div>
      </div>

      <div className="min-w-0 overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead className="w-[42%]">Memory</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Updated</TableHead>
              <TableHead className="hidden xl:table-cell">Source</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell className="whitespace-normal">
                    <div className="h-4 w-48 animate-pulse rounded bg-muted" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">
                    <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                  </TableCell>
                  <TableCell />
                </TableRow>
              ))}

            {!isLoading &&
              pageRows.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="max-w-0 whitespace-normal">
                    <MemoryDetailDrawer item={item} onAction={onAction}>
                      <Button
                        variant="ghost"
                        className="h-auto w-full justify-start px-0 py-0 text-left hover:bg-transparent"
                      >
                        <span className="grid min-w-0 flex-1 gap-1">
                          <span className="truncate font-medium">{item.title}</span>
                          <span className="block min-w-0 truncate text-xs text-muted-foreground">
                            {item.content || item.id}
                          </span>
                        </span>
                      </Button>
                    </MemoryDetailDrawer>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{formatMemoryType(item.type)}</Badge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={item.status} />
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {formatDate(item.updatedAt)}
                  </TableCell>
                  <TableCell className="hidden max-w-44 truncate text-muted-foreground xl:table-cell">
                    {item.source}
                  </TableCell>
                  <TableCell>
                    <MemoryActions item={item} onAction={onAction} />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && filteredData.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-sm text-muted-foreground">
                  No memories match this filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {!isLoading && filteredData.length > 0 && (
          <div className="flex flex-col gap-3 border-t px-3 py-2 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
            <div className="text-xs tabular-nums">
              Showing {startIndex + 1}-{endIndex} of {filteredData.length.toLocaleString()}
              {!query.trim() && totalMatching > data.length
                ? ` loaded, ${totalMatching.toLocaleString()} matching`
                : ''}
            </div>

            {hasPagination && (
              <Pagination className="mx-0 w-auto justify-start md:justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      aria-disabled={safePage === 1}
                      className={cn(safePage === 1 && 'pointer-events-none opacity-50')}
                      href="#"
                      onClick={(event) => {
                        event.preventDefault()
                        goToPage(safePage - 1)
                      }}
                    />
                  </PaginationItem>

                  {paginationItems.map((item, index) => (
                    <PaginationItem key={`${item}-${index}`}>
                      {item === 'ellipsis' ? (
                        <PaginationEllipsis />
                      ) : (
                        <PaginationLink
                          href="#"
                          isActive={item === safePage}
                          onClick={(event) => {
                            event.preventDefault()
                            goToPage(item)
                          }}
                        >
                          {item}
                        </PaginationLink>
                      )}
                    </PaginationItem>
                  ))}

                  <PaginationItem>
                    <PaginationNext
                      aria-disabled={safePage === pageCount}
                      className={cn(safePage === pageCount && 'pointer-events-none opacity-50')}
                      href="#"
                      onClick={(event) => {
                        event.preventDefault()
                        goToPage(safePage + 1)
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function getPaginationItems(currentPage: number, pageCount: number): Array<number | 'ellipsis'> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1)
  }

  const pages = new Set([1, pageCount, currentPage - 1, currentPage, currentPage + 1])
  const visiblePages = Array.from(pages)
    .filter((page) => page >= 1 && page <= pageCount)
    .sort((first, second) => first - second)

  return visiblePages.flatMap((page, index) => {
    const previousPage = visiblePages[index - 1]
    if (previousPage && page - previousPage > 1) return ['ellipsis', page]
    return [page]
  })
}

function filterRows(data: MemoryTableRow[], query: string): MemoryTableRow[] {
  const normalizedQuery = normalizeSearch(query)
  if (!normalizedQuery) return data

  const terms = normalizedQuery.split(/\s+/).filter(Boolean)
  return data.filter((item) => {
    const haystack = normalizeSearch(
      [
        item.id,
        item.title,
        item.type,
        item.status,
        item.theme,
        item.source,
        item.content,
        ...item.tags,
      ]
        .filter(Boolean)
        .join(' ')
    )

    return terms.every((term) => haystack.includes(term))
  })
}

function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function formatMemoryType(type: MemoryType): string {
  return type.charAt(0).toUpperCase() + type.slice(1)
}

function MemoryDetailDrawer({
  item,
  onAction,
  children,
}: {
  item: MemoryTableRow
  onAction: (id: string, action: MemoryRowAction) => void
  children: React.ReactNode
}) {
  const isMobile = useIsMobile()

  return (
    <Drawer direction={isMobile ? 'bottom' : 'right'}>
      <DrawerTrigger asChild>{children}</DrawerTrigger>
      <DrawerContent className="sm:max-w-lg">
        <DrawerHeader>
          <DrawerTitle className="wrap-break-word">{item.title}</DrawerTitle>
          <DrawerDescription>Source: {item.source}</DrawerDescription>
        </DrawerHeader>
        <div className="grid gap-4 overflow-auto px-4 pb-2">
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={item.status} />
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-3 text-sm">
            <Detail label="Created" value={formatDate(item.createdAt)} />
            <Detail label="Updated" value={formatDate(item.updatedAt)} />
            <Detail
              label="Type"
              value={formatMemoryType(item.type)}
              tooltip="Memory category used by PAM to organize retrieval, context composition, and maintenance."
            />
            <Detail
              label="Salience"
              value={item.salience === undefined ? 'Default' : item.salience.toFixed(2)}
              tooltip="Relative importance score used when ranking memories for context. Default means PAM uses its standard ranking."
            />
          </div>

          <div className="grid gap-2">
            <div className="text-sm font-medium">Content</div>
            <pre className="max-h-[45vh] overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-sm leading-6 text-muted-foreground">
              {item.content}
            </pre>
          </div>
        </div>
        <DrawerFooter>
          <div className="flex flex-wrap gap-2">
            {item.status === 'proposed' && (
              <>
                <DrawerClose asChild>
                  <Button onClick={() => onAction(item.id, 'approve')}>
                    <IconCheck />
                    Approve
                  </Button>
                </DrawerClose>
                <DrawerClose asChild>
                  <Button variant="outline" onClick={() => onAction(item.id, 'reject')}>
                    <IconX />
                    Reject
                  </Button>
                </DrawerClose>
              </>
            )}
            {item.status === 'active' && (
              <>
                <DrawerClose asChild>
                  <Button variant="outline" onClick={() => onAction(item.id, 'archive')}>
                    <IconArchive />
                    Archive
                  </Button>
                </DrawerClose>
                <DrawerClose asChild>
                  <Button variant="outline" onClick={() => onAction(item.id, 'mark-noise')}>
                    <IconTrash />
                    Mark noise
                  </Button>
                </DrawerClose>
              </>
            )}
            {item.status !== 'active' && item.status !== 'proposed' && (
              <DrawerClose asChild>
                <Button variant="outline" onClick={() => onAction(item.id, 'restore')}>
                  <IconRestore />
                  Restore
                </Button>
              </DrawerClose>
            )}
            {item.status !== 'noise' && item.status !== 'active' && (
              <DrawerClose asChild>
                <Button variant="outline" onClick={() => onAction(item.id, 'mark-noise')}>
                  <IconTrash />
                  Mark noise
                </Button>
              </DrawerClose>
            )}
            <DrawerClose asChild>
              <Button variant="ghost">Close</Button>
            </DrawerClose>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

function MemoryActions({
  item,
  onAction,
}: {
  item: MemoryTableRow
  onAction: (id: string, action: MemoryRowAction) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
        <IconDotsVertical />
        <span className="sr-only">Open memory actions</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {item.status === 'proposed' && (
          <>
            <DropdownMenuItem onClick={() => onAction(item.id, 'approve')}>
              <IconCheck />
              Approve
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction(item.id, 'reject')}>
              <IconX />
              Reject
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {item.status === 'active' ? (
          <>
            <DropdownMenuItem onClick={() => onAction(item.id, 'archive')}>
              <IconArchive />
              Archive
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction(item.id, 'mark-noise')}>
              <IconTrash />
              Mark noise
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem onClick={() => onAction(item.id, 'restore')}>
              <IconRestore />
              Restore
            </DropdownMenuItem>
            {item.status !== 'noise' && (
              <DropdownMenuItem onClick={() => onAction(item.id, 'mark-noise')}>
                <IconTrash />
                Mark noise
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Detail({ label, value, tooltip }: { label: string; value: string; tooltip?: string }) {
  const content = (
    <div className="rounded-lg border bg-muted/20 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-medium">{value}</div>
    </div>
  )

  if (!tooltip) return content

  return (
    <Tooltip>
      <TooltipTrigger render={content} />
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

function StatusBadge({ status }: { status: MemoryStatus }) {
  const config = {
    active: { icon: IconCheck, label: 'active', className: 'text-emerald-500' },
    proposed: { icon: IconInbox, label: 'proposed', className: 'text-sky-500' },
    archived: { icon: IconArchive, label: 'archived', className: 'text-muted-foreground' },
    deleted: { icon: IconTrash, label: 'deleted', className: 'text-destructive' },
    noise: { icon: IconHistory, label: 'noise', className: 'text-muted-foreground' },
  } satisfies Record<
    MemoryStatus,
    { icon: React.ComponentType<{ className?: string }>; label: string; className: string }
  >
  const item = config[status]
  const Icon = item.icon

  return (
    <Badge variant="outline" className="gap-1.5">
      <Icon className={cn('size-3.5', item.className)} />
      {item.label}
    </Badge>
  )
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
