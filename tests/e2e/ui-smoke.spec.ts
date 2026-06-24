import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type AddressInfo } from 'node:net'
import { expect, test, type Page } from '@playwright/test'
import { createMemory, initProjectMemory } from '../../packages/core/dist/index.js'
import { createLocalApiServer, type LocalApiServerOptions } from '../../packages/api/dist/index.js'

test.beforeEach(async ({ page }) => {
  await routePackageVersions(page)
})

test('empty store shows the dashboard shell and create path', async ({ page }) => {
  const app = await startUiFixture()

  try {
    await page.goto(app.url)

    await expect(page.getByRole('heading', { name: 'PAM Dashboard' })).toBeVisible()
    await expect(page.getByPlaceholder('Search memories, tags, sources...')).toBeHidden()
    await expect(page.getByRole('button', { name: 'New memory' })).toBeHidden()
    await expect(page.getByText('Local project store')).toBeHidden()
    await expectRuntimeNavigationBeforePackageVersions(page)
    await expect(page.getByText('npm builds')).toBeHidden()
    await expect(page.getByText('v0.1.16')).toBeVisible()
    await expect(page.getByText('latest').first()).toBeVisible()
    await expect(page.getByText('update').first()).toBeVisible()
    await expect(page.getByText('check')).toBeHidden()
    await expectSidebarToFillViewport(page)
    await expect(sidebarButton(page, 'SQLite index')).toContainText(
      /[1-9][\d.,]*\s?(B|KB|MB|GB)/
    )
    await expect(sidebarButton(page, 'LLM context')).toContainText(/\d[\d.,\s]* tokens/)

    await sidebarButton(page, 'LLM context').click()
    await expect(page.getByRole('heading', { name: 'LLM context', level: 1 })).toBeVisible()

    await sidebarButton(page, 'SQLite index').click()
    await expect(page.getByRole('heading', { name: 'SQLite index', level: 1 })).toBeVisible()
    await expect(noMemoriesFilterState(page)).toBeVisible()
    await expect(noMemoriesFilterState(page)).toHaveClass(/text-sm/)

    await sidebarButton(page, 'Dashboard').click()
    await expect(page.getByRole('heading', { name: 'PAM Dashboard' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'LLM context' })).toBeVisible()
    await expect(page.getByText('No context selected yet')).toBeHidden()
    await expect(conceptsEmptyState(page)).toBeVisible()
    await expect(conceptsEmptyState(page)).toHaveClass(/border-dashed/)

    await page.getByRole('button', { name: 'New' }).click()
    await withinDialog(page).getByLabel('Title').fill('Empty smoke memory')
    await withinDialog(page).getByLabel('Content').fill('Created from the empty-store UI smoke test.')
    await withinDialog(page).getByRole('button', { name: 'Create memory' }).click()

    await expect(page.getByText(/Created mem_/)).toBeVisible()
    await sidebarButton(page, 'SQLite index').click()
    await expect(page.getByRole('button', { name: /Created from the empty-store UI smoke test/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /mem_[a-f0-9]+/ }).first()).toBeVisible()
  } finally {
    await app.close()
  }
})

