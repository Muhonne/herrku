import { parseIngredient, UNIT_TOKENS, type Unit } from '@herrku/shared'
import type { RecipeIngredient } from '../api'
import { Button, Input, Select, labelClass } from './ui'

export interface IngredientDraft {
  section: string
  rawText: string
  quantity: string
  quantityMax: string
  unit: string
  name: string
  note: string
}

export const emptyIngredient = (): IngredientDraft => ({
  section: '',
  rawText: '',
  quantity: '',
  quantityMax: '',
  unit: '',
  name: '',
  note: '',
})

export function toIngredientDraft(ingredient: RecipeIngredient): IngredientDraft {
  return {
    section: ingredient.section ?? '',
    rawText: ingredient.rawText ?? '',
    quantity: ingredient.quantity === null ? '' : String(ingredient.quantity),
    quantityMax: ingredient.quantityMax === null ? '' : String(ingredient.quantityMax),
    unit: ingredient.unit ?? '',
    name: ingredient.name,
    note: ingredient.note ?? '',
  }
}

function numberOrNull(value: string): number | null {
  const trimmed = value.trim().replace(',', '.')
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

export function hasIngredientContent(draft: IngredientDraft): boolean {
  return draft.name.trim().length > 0 || draft.rawText.trim().length > 0
}

export function fromIngredientDraft(draft: IngredientDraft): {
  section: string | null
  rawText: string | null
  quantity: number | null
  quantityMax: number | null
  unit: Unit | null
  name: string
  note: string | null
} {
  return {
    section: draft.section.trim() || null,
    rawText: draft.rawText.trim() || null,
    quantity: numberOrNull(draft.quantity),
    quantityMax: numberOrNull(draft.quantityMax),
    unit: draft.unit ? (draft.unit as Unit) : null,
    name: draft.name.trim(),
    note: draft.note.trim() || null,
  }
}

export function IngredientEditor({
  ingredients,
  onChange,
}: {
  ingredients: IngredientDraft[]
  onChange: (ingredients: IngredientDraft[]) => void
}): React.ReactNode {
  const update = (index: number, patch: Partial<IngredientDraft>): void => {
    onChange(ingredients.map((ingredient, current) => (current === index ? { ...ingredient, ...patch } : ingredient)))
  }

  const parseInto = (index: number): void => {
    const draft = ingredients[index]
    if (!draft || !draft.rawText.trim()) return
    const parsed = parseIngredient(draft.rawText)
    update(index, {
      quantity: parsed.quantity === null ? '' : String(parsed.quantity),
      quantityMax: parsed.quantityMax === null ? '' : String(parsed.quantityMax),
      unit: parsed.unit ?? '',
      name: parsed.name,
      note: parsed.note ?? '',
    })
  }

  return (
    <div className="space-y-3">
      {ingredients.map((ingredient, index) => (
        <div key={index} className="rounded-lg border border-stone-200 bg-stone-50/60 p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
            <div className="col-span-2 sm:col-span-3">
              <span className={labelClass}>Group</span>
              <Input
                aria-label={`Ingredient ${index + 1} group`}
                placeholder="Optional"
                maxLength={80}
                value={ingredient.section}
                onChange={(event) => update(index, { section: event.target.value })}
              />
            </div>
            <div className="col-span-2 sm:col-span-9">
              <span className={labelClass}>Raw line</span>
              <Input
                aria-label={`Ingredient ${index + 1} raw line`}
                placeholder="1 1/2 cups flour"
                maxLength={500}
                value={ingredient.rawText}
                onChange={(event) => update(index, { rawText: event.target.value })}
                onBlur={() => parseInto(index)}
              />
            </div>
            <div className="col-span-1 sm:col-span-1">
              <span className={labelClass}>Qty</span>
              <Input
                aria-label={`Ingredient ${index + 1} quantity`}
                type="number"
                step="any"
                min="0"
                value={ingredient.quantity}
                onChange={(event) => update(index, { quantity: event.target.value })}
              />
            </div>
            <div className="col-span-1 sm:col-span-1">
              <span className={labelClass}>Max</span>
              <Input
                aria-label={`Ingredient ${index + 1} max quantity`}
                type="number"
                step="any"
                min="0"
                placeholder="—"
                value={ingredient.quantityMax}
                onChange={(event) => update(index, { quantityMax: event.target.value })}
              />
            </div>
            <div className="col-span-2 sm:col-span-2">
              <span className={labelClass}>Unit</span>
              <Select
                aria-label={`Ingredient ${index + 1} unit`}
                value={ingredient.unit}
                onChange={(event) => update(index, { unit: event.target.value })}
              >
                <option value="">—</option>
                {UNIT_TOKENS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </Select>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <span className={labelClass}>Name</span>
              <Input
                aria-label={`Ingredient ${index + 1} name`}
                maxLength={200}
                value={ingredient.name}
                onChange={(event) => update(index, { name: event.target.value })}
              />
            </div>
            <div className="col-span-2 sm:col-span-2">
              <span className={labelClass}>Note</span>
              <Input
                aria-label={`Ingredient ${index + 1} note`}
                maxLength={200}
                value={ingredient.note}
                onChange={(event) => update(index, { note: event.target.value })}
              />
            </div>
          </div>
          <div className="mt-2 flex justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onChange(ingredients.filter((_, current) => current !== index))}
              disabled={ingredients.length === 1}
            >
              Remove
            </Button>
          </div>
        </div>
      ))}

      <Button type="button" variant="secondary" onClick={() => onChange([...ingredients, emptyIngredient()])}>
        Add ingredient
      </Button>
    </div>
  )
}
