import { describe, expect, it } from 'vitest'
import type { ParsedIngredient } from '@herrku/shared'
import { parseIngredient } from '@herrku/shared'

type Case = [input: string, expected: ParsedIngredient]

const cases: Case[] = [
  [
    '1 1/2 cups flour',
    { quantity: 1.5, quantityMax: null, unit: 'cup', name: 'flour', note: null },
  ],
  [
    '2–3 cloves garlic, minced',
    { quantity: 2, quantityMax: 3, unit: 'clove', name: 'garlic', note: 'minced' },
  ],
  ['½ tsp salt', { quantity: 0.5, quantityMax: null, unit: 'tsp', name: 'salt', note: null }],
  [
    '400 g canned tomatoes',
    { quantity: 400, quantityMax: null, unit: 'g', name: 'canned tomatoes', note: null },
  ],
  ['2 eggs', { quantity: 2, quantityMax: null, unit: null, name: 'eggs', note: null }],
  [
    'salt to taste',
    { quantity: null, quantityMax: null, unit: null, name: 'salt', note: 'to taste' },
  ],
  [
    '1 x 400g tin chickpeas',
    { quantity: 1, quantityMax: null, unit: 'can', name: 'chickpeas', note: '400 g' },
  ],
  [
    '2 × 400 g tins chopped tomatoes',
    { quantity: 2, quantityMax: null, unit: 'can', name: 'chopped tomatoes', note: '400 g' },
  ],
  [
    '1 (400 g) tin chickpeas',
    { quantity: 1, quantityMax: null, unit: 'can', name: 'chickpeas', note: '400 g' },
  ],
  ['1/2 cup milk', { quantity: 0.5, quantityMax: null, unit: 'cup', name: 'milk', note: null }],
  ['1½ tbsp sugar', { quantity: 1.5, quantityMax: null, unit: 'tbsp', name: 'sugar', note: null }],
  [
    '2 to 3 cloves garlic',
    { quantity: 2, quantityMax: 3, unit: 'clove', name: 'garlic', note: null },
  ],
  [
    '1.5 kg potatoes',
    { quantity: 1.5, quantityMax: null, unit: 'kg', name: 'potatoes', note: null },
  ],
  ['3 cloves garlic', { quantity: 3, quantityMax: null, unit: 'clove', name: 'garlic', note: null }],
  [
    '1 tsp salt, divided',
    { quantity: 1, quantityMax: null, unit: 'tsp', name: 'salt', note: 'divided' },
  ],
  ['2 eggs, beaten', { quantity: 2, quantityMax: null, unit: null, name: 'eggs', note: 'beaten' }],
  [
    '1 (14 oz) can tomatoes',
    { quantity: 1, quantityMax: null, unit: 'can', name: 'tomatoes', note: '14 oz' },
  ],
  ['', { quantity: null, quantityMax: null, unit: null, name: '', note: null }],
  ['   ', { quantity: null, quantityMax: null, unit: null, name: '', note: null }],
  ['salt', { quantity: null, quantityMax: null, unit: null, name: 'salt', note: null }],
  [
    '1 scoop protein powder',
    { quantity: 1, quantityMax: null, unit: null, name: 'scoop protein powder', note: null },
  ],
  [
    '2 cups flour',
    { quantity: 2, quantityMax: null, unit: 'cup', name: 'flour', note: null },
  ],
]

describe('parseIngredient', () => {
  it.each(cases)('parses %j', (input, expected) => {
    expect(parseIngredient(input)).toEqual(expected)
  })

  it('never throws on malformed input', () => {
    const malformed = [
      '1/0 cup sugar',
      '-1 cup sugar',
      '2-3-4 apples',
      '½½½',
      '1 1/1 cups',
      'x'.repeat(500),
      ',,,',
      '1 cup, ,',
      '0 g',
    ]
    for (const input of malformed) {
      expect(() => parseIngredient(input)).not.toThrow()
    }
  })

  it('falls back to the whole text when a quantity parse leaves a broken name', () => {
    expect(parseIngredient('1/0 cup sugar')).toEqual({
      quantity: null,
      quantityMax: null,
      unit: null,
      name: '1/0 cup sugar',
      note: null,
    })
    expect(parseIngredient('2-3-4 apples')).toEqual({
      quantity: null,
      quantityMax: null,
      unit: null,
      name: '2-3-4 apples',
      note: null,
    })
    expect(parseIngredient('-1 cup sugar').quantity).toBeNull()
  })

  it('normalizes whitespace and unicode', () => {
    expect(parseIngredient('  2   cups   flour  ')).toEqual({
      quantity: 2,
      quantityMax: null,
      unit: 'cup',
      name: 'flour',
      note: null,
    })
  })
})
