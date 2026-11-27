import { describe, expect, it } from 'vitest'
import { buildSearchText } from '@herrku/shared'

describe('buildSearchText', () => {
  it('lowercases the title, ingredient names and tags', () => {
    expect(
      buildSearchText({ title: 'Pähkinäleipä', ingredientNames: ['Jauhot', 'Maito'], tags: ['Leipä'] }),
    ).toBe('pähkinäleipä\njauhot\nmaito\nleipä')
  })

  it('collapses whitespace and normalizes unicode', () => {
    expect(
      buildSearchText({ title: '  Crème   Brûlée ', ingredientNames: ['  Crème '], tags: [] }),
    ).toBe('crème brûlée\ncrème')
  })

  it('omits empty segments', () => {
    expect(buildSearchText({ title: 'Soup', ingredientNames: ['', '  '], tags: [] })).toBe('soup')
  })

  it('handles finnish characters in both cases', () => {
    const text = buildSearchText({ title: 'PÄHKINÄLEIPÄ', ingredientNames: [], tags: [] })
    expect(text).toContain('pähkinäleipä')
    expect(text).not.toContain('PÄHKINÄ')
  })
})
