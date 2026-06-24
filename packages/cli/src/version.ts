import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VERSION as CORE_VERSION } from '@helloworlkd/pam-core'

export function getCliVersion(): string {
  try {
    const packageJsonPath = join(dirname(fileURLToPath(import.meta.url)), '../package.json')
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: string }
    return packageJson.version ?? CORE_VERSION
  } catch {
    return CORE_VERSION
  }
}