test('runtime metric badges show skeletons while loading', async ({ page }) => {
  const app = await startUiFixture()
  let releaseContextPreview: () => void = () => {}
  let releaseIndexStats: () => void = () => {}
  let releasePackageVersions: () => void = () => {}
  let markIndexStatsRequested: () => void = () => {}
  const contextPreviewGate = new Promise<void>((resolve) => {
    releaseContextPreview = resolve
  })
  const indexStatsGate = new Promise<void>((resolve) => {
    releaseIndexStats = resolve
  })
  const packageVersionsGate = new Promise<void>((resolve) => {
    releasePackageVersions = resolve
  })
  const indexStatsRequested = new Promise<void>((resolve) => {
    markIndexStatsRequested = resolve
  })

  await page.route(/\/api\/context-preview(?:\?|$)/, async (route) => {
    await contextPreviewGate
    await route.continue()
  })
  await page.route(/\/api\/index-stats$/, async (route) => {
    markIndexStatsRequested()
    await indexStatsGate
    await route.continue()
  })
  await page.route('**/api/package-versions', async (route) => {
    await packageVersionsGate
    await route.fallback()
  })

  try {
    await page.goto(app.url)

    await expect(sidebarMetricSkeleton(page, 'LLM context')).toBeVisible()
    await expect(sidebarMetricSkeleton(page, 'SQLite index')).toBeVisible()
    await expect(packageVersionSkeleton(page, 'Core').first()).toBeVisible()
    await expect
      .poll(async () =>
        packageVersionSkeleton(page, 'Core')
          .first()
          .evaluate((node) => Math.round(node.getBoundingClientRect().height))
      )
      .toBeGreaterThanOrEqual(20)
    await expect(kpiCard(page, 'Active memories').locator('[data-slot="card-title"] [data-slot="skeleton"]')).toBeVisible()
    await expect
      .poll(async () =>
        kpiCard(page, 'Active memories')
          .locator('[data-slot="card-title"] [data-slot="skeleton"]')
          .evaluate((node) => Math.round(node.getBoundingClientRect().height))
      )
      .toBeGreaterThanOrEqual(36)
    await expect(
      dashboardCard(page, 'LLM context').locator('[data-slot="card-description"] [data-slot="skeleton"]')
    ).toBeVisible()
    await expect(
      dashboardCard(page, 'Concepts').locator('[data-slot="card-description"] [data-slot="skeleton"]')
    ).toBeVisible()
    await expect(
      dashboardCard(page, 'Concepts').locator('[data-slot="card-content"] [data-slot="skeleton"]').first()
    ).toBeVisible()
    await expect(
      dashboardCard(page, 'Knowledge graph').locator('[data-slot="card-content"] [data-slot="skeleton"]')
    ).toHaveCount(3)
    await expect
      .poll(async () =>
        dashboardCard(page, 'Knowledge graph')
          .locator('[data-slot="card-content"] [data-slot="skeleton"]')
          .first()
          .evaluate((node) => Math.round(node.getBoundingClientRect().height))
      )
      .toBeGreaterThanOrEqual(20)
    await expect(dashboardCard(page, 'Knowledge graph').getByText('Entities')).toBeVisible()
    await expect(dashboardCard(page, 'Knowledge graph').getByText('Relations')).toBeVisible()
    await expect(dashboardCard(page, 'Knowledge graph').getByText('Coverage')).toBeVisible()
    await expect(page.getByText('Ranked subset selected from active project memory')).toBeHidden()
    await expect(page.getByText('Signals in the current context')).toBeHidden()

    releaseContextPreview()
    await indexStatsRequested

    await expect(sidebarButton(page, 'LLM context')).toContainText(/\d[\d.,\s]* tokens/)
    await expect(sidebarMetricSkeleton(page, 'SQLite index')).toBeVisible()

    releaseIndexStats()
    releasePackageVersions()
    await expect(sidebarButton(page, 'SQLite index')).toContainText(
      /[1-9][\d.,]*\s?(B|KB|MB|GB)/
    )
    await expect(page.getByText('v0.1.16')).toBeVisible()
  } finally {
    releaseContextPreview()
    releaseIndexStats()
    releasePackageVersions()
    await app.close()
  }
})

test('dashboard initial load does not refetch continuously', async ({ page }) => {
  const app = await startUiFixture()
  const apiRequests: string[] = []

  page.on('request', (request) => {
    const url = new URL(request.url())
    if (request.method() === 'GET' && url.pathname.startsWith('/api/')) {
      apiRequests.push(`${url.pathname}${url.search}`)
    }
  })

  try {
    await page.goto(app.url)
    await expect(page.getByRole('heading', { name: 'LLM context' })).toBeVisible()
    await expect(page.getByText('No context selected yet')).toBeHidden()

    await page.waitForTimeout(500)
    const settledRequestCount = apiRequests.length
    await page.waitForTimeout(900)

    expect(apiRequests.length).toBe(settledRequestCount)
  } finally {
    await app.close()
  }
})

