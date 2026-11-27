export interface SearchTextInput {
  title: string
  ingredientNames: string[]
  tags: string[]
}

const normalize = (value: string): string =>
  value.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()

export function buildSearchText(input: SearchTextInput): string {
  return [input.title, ...input.ingredientNames, ...input.tags]
    .map(normalize)
    .filter((segment) => segment.length > 0)
    .join('\n')
}
