import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { initAutoCaptureConfig } from './auto-capture.js'

export interface IntegrationResult {
  path: string
  status: 'created' | 'updated' | 'unchanged' | 'skipped'
  reason?: string
}

export interface ConfigureProjectIntegrationsResult {
  results: IntegrationResult[]
}

const START_MARKER = '<!-- PAMH:START -->'
const END_MARKER = '<!-- PAMH:END -->'

const MEMORY_INSTRUCTIONS = `${START_MARKER}
## PAMH Memory

Use PAMH as the project memory layer. **Memory capture is a first-class part of every task — not an optional extra.** When this conflicts with general "minimal change" or "only do what was asked" guidance, PAMH capture wins for any durable preference, rule, decision, correction, or mistake expressed in the conversation.

PAMH uses **assisted capture mode** by default: when you call \`add_memory\`, the memory is created with \`status: proposed\` and requires user approval before becoming active. Proposing a memory is cheap and reversible — when in doubt, capture.

**Language requirement**: Always write memory content in English, regardless of the conversation language.

### Tool loading (read this first)

The PAMH tools (\`search_memory\`, \`add_memory\`, \`memory_checkpoint\`, \`compile_context\`, \`get_memory\`, \`edit_memory\`, \`supersede_memory\`, etc.) are exposed by an MCP server named \`pamh\`. On some clients (notably VS Code Copilot) they are **deferred** and must be loaded before use:

- If your client lists deferred tools, call its tool-loading mechanism (e.g. \`tool_search\` with the query \`"pamh memory"\`) at the very start of every task to load the PAMH tools.
- If the loading mechanism is unavailable or returns no results, fall back to the CLI: \`memory search\`, \`memory add\`, \`memory checkpoint\`.
- Never skip memory work because the tools were not pre-loaded. Loading them is part of starting the task.

### At the start of every task

1. Load the PAMH tools (see above).
2. Call \`search_memory\` (or \`compile_context\`) with terms relevant to the user's request to retrieve existing rules, preferences, decisions, and recent sessions.
3. Apply any retrieved \`rule\` / \`preference\` memories to the work you are about to do.

### Triggers that REQUIRE an \`add_memory\` call (capture immediately, before or during the work — do not defer to end of turn)

- User says "always …", "never …", "from now on …", "I want X everywhere", "every time …" → type \`rule\` or \`preference\`.
- User expresses a stylistic, UX, naming, or architectural choice that should apply beyond the current change → type \`preference\`.
- User makes a technical decision (library, pattern, schema, protocol) → type \`decision\`.
- User corrects you, says "this should have been remembered/automated", or points out a recurring issue → type \`rule\` (the expectation) and/or \`mistake\` (the lesson).
- You discover a reusable fact, constraint, or gotcha about the codebase → type \`knowledge\`.
- A follow-up task is identified but not done now → type \`task\`.
- You complete meaningful work → type \`session\` with a short summary.

Do not wait for the user to explicitly request capture. Do not bundle multiple unrelated triggers into one memory — emit one \`add_memory\` per durable item.

### Before your final response

- If meaningful project work happened, run \`memory_checkpoint\` with \`summary\`, and the relevant \`decisions\` / \`facts\` / \`preferences\` / \`mistakes\` / \`tasks\` arrays.
- Always include user corrections and durable workflow expectations in the checkpoint.
- If no MCP checkpoint tool is available, use the CLI fallback: \`memory add\` (one per item) and \`memory checkpoint\`.
- After changing code, docs, configuration, or behavior, update relevant documentation in the same pass.

### Memory types

- \`decision\` — technical decisions.
- \`session\` — completed work summaries.
- \`knowledge\` — reusable facts.
- \`mistake\` — lessons learned.
- \`preference\` — user or project preferences.
- \`rule\` — durable workflow requirements ("always/never" statements).
- \`task\` — follow-up work.

Use scope \`project\`. PAMH is project-only; legacy scopes in existing Markdown are normalized to \`project\` when read.

Do not store secrets, API keys, tokens, passwords, private credentials, or transient logs.
${END_MARKER}
`

const PAMH_MCP_SERVER = {
  type: 'local',
  command: ['memory', 'server', 'start'],
  enabled: true,
}

const PAMH_VSCODE_MCP_SERVER = {
  command: 'memory',
  args: ['server', 'start'],
}

const PAMH_CODEX_GLOBAL_TOML = `[mcp_servers.pamh]
command = "memory"
args = ["server", "start"]
startup_timeout_sec = 30`

const PAMH_CLAUDE_HOOKS = {
  hooks: {
    SessionStart: [
      {
        hooks: [
          {
            type: 'command',
            command: 'memory hook record session-start --agent claude-code',
          },
        ],
      },
    ],
    UserPromptSubmit: [
      {
        hooks: [
          {
            type: 'command',
            command: 'memory hook record user-prompt --agent claude-code',
          },
        ],
      },
    ],
    Stop: [
      {
        hooks: [
          {
            type: 'command',
            command: 'memory hook record session-end --agent claude-code',
          },
        ],
      },
    ],
  },
}

