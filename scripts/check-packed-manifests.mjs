#!/usr/bin/env node
/* global console, process */

import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tar = process.platform === 'win32' ? 'tar.exe' : 'tar'

const packageDirs = ['packages/core', 'packages/ui', 'packages/api', 'packages/mcp', 'packages/cli']
const dependencyFields = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
]

let failed = false

for (const packageDir of packageDirs) {
  const absolutePackageDir = join(root, packageDir)
  const tempDir = await mkdtemp(join(tmpdir(), 'pamh-pack-check-'))

  try {
    const output = runPnpmPack(absolutePackageDir, tempDir)
    const pack = JSON.parse(output)
    const manifestJson = execFileSync(tar, ['-xOf', pack.filename, 'package/package.json'], {
      encoding: 'utf8',
    })
    const manifest = JSON.parse(manifestJson)
    const workspaceRefs = findWorkspaceRefs(manifest)

    if (workspaceRefs.length > 0) {
      failed = true
      console.error(`${manifest.name}@${manifest.version} contains workspace dependencies:`)
      for (const ref of workspaceRefs) {
        console.error(`  ${ref}`)
      }
    } else {
      console.log(`${manifest.name}@${manifest.version}: packed manifest ok`)
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

if (failed) {
  process.exit(1)
}

function findWorkspaceRefs(manifest) {
  const refs = []

  for (const field of dependencyFields) {
    const dependencies = manifest[field]
    if (!dependencies || typeof dependencies !== 'object') continue

    for (const [name, version] of Object.entries(dependencies)) {
      if (typeof version === 'string' && version.startsWith('workspace:')) {
        refs.push(`${field}.${name} = ${version}`)
      }
    }
  }

  return refs
}

function runPnpmPack(cwd, destination) {
  const args = ['pack', '--pack-destination', destination, '--json']
  const options = {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }

  if (process.platform === 'win32') {
    return execFileSync('cmd.exe', ['/d', '/c', 'pnpm', ...args], options)
  }

  return execFileSync('pnpm', args, options)
}
