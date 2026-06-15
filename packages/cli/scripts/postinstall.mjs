#!/usr/bin/env node
/* global console, process */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PACKAGE_NAME = 'pamh-cli'

async function main() {
  if (process.env.PAMH_SKIP_PROJECT_INIT === '1') return
  if (isGlobalInstall()) {
    console.log('[pamh] Global CLI installed. Run `memory init` inside a project to bootstrap it.')
    return
  }

  const projectPath = resolve(process.env.INIT_CWD || process.cwd())
  const packageJsonPath = resolve(projectPath, 'package.json')
  if (!existsSync(packageJsonPath)) return

  const packageJson = readPackageJson(packageJsonPath)
  if (!packageJson || packageJson.name === PACKAGE_NAME) return
  if (!declaresDirectDependency(packageJson, PACKAGE_NAME)) return

  try {
    const { configureProjectIntegrations, initAutoCaptureConfig, initProjectMemory } =
      await import('pamh-core')
    const memoryPath = await initProjectMemory(projectPath)
    await initAutoCaptureConfig(memoryPath)
    const { results } = await configureProjectIntegrations(projectPath)
    const changed = results.filter(
      (result) => result.status === 'created' || result.status === 'updated'
    )

    console.log(`[pamh] Project memory initialized at ${memoryPath}`)
    if (changed.length > 0) {
      console.log(`[pamh] Wrote ${changed.length} agent/IDE integration file(s).`)
    }
    console.log(
      '[pamh] Reload VS Code/Cursor, start a new Claude Code/OpenCode session, or restart/open a new Codex session.'
    )
  } catch (error) {
    console.warn(
      `[pamh] Project memory auto-init skipped: ${error instanceof Error ? error.message : String(error)}`
    )
    console.warn('[pamh] You can run `memory init` manually inside the project.')
  }
}

function isGlobalInstall() {
  return (
    process.env.npm_config_global === 'true' ||
    process.env.npm_config_location === 'global' ||
    process.env.npm_lifecycle_event === 'globalinstall'
  )
}

function readPackageJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8').replace(/^\uFEFF/, ''))
  } catch {
    return null
  }
}

function declaresDirectDependency(packageJson, packageName) {
  return ['dependencies', 'devDependencies', 'optionalDependencies'].some((field) => {
    const dependencies = packageJson[field]
    return Boolean(dependencies && typeof dependencies === 'object' && dependencies[packageName])
  })
}

await main()
