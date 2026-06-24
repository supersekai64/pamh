const MAX_TITLE_LENGTH = 72

const LEADING_NOISE_PATTERNS = [
  /^(always|never|from now on|remember that|note that)\s+/i,
  /^(the\s+)?pam(h)?\s+/i,
]

export function generateMemoryTitle(content: string, fallbackId?: string): string {
  const cleaned = cleanTitleCandidate(firstMeaningfulLine(content))
  if (!cleaned) return fallbackId ?? ''

  return truncateTitle(cleaned)
}

function firstMeaningfulLine(content: string): string {
  return (
    content
      .split(/\r?\n/)
      .map((line) => line.replace(/^[-*#>\s]+/, '').trim())
      .find((line) => line.length > 0) ?? ''
  )
}

function cleanTitleCandidate(value: string): string {
  let cleaned = value
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/[.。!?]+$/g, '')
    .trim()

  for (const pattern of LEADING_NOISE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '').trim()
  }

  return cleaned
}

function truncateTitle(value: string): string {
  if (value.length <= MAX_TITLE_LENGTH) return value

  const shortened = value.slice(0, MAX_TITLE_LENGTH + 1)
  const lastSpace = shortened.lastIndexOf(' ')
  const boundary = lastSpace >= 40 ? lastSpace : MAX_TITLE_LENGTH

  return value
    .slice(0, boundary)
    .replace(/[,:;/-]+$/g, '')
    .trim()
}
