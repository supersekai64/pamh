export const MEMORY_THEMES = [
  'instruction',
  'decision',
  'issue',
  'preference',
  'task',
  'conversation',
  'session',
  'fact',
] as const

export type MemoryTheme = (typeof MEMORY_THEMES)[number]

const THEME_LABELS: Record<MemoryTheme, string> = {
  instruction: 'Instruction',
  decision: 'Decision',
  issue: 'Issue',
  preference: 'Preference',
  task: 'Task',
  conversation: 'Conversation',
  session: 'Session',
  fact: 'Fact',
}

export function isMemoryTheme(value: unknown): value is MemoryTheme {
  return typeof value === 'string' && MEMORY_THEMES.includes(value as MemoryTheme)
}

export function normalizeMemoryTheme(value: unknown): MemoryTheme | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  const aliases: Record<string, MemoryTheme> = {
    architecture: 'fact',
    bug: 'issue',
    bugs: 'issue',
    chat: 'conversation',
    chats: 'conversation',
    conversation: 'conversation',
    conversations: 'conversation',
    decision: 'decision',
    decisions: 'decision',
    doc: 'fact',
    docs: 'fact',
    error: 'issue',
    failure: 'issue',
    fact: 'fact',
    facts: 'fact',
    instruction: 'instruction',
    instructions: 'instruction',
    issue: 'issue',
    issues: 'issue',
    memory: 'conversation',
    preference: 'preference',
    preferences: 'preference',
    problem: 'issue',
    raw: 'conversation',
    rule: 'instruction',
    rules: 'instruction',
    session: 'session',
    task: 'task',
    tasks: 'task',
  }

  return aliases[normalized] ?? (isMemoryTheme(normalized) ? normalized : undefined)
}

export function inferMemoryTheme(input: {
  type?: string
  content?: string
  tags?: string[]
  source?: string
  theme?: string
}): MemoryTheme {
  const explicit = normalizeMemoryTheme(input.theme)
  if (explicit) return explicit

  for (const tag of input.tags ?? []) {
    const theme = normalizeMemoryTheme(tag)
    if (theme && !['fact', 'conversation'].includes(theme)) return theme
  }

  switch (input.type) {
    case 'rule':
      return 'instruction'
    case 'decision':
      return 'decision'
    case 'mistake':
      return 'issue'
    case 'preference':
      return 'preference'
    case 'task':
      return 'task'
    case 'session':
      return 'session'
    case 'exchange':
      return 'conversation'
  }

  const text = `${input.tags?.join(' ') ?? ''} ${input.content ?? ''}`
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')

  if (/\b(always|never|must|should|rule|toujours|jamais|doit|devrait)\b/.test(text)) {
    return 'instruction'
  }
  if (/\b(decide[sd]?|decision|choose|chosen|use|adopt|choisir|decision)\b/.test(text)) {
    return 'decision'
  }
  if (/\b(issue|bug|error|fail|failure|mistake|problem|probleme|erreur|echec)\b/.test(text)) {
    return 'issue'
  }

  return input.source?.includes('hook') ? 'conversation' : 'fact'
}

export function formatMemoryTheme(theme: string): string {
  const normalized = normalizeMemoryTheme(theme)
  if (normalized) return THEME_LABELS[normalized]
  return theme
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}
