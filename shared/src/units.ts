export const UNIT_TOKENS = [
  'g',
  'kg',
  'mg',
  'ml',
  'l',
  'cl',
  'dl',
  'tsp',
  'tbsp',
  'oz',
  'lb',
  'piece',
  'clove',
  'slice',
  'sprig',
  'pinch',
  'dash',
  'bunch',
  'handful',
  'can',
  'jar',
  'packet',
  'sheet',
  'stalk',
] as const

export type Unit = (typeof UNIT_TOKENS)[number]

const ALIASES: Record<string, Unit> = {}

const add = (token: Unit, ...names: string[]): void => {
  for (const name of names) ALIASES[name] = token
}

add('g', 'g', 'gram', 'grams', 'gr')
add('kg', 'kg', 'kilogram', 'kilograms', 'kilo', 'kilos')
add('mg', 'mg', 'milligram', 'milligrams')
add('ml', 'ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters')
add('l', 'l', 'litre', 'litres', 'liter', 'liters')
add('cl', 'cl', 'centilitre', 'centilitres', 'centiliter', 'centiliters')
add('dl', 'dl', 'decilitre', 'decilitres', 'deciliter', 'deciliters')
add('tsp', 'tsp', 'teaspoon', 'teaspoons', 'ts')
add('tbsp', 'tbsp', 'tablespoon', 'tablespoons', 'tbs')
add('oz', 'oz', 'ounce', 'ounces')
add('lb', 'lb', 'lbs', 'pound', 'pounds')
add('piece', 'piece', 'pieces', 'pc', 'pcs', 'stick', 'sticks', 'head', 'heads')
add('clove', 'clove', 'cloves')
add('slice', 'slice', 'slices')
add('sprig', 'sprig', 'sprigs')
add('pinch', 'pinch', 'pinches')
add('dash', 'dash', 'dashes')
add('bunch', 'bunch', 'bunches')
add('handful', 'handful', 'handfuls')
add('can', 'can', 'cans', 'tin', 'tins')
add('jar', 'jar', 'jars')
add('packet', 'packet', 'packets', 'pkg', 'pkgs', 'package', 'packages')
add('sheet', 'sheet', 'sheets')
add('stalk', 'stalk', 'stalks')

export function matchUnit(token: string): Unit | null {
  const key = token.trim().toLowerCase().replace(/\.$/, '')
  return ALIASES[key] ?? null
}

const PLURALS: Partial<Record<Unit, string>> = {
  piece: 'pieces',
  clove: 'cloves',
  slice: 'slices',
  sprig: 'sprigs',
  pinch: 'pinches',
  dash: 'dashes',
  bunch: 'bunches',
  handful: 'handfuls',
  can: 'cans',
  jar: 'jars',
  packet: 'packets',
  sheet: 'sheets',
  stalk: 'stalks',
}

export function unitLabel(unit: Unit, count: number | null): string {
  const plural = PLURALS[unit]
  if (plural && count !== null && count > 1) return plural
  return unit
}

export const CONTAINER_WORDS = new Set([
  'can',
  'cans',
  'tin',
  'tins',
  'jar',
  'jars',
  'packet',
  'packets',
  'box',
  'boxes',
  'bottle',
  'bottles',
  'bag',
  'bags',
  'carton',
  'cartons',
  'tub',
  'tubs',
])
