import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const postinstallPath = fileURLToPath(new URL('../scripts/postinstall.mjs', import.meta.url))

describe('postinstall project bootstrap', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pamh-postinstall-test-'))
    await writeProjectPackageJson({})
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('waits for npm to persist a direct pamh-cli dependency before initializing', async () => {
    const child = spawn(process.execPath, [postinstallPath, '--deferred', tempDir], {
      env: {
        ...process.env,
        PAMH_POSTINSTALL_POLL_MS: '20',
        PAMH_POSTINSTALL_TIMEOUT_MS: '2000',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    await new Promise((resolve) => setTimeout(resolve, 80))
    await writeProjectPackageJson({ devDependencies: { 'pamh-cli': '^0.1.14' } })

    const result = await waitForExit(child)

    expect(result.code).toBe(0)
    expect(result.stderr).toBe('')
    expect(existsSync(join(tempDir, '.ai-memory'))).toBe(true)
    expect(existsSync(join(tempDir, 'AGENTS.md'))).toBe(true)
    expect(existsSync(join(tempDir, '.mcp.json'))).toBe(true)
  })

  async function writeProjectPackageJson(extra: Record<string, unknown>) {
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'pamh-postinstall-fixture',
          version: '1.0.0',
          ...extra,
        },
        null,
        2
      ),
      'utf-8'
    )
  }
})

function waitForExit(child: ReturnType<typeof spawn>) {
  return new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
    let stderr = ''
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('exit', (code) => resolve({ code, stderr }))
  })
}