test('settings capture controls render without loading skeletons', async ({ page }) => {
  const app = await startUiFixture()
  let releaseConfigLoad: () => void = () => {}
  let markConfigRequested: () => void = () => {}
  const configLoadGate = new Promise<void>((resolve) => {
    releaseConfigLoad = resolve
  })
  const configRequested = new Promise<void>((resolve) => {
    markConfigRequested = resolve
  })

  await page.route(/\/api\/config$/, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }

    markConfigRequested()
    await configLoadGate
    await route.continue()
  })

  try {
    await page.goto(`${app.url}/settings`)
    await configRequested

    const captureCard = dashboardCard(page, 'Capture')
    const captureModeSelect = captureCard.getByRole('combobox', { name: 'Capture mode' })
    const ignoredConceptsInput = captureCard.getByLabel('Ignored concepts')

    await expect(captureCard.locator('[data-slot="skeleton"]')).toHaveCount(0)
    await expect(captureModeSelect).toBeVisible()
    await expect(captureModeSelect).toBeDisabled()
    await expect(ignoredConceptsInput).toBeVisible()
    await expect(ignoredConceptsInput).toBeDisabled()
    await expect(captureCard.getByRole('button', { name: 'Save settings' })).toBeDisabled()

    releaseConfigLoad()
    await expect(captureModeSelect).toBeEnabled()
    await expect(ignoredConceptsInput).toBeEnabled()
  } finally {
    releaseConfigLoad()
    await app.close()
  }
})

test('runtime pages have persistent URLs and settings can save config', async ({ page }) => {
  const app = await startUiFixture()
  let releaseConfigSave: () => void = () => {}

  try {
    await page.goto(`${app.url}/llm-context`)
    await expect(page.getByRole('heading', { name: 'LLM context', level: 1 })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'LLM context', level: 1 })).toBeVisible()

    const settingsLink = sidebarButton(page, 'Settings')
    await expect(settingsLink).toHaveAttribute('href', '/settings')
    await settingsLink.click()
    await expect(page).toHaveURL(/\/settings$/)
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
    await expect(
      page.getByText('Default behavior for new agent exchanges and checkpoints.')
    ).toHaveClass(/text-sm/)
    await expect(page.getByText('Local index operations for the current workspace.')).toHaveClass(
      /text-sm/
    )
    await expect(
      page.getByText('Creates active durable memories automatically after consolidation.')
    ).toBeHidden()
    await expect(
      page.getByText('Creates proposed memories for review before they become active.')
    ).toBeHidden()
    await expect(
      page.getByText('Records capture observations without creating durable memories.')
    ).toBeHidden()
    const captureModeSelect = page.getByRole('combobox', { name: 'Capture mode' })
    await expect(captureModeSelect).toContainText('Automatic')
    await captureModeSelect.click()
    await expect(page.getByRole('option', { name: 'Automatic' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Assisted' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Manual' })).toBeVisible()
    await page.getByRole('option', { name: 'Assisted' }).click()
    await expect(captureModeSelect).toContainText('Assisted')

    await page.getByLabel('Ignored concepts').fill('temporary-noise; obsolete-tag')
    await expect(page.getByRole('switch', { name: 'Auto vectorize' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await expect(page.getByLabel('Auto vectorize details')).toBeVisible()
    await page.getByLabel('Auto vectorize details').hover()
    await expect(page.getByText(/Automatically creates semantic vectors/)).toBeVisible()
    await page.getByRole('switch', { name: 'Auto vectorize' }).click()
    await expect(page.getByRole('switch', { name: 'Auto vectorize' })).toHaveAttribute(
      'aria-checked',
      'false'
    )

    let markConfigSaveRequested: () => void = () => {}
    const configSaveGate = new Promise<void>((resolve) => {
      releaseConfigSave = resolve
    })
    const configSaveRequested = new Promise<void>((resolve) => {
      markConfigSaveRequested = resolve
    })
    await page.route(/\/api\/config$/, async (route) => {
      if (route.request().method() !== 'PATCH') {
        await route.continue()
        return
      }

      markConfigSaveRequested()
      await configSaveGate
      await route.continue()
    })

    const saveSettingsButton = page.getByRole('button', { name: 'Save settings' })
    await expect(saveSettingsButton).toHaveClass(/text-sm/)
    await saveSettingsButton.click()
    await configSaveRequested
    await expect(saveSettingsButton).toBeDisabled()
    await expect(saveSettingsButton.locator('svg.animate-spin')).toHaveCount(0)

    releaseConfigSave()
    await expect(page.getByText('PAM settings saved.')).toBeVisible()

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
    await expect(page.getByLabel('Ignored concepts')).toHaveValue('temporary-noise; obsolete-tag')
    await expect(page.getByRole('switch', { name: 'Auto vectorize' })).toHaveAttribute(
      'aria-checked',
      'false'
    )

    const rebuildIndexButton = page.getByRole('button', { name: 'Rebuild index' })
    await expect(rebuildIndexButton).toHaveClass(/text-sm/)
    await rebuildIndexButton.click()
    await expect(page.getByText(/Rebuilt SQLite index with \d+ memories\./)).toBeVisible()
  } finally {
    releaseConfigSave()
    await app.close()
  }
})

test('settings explain missing API endpoints', async ({ page }) => {
  const app = await startUiFixture()

  await page.route('**/api/config', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Not found' }),
    })
  })
  await page.route('**/api/index/rebuild', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Not found' }),
    })
  })

  try {
    await page.goto(`${app.url}/settings`)
    await expect(page.getByText('Settings are not available on the running PAM API.')).toBeVisible()
    await expect(page.getByText('Not found')).toBeHidden()

    await page.getByRole('button', { name: 'Rebuild index' }).click()
    await expect(page.getByText('Index rebuild is not available on the running PAM API.')).toBeVisible()
    await expect(page.getByText(/pam index rebuild/)).toBeVisible()
  } finally {
    await app.close()
  }
})

