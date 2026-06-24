import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Command } from 'commander'
import {
  MemoryIndex,
  checkIndexConsistency,
  findMemoryBase,
  getProjectMemoryPath,
  scanMemoryFileIssues,
} from '@helloworlkd/pam-core'

export function registerDoctorCommand(program: Command) {
  const doctor = program.command('doctor').description('Diagnose memory system health')

  doctor
    .command('check')
    .description('Check consistency between Markdown files and SQLite index')
    .action(async () => {
      const basePath = getProjectMemoryPath(process.cwd())

      console.log('Checking index consistency...')
      const report = await checkIndexConsistency(basePath)
      const issues = await scanMemoryFileIssues(basePath)

      console.log(`\nFiles found: ${report.totalFiles}`)
      console.log(`Indexed: ${report.totalIndexed}`)

      if (report.missingInIndex.length > 0) {
        console.log(`\nMissing from index (${report.missingInIndex.length}):`)
        for (const id of report.missingInIndex) {
          console.log(`  - ${id}`)
        }
      }

      if (report.missingInFiles.length > 0) {
        console.log(`\nMissing from files (${report.missingInFiles.length}):`)
        for (const id of report.missingInFiles) {
          console.log(`  - ${id}`)
        }
      }

      if (issues.length > 0) {
        console.log(`\nInvalid Markdown files (${issues.length}):`)
        for (const issue of issues) {
          console.log(`  - ${issue.path}: ${issue.error}`)
        }
      }

      if (
        report.missingInIndex.length === 0 &&
        report.missingInFiles.length === 0 &&
        issues.length === 0
      ) {
        console.log('\nOK: Index and Markdown files are consistent')
      }
    })

  doctor
    .command('stats')
    .description('Show memory statistics')
    .action(() => {
      const basePath = getProjectMemoryPath(process.cwd())

      const index = new MemoryIndex(basePath)
      const stats = index.getStats()
      index.close()

      console.log(`\nTotal memories: ${stats.total}`)
      console.log(`Active: ${stats.active}`)
      console.log(`Deleted: ${stats.deleted}`)

      if (Object.keys(stats.byType).length > 0) {
        console.log('\nBy type:')
        for (const [type, count] of Object.entries(stats.byType)) {
          console.log(`  ${type}: ${count}`)
        }
      }

      if (Object.keys(stats.byScope).length > 0) {
        console.log('\nBy scope:')
        for (const [scope, count] of Object.entries(stats.byScope)) {
          console.log(`  ${scope}: ${count}`)
        }
      }

      if (Object.keys(stats.tags).length > 0) {
        console.log('\nTags:')
        for (const [tag, count] of Object.entries(stats.tags)) {
          console.log(`  ${tag}: ${count}`)
        }
      }
    })

  doctor
    .command('integrations')
    .description('Check local agent integration files and first-run readiness')
    .action(async () => {
      const cwd = process.cwd()
      const memoryPath = findMemoryBase(cwd) ?? getProjectMemoryPath(cwd)

      console.log('PAM integration doctor\n')
      reportCheck('CLI command', 'pam server start')
      reportCheck('.ai-memory store', existsSync(memoryPath) ? memoryPath : 'missing')

      const checks = [
        await checkTextFile(join(cwd, 'AGENTS.md'), ['PAM Memory', 'pam search']),
        await checkTextFile(join(cwd, 'CLAUDE.md'), ['PAM Memory', 'pam search']),
        await checkTextFile(join(cwd, '.github', 'copilot-instructions.md'), ['PAM Memory']),
        await checkTextFile(join(cwd, '.cursor', 'rules', 'pam.mdc'), ['PAM Memory']),
        await checkJsonFile(join(cwd, '.claude', 'settings.json'), ['pam hook record']),
        await checkJsonFile(join(cwd, '.mcp.json'), ['server', 'start']),
        await checkJsonFile(join(cwd, '.vscode', 'mcp.json'), ['server', 'start']),
        await checkJsonFile(join(cwd, '.cursor', 'mcp.json'), ['server', 'start']),
      ]

      for (const check of checks) {
        reportCheck(check.label, check.ok ? 'ok' : check.reason)
      }

      const failed = checks.filter((check) => !check.ok)
      if (failed.length > 0) {
        console.log('\nRun `pam init` to regenerate missing or stale project integrations.')
        process.exitCode = 1
        return
      }

      console.log('\nOK: Project integrations look ready. Reload your agent client if it was open.')
    })
}

interface IntegrationCheck {
  label: string
  ok: boolean
  reason: string
}

async function checkTextFile(filePath: string, required: string[]): Promise<IntegrationCheck> {
  if (!existsSync(filePath)) return { label: filePath, ok: false, reason: 'missing' }

  const raw = await readFile(filePath, 'utf-8')
  if (raw.includes('--project')) return { label: filePath, ok: false, reason: 'uses --project' }
  if (/Use [`']global[`']/.test(raw)) {
    return { label: filePath, ok: false, reason: 'mentions unsupported global scope' }
  }

  const missing = required.filter((term) => !raw.includes(term))
  return {
    label: filePath,
    ok: missing.length === 0,
    reason: missing.length === 0 ? 'ok' : `missing ${missing.join(', ')}`,
  }
}

async function checkJsonFile(filePath: string, required: string[]): Promise<IntegrationCheck> {
  if (!existsSync(filePath)) return { label: filePath, ok: false, reason: 'missing' }

  try {
    const raw = await readFile(filePath, 'utf-8')
    JSON.parse(raw)
    if (raw.includes('--project')) return { label: filePath, ok: false, reason: 'uses --project' }
    const missing = required.filter((term) => !raw.includes(term))
    return {
      label: filePath,
      ok: missing.length === 0,
      reason: missing.length === 0 ? 'ok' : `missing ${missing.join(', ')}`,
    }
  } catch (error) {
    return {
      label: filePath,
      ok: false,
      reason: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

function reportCheck(label: string, result: string): void {
  const ok = result !== 'missing' && result !== 'uses --project' && !result.startsWith('invalid')
  console.log(`${ok ? 'OK' : 'FAIL'} ${label}: ${result}`)
}
