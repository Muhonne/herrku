import type { Unit } from './units.js'

export interface IngredientLine {
  section: string | null
  quantity: number | null
  quantityMax: number | null
  unit: Unit | null
  name: string
  note: string | null
}

export interface MergeRecipe {
  servings: number | null
  ingredients: IngredientLine[]
}

export interface MergeSelection {
  recipe: MergeRecipe
  servings?: number | null
}

export interface ShoppingLine {
  name: string
  unit: Unit | null
  quantity: number | null
  quantityMax: number | null
  notes: string[]
}

interface Accumulator {
  name: string
  unit: Unit | null
  quantitySum: number
  maxSum: number
  hasRange: boolean
  unquantified: boolean
  notes: string[]
  seenNotes: Set<string>
}

const ROUNDING = 1e6

const round = (value: number): number => Math.round(value * ROUNDING) / ROUNDING

const normalizeName = (name: string): string =>
  name.normalize('NFC').replace(/\s+/g, ' ').trim()

function multiplierFor(recipeServings: number | null, requested: number | null | undefined): number {
  if (recipeServings === null || recipeServings <= 0) return 1
  if (requested === null || requested === undefined || requested <= 0) return 1
  return requested / recipeServings
}

export function mergeShoppingList(selections: MergeSelection[]): ShoppingLine[] {
  const accumulators = new Map<string, Accumulator>()

  for (const selection of selections) {
    const multiplier = multiplierFor(selection.recipe.servings, selection.servings)

    for (const ingredient of selection.recipe.ingredients) {
      const name = normalizeName(ingredient.name)
      if (!name) continue

      const key = `${name.toLowerCase()}\u0000${ingredient.unit ?? ''}`
      let accumulator = accumulators.get(key)
      if (!accumulator) {
        accumulator = {
          name,
          unit: ingredient.unit,
          quantitySum: 0,
          maxSum: 0,
          hasRange: false,
          unquantified: false,
          notes: [],
          seenNotes: new Set(),
        }
        accumulators.set(key, accumulator)
      }

      if (ingredient.quantity === null) {
        accumulator.unquantified = true
      } else {
        accumulator.quantitySum += ingredient.quantity * multiplier
        const max = ingredient.quantityMax ?? ingredient.quantity
        accumulator.maxSum += max * multiplier
        if (ingredient.quantityMax !== null) accumulator.hasRange = true
      }

      const note = ingredient.note?.trim()
      if (note) {
        const noteKey = note.toLowerCase()
        if (!accumulator.seenNotes.has(noteKey)) {
          accumulator.seenNotes.add(noteKey)
          accumulator.notes.push(note)
        }
      }
    }
  }

  const lines: ShoppingLine[] = []
  for (const accumulator of accumulators.values()) {
    const quantified = !accumulator.unquantified
    lines.push({
      name: accumulator.name,
      unit: accumulator.unit,
      quantity: quantified ? round(accumulator.quantitySum) : null,
      quantityMax:
        quantified && accumulator.hasRange ? round(accumulator.maxSum) : null,
      notes: accumulator.notes,
    })
  }

  lines.sort((a, b) => {
    const byName = a.name.localeCompare(b.name, 'fi')
    if (byName !== 0) return byName
    return (a.unit ?? '').localeCompare(b.unit ?? '')
  })

  return lines
}