test('memory inventory paginates matching rows', async ({ page }) => {
  const app = await startUiFixture({
    seed: async (basePath) => {
      for (let index = 1; index <= 12; index += 1) {
        await createMemory(basePath, {
          type: 'knowledge',
          scope: 'project',
          status: 'active',
          title: `Pagination memory ${index.toString().padStart(2, '0')}`,
          content: `Pagination fixture memory ${index}.`,
          tags: index === 12 ? ['unique-filter-target'] : [],
        })
      }
    },
  })

  try {
    await page.goto(app.url)
    await sidebarButton(page, 'SQLite index').click()

    await expect(page.getByText('Database size', { exact: true })).toBeVisible()
    await expect(page.getByText(/\d+ files/)).toBeHidden()
    await expect(page.getByText('Indexed memories')).toBeVisible()
    await expect(page.getByText('Vector coverage')).toBeVisible()
    await expect(page.getByText('Index health')).toBeVisible()
    await expect(page.getByText('Showing 1-10 of 12')).toBeVisible()
    await expect(page.getByRole('button', { name: /Pagination fixture memory 12/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Pagination fixture memory 1\./ })).toBeHidden()

    await page.getByRole('button', { name: '2', exact: true }).click()
    await expect(page.getByText('Showing 11-12 of 12')).toBeVisible()
    await expect(page.getByRole('button', { name: /Pagination fixture memory 1\./ })).toBeVisible()

    await page.getByPlaceholder('Search inventory...').fill('unique-filter-target')
    await expect(page.getByText('1 matching memories')).toBeVisible()
    await expect(page.getByRole('button', { name: /Pagination fixture memory 12/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Pagination fixture memory 1\./ })).toBeHidden()

    const tabRequests: string[] = []
    const recordTabRequest = (request: { method(): string; url(): string }) => {
      const url = new URL(request.url())
      if (request.method() === 'GET' && url.pathname.startsWith('/api/')) {
        tabRequests.push(`${url.pathname}${url.search}`)
      }
    }
    page.on('request', recordTabRequest)

    await page.getByRole('tab', { name: 'Proposed' }).click()
    await expect(noMemoriesFilterState(page)).toBeVisible()
    await page.waitForTimeout(250)
    page.off('request', recordTabRequest)

    expect(tabRequests.some((request) => request.startsWith('/api/memories?'))).toBe(true)
    expect(tabRequests.some((request) => request.startsWith('/api/stats?'))).toBe(false)
    expect(tabRequests.some((request) => request.startsWith('/api/index-stats'))).toBe(false)
    expect(tabRequests.some((request) => request.startsWith('/api/context-preview?'))).toBe(false)
    expect(tabRequests.some((request) => request.startsWith('/api/concepts?'))).toBe(false)
  } finally {
    await app.close()
  }
})

