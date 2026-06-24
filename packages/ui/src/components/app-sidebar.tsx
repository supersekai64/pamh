import * as React from 'react'
import { IconBrain, IconDatabase, IconLayoutDashboard, IconSettings } from '@tabler/icons-react'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { ContextPreview, IndexDiagnosticsResponse, PackageVersionsResponse } from '@/types'

export type RuntimeView = 'dashboard' | 'llm-context' | 'sqlite-index' | 'settings'

export function viewToPath(view: RuntimeView): string {
  if (view === 'dashboard') return '/'
  return `/${view}`
}

const runtimeItems: Array<{
  value: RuntimeView
  label: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  { value: 'dashboard', label: 'Dashboard', icon: IconLayoutDashboard },
  { value: 'llm-context', label: 'LLM context', icon: IconBrain },
  { value: 'sqlite-index', label: 'SQLite index', icon: IconDatabase },
  { value: 'settings', label: 'Settings', icon: IconSettings },
]

export function AppSidebar({
  activeView,
  contextPreview,
  indexStats,
  isContextLoading,
  isIndexStatsLoading,
  packageVersions,
  isPackageVersionsLoading,
  packageVersionsError,
  onViewChange,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  activeView: RuntimeView
  contextPreview?: ContextPreview | null
  indexStats?: IndexDiagnosticsResponse | null
  isContextLoading?: boolean
  isIndexStatsLoading?: boolean
  packageVersions?: PackageVersionsResponse | null
  isPackageVersionsLoading?: boolean
  packageVersionsError?: string
  onViewChange: (view: RuntimeView, event?: React.MouseEvent<HTMLAnchorElement>) => void
}) {
  const databaseSize = indexStats ? formatBytes(indexStats.database.sizeBytes) : '0 B'
  const contextTokens = contextPreview
    ? formatTokenEstimate(contextPreview.tokenEstimate)
    : '0 tokens'
  const isContextMetricLoading = Boolean(isContextLoading && !contextPreview)
  const isDatabaseMetricLoading = Boolean(isIndexStatsLoading && !indexStats)

  return (
    <Sidebar collapsible="none" className="border-r border-sidebar-border" {...props}>
      <SidebarHeader className="p-3 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-foreground text-sm font-semibold text-sidebar">
            P
          </div>
          <div className="grid min-w-0 text-left leading-tight">
            <span className="truncate text-sm font-semibold text-sidebar-foreground">PAM</span>
            <span className="truncate text-xs text-sidebar-foreground/70">Portable AI Memory</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup className="px-0 py-2">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {runtimeItems.map((item) => {
                const Icon = item.icon

                return (
                  <SidebarMenuItem key={item.value}>
                    <SidebarMenuButton
                      isActive={activeView === item.value}
                      className="h-8 px-2 text-sm font-medium data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                      tooltip={item.label}
                      render={
                        <a
                          href={viewToPath(item.value)}
                          onClick={(event) => onViewChange(item.value, event)}
                        />
                      }
                    >
                      <Icon />
                      <span className="min-w-0 truncate">{item.label}</span>
                      {item.value === 'llm-context' && (
                        <RuntimeMenuMetric isLoading={isContextMetricLoading}>
                          {contextTokens}
                        </RuntimeMenuMetric>
                      )}
                      {item.value === 'sqlite-index' && (
                        <RuntimeMenuMetric isLoading={isDatabaseMetricLoading}>
                          {databaseSize}
                        </RuntimeMenuMetric>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="mt-auto p-2.5">
        <PackageVersionsBlock
          error={packageVersionsError}
          isLoading={isPackageVersionsLoading}
          packageVersions={packageVersions}
        />
      </SidebarFooter>
    </Sidebar>
  )
}

function RuntimeMenuMetric({
  children,
  isLoading,
}: {
  children: React.ReactNode
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <Skeleton
        aria-hidden="true"
        className="ml-auto h-5 w-16 shrink-0 rounded-md bg-sidebar-accent"
      />
    )
  }

  return (
    <span className="ml-auto max-w-28 shrink-0 truncate rounded-md bg-sidebar-accent px-1.5 py-0.5 text-xs tabular-nums text-sidebar-foreground/70">
      {children}
    </span>
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

function formatTokenEstimate(tokens: number): string {
  const safeTokens = Number.isFinite(tokens) ? Math.max(0, Math.round(tokens)) : 0
  return `${safeTokens.toLocaleString()} tokens`
}

function PackageVersionsBlock({
  error,
  isLoading = false,
  packageVersions,
}: {
  error?: string
  isLoading?: boolean
  packageVersions?: PackageVersionsResponse | null
}) {
  const packages = packageVersions?.packages ?? []

  return (
    <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/25 px-3 py-3">
      <SidebarGroupContent>
        {isLoading && packages.length === 0 ? (
          <div className="flex flex-col gap-1.5">
            {['Core', 'Protocol', 'UI', 'API', 'CLI'].map((label) => (
              <div
                key={label}
                className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 text-xs text-sidebar-foreground"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="w-16 shrink-0 truncate">{label}</span>
                  <Skeleton className="h-5 w-12" />
                </div>
                <Skeleton className="h-5 min-w-12 rounded-full" />
              </div>
            ))}
          </div>
        ) : packages.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {packages.map((item) => (
              <div
                key={item.name}
                className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 text-xs text-sidebar-foreground"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="w-16 shrink-0 truncate">{item.label}</span>
                  <span className="min-w-0 truncate font-medium tabular-nums">
                    {formatVersion(item.currentVersion)}
                  </span>
                </div>
                <Badge
                  variant={item.status === 'update-available' ? 'default' : 'outline'}
                  className="h-5 min-w-12 justify-center px-2 text-[11px]"
                  title={packageVersionStatusTitle(item)}
                >
                  {versionStatusLabel(item.status)}
                </Badge>
                {item.status === 'update-available' && item.latestVersion ? (
                  <span className="col-span-2 truncate pl-[4.5rem] text-[11px] text-sidebar-foreground/60">
                    latest {formatVersion(item.latestVersion)}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-sidebar-foreground/60">
            {error || 'Version check unavailable.'}
          </p>
        )}
      </SidebarGroupContent>
    </div>
  )
}

function versionStatusLabel(status: PackageVersionsResponse['packages'][number]['status']): string {
  if (status === 'update-available') return 'update'
  if (status === 'ahead') return 'ahead'
  if (status === 'unknown') return 'unknown'
  return 'latest'
}

function formatVersion(version?: string | null): string {
  if (!version) return 'n/a'
  return version.startsWith('v') ? version : `v${version}`
}

function packageVersionStatusTitle(item: PackageVersionsResponse['packages'][number]): string {
  if (item.status === 'update-available' && item.latestVersion) {
    return `${item.label} can be updated to ${formatVersion(item.latestVersion)}.`
  }
  if (item.status === 'ahead') return `${item.label} is ahead of the published npm version.`
  if (item.status === 'unknown')
    return item.error || `${item.label} npm metadata needs verification.`
  return `${item.label} is current.`
}
