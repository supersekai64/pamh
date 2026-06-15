export type ConceptCategory = 'tag' | 'keyword'

export interface ConceptCandidate {
  id: string
  title: string
  category: ConceptCategory
  weight: number
}

interface TokenCandidate {
  normalized: string
  raw: string
  strong: boolean
}

interface WordSegment {
  segment: string
  isWordLike?: boolean
}

type Segmenter = {
  segment(input: string): Iterable<WordSegment>
}

type SegmenterConstructor = new (
  locale?: string | string[],
  options?: { granularity?: 'grapheme' | 'word' | 'sentence' }
) => Segmenter

const IMPORTANT_SHORT_CONCEPTS = new Set(['ai', 'api', 'db', 'ui', 'ux'])

const SPECIAL_LABELS: Record<string, string> = {
  ai: 'AI',
  api: 'API',
  db: 'DB',
  llm: 'LLM',
  mcp: 'MCP',
  sdk: 'SDK',
  sqlite: 'SQLite',
  threejs: 'Three.js',
  ui: 'UI',
  ux: 'UX',
  webgl: 'WebGL',
}

const TECHNICAL_TERMS = new Set([
  ...Object.keys(SPECIAL_LABELS),
  'cli',
  'codex',
  'copilot',
  'cursor',
  'github',
  'localstorage',
  'nextjs',
  'node',
  'npm',
  'opencode',
  'pnpm',
  'react',
  'typescript',
  'vite',
])

const STOP_CONCEPTS = new Set([
  'a',
  'about',
  'active',
  'after',
  'also',
  'and',
  'are',
  'as',
  'au',
  'aux',
  'avec',
  'browser',
  'but',
  'can',
  'ce',
  'ces',
  'cet',
  'cette',
  'content',
  'created',
  'dans',
  'de',
  'deleted',
  'des',
  'donc',
  'du',
  'each',
  'elle',
  'elles',
  'en',
  'est',
  'et',
  'eux',
  'for',
  'from',
  'global',
  'has',
  'have',
  'il',
  'ils',
  'indexed',
  'into',
  'is',
  'it',
  'its',
  'la',
  'le',
  'les',
  'local',
  'longer',
  'manual',
  'memory',
  'memories',
  'ne',
  'not',
  'now',
  'of',
  'only',
  'on',
  'or',
  'par',
  'pas',
  'pamh',
  'pour',
  'project',
  'proposed',
  'quand',
  'que',
  'qui',
  'sa',
  'se',
  'ses',
  'session',
  'should',
  'son',
  'sont',
  'source',
  'status',
  'store',
  'sur',
  'the',
  'this',
  'through',
  'to',
  'un',
  'une',
  'updated',
  'use',
  'user',
  'with',
])

export function extractConceptCandidates(content: string, tags: string[] = []): ConceptCandidate[] {
  const candidates = new Map<string, ConceptCandidate>()

  for (const tag of tags) {
    const normalized = normalizeConcept(tag)
    if (!normalized) continue
    upsertCandidate(candidates, normalized, 'tag', 5)
  }

  const tokens = extractTokenCandidates(content)
  const singleCounts = new Map<string, number>()
  for (const token of tokens) {
    singleCounts.set(token.normalized, (singleCounts.get(token.normalized) ?? 0) + 1)
  }

  for (const token of tokens) {
    if (!token.strong) continue
    upsertCandidate(candidates, token.normalized, 'keyword', 2.5)
  }

  for (const phrase of extractPhraseCandidates(tokens)) {
    upsertCandidate(candidates, phrase.id, 'keyword', phrase.weight)
  }

  for (const [normalized, count] of singleCounts) {
    if (count < 2) continue
    if (candidates.has(normalized)) continue
    if (!isStrongStandaloneConcept(normalized)) continue
    upsertCandidate(candidates, normalized, 'keyword', 1.5)
  }

  return [...candidates.values()].sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id))
}

export function extractConceptKeywords(content: string): string[] {
  return extractConceptCandidates(content)
    .filter((candidate) => candidate.category === 'keyword')
    .map((candidate) => candidate.id)
}

export function tokenizeConceptText(content: string): string[] {
  return rawWords(content)
    .map((word) => normalizeConcept(word))
    .filter((word): word is string => Boolean(word))
}

