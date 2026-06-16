#!/usr/bin/env node
/* global console, process, setTimeout */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_NAME = 'pamh-cli'
const DEFAULT_DEFER_TIMEOUT_MS = 15_000
const DEFAULT_DEFER_POLL_MS = 500

async function main() {
  const [command, projectPathArg] = process.argv.slice(2)
  if (command === '--deferred') {
    await runDeferredInit(resolve(projectPathArg || process.env.INIT_CWD || process.cwd()))
    return
  }

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
  if (!declaresDirectDependency(packageJson, PACKAGE_NAME)) {
    scheduleDeferredInit(projectPath)
    return
  }

  await initializeProject(projectPath)
}

async function runDeferredInit(projectPath) {
  const deadline =
    Date.now() + readPositiveIntEnv('PAMH_POSTINSTALL_TIMEOUT_MS', DEFAULT_DEFER_TIMEOUT_MS)
  const pollMs = readPositiveIntEnv('PAMH_POSTINSTALL_POLL_MS', DEFAULT_DEFER_POLL_MS)

  while (Date.now() <= deadline) {
    const packageJson = readPackageJson(resolve(projectPath, 'package.json'))
    if (packageJson?.name === PACKAGE_NAME) return
    if (packageJson && declaresDirectDependency(packageJson, PACKAGE_NAME)) {
      await initializeProject(projectPath)
      return
    }
    await sleep(pollMs)
  }
}

function scheduleDeferredInit(projectPath) {
  const child = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), '--deferred', projectPath],
    {
      detached: true,
      env: process.env,
      stdio: 'ignore',
      windowsHide: true,
    }
  )
  child.unref()
}

async function initializeProject(projectPath) {
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

function readPositiveIntEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] || '', 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

await main()