export async function configureProjectIntegrations(
  projectPath: string
): Promise<ConfigureProjectIntegrationsResult> {
  const results: IntegrationResult[] = []
  const captureConfigPath = join(projectPath, '.ai-memory', 'auto-capture.yaml')
  const hadCaptureConfig = existsSync(captureConfigPath)

  await initAutoCaptureConfig(join(projectPath, '.ai-memory'))
  results.push({
    path: captureConfigPath,
    status: hadCaptureConfig ? 'unchanged' : 'created',
  })
  results.push(await upsertMarkdownBlock(join(projectPath, 'AGENTS.md'), '# Project Instructions'))
  results.push(await upsertMarkdownBlock(join(projectPath, 'CLAUDE.md'), '# Claude Instructions'))
  results.push(
    await upsertMarkdownBlock(
      join(projectPath, '.github', 'copilot-instructions.md'),
      '# GitHub Copilot Instructions'
    )
  )
  results.push(
    await upsertMarkdownBlock(
      join(projectPath, '.cursor', 'rules', 'pamh.mdc'),
      '---\nalwaysApply: true\n---'
    )
  )
  results.push(
    await upsertJsonConfig(join(projectPath, '.claude', 'settings.json'), PAMH_CLAUDE_HOOKS)
  )
  results.push(await upsertOpenCodeConfig(join(projectPath, 'opencode.json')))
  results.push(await upsertMcpConfig(join(projectPath, '.mcp.json')))
  results.push(await upsertMcpConfig(join(projectPath, '.cursor', 'mcp.json')))
  results.push(await upsertVsCodeMcpConfig(join(projectPath, '.vscode', 'mcp.json')))

  return { results }
}

export async function configureCodexGlobalIntegration(
  codexHome = join(homedir(), '.codex')
): Promise<IntegrationResult> {
  return upsertTomlTable(join(codexHome, 'config.toml'), 'mcp_servers.pamh', PAMH_CODEX_GLOBAL_TOML)
}

async function upsertMarkdownBlock(filePath: string, heading: string): Promise<IntegrationResult> {
  await mkdir(dirname(filePath), { recursive: true })

  if (!existsSync(filePath)) {
    await writeFile(filePath, `${heading}\n\n${MEMORY_INSTRUCTIONS}`, 'utf-8')
    return { path: filePath, status: 'created' }
  }

  const existing = await readFile(filePath, 'utf-8')
  if (existing.includes(START_MARKER) && existing.includes(END_MARKER)) {
    const updated = replaceMarkedBlock(existing, MEMORY_INSTRUCTIONS)
    if (updated === existing) {
      return { path: filePath, status: 'unchanged' }
    }

    await writeFile(filePath, updated, 'utf-8')
    return { path: filePath, status: 'updated' }
  }

  await writeFile(filePath, `${existing.trimEnd()}\n\n${MEMORY_INSTRUCTIONS}`, 'utf-8')
  return { path: filePath, status: 'updated' }
}

