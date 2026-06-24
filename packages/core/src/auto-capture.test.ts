import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadAutoCaptureConfig, saveAutoCaptureConfig } from './auto-capture.js'

describe('auto-capture', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pam-auto-capture-test-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should return default config when file does not exist', async () => {
    const config = await loadAutoCaptureConfig(tempDir)
    expect(config.mode).toBe('auto')
  })

  it('should load valid YAML config', async () => {
    const yamlContent = 'mode: manual\n'
    await writeFile(join(tempDir, 'auto-capture.yaml'), yamlContent, 'utf-8')

    const config = await loadAutoCaptureConfig(tempDir)
    expect(config.mode).toBe('manual')
  })

  it('should save and load config', async () => {
    await saveAutoCaptureConfig(tempDir, { mode: 'auto' })

    const config = await loadAutoCaptureConfig(tempDir)
    expect(config.mode).toBe('auto')
  })

  it('should return default for invalid mode', async () => {
    const yamlContent = 'mode: invalid\n'
    await writeFile(join(tempDir, 'auto-capture.yaml'), yamlContent, 'utf-8')

    const config = await loadAutoCaptureConfig(tempDir)
    expect(config.mode).toBe('auto')
  })

  it('should return default for invalid YAML', async () => {
    await writeFile(join(tempDir, 'auto-capture.yaml'), 'invalid: yaml: content:', 'utf-8')

    const config = await loadAutoCaptureConfig(tempDir)
    expect(config.mode).toBe('auto')
  })
})
