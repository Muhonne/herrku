const SPECIAL_CASES: Record<string, string> = {
  ß: 'ss',
  ø: 'o',
  đ: 'd',
  ð: 'd',
  ł: 'l',
  æ: 'ae',
  œ: 'oe',
  þ: 'th',
}

const MAX_SLUG_LENGTH = 60

export function slugify(input: string): string {
  const stripped = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[ßøđðłæœþ]/g, (character) => SPECIAL_CASES[character] ?? character)

  const slug = stripped
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '')

  return slug || 'recipe'
}
