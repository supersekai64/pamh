import { describe, expect, it } from 'vitest'
import { inferMemoryTheme, normalizeMemoryTheme } from './themes.js'

describe('themes', () => {
  it('uses strict current theme names without legacy theme aliases', () => {
    expect(normalizeMemoryTheme('instruction')).toBe('instruction')
    expect(normalizeMemoryTheme('conversation')).toBe('conversation')
    expect(normalizeMemoryTheme('fact')).toBe('fact')

    expect(normalizeMemoryTheme('guideline')).toBeUndefined()
    expect(normalizeMemoryTheme('context')).toBeUndefined()
    expect(normalizeMemoryTheme('knowledge')).toBeUndefined()
  })

  it('infers current theme names from memory types', () => {
    expect(inferMemoryTheme({ type: 'rule' })).toBe('instruction')
    expect(inferMemoryTheme({ type: 'exchange' })).toBe('conversation')
    expect(inferMemoryTheme({ type: 'knowledge' })).toBe('fact')
  })
})
