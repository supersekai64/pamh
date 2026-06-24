import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { configureCodexGlobalIntegration, configureProjectIntegrations } from './integrations.js'

describe('integrations', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pam-integrations-test-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should create project integration files', async () => {
    const result = await configureProjectIntegrations(tempDir)

    expect(result.results.every((entry) => entry.status === 'created')).toBe(true)
    expect(existsSync(join(tempDir, 'AGENTS.md'))).toBe(true)
    expect(existsSync(join(tempDir, 'CLAUDE.md'))).toBe(true)
    expect(existsSync(join(tempDir, '.ai-memory', 'auto-capture.yaml'))).toBe(true)
    expect(existsSync(join(tempDir, '.claude', 'settings.json'))).toBe(true)
    expect(existsSync(join(tempDir, '.codex', 'hooks.json'))).toBe(true)
    expect(existsSync(join(tempDir, 'opencode.json'))).toBe(true)
    expect(existsSync(join(tempDir, '.mcp.json'))).toBe(true)
    expect(existsSync(join(tempDir, '.vscode', 'mcp.json'))).toBe(true)
    expect(existsSync(join(tempDir, '.cursor', 'mcp.json'))).toBe(true)
    expect(existsSync(join(tempDir, '.cursor', 'rules', 'pam.mdc'))).toBe(true)
    expect(existsSync(join(tempDir, '.github', 'copilot-instructions.md'))).toBe(true)
  })

  it('should configure VS Code MCP server', async () => {
    await configureProjectIntegrations(tempDir)

    const raw = await readFile(join(tempDir, '.vscode', 'mcp.json'), 'utf-8')
    const config = JSON.parse(raw)

    expect(config.servers.pam).toEqual({
      command: 'pam',
      args: ['server', 'start'],
    })
  })

  it('should configure Claude Code hooks', async () => {
    await configureProjectIntegrations(tempDir)

    const raw = await readFile(join(tempDir, '.claude', 'settings.json'), 'utf-8')
    const config = JSON.parse(raw)

    expect(config.hooks.SessionStart[0].hooks[0].command).toContain('pam hook record')
    expect(config.hooks.SessionStart[0].hooks[0].command).toContain('--agent claude-code')
    expect(config.hooks.Stop[0].hooks[0].command).toContain('session-end')
    expect(raw).not.toContain('--project')
  })

  it('should configure Codex hooks with the Codex agent label', async () => {
    await configureProjectIntegrations(tempDir)

    const raw = await readFile(join(tempDir, '.codex', 'hooks.json'), 'utf-8')
    const config = JSON.parse(raw)

    expect(config.hooks.SessionStart[0].hooks[0].command).toBe(
      'pam hook record session-start --agent codex'
    )
    expect(config.hooks.UserPromptSubmit[0].hooks[0].command).toBe(
      'pam hook record user-prompt --agent codex'
    )
    expect(config.hooks.Stop[0].hooks[0].command).toBe('pam hook record session-end --agent codex')
    expect(raw).not.toContain('--agent claude-code')
  })

  it('should migrate stale Codex hooks that were labeled as Claude Code', async () => {
    await mkdir(join(tempDir, '.codex'), { recursive: true })
    await writeFile(
      join(tempDir, '.codex', 'hooks.json'),
      JSON.stringify(
        {
          hooks: {
            SessionStart: [
              {
                hooks: [
                  {
                    type: 'command',
                    command: 'pam hook record session-start --agent claude-code',
                  },
                ],
              },
            ],
            UserPromptSubmit: [
              {
                hooks: [
                  {
                    type: 'command',
                    command: 'pam hook record user-prompt --agent claude-code',
                  },
                ],
              },
            ],
            Stop: [
              {
                hooks: [
                  {
                    type: 'command',
                    command: 'pam hook record session-end --agent claude-code',
                  },
                ],
              },
            ],
          },
        },
        null,
        2
      ),
      'utf-8'
    )

    const result = await configureProjectIntegrations(tempDir)
    const codexResult = result.results.find((entry) =>
      entry.path.replaceAll('\\', '/').endsWith('.codex/hooks.json')
    )
    const raw = await readFile(join(tempDir, '.codex', 'hooks.json'), 'utf-8')

    expect(codexResult?.status).toBe('updated')
    expect(raw).toContain('--agent codex')
    expect(raw).not.toContain('--agent claude-code')
  })

  it('should configure opencode MCP and instructions', async () => {
    await configureProjectIntegrations(tempDir)

    const raw = await readFile(join(tempDir, 'opencode.json'), 'utf-8')
    const config = JSON.parse(raw)

    expect(config.instructions).toContain('AGENTS.md')
    expect(config.mcp.pam).toEqual({
      type: 'local',
      command: ['pam', 'server', 'start'],
      enabled: true,
    })
  })

  it('should merge existing opencode config', async () => {
    await writeFile(
      join(tempDir, 'opencode.json'),
      JSON.stringify({ username: 'tester', instructions: ['EXISTING.md'] }, null, 2),
      'utf-8'
    )

    await configureProjectIntegrations(tempDir)

    const raw = await readFile(join(tempDir, 'opencode.json'), 'utf-8')
    const config = JSON.parse(raw)

    expect(config.username).toBe('tester')
    expect(config.instructions).toEqual(['EXISTING.md', 'AGENTS.md'])
    expect(config.mcp.pam.command).toEqual(['pam', 'server', 'start'])
  })

  it('should update marked instruction block idempotently', async () => {
    await configureProjectIntegrations(tempDir)
    const first = await readFile(join(tempDir, 'AGENTS.md'), 'utf-8')

    await configureProjectIntegrations(tempDir)
    const second = await readFile(join(tempDir, 'AGENTS.md'), 'utf-8')

    expect(second).toBe(first)
    expect(second.match(/PAM:START/g)).toHaveLength(1)
  })

  it('should instruct agents to checkpoint durable user corrections', async () => {
    await configureProjectIntegrations(tempDir)

    const agents = await readFile(join(tempDir, 'AGENTS.md'), 'utf-8')

    expect(agents).toContain('Before your final response')
    expect(agents).toContain('User corrects you')
    expect(agents).toContain('memory_checkpoint')
    expect(agents).toContain('Strong concepts')
    expect(agents).toContain('concepts')
    expect(agents).toContain('update relevant documentation')
    expect(agents).toContain('auto capture mode')
    expect(agents).not.toContain('assisted capture mode** by default')
  })

  it('should generate project-only instructions with executable CLI fallbacks', async () => {
    await configureProjectIntegrations(tempDir)

    const files = [
      join(tempDir, 'AGENTS.md'),
      join(tempDir, 'CLAUDE.md'),
      join(tempDir, '.github', 'copilot-instructions.md'),
      join(tempDir, '.cursor', 'rules', 'pam.mdc'),
    ]

    for (const file of files) {
      const raw = await readFile(file, 'utf-8')
      expect(raw).toContain('pam search')
      expect(raw).toContain('PAM is project-only')
      expect(raw).not.toContain('--project')
      expect(raw).not.toContain('Use `global`')
    }
  })

  it('should skip invalid existing JSON configs', async () => {
    await writeFile(join(tempDir, 'opencode.json'), '{ invalid json', 'utf-8')

    const result = await configureProjectIntegrations(tempDir)
    const opencodeResult = result.results.find((entry) => entry.path.endsWith('opencode.json'))

    expect(opencodeResult?.status).toBe('skipped')
  })

  it('should configure global Codex MCP server', async () => {
    const codexHome = join(tempDir, '.codex-home')

    const result = await configureCodexGlobalIntegration(codexHome)
    const raw = await readFile(join(codexHome, 'config.toml'), 'utf-8')

    expect(result.status).toBe('created')
    expect(raw).toContain('[mcp_servers.pam]')
    expect(raw).toContain('command = "pam"')
    expect(raw).toContain('args = ["server", "start"]')
  })

  it('should update global Codex MCP server idempotently', async () => {
    const codexHome = join(tempDir, '.codex-home')
    const configPath = join(codexHome, 'config.toml')
    await mkdir(codexHome, { recursive: true })
    await writeFile(
      configPath,
      `model = "gpt-5.4"

[mcp_servers.PAM]
command = "old-memory"
args = ["old"]

[mcp_servers.node_repl]
command = "node_repl"
`,
      'utf-8'
    )

    const first = await configureCodexGlobalIntegration(codexHome)
    const second = await configureCodexGlobalIntegration(codexHome)
    const raw = await readFile(configPath, 'utf-8')

    expect(first.status).toBe('updated')
    expect(second.status).toBe('unchanged')
    expect(raw.match(/\[mcp_servers\.pam\]/g)).toHaveLength(1)
    expect(raw).toContain('model = "gpt-5.4"')
    expect(raw).toContain('[mcp_servers.node_repl]')
    expect(raw).toContain('command = "pam"')
    expect(raw).not.toContain('[mcp_servers.PAM]')
    expect(raw).not.toContain('old-memory')
  })
})
