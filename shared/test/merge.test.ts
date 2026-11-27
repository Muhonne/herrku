import { describe, expect, it } from 'vitest'
import type { IngredientLine, MergeSelection } from '@herrku/shared'
import { mergeShoppingList, renderShoppingList } from '@herrku/shared'

const ing = (over: Partial<IngredientLine> = {}): IngredientLine => ({
  section: null,
  quantity: null,
  quantityMax: null,
  unit: null,
  name: '',
  note: null,
  ...over,
})

const selection = (
  servings: number | null,
  ingredients: IngredientLine[],
  requested?: number,
): MergeSelection => ({
  recipe: { servings, ingredients },
  ...(requested === undefined ? {} : { servings: requested }),
})

describe('mergeShoppingList', () => {
  it('sums the same name and unit', () => {
    const lines = mergeShoppingList([
      selection(4, [ing({ quantity: 1, unit: 'g', name: 'flour' })]),
      selection(2, [ing({ quantity: 2, unit: 'g', name: 'flour' })]),
    ])
    expect(lines).toEqual([
      { name: 'flour', unit: 'g', quantity: 3, quantityMax: null, notes: [] },
    ])
  })

  it('scales by requested servings over recipe servings', () => {
    const lines = mergeShoppingList([
      selection(4, [ing({ quantity: 1, unit: 'g', name: 'flour' })], 8),
      selection(2, [ing({ quantity: 2, unit: 'g', name: 'flour' })]),
    ])
    expect(lines[0]?.quantity).toBe(4)
  })

  it('treats a missing recipe servings or requested servings as multiplier 1', () => {
    const lines = mergeShoppingList([
      selection(null, [ing({ quantity: 2, unit: 'g', name: 'salt' })], 10),
      selection(4, [ing({ quantity: 1, unit: 'g', name: 'salt' })], null),
    ])
    expect(lines[0]?.quantity).toBe(3)
  })

  it('adds ranges min to min and max to max', () => {
    const lines = mergeShoppingList([
      selection(4, [ing({ quantity: 2, quantityMax: 3, unit: 'clove', name: 'garlic' })]),
      selection(4, [ing({ quantity: 1, quantityMax: 2, unit: 'clove', name: 'garlic' })]),
    ])
    expect(lines).toEqual([
      { name: 'garlic', unit: 'clove', quantity: 3, quantityMax: 5, notes: [] },
    ])
  })

  it('keeps different units on separate lines', () => {
    const lines = mergeShoppingList([
      selection(4, [ing({ quantity: 100, unit: 'g', name: 'flour' })]),
      selection(4, [ing({ quantity: 250, unit: 'ml', name: 'flour' })]),
    ])
    expect(lines).toHaveLength(2)
    expect(lines.map((line) => line.unit)).toEqual(['g', 'ml'])
  })

  it('marks a merged line unquantified if any entry is unquantified', () => {
    const lines = mergeShoppingList([
      selection(4, [ing({ quantity: null, name: 'salt', note: 'to taste' })]),
      selection(4, [ing({ quantity: 2, name: 'salt' })]),
    ])
    expect(lines).toEqual([
      { name: 'salt', unit: null, quantity: null, quantityMax: null, notes: ['to taste'] },
    ])
  })

  it('dedupes notes case-insensitively and keeps the first spelling', () => {
    const lines = mergeShoppingList([
      selection(4, [ing({ quantity: 1, unit: 'clove', name: 'garlic', note: 'Minced' })]),
      selection(4, [ing({ quantity: 1, unit: 'clove', name: 'garlic', note: 'minced' })]),
      selection(4, [ing({ quantity: 1, unit: 'clove', name: 'garlic', note: 'divided' })]),
    ])
    expect(lines[0]?.notes).toEqual(['Minced', 'divided'])
  })

  it('merges names case-insensitively and keeps the first spelling', () => {
    const lines = mergeShoppingList([
      selection(4, [ing({ quantity: 1, unit: 'g', name: 'Flour' })]),
      selection(4, [ing({ quantity: 1, unit: 'g', name: 'flour' })]),
    ])
    expect(lines).toHaveLength(1)
    expect(lines[0]?.name).toBe('Flour')
    expect(lines[0]?.quantity).toBe(2)
  })

  it('collapses whitespace and normalizes unicode for keys', () => {
    const lines = mergeShoppingList([
      selection(4, [ing({ quantity: 1, unit: 'g', name: 'canned  tomatoes' })]),
      selection(4, [ing({ quantity: 1, unit: 'g', name: 'canned tomatoes' })]),
    ])
    expect(lines).toHaveLength(1)
  })

  it('sorts by name and then unit, independent of selection order', () => {
    const lines = mergeShoppingList([
      selection(4, [
        ing({ quantity: 1, name: 'salt' }),
        ing({ quantity: 1, name: 'garlic' }),
        ing({ quantity: 100, unit: 'g', name: 'flour' }),
        ing({ quantity: 250, unit: 'ml', name: 'flour' }),
      ]),
    ])
    expect(lines.map((line) => `${line.name}/${line.unit ?? ''}`)).toEqual([
      'flour/g',
      'flour/ml',
      'garlic/',
      'salt/',
    ])
  })

  it('returns an empty list for no selections', () => {
    expect(mergeShoppingList([])).toEqual([])
  })

  it('does not round merged quantities', () => {
    const lines = mergeShoppingList([
      selection(3, [ing({ quantity: 1, unit: 'g', name: 'milk' })]),
      selection(3, [ing({ quantity: 1, unit: 'g', name: 'milk' })]),
    ])
    expect(lines[0]?.quantity).toBe(2)
  })
})

describe('renderShoppingList', () => {
  it('joins formatted lines with a trailing newline', () => {
    const text = renderShoppingList([
      { name: 'flour', unit: 'g', quantity: 300, quantityMax: null, notes: [] },
      { name: 'garlic', unit: 'clove', quantity: 3, quantityMax: null, notes: ['minced'] },
      { name: 'salt', unit: null, quantity: null, quantityMax: null, notes: ['to taste'] },
    ])
    expect(text).toBe('300 g flour\n3 cloves garlic (minced)\nsalt (to taste)\n')
  })

  it('returns an empty string for no lines', () => {
    expect(renderShoppingList([])).toBe('')
  })
})