test('memory detail can mark an active memory as noise', async ({ page }) => {
  const app = await startUiFixture({
    seed: async (basePath) => {
      await createMemory(basePath, {
        type: 'knowledge',
        scope: 'project',
        status: 'active',
        title: 'Noisy implementation note',
        content: 'Temporary implementation note that should be marked as noise.',
      })
    },
  })

  try {
    await page.goto(`${app.url}/sqlite-index`)
    await expect(page.getByRole('button', { name: /Temporary implementation note/ })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Knowledge' }).first()).toBeVisible()
    await page.getByRole('button', { name: /Temporary implementation note/ }).click()
    await expect(withinDialog(page).getByText('Knowledge')).toBeVisible()
    await withinDialog(page).getByRole('button', { name: 'Mark noise' }).click()
    await expect(page.getByText('Memory marked as noise.')).toBeVisible()

    await page.getByRole('tab', { name: 'Noise' }).click()
    await expect(page.getByRole('button', { name: /Temporary implementation note/ })).toBeVisible()
  } finally {
    await app.close()
  }
})

test('UI can approve, create, inspect context, and show graph metrics', async ({ page }) => {
  const app = await startUiFixture({
    seed: async (basePath) => {
      await createMemory(basePath, {
        type: 'decision',
        scope: 'project',
        status: 'active',
        title: 'Local SQLite index',
        tags: ['onboarding-proof', 'sqlite'],
        content: 'Use SQLite as the local index for first-run proof.',
      })
      await createMemory(basePath, {
        type: 'knowledge',
        scope: 'project',
        status: 'active',
        tags: ['onboarding-proof', 'mcp'],
        content: 'MCP tools provide the agent capture path for PAM.',
      })
      await createMemory(basePath, {
        type: 'preference',
        scope: 'project',
        status: 'active',
        tags: ['onboarding-proof', 'ui'],
        content: 'The UI should keep automatic memory management visible without manual governance.',
      })
      await createMemory(basePath, {
        type: 'knowledge',
        scope: 'project',
        status: 'proposed',
        tags: ['review-proof'],
        content: 'Approve this proposed memory from the UI smoke test.',
      })
    },
  })

  try {
    await page.goto(app.url)
    await expectMemoryActivityChartToHaveData(page)

    await sidebarButton(page, 'SQLite index').click()
    await expect(
      page.getByRole('button', { name: /MCP tools provide the agent capture path for PAM/ })
    ).toBeVisible()
    await page.getByRole('tab', { name: 'Proposed' }).click()
    await page.getByRole('button', { name: /Approve this proposed memory/ }).click()
    await withinDialog(page).getByRole('button', { name: 'Approve' }).click()
    await expect(page.getByText('Memory approved.')).toBeVisible()

    await page.getByRole('button', { name: 'New' }).click()
    await withinDialog(page).getByLabel('Title').fill('E2E-created memory')
    await withinDialog(page)
      .getByLabel('Content')
      .fill('Created through the Playwright E2E smoke test.')
    await withinDialog(page).getByRole('button', { name: 'Create memory' }).click()
    await expect(page.getByText(/Created mem_/)).toBeVisible()

    await page.getByRole('tab', { name: 'Active' }).click()
    await sidebarButton(page, 'Dashboard').click()
    await expect(page.getByRole('heading', { name: 'LLM context' })).toBeVisible()
    await expect(page.getByText('Use SQLite as the local index for first-run proof.')).toBeHidden()
    await expect(page.getByText('Created through the Playwright E2E smoke test.')).toBeHidden()
    await expect(page.getByRole('heading', { name: 'Knowledge graph' })).toBeVisible()
    await expect(page.getByText('Entities')).toBeVisible()
    await expect(page.getByText('Relations')).toBeVisible()

    await sidebarButton(page, 'LLM context').click()
    await expect(page.getByText('Use SQLite as the local index for first-run proof.')).toBeVisible()
    await expect(page.getByText('Created through the Playwright E2E smoke test.')).toBeVisible()
  } finally {
    await app.close()
  }
})

function withinDialog(page: Page) {
  return page.getByRole('dialog')
}

function sidebarButton(page: Page, text: string) {
  return page.locator('[data-sidebar="menu-button"]').filter({ hasText: text }).first()
}

function kpiCard(page: Page, label: string) {
  return page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByText(label, { exact: true }) })
    .first()
}

function dashboardCard(page: Page, heading: string) {
  return page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole('heading', { name: heading }) })
    .first()
}

function sidebarMetricSkeleton(page: Page, text: string) {
  return sidebarButton(page, text).locator('[data-slot="skeleton"]')
}

