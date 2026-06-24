import { Command } from 'commander'
import { getProjectMemoryPath, recordHookEvent } from '@supersekai64/pam-core'

const HOOK_EVENT_TYPES = [
  'session-start',
  'user-prompt',
  'pre-tool-use',
  'post-tool-use',
  'pre-compact',
  'notification',
  'stop',
  'session-end',
  'other',
] as const

export function registerHookCommand(program: Command) {
  const hook = program.command('hook').description('Record agent lifecycle hook events')

  hook
    .command('record <type>')
    .description('Record a lifecycle hook event for assisted capture workflows')
    .option('--agent <agent>', 'Agent or tool name')
    .option('--model <model>', 'Model name when known')
    .option('--session-id <sessionId>', 'Agent session identifier')
    .option('--data <json>', 'Additional event data as JSON')
    .action(async (type, options) => {
      if (!HOOK_EVENT_TYPES.includes(type)) {
        console.error(`Invalid hook type. Must be one of: ${HOOK_EVENT_TYPES.join(', ')}`)
        process.exit(1)
      }

      let data: Record<string, unknown> = {}
      if (options.data) {
        try {
          const parsed = JSON.parse(options.data)
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Hook data must be a JSON object')
          }
          data = parsed as Record<string, unknown>
        } catch (error) {
          console.error(error instanceof Error ? error.message : String(error))
          process.exit(1)
        }
      } else {
        data = await readHookDataFromStdin()
      }

      if (options.model) {
        data.model = options.model
      }

      const basePath = getProjectMemoryPath(process.cwd())
      const event = await recordHookEvent(basePath, {
        type,
        agent: options.agent,
        session_id: options.sessionId,
        project_path: process.cwd(),
        data,
      })

      console.log(`Hook event recorded: ${event.id}`)
    })
}

async function readHookDataFromStdin(): Promise<Record<string, unknown>> {
  if (process.stdin.isTTY) return {}

  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  const raw = Buffer.concat(chunks).toString('utf-8').trim()
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return normalizeHookPayload(parsed as Record<string, unknown>)
    }
  } catch {
    // Fall through and treat stdin as plain prompt text.
  }

  return { text: raw }
}

function normalizeHookPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const prompt =
    firstString(payload, ['text', 'prompt', 'user_prompt', 'message', 'content', 'transcript']) ??
    firstString(payload, ['UserPrompt', 'userPrompt', 'prompt_text'])

  return prompt ? { ...payload, text: prompt } : payload
}

function firstString(payload: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim()) return value
  }

  return undefined
}
