import { IconDatabase, IconLoader2, IconPlus, IconRefresh } from '@tabler/icons-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export function SiteHeader({
  isRefreshing,
  lastUpdated,
  projectName,
  onCreate,
  onRefresh,
}: {
  isRefreshing: boolean
  lastUpdated: Date | null
  projectName: string
  onCreate: () => void
  onRefresh: () => void
}) {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full min-w-0 items-center gap-2 px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Badge
            variant="outline"
            className="hidden h-6 gap-1.5 rounded-full px-2 text-xs sm:inline-flex"
          >
            <IconDatabase className="size-3" />
            {projectName}
          </Badge>
          <Button variant="outline" size="icon-sm" onClick={onRefresh} aria-label="Refresh">
            {isRefreshing ? <IconLoader2 className="animate-spin" /> : <IconRefresh />}
          </Button>
          {lastUpdated && (
            <span className="hidden text-xs text-muted-foreground lg:inline">
              Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" onClick={onCreate} className="hidden sm:inline-flex">
            <IconPlus />
            New
          </Button>
        </div>
      </div>
    </header>
  )
}
