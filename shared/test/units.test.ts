import { describe, expect, it } from 'vitest'
import { UNIT_TOKENS, matchUnit, unitLabel } from '@herrku/shared'

describe('UNIT_TOKENS', () => {
  it('has no duplicates', () => {
    expect(new Set(UNIT_TOKENS).size).toBe(UNIT_TOKENS.length)
  })

  it('contains the canonical tokens used by the parser', () => {
    for (const token of ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'clove', 'can', 'piece']) {
      expect(UNIT_TOKENS).toContain(token)
    }
  })
})

describe('matchUnit', () => {
  it.each([
    ['g', 'g'],
    ['gram', 'g'],
    ['grams', 'g'],
    ['Gram', 'g'],
    ['kg', 'kg'],
    ['kilograms', 'kg'],
    ['mg', 'mg'],
    ['ml', 'ml'],
    ['millilitres', 'ml'],
    ['milliliters', 'ml'],
    ['l', 'l'],
    ['litre', 'l'],
    ['liters', 'l'],
    ['cl', 'cl'],
    ['dl', 'dl'],
    ['tsp', 'tsp'],
    ['teaspoon', 'tsp'],
    ['teaspoons', 'tsp'],
    ['tbsp', 'tbsp'],
    ['tablespoons', 'tbsp'],
    ['oz', 'oz'],
    ['ounces', 'oz'],
    ['lb', 'lb'],
    ['pounds', 'lb'],
    ['piece', 'piece'],
    ['pieces', 'piece'],
    ['stick', 'piece'],
    ['heads', 'piece'],
    ['clove', 'clove'],
    ['cloves', 'clove'],
    ['slice', 'slice'],
    ['sprigs', 'sprig'],
    ['pinches', 'pinch'],
    ['dashes', 'dash'],
    ['bunches', 'bunch'],
    ['handfuls', 'handful'],
    ['can', 'can'],
    ['tins', 'can'],
    ['jar', 'jar'],
    ['packet', 'packet'],
    ['pkg', 'packet'],
    ['packages', 'packet'],
    ['sheets', 'sheet'],
    ['stalks', 'stalk'],
  ] as const)('maps %s to %s', (input, expected) => {
    expect(matchUnit(input)).toBe(expected)
  })

  it('returns null for unknown or empty tokens', () => {
    expect(matchUnit('bananas')).toBeNull()
    expect(matchUnit('')).toBeNull()
    expect(matchUnit('   ')).toBeNull()
  })
})

describe('unitLabel', () => {
  it.each([
    ['clove', 1, 'clove'],
    ['clove', 3, 'cloves'],
    ['g', 400, 'g'],
    ['kg', 1.5, 'kg'],
    ['tsp', 2, 'tsp'],
    ['pinch', 3, 'pinches'],
    ['dash', 2, 'dashes'],
    ['bunch', 2, 'bunches'],
    ['handful', 2, 'handfuls'],
    ['can', 2, 'cans'],
    ['jar', 2, 'jars'],
    ['packet', 2, 'packets'],
    ['sheet', 2, 'sheets'],
    ['stalk', 2, 'stalks'],
    ['piece', 2, 'pieces'],
    ['slice', 2, 'slices'],
    ['sprig', 2, 'sprigs'],
    ['oz', 2, 'oz'],
    ['lb', 2, 'lb'],
  ] as const)('renders %s with count %s as %s', (unit, count, expected) => {
    expect(unitLabel(unit, count)).toBe(expected)
  })
})