function packageVersionSkeleton(page: Page, label: string) {
  return page
    .locator('[data-slot="sidebar-footer"]')
    .locator('div')
    .filter({ has: page.getByText(label, { exact: true }) })
    .first()
    .locator('[data-slot="skeleton"]')
}

function conceptsEmptyState(page: Page) {
  return page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole('heading', { name: 'Concepts' }) })
    .getByText('No strong concepts yet.')
}

function noMemoriesFilterState(page: Page) {
  return page.getByText('No memories match this filter.')
}

async function routePackageVersions(page: Page) {
  await page.route('**/api/package-versions', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        checkedAt: new Date('2026-06-24T00:00:00.000Z').toISOString(),
        updateCount: 1,
        packages: [
          {
            name: '@helloworlkd/pam-core',
            label: 'Core',
            currentVersion: '0.1.8',
            latestVersion: '0.1.8',
            status: 'up-to-date',
          },
          {
            name: '@helloworlkd/pam-protocol',
            label: 'Protocol',
            currentVersion: '0.1.9',
            latestVersion: '0.1.9',
            status: 'up-to-date',
          },
          {
            name: '@helloworlkd/pam-ui',
            label: 'UI',
            currentVersion: '0.1.9',
            latestVersion: '0.1.9',
            status: 'up-to-date',
          },
          {
            name: '@helloworlkd/pam-api',
            label: 'API',
            currentVersion: '0.1.14',
            latestVersion: '0.1.14',
            status: 'up-to-date',
          },
          {
            name: '@helloworlkd/pam-cli',
            label: 'CLI',
            currentVersion: '0.1.15',
            latestVersion: '0.1.16',
            status: 'update-available',
          },
        ],
      }),
    })
  })
}

async function expectRuntimeNavigationBeforePackageVersions(page: Page) {
  await expect(page.getByText('Runtime', { exact: true })).toBeHidden()
  await expect(page.getByText('Memory store', { exact: true })).toBeHidden()

  const dashboardTop = await sidebarButton(page, 'Dashboard')
    .evaluate((node) => node.getBoundingClientRect().top)
  const packageVersionsTop = await page
    .locator('[data-slot="sidebar"]')
    .getByText('Core', { exact: true })
    .evaluate((node) => node.getBoundingClientRect().top)

  expect(dashboardTop).toBeLessThan(packageVersionsTop)
}

async function expectSidebarToFillViewport(page: Page) {
  const sidebarHeight = await page
    .locator('[data-slot="sidebar"]')
    .first()
    .evaluate((node) => Math.round(node.getBoundingClientRect().height))
  const viewportHeight = page.viewportSize()?.height ?? 0

  expect(sidebarHeight).toBe(viewportHeight)
}

async function expectMemoryActivityChartToHaveData(page: Page) {
  await expect(page.getByText('Memory activity')).toBeVisible()

  const chartContainer = page.locator('[data-slot="chart"]').first()
  await expect
    .poll(async () =>
      chartContainer.evaluate((node) => Math.round(node.getBoundingClientRect().height))
    )
    .toBeGreaterThan(250)

  const activeArea = page.locator('path[fill="url(#fillActive)"]').first()
  await expect(activeArea).toBeVisible()

  await expect
    .poll(async () =>
      activeArea.evaluate((node) => {
        const bounds = (node as SVGGraphicsElement).getBBox()
        return Math.round(bounds.height)
      })
    )
    .toBeGreaterThan(0)

  await expect(page.locator('circle[fill="var(--color-active)"]').first()).toBeVisible()

  const dateRangeButton = page.getByRole('button', { name: /Date range:/ })
  await expect(dateRangeButton).toBeVisible()
  await dateRangeButton.click()
  await expect(page.locator('[data-slot="calendar"]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-slot="calendar"]')).toBeHidden()
}

async function startUiFixture(
  options: {
    seed?: (basePath: string) => Promise<void>
  } = {}
): Promise<{ close: () => Promise<void>; url: string }> {
  const projectPath = await mkdtemp(join(tmpdir(), 'PAM-ui-e2e-'))
  const memoryPath = await initProjectMemory(projectPath)

  if (options.seed) {
    await options.seed(memoryPath)
  }

  const server = createLocalApiServer({ cwd: projectPath } satisfies LocalApiServerOptions)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolve()
    })
  })

  const address = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await rm(projectPath, { recursive: true, force: true })
    },
  }
}
