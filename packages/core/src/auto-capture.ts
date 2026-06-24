import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'

export type AutoCaptureMode = 'manual' | 'assisted' | 'auto'

export interface AutoCaptureConfig {
  mode: AutoCaptureMode
  rules?: AutoCaptureRule[]
  exclude?: AutoCaptureRule[]
}

export interface AutoCaptureRule {
  after?: string
  type?: string
  scope?: string
}

const DEFAULT_CONFIG: AutoCaptureConfig = {
  mode: 'auto',
}

export async function loadAutoCaptureConfig(basePath: string): Promise<AutoCaptureConfig> {
  const configPath = join(basePath, 'auto-capture.yaml')

  if (!existsSync(configPath)) {
    return DEFAULT_CONFIG
  }

  try {
    const content = await readFile(configPath, 'utf-8')
    const config = yaml.load(content) as AutoCaptureConfig

    if (!config || !config.mode) {
      return DEFAULT_CONFIG
    }

    if (!['manual', 'assisted', 'auto'].includes(config.mode)) {
      return DEFAULT_CONFIG
    }

    return config
  } catch {
    return DEFAULT_CONFIG
  }
}

export async function saveAutoCaptureConfig(
  basePath: string,
  config: AutoCaptureConfig
): Promise<void> {
  const configPath = join(basePath, 'auto-capture.yaml')
  const content = yaml.dump(config, { indent: 2 })
  await writeFile(configPath, content, 'utf-8')
}

export async function initAutoCaptureConfig(basePath: string): Promise<void> {
  const configPath = join(basePath, 'auto-capture.yaml')

  if (existsSync(configPath)) {
    return
  }

  await mkdir(basePath, { recursive: true })
  await saveAutoCaptureConfig(basePath, DEFAULT_CONFIG)
}