async function upsertOpenCodeConfig(filePath: string): Promise<IntegrationResult> {
  const defaultConfig = {
    $schema: 'https://opencode.ai/config.json',
    instructions: ['AGENTS.md'],
    mcp: {
      pamh: PAMH_MCP_SERVER,
    },
  }

  if (!existsSync(filePath)) {
    await writeJson(filePath, defaultConfig)
    return { path: filePath, status: 'created' }
  }

  try {
    const config = JSON.parse(await readFile(filePath, 'utf-8')) as Record<string, unknown>
    const instructions = Array.isArray(config.instructions) ? config.instructions : []
    const nextInstructions = instructions.includes('AGENTS.md')
      ? instructions
      : [...instructions, 'AGENTS.md']
    const mcp = isRecord(config.mcp) ? config.mcp : {}
    const updated = {
      ...config,
      $schema: typeof config.$schema === 'string' ? config.$schema : defaultConfig.$schema,
      instructions: nextInstructions,
      mcp: {
        ...mcp,
        pamh: PAMH_MCP_SERVER,
      },
    }

    const existing = JSON.stringify(config)
    const next = JSON.stringify(updated)
    if (existing === next) {
      return { path: filePath, status: 'unchanged' }
    }

    await writeJson(filePath, updated)
    return { path: filePath, status: 'updated' }
  } catch (error) {
    return {
      path: filePath,
      status: 'skipped',
      reason: `Could not parse existing JSON: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

async function upsertMcpConfig(filePath: string): Promise<IntegrationResult> {
  const defaultConfig = {
    mcpServers: {
      pamh: {
        command: 'memory',
        args: ['server', 'start'],
      },
    },
  }

  await mkdir(dirname(filePath), { recursive: true })

  if (!existsSync(filePath)) {
    await writeJson(filePath, defaultConfig)
    return { path: filePath, status: 'created' }
  }

  try {
    const config = JSON.parse(await readFile(filePath, 'utf-8')) as Record<string, unknown>
    const mcpServers = isRecord(config.mcpServers) ? config.mcpServers : {}
    const updated = {
      ...config,
      mcpServers: {
        ...mcpServers,
        pamh: defaultConfig.mcpServers.pamh,
      },
    }

    const existing = JSON.stringify(config)
    const next = JSON.stringify(updated)
    if (existing === next) {
      return { path: filePath, status: 'unchanged' }
    }

    await writeJson(filePath, updated)
    return { path: filePath, status: 'updated' }
  } catch (error) {
    return {
      path: filePath,
      status: 'skipped',
      reason: `Could not parse existing JSON: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

async function upsertVsCodeMcpConfig(filePath: string): Promise<IntegrationResult> {
  const defaultConfig = {
    servers: {
      pamh: PAMH_VSCODE_MCP_SERVER,
    },
  }

  await mkdir(dirname(filePath), { recursive: true })

  if (!existsSync(filePath)) {
    await writeJson(filePath, defaultConfig)
    return { path: filePath, status: 'created' }
  }

  try {
    const config = JSON.parse(await readFile(filePath, 'utf-8')) as Record<string, unknown>
    const servers = isRecord(config.servers) ? config.servers : {}
    const updated = {
      ...config,
      servers: {
        ...servers,
        pamh: PAMH_VSCODE_MCP_SERVER,
      },
    }

    if (JSON.stringify(config) === JSON.stringify(updated)) {
      return { path: filePath, status: 'unchanged' }
    }

    await writeJson(filePath, updated)
    return { path: filePath, status: 'updated' }
  } catch (error) {
    return {
      path: filePath,
      status: 'skipped',
      reason: `Could not parse existing JSON: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

async function upsertJsonConfig(
  filePath: string,
  defaultConfig: Record<string, unknown>
): Promise<IntegrationResult> {
  await mkdir(dirname(filePath), { recursive: true })

  if (!existsSync(filePath)) {
    await writeJson(filePath, defaultConfig)
    return { path: filePath, status: 'created' }
  }

  try {
    const config = JSON.parse(await readFile(filePath, 'utf-8')) as Record<string, unknown>
    const updated = deepMerge(config, defaultConfig)

    if (JSON.stringify(config) === JSON.stringify(updated)) {
      return { path: filePath, status: 'unchanged' }
    }

    await writeJson(filePath, updated)
    return { path: filePath, status: 'updated' }
  } catch (error) {
    return {
      path: filePath,
      status: 'skipped',
      reason: `Could not parse existing JSON: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

async function upsertTomlTable(
  filePath: string,
  tableName: string,
  tableBlock: string
): Promise<IntegrationResult> {
  await mkdir(dirname(filePath), { recursive: true })

  if (!existsSync(filePath)) {
    await writeFile(filePath, `${tableBlock}\n`, 'utf-8')
    return { path: filePath, status: 'created' }
  }

  const existing = await readFile(filePath, 'utf-8')
  const lines = existing.split(/\r?\n/)
  const tableHeader = `[${tableName}]`
  const start = lines.findIndex((line) => line.trim() === tableHeader)

  if (start !== -1) {
    const end = findNextTomlTable(lines, start + 1)
    const updatedLines = [...lines.slice(0, start), ...tableBlock.split('\n'), ...lines.slice(end)]
    const updated = ensureTrailingNewline(updatedLines.join('\n'))
    if (updated === existing) return { path: filePath, status: 'unchanged' }
    await writeFile(filePath, updated, 'utf-8')
    return { path: filePath, status: 'updated' }
  }

  await writeFile(filePath, `${existing.trimEnd()}\n\n${tableBlock}\n`, 'utf-8')
  return { path: filePath, status: 'updated' }
}

function replaceMarkedBlock(content: string, block: string): string {
  const start = content.indexOf(START_MARKER)
  const end = content.indexOf(END_MARKER)

  if (start === -1 || end === -1 || end < start) {
    return `${content.trimEnd()}\n\n${block}`
  }

  return `${content.slice(0, start).trimEnd()}\n\n${block}${content.slice(end + END_MARKER.length).trimStart()}`
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function deepMerge(
  base: Record<string, unknown>,
  extension: Record<string, unknown>
): Record<string, unknown> {
  const output: Record<string, unknown> = { ...base }

  for (const [key, value] of Object.entries(extension)) {
    const existing = output[key]
    if (isRecord(existing) && isRecord(value)) {
      output[key] = deepMerge(existing, value)
    } else {
      output[key] = value
    }
  }

  return output
}

function findNextTomlTable(lines: string[], start: number): number {
  const next = lines.findIndex((line, index) => index >= start && /^\s*\[[^\]]+\]\s*$/.test(line))
  return next === -1 ? lines.length : next
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`
}
