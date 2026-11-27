import { describe, expect, it } from 'vitest'
import { slugify } from '@herrku/shared'

describe('slugify', () => {
  it.each([
    ['Pähkinäleipä', 'pahkinaleipa'],
    ['Crème Brûlée', 'creme-brulee'],
    ['  Hello, World!  ', 'hello-world'],
    ['Øl & Æble', 'ol-aeble'],
    ['Straße', 'strasse'],
    ['Maito 2%', 'maito-2'],
    ['Already-slugged', 'already-slugged'],
    ['---dashes---', 'dashes'],
  ])('slugifies %j as %j', (input, expected) => {
    expect(slugify(input)).toBe(expected)
  })

  it('falls back to "recipe" for empty or symbol-only titles', () => {
    expect(slugify('')).toBe('recipe')
    expect(slugify('«»')).toBe('recipe')
  })

  it('truncates to 60 characters without a trailing dash', () => {
    const slug = slugify('a'.repeat(80))
    expect(slug).toHaveLength(60)
    expect(slug.endsWith('-')).toBe(false)
  })

  it('produces stable output for the same input', () => {
    expect(slugify('Pähkinäleipä')).toBe(slugify('Pähkinäleipä'))
  })
})
