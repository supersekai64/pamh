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

const START_MARKER = '<!-- PAM:START -->'
const END_MARKER = '<!-- PAM:END -->'

const MEMORY_INSTRUCTIONS = `${START_MARKER}
## PAM Memory

Use PAM as the project memory layer. **Memory capture is a first-class part of every task — not an optional extra.** When this conflicts with general "minimal change" or "only do what was asked" guidance, PAM capture wins for any durable preference, rule, decision, correction, or mistake expressed in the conversation.

PAM uses **auto capture mode** by default: \`add_memory\` and \`memory_checkpoint\` create active memories after same-theme consolidation and contradiction handling. \`proposed\` memories are only expected in assisted review mode; manual mode records observations but skips automatic durable memory writes.

**Language requirement**: Always write memory content in English, regardless of the conversation language.

**Strong concepts**: When calling \`add_memory\`, \`edit_memory\`, or \`memory_checkpoint\`, provide an optional \`concepts\` array with 1-3 broad, durable semantic themes chosen by the client AI. Use canonical project/product themes, not button labels, page section names, implementation details, memory types, model names, agent names, status labels, source names, or one-off nouns. Keep concrete details in the memory content as evidence.

### Tool loading (read this first)

The PAM tools (\`search_memory\`, \`add_memory\`, \`memory_checkpoint\`, \`compile_context\`, \`get_memory\`, \`edit_memory\`, \`supersede_memory\`, etc.) are exposed by an MCP server named \`pam\`. On some clients (notably VS Code Copilot) they are **deferred** and must be loaded before use:

- If your client lists deferred tools, call its tool-loading mechanism (e.g. \`tool_search\` with the query \`"pam memory"\`) at the very start of every task to load the PAM tools.
- If the loading mechanism is unavailable or returns no results, fall back to the CLI: \`pam search\`, \`pam add\`, \`pam checkpoint\`.
- Never skip memory work because the tools were not pre-loaded. Loading them is part of starting the task.

### At the start of every task

1. Load the PAM tools (see above).
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
- If no MCP checkpoint tool is available, use the CLI fallback: \`pam add\` (one per item) and \`pam checkpoint\`.
- After changing code, docs, configuration, or behavior, update relevant documentation in the same pass.

### Memory types

- \`decision\` — technical decisions.
- \`session\` — completed work summaries.
- \`knowledge\` — reusable facts.
- \`mistake\` — lessons learned.
- \`preference\` — user or project preferences.
- \`rule\` — durable workflow requirements ("always/never" statements).
- \`task\` — follow-up work.

Use scope \`project\`. PAM is project-only; legacy scopes in existing Markdown are normalized to \`project\` when read.

Do not store secrets, API keys, tokens, passwords, private credentials, or transient logs.
${END_MARKER}
`

const PAM_MCP_SERVER = {
  type: 'local',
  command: ['pam', 'server', 'start'],
  enabled: true,
}

const PAM_VSCODE_MCP_SERVER = {
  command: 'pam',
  args: ['server', 'start'],
}

const PAM_CODEX_GLOBAL_TOML = `[mcp_servers.pam]
command = "pam"
args = ["server", "start"]
startup_timeout_sec = 30`

function pamHookConfig(agent: 'claude-code' | 'codex') {
  return {
    hooks: {
      SessionStart: [
        {
          hooks: [
            {
              type: 'command',
              command: `pam hook record session-start --agent ${agent}`,
            },
          ],
        },
      ],
      UserPromptSubmit: [
        {
          hooks: [
            {
              type: 'command',
              command: `pam hook record user-prompt --agent ${agent}`,
            },
          ],
        },
      ],
      Stop: [
        {
          hooks: [
            {
              type: 'command',
              command: `pam hook record session-end --agent ${agent}`,
            },
          ],
        },
      ],
    },
  }
}

const PAM_CLAUDE_HOOKS = pamHookConfig('claude-code')
const PAM_CODEX_HOOKS = pamHookConfig('codex')

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
      join(projectPath, '.cursor', 'rules', 'pam.mdc'),
      '---\nalwaysApply: true\n---'
    )
  )
  results.push(
    await upsertJsonConfig(join(projectPath, '.claude', 'settings.json'), PAM_CLAUDE_HOOKS)
  )
  results.push(await upsertJsonConfig(join(projectPath, '.codex', 'hooks.json'), PAM_CODEX_HOOKS))
  results.push(await upsertOpenCodeConfig(join(projectPath, 'opencode.json')))
  results.push(await upsertMcpConfig(join(projectPath, '.mcp.json')))
  results.push(await upsertMcpConfig(join(projectPath, '.cursor', 'mcp.json')))
  results.push(await upsertVsCodeMcpConfig(join(projectPath, '.vscode', 'mcp.json')))

  return { results }
}

export async function configureCodexGlobalIntegration(
  codexHome = join(homedir(), '.codex')
): Promise<IntegrationResult> {
  return upsertTomlTable(join(codexHome, 'config.toml'), 'mcp_servers.pam', PAM_CODEX_GLOBAL_TOML)
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
      pam: PAM_MCP_SERVER,
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
    const mcp = isRecord(config.mcp) ? withoutLegacyPamKey(config.mcp) : {}
    const updated = {
      ...config,
      $schema: typeof config.$schema === 'string' ? config.$schema : defaultConfig.$schema,
      instructions: nextInstructions,
      mcp: {
        ...mcp,
        pam: PAM_MCP_SERVER,
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
      pam: {
        command: 'pam',
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
    const mcpServers = isRecord(config.mcpServers) ? withoutLegacyPamKey(config.mcpServers) : {}
    const updated = {
      ...config,
      mcpServers: {
        ...mcpServers,
        pam: defaultConfig.mcpServers.pam,
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
      pam: PAM_VSCODE_MCP_SERVER,
    },
  }

  await mkdir(dirname(filePath), { recursive: true })

  if (!existsSync(filePath)) {
    await writeJson(filePath, defaultConfig)
    return { path: filePath, status: 'created' }
  }

  try {
    const config = JSON.parse(await readFile(filePath, 'utf-8')) as Record<string, unknown>
    const servers = isRecord(config.servers) ? withoutLegacyPamKey(config.servers) : {}
    const updated = {
      ...config,
      servers: {
        ...servers,
        pam: PAM_VSCODE_MCP_SERVER,
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
  const tableHeaderLower = tableHeader.toLowerCase()
  const start = lines.findIndex((line) => line.trim().toLowerCase() === tableHeaderLower)

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

function withoutLegacyPamKey(value: Record<string, unknown>): Record<string, unknown> {
  const output = { ...value }
  delete output.PAM
  return output
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