export function normalizeConcept(value: string): string | null {
  const normalized = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/three\.?js/g, 'threejs')
    .replace(/next\.?js/g, 'nextjs')
    .replace(/[\p{Pc}]/gu, '-')
    .replace(/[^\p{L}\p{N}+#.\-\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.#-]+|[.#-]+$/g, '')
  const canonical = canonicalizeConcept(normalized)

  if (!canonical || /^\d+$/u.test(canonical)) return null
  if (canonical.length < 3 && !IMPORTANT_SHORT_CONCEPTS.has(canonical)) return null
  if (isStopConcept(canonical)) return null
  return canonical
}

export function formatConceptLabel(value: string): string {
  const normalized = normalizeConcept(value) ?? value
  if (SPECIAL_LABELS[normalized]) return SPECIAL_LABELS[normalized]

  return normalized
    .split(/([\s-]+)/)
    .map((part) => {
      if (/^[\s-]+$/u.test(part)) return part
      return SPECIAL_LABELS[part] ?? part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join('')
}

export function isStopConcept(value: string): boolean {
  const normalized = canonicalizeConcept(value.toLowerCase().trim())
  if (!normalized) return true
  if (STOP_CONCEPTS.has(normalized)) return true
  const parts = normalized.split(/[\s-]+/).filter(Boolean)
  return parts.length > 0 && parts.every((part) => STOP_CONCEPTS.has(part))
}

function extractTokenCandidates(content: string): TokenCandidate[] {
  return rawWords(content)
    .map((raw) => {
      const normalized = normalizeConcept(raw)
      if (!normalized) return null
      return {
        normalized,
        raw,
        strong: isStrongRawToken(raw, normalized),
      }
    })
    .filter((token): token is TokenCandidate => Boolean(token))
}

function extractPhraseCandidates(tokens: TokenCandidate[]): Array<{ id: string; weight: number }> {
  const counts = new Map<string, { count: number; strong: boolean; length: number }>()

  for (let index = 0; index < tokens.length; index += 1) {
    for (const size of [2, 3]) {
      const slice = tokens.slice(index, index + size)
      if (slice.length !== size) continue
      if (!slice.some((token) => token.strong)) continue
      if (slice.every((token) => !isMeaningfulPhraseToken(token))) continue
      const id = normalizeConcept(slice.map((token) => token.normalized).join(' '))
      if (!id) continue
      const current = counts.get(id) ?? { count: 0, strong: false, length: size }
      counts.set(id, {
        count: current.count + 1,
        strong: current.strong || slice.some((token) => token.strong),
        length: size,
      })
    }
  }

  return [...counts.entries()]
    .filter(([, bucket]) => bucket.strong)
    .map(([id, bucket]) => ({
      id,
      weight: bucket.length * 1.4 + Math.min(bucket.count, 3),
    }))
}

function upsertCandidate(
  candidates: Map<string, ConceptCandidate>,
  id: string,
  category: ConceptCategory,
  weight: number
): void {
  const current = candidates.get(id)
  candidates.set(id, {
    id,
    title: formatConceptLabel(id),
    category: current?.category === 'tag' ? 'tag' : category,
    weight: (current?.weight ?? 0) + weight,
  })
}

function rawWords(content: string): string[] {
  const SegmenterImpl = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter
  if (SegmenterImpl) {
    return [...new SegmenterImpl(undefined, { granularity: 'word' }).segment(content)]
      .filter((segment) => segment.isWordLike !== false)
      .map((segment) => segment.segment)
      .filter((segment) => /[\p{L}\p{N}]/u.test(segment))
  }

  return content.match(/[\p{L}\p{N}][\p{L}\p{N}_./+#-]*/gu) ?? []
}

function isStrongStandaloneConcept(normalized: string): boolean {
  return TECHNICAL_TERMS.has(normalized) || /[.+#-]/u.test(normalized)
}

function isStrongRawToken(raw: string, normalized: string): boolean {
  if (TECHNICAL_TERMS.has(normalized)) return true
  if (IMPORTANT_SHORT_CONCEPTS.has(normalized)) return true
  if (/[._/\\+#-]/u.test(raw)) return true
  if (/\d/u.test(raw) && /\p{L}/u.test(raw)) return true
  if (/^[A-Z0-9]{2,}$/u.test(raw)) return true
  if (/^\p{Lu}[\p{Ll}\p{N}]+(?:\p{Lu}[\p{Ll}\p{N}]+)+/u.test(raw)) return true
  if (/^\p{Ll}+[\p{Lu}]/u.test(raw)) return true
  if (/^\p{Lu}[\p{Ll}\p{N}]{3,}$/u.test(raw) && !STOP_CONCEPTS.has(normalized)) return true
  return false
}

function isMeaningfulPhraseToken(token: TokenCandidate): boolean {
  return token.strong || token.normalized.length >= 5 || /[.+#-]/u.test(token.normalized)
}

function canonicalizeConcept(value: string): string {
  return value
    .split(/(\s+|-)/)
    .map((part) => {
      if (/^\s+$|^-+$/u.test(part)) return part
      return singularizeEnglishConcept(part)
    })
    .join('')
}

function singularizeEnglishConcept(value: string): string {
  const irregular: Record<string, string> = {
    analyses: 'analysis',
    children: 'child',
    criteria: 'criterion',
    data: 'data',
    indices: 'index',
    people: 'person',
  }
  if (irregular[value]) return irregular[value]
  if (IMPORTANT_SHORT_CONCEPTS.has(value)) return value
  if (/^(css|ss|status|nextjs|threejs|webgl|kubernetes)$/u.test(value)) return value
  if (value.length <= 3) return value
  if (value.endsWith('ies') && value.length > 4) return `${value.slice(0, -3)}y`
  if (/(ches|shes|xes|zes)$/u.test(value) && value.length > 5) return value.slice(0, -2)
  if (value.endsWith('ses') && !value.endsWith('sses') && value.length > 5)
    return value.slice(0, -2)
  if (value.endsWith('s') && !/(ss|us|is)$/u.test(value) && value.length > 4) {
    return value.slice(0, -1)
  }
  return value
}
