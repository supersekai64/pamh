import { describe, expect, it } from 'vitest'
import { extractConceptCandidates, normalizeConcept } from './concepts.js'

describe('concept quality', () => {
  it('rejects standalone function words while keeping technical and entity-like concepts', () => {
    expect(normalizeConcept('est')).toBeNull()
    expect(normalizeConcept('avec')).toBeNull()
    expect(normalizeConcept('dans')).toBeNull()
    expect(normalizeConcept('localStorage')).toBe('localstorage')
    expect(normalizeConcept('Next.js')).toBe('nextjs')
  })

  it('extracts high-signal concepts from mixed French project text', () => {
    const candidates = extractConceptCandidates(
      [
        'La sauvegarde localStorage est supprimée quand la grille Sudoku est terminée.',
        'Le projet Next.js utilise PAMH avec une mémoire locale.',
      ].join(' ')
    )
    const ids = candidates.map((candidate) => candidate.id)

    expect(ids).toContain('localstorage')
    expect(ids).toContain('sudoku')
    expect(ids).toContain('nextjs')
    expect(ids).not.toContain('est')
    expect(ids).not.toContain('avec')
    expect(ids).not.toContain('dans')
  })

  it('uses tags as strong concepts even when content is sparse', () => {
    const candidates = extractConceptCandidates('Review the new screen.', [
      'memory-capture',
      'ui-density',
    ])
    const ids = candidates.map((candidate) => candidate.id)

    expect(ids).toContain('memory-capture')
    expect(ids).toContain('ui-density')
  })
})
