import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { formatMinutes, useRecipes, useShoppingList, type Selection } from '../api'
import { Button, Card, EmptyState, ErrorBox, FullPageLoader, Input, Select, useToast } from '../components/ui'
import { copyText } from '../lib/clipboard'

function parseSelection(raw: string | null): Selection[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [idPart, servingsPart] = entry.split(':')
      const recipeId = Number.parseInt(idPart ?? '', 10)
      const servings = servingsPart ? Number.parseInt(servingsPart, 10) : null
      return {
        recipeId,
        servings: servings !== null && Number.isFinite(servings) ? servings : null,
      }
    })
    .filter((entry) => Number.isFinite(entry.recipeId) && entry.recipeId > 0)
}

function serializeSelection(selection: Selection[]): string {
  return selection
    .map((entry) => (entry.servings === null ? String(entry.recipeId) : `${entry.recipeId}:${entry.servings}`))
    .join(',')
}

export default function ShoppingListPage(): React.ReactNode {
  const [params, setParams] = useSearchParams()
  const toast = useToast()
  const recipes = useRecipes({ q: '', tags: [], sort: 'title', page: 1 })
  const [search, setSearch] = useState('')

  const selection = useMemo(() => parseSelection(params.get('sel')), [params])

  const updateSelection = (next: Selection[]): void => {
    const updated = new URLSearchParams(params)
    if (next.length === 0) updated.delete('sel')
    else updated.set('sel', serializeSelection(next))
    setParams(updated, { replace: true })
  }

  const toggle = (recipeId: number, defaultServings: number | null): void => {
    const current = selection.find((entry) => entry.recipeId === recipeId)
    if (current) {
      updateSelection(selection.filter((entry) => entry.recipeId !== recipeId))
    } else {
      updateSelection([...selection, { recipeId, servings: defaultServings }])
    }
  }

  const setServings = (recipeId: number, value: string): void => {
    const parsed = Number.parseInt(value, 10)
    updateSelection(
      selection.map((entry) =>
        entry.recipeId === recipeId
          ? { ...entry, servings: Number.isFinite(parsed) && parsed > 0 ? parsed : null }
          : entry,
      ),
    )
  }

  const shopping = useShoppingList(selection, selection.length > 0)

  const filtered =
    recipes.data?.items.filter((recipe) =>
      search.trim() === '' ? true : recipe.title.toLowerCase().includes(search.trim().toLowerCase()),
    ) ?? []

  const copy = async (): Promise<void> => {
    const text = shopping.data?.text ?? ''
    if (!text) return
    const ok = await copyText(text)
    toast(ok ? 'Shopping list copied' : 'Copy failed — select the text and copy manually')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Shopping list</h1>
        <p className="mt-1 text-sm text-stone-500">
          Pick recipes, adjust servings, then copy the merged list.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-3">
          <Input
            type="search"
            aria-label="Filter recipes"
            placeholder="Filter recipes…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          {recipes.isLoading ? <FullPageLoader /> : null}
          {recipes.isError ? <ErrorBox message="Could not load recipes." /> : null}

          {!recipes.isLoading && filtered.length === 0 ? (
            <p className="text-sm text-stone-500">No recipes to choose from.</p>
          ) : null}

          <ul className="divide-y divide-stone-100">
            {filtered.map((recipe) => {
              const selected = selection.find((entry) => entry.recipeId === recipe.id)
              return (
                <li key={recipe.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <label className="flex flex-1 items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-stone-300 text-emerald-700"
                      checked={Boolean(selected)}
                      onChange={() => toggle(recipe.id, recipe.servings)}
                    />
                    <span>
                      <span className="block text-sm font-medium text-stone-800">{recipe.title}</span>
                      <span className="block text-xs text-stone-500">
                        {recipe.servings ? `${recipe.servings} servings` : 'No yield'}
                        {recipe.totalMinutes !== null ? ` · ${formatMinutes(recipe.totalMinutes)}` : ''}
                      </span>
                    </span>
                  </label>
                  {selected ? (
                    <label className="flex items-center gap-2 text-xs text-stone-600">
                      Servings
                      <Select
                        aria-label={`Servings for ${recipe.title}`}
                        className="w-24"
                        value={selected.servings ?? ''}
                        onChange={(event) => setServings(recipe.id, event.target.value)}
                      >
                        <option value="">—</option>
                        {Array.from({ length: 24 }, (_, index) => index + 1).map((count) => (
                          <option key={count} value={count}>
                            {count}
                          </option>
                        ))}
                      </Select>
                    </label>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Merged list</h2>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => updateSelection([])}>
                Clear
              </Button>
              <Button type="button" onClick={() => void copy()} disabled={!shopping.data?.text}>
                Copy
              </Button>
            </div>
          </div>

          {selection.length === 0 ? (
            <EmptyState title="Nothing selected" description="Tick recipes on the left to build a list." />
          ) : null}

          {shopping.isError ? <ErrorBox message="Could not build the list." /> : null}
          {shopping.isFetching && selection.length > 0 ? (
            <p className="text-sm text-stone-500">Building…</p>
          ) : null}

          {shopping.data ? (
            <textarea
              aria-label="Shopping list text"
              readOnly
              value={shopping.data.text}
              rows={Math.max(8, shopping.data.lines.length + 2)}
              className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-sm text-stone-800"
            />
          ) : null}
        </Card>
      </div>
    </div>
  )
}
