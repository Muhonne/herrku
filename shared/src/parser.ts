import { CONTAINER_WORDS, matchUnit, type Unit } from './units.js'

export interface ParsedIngredient {
  quantity: number | null
  quantityMax: number | null
  unit: Unit | null
  name: string
  note: string | null
}

const UNICODE_FRACTIONS: Record<string, number> = {
  '¼': 1 / 4,
  '½': 1 / 2,
  '¾': 3 / 4,
  '⅐': 1 / 7,
  '⅑': 1 / 9,
  '⅒': 1 / 10,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅕': 1 / 5,
  '⅖': 2 / 5,
  '⅗': 3 / 5,
  '⅘': 4 / 5,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
}

const UNICODE_FRACTION_CLASS = '\\u00BC-\\u00BE\\u2150-\\u215E'

const QTY_SRC = String.raw`(?:\d+\s+\d+\s*/\s*\d+|\d+\s*/\s*\d+|\d+(?:[.,]\d+)?\s*[\u00BC-\u00BE\u2150-\u215E]?|[\u00BC-\u00BE\u2150-\u215E])`

const RANGE_RE = new RegExp(
  String.raw`^\s*(${QTY_SRC})\s*(?:-|–|—|to)\s*(${QTY_SRC})(?=\s|$|[A-Za-z(])`,
  'i',
)

const SINGLE_RE = new RegExp(String.raw`^\s*(${QTY_SRC})(?=\s|$|[A-Za-z(])`, 'i')

const SIZE_RE = /^(\d+(?:\.\d+)?)\s*([a-zA-Z.]+)\s+/
const CONTAINER_RE = /^([a-zA-Z]+)\b\s*/
const NOTE_SPLIT_RE = /,/
const SUFFIX_NOTE_RE = /^(.*?)\s+(to taste|as needed|for garnish|for serving|for the garnish)$/i

const normalize = (input: string): string =>
  input.normalize('NFC').replace(/\s+/g, ' ').trim()

const cleanName = (input: string): string => normalize(input)

function parseQuantityToken(token: string): number | null {
  const value = token.trim().replace(',', '.')
  if (!value) return null

  const mixed = value.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/)
  if (mixed) {
    const whole = Number(mixed[1])
    const numerator = Number(mixed[2])
    const denominator = Number(mixed[3])
    if (!denominator) return null
    return whole + numerator / denominator
  }

  const fraction = value.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (fraction) {
    const numerator = Number(fraction[1])
    const denominator = Number(fraction[2])
    if (!denominator) return null
    return numerator / denominator
  }

  const wholePlusFraction = value.match(new RegExp(String.raw`^(\d+(?:[.,]\d+)?)\s*([${UNICODE_FRACTION_CLASS}])$`))
  if (wholePlusFraction) {
    const fraction = UNICODE_FRACTIONS[wholePlusFraction[2] ?? '']
    if (fraction === undefined) return null
    return Number(wholePlusFraction[1]?.replace(',', '.')) + fraction
  }

  if (UNICODE_FRACTIONS[value] !== undefined) return UNICODE_FRACTIONS[value] ?? null

  const decimal = value.match(/^\d+(?:\.\d+)?$/)
  if (decimal) return Number(value)

  return null
}

interface LeadingQuantity {
  value: number
  max: number | null
  rest: string
}

function matchLeadingQuantity(text: string): LeadingQuantity | null {
  const range = text.match(RANGE_RE)
  if (range) {
    const value = parseQuantityToken(range[1] ?? '')
    const max = parseQuantityToken(range[2] ?? '')
    if (value !== null && max !== null) {
      return { value, max, rest: text.slice(range[0].length) }
    }
  }

  const single = text.match(SINGLE_RE)
  if (single) {
    const value = parseQuantityToken(single[1] ?? '')
    if (value !== null && value >= 0) {
      return { value, max: null, rest: text.slice(single[0].length) }
    }
  }

  return null
}

function parseSizeNote(inner: string): string | null {
  const match = normalize(inner).match(/^(\d+(?:[.,]\d+)?)\s*([a-zA-Z.]+)$/)
  if (!match) return null
  const unit = matchUnit(match[2] ?? '')
  if (!unit) return null
  const value = Number((match[1] ?? '').replace(',', '.'))
  return `${value} ${unit}`
}

const emptyResult = (): ParsedIngredient => ({
  quantity: null,
  quantityMax: null,
  unit: null,
  name: '',
  note: null,
})

export function parseIngredient(raw: string): ParsedIngredient {
  const text = normalize(raw)
  if (!text) return emptyResult()

  let body = text
  let note: string | null = null

  const comma = body.search(NOTE_SPLIT_RE)
  if (comma !== -1) {
    const trailing = body.slice(comma + 1).trim()
    note = trailing ? trailing : null
    body = body.slice(0, comma).trim()
  }

  if (!body) return { ...emptyResult(), note }

  const leading = matchLeadingQuantity(body)
  if (!leading) {
    const suffix = body.match(SUFFIX_NOTE_RE)
    if (suffix?.[1]) {
      return {
        quantity: null,
        quantityMax: null,
        unit: null,
        name: cleanName(suffix[1]),
        note: (suffix[2] ?? '').toLowerCase(),
      }
    }
    return { quantity: null, quantityMax: null, unit: null, name: cleanName(body), note }
  }

  let rest = leading.rest.trimStart()
  let unit: Unit | null = null
  let sizeNote: string | null = null

  let hadConnector = false
  const connector = rest.match(/^\s*(?:x|×|\*)\s+/i)
  if (connector) {
    hadConnector = true
    rest = rest.slice(connector[0].length)
  }

  const parenthetical = rest.match(/^\s*\(([^)]*)\)\s*/)
  if (parenthetical) {
    const size = parseSizeNote(parenthetical[1] ?? '')
    if (size) {
      sizeNote = size
      rest = rest.slice(parenthetical[0].length)
    }
  }

  if (!sizeNote && hadConnector) {
    const size = rest.match(SIZE_RE)
    if (size) {
      const candidate = matchUnit(size[2] ?? '')
      if (candidate) {
        const after = rest.slice(size[0].length)
        const container = after.match(CONTAINER_RE)
        if (container && CONTAINER_WORDS.has((container[1] ?? '').toLowerCase())) {
          const value = Number((size[1] ?? '').replace(',', '.'))
          sizeNote = `${value} ${candidate}`
          unit = matchUnit(container[1] ?? '')
          rest = after.slice(container[0].length)
        }
      }
    }
  }

  const unitMatch = rest.match(/^([a-zA-Z.]+)\b\s*/)
  if (!unit && unitMatch) {
    const candidate = matchUnit(unitMatch[1] ?? '')
    if (candidate) {
      unit = candidate
      rest = rest.slice(unitMatch[0].length)
    }
  }

  rest = rest.replace(/^of\s+/i, '').trim()

  const broken = !rest || /^[-–—/]/.test(rest) || /^\d/.test(rest)
  if (broken) {
    return { quantity: null, quantityMax: null, unit: null, name: cleanName(body), note }
  }

  if (sizeNote) note = note ? `${sizeNote}, ${note}` : sizeNote

  return {
    quantity: leading.value,
    quantityMax: leading.max,
    unit,
    name: cleanName(rest),
    note,
  }
}
