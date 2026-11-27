import { describe, expect, it } from 'vitest'
import { formatLine, formatQuantity, unitLabel } from '@herrku/shared'

describe('formatQuantity', () => {
  it.each([
    [null, null, ''],
    [2, null, '2'],
    [0.5, null, '½'],
    [0.25, null, '¼'],
    [0.75, null, '¾'],
    [0.125, null, '⅛'],
    [1.5, null, '1½'],
    [2.25, null, '2¼'],
    [1 / 3, null, '⅓'],
    [2 / 3, null, '⅔'],
    [1.3333, null, '1⅓'],
    [1.33, null, '1⅓'],
    [0.1, null, '0.1'],
    [1.1, null, '1.1'],
    [0.001, null, '0'],
    [2, 3, '2–3'],
    [2, 2, '2'],
    [3.5, 4, '3½–4'],
    [null, 3, ''],
  ] as const)('renders %s–%s as %j', (quantity, quantityMax, expected) => {
    expect(formatQuantity(quantity, quantityMax)).toBe(expected)
  })
})

describe('formatLine', () => {
  const base = { quantity: null, quantityMax: null, unit: null, name: '', notes: [] as string[] }

  it('renders a quantified line', () => {
    expect(
      formatLine({ ...base, quantity: 2, unit: 'cup', name: 'flour' }),
    ).toBe('2 cups flour')
  })

  it('renders a weight line without pluralizing', () => {
    expect(
      formatLine({ ...base, quantity: 400, unit: 'g', name: 'canned tomatoes' }),
    ).toBe('400 g canned tomatoes')
  })

  it('renders a single countable item in the singular', () => {
    expect(formatLine({ ...base, quantity: 1, unit: 'clove', name: 'garlic' })).toBe(
      '1 clove garlic',
    )
  })

  it('renders an unquantified line with its note', () => {
    expect(formatLine({ ...base, name: 'salt', notes: ['to taste'] })).toBe('salt (to taste)')
  })

  it('renders multiple notes comma separated', () => {
    expect(
      formatLine({ ...base, quantity: 3, unit: 'clove', name: 'garlic', notes: ['minced', 'divided'] }),
    ).toBe('3 cloves garlic (minced, divided)')
  })

  it('renders a range with plural units', () => {
    expect(
      formatLine({ ...base, quantity: 2, quantityMax: 3, unit: 'clove', name: 'garlic' }),
    ).toBe('2–3 cloves garlic')
  })
})

describe('unitLabel', () => {
  it('uses singular for a fractional count below one', () => {
    expect(unitLabel('cup', 0.5)).toBe('cup')
  })
})
