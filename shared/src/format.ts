import type { Unit } from './units.js'
import { unitLabel } from './units.js'

const TOLERANCE = 0.01

const FRACTION_GLYPHS: Array<[number, string]> = [
  [1 / 8, '⅛'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [3 / 8, '⅜'],
  [1 / 2, '½'],
  [5 / 8, '⅝'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
  [7 / 8, '⅞'],
]

export function formatNumber(value: number): string {
  const rounded = Math.round(value)
  if (Math.abs(value - rounded) <= TOLERANCE) return String(rounded)

  const whole = Math.floor(value)
  const fraction = value - whole
  for (const [target, glyph] of FRACTION_GLYPHS) {
    if (Math.abs(fraction - target) <= TOLERANCE) {
      return `${whole > 0 ? whole : ''}${glyph}`
    }
  }

  return String(Math.round(value * 100) / 100)
}

export function formatQuantity(quantity: number | null, quantityMax: number | null): string {
  if (quantity === null) return ''
  if (quantityMax !== null && Math.abs(quantityMax - quantity) > TOLERANCE) {
    return `${formatNumber(quantity)}–${formatNumber(quantityMax)}`
  }
  return formatNumber(quantity)
}

export interface RenderLine {
  quantity: number | null
  quantityMax: number | null
  unit: Unit | null
  name: string
  notes: string[]
}

export function formatLine(line: RenderLine): string {
  const parts: string[] = []
  const quantity = formatQuantity(line.quantity, line.quantityMax)
  if (quantity) parts.push(quantity)
  if (line.unit) parts.push(unitLabel(line.unit, line.quantityMax ?? line.quantity))
  if (line.name) parts.push(line.name)

  const notes = line.notes.length > 0 ? ` (${line.notes.join(', ')})` : ''
  return `${parts.join(' ')}${notes}`
}

export function renderShoppingList(lines: RenderLine[]): string {
  if (lines.length === 0) return ''
  return `${lines.map(formatLine).join('\n')}\n`
}
