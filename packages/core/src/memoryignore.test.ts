import { describe, it, expect } from 'vitest'
import { loadMemoryIgnore, getDefaultIgnorePatterns } from './memoryignore.js'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('memoryignore', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pam-ignore-test-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should load default patterns when no .memoryignore exists', async () => {
    const ignore = await loadMemoryIgnore(tempDir)

    expect(ignore.patterns.length).toBeGreaterThan(0)
    expect(ignore.patterns).toContain('.env')
    expect(ignore.patterns).toContain('*.pem')
    expect(ignore.patterns).toContain('node_modules/')
  })

  it('should load user patterns from .memoryignore', async () => {
    await writeFile(join(tempDir, '.memoryignore'), '*.secret\n# comment\nprivate/', 'utf-8')

    const ignore = await loadMemoryIgnore(tempDir)

    expect(ignore.patterns).toContain('*.secret')
    expect(ignore.patterns).toContain('private/')
    expect(ignore.patterns).not.toContain('# comment')
  })

  it('should ignore .env files', async () => {
    const ignore = await loadMemoryIgnore(tempDir)

    expect(ignore.isIgnored('.env')).toBe(true)
    expect(ignore.isIgnored('.env.local')).toBe(true)
    expect(ignore.isIgnored('.env.production')).toBe(true)
  })

  it('should ignore *.pem files', async () => {
    const ignore = await loadMemoryIgnore(tempDir)

    expect(ignore.isIgnored('cert.pem')).toBe(true)
    expect(ignore.isIgnored('path/to/cert.pem')).toBe(true)
  })

  it('should ignore directories', async () => {
    const ignore = await loadMemoryIgnore(tempDir)

    expect(ignore.isIgnored('node_modules/package/index.js')).toBe(true)
    expect(ignore.isIgnored('secrets/api.key')).toBe(true)
  })

  it('should not ignore regular files', async () => {
    const ignore = await loadMemoryIgnore(tempDir)

    expect(ignore.isIgnored('memory.md')).toBe(false)
    expect(ignore.isIgnored('decisions/arch.md')).toBe(false)
  })

  it('should return default patterns', () => {
    const patterns = getDefaultIgnorePatterns()

    expect(patterns).toContain('.env')
    expect(patterns).toContain('*.pem')
    expect(patterns).toContain('*.key')
    expect(patterns).toContain('node_modules/')
  })
})
