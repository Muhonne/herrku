import { useMutation, useQueryClient } from '@tanstack/react-query'
import { formatQuantity, unitLabel } from '@herrku/shared'
import { Link, useNavigate, useParams } from 'react-router'
import { formatDate, formatMinutes, request, useMe, useRecipe, type RecipeIngredient, type RecipeStep } from '../api'
import { Button, Card, ConfirmButton, EmptyState, ErrorBox, FullPageLoader } from '../components/ui'

function groupBySection<T extends { section: string | null }>(
  items: T[],
): Array<{ section: string | null; items: T[] }> {
  const groups: Array<{ section: string | null; items: T[] }> = []
  for (const item of items) {
    const last = groups[groups.length - 1]
    if (last && last.section === item.section) {
      last.items.push(item)
    } else {
      groups.push({ section: item.section, items: [item] })
    }
  }
  return groups
}

function ingredientText(ingredient: RecipeIngredient): string {
  const quantity = formatQuantity(ingredient.quantity, ingredient.quantityMax)
  const unit = ingredient.unit ? unitLabel(ingredient.unit, ingredient.quantityMax ?? ingredient.quantity) : ''
  const parts = [quantity, unit, ingredient.name].filter((part) => part.length > 0)
  const base = parts.join(' ')
  return ingredient.note ? `${base} (${ingredient.note})` : base
}

function StepList({ steps }: { steps: RecipeStep[] }): React.ReactNode {
  let counter = 0
  const groups = groupBySection(steps)
  return (
    <div className="space-y-5">
      {groups.map((group, index) => (
        <div key={`${group.section ?? 'steps'}-${index}`}>
          {group.section ? (
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
              {group.section}
            </h3>
          ) : null}
          <ol className="space-y-3">
            {group.items.map((step, stepIndex) => {
              counter += 1
              return (
                <li key={stepIndex} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-900">
                    {counter}
                  </span>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-stone-800">{step.text}</p>
                </li>
              )
            })}
          </ol>
        </div>
      ))}
    </div>
  )
}

export default function RecipeDetailPage(): React.ReactNode {
  const { slug = '' } = useParams()
  const recipe = useRecipe(slug)
  const me = useMe()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const remove = useMutation({
    mutationFn: () => request<void>('DELETE', `/api/recipes/${slug}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['recipes'] })
      navigate('/recipes', { replace: true })
    },
  })

  if (recipe.isLoading) return <FullPageLoader />
  if (recipe.isError || !recipe.data) {
    return (
      <div className="space-y-4">
        <ErrorBox message="That recipe could not be loaded." />
        <Link to="/recipes" className="text-sm font-medium text-emerald-800 hover:underline">
          Back to recipes
        </Link>
      </div>
    )
  }

  const data = recipe.data
  const canEdit =
    me.data !== null &&
    me.data !== undefined &&
    (me.data.id === data.createdBy.id || me.data.role === 'admin')
  const ingredientGroups = groupBySection(data.ingredients)

  return (
    <article className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/recipes" className="text-sm text-stone-500 hover:underline">
            ← Recipes
          </Link>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{data.title}</h1>
          <p className="mt-1 text-sm text-stone-500">
            by {data.createdBy.displayName} · updated {formatDate(data.updatedAt)}
          </p>
        </div>
        {canEdit ? (
          <div className="flex items-center gap-2">
            <Link to={`/recipes/${data.slug}/edit`}>
              <Button type="button" variant="secondary">
                Edit
              </Button>
            </Link>
            <ConfirmButton onConfirm={() => remove.mutate()} disabled={remove.isPending}>
              Delete
            </ConfirmButton>
          </div>
        ) : null}
      </div>

      {remove.isError ? <ErrorBox message="Could not delete the recipe." /> : null}

      {data.image ? (
        <img
          src={data.image.fullUrl}
          alt=""
          className="max-h-[420px] w-full rounded-xl object-cover"
        />
      ) : null}

      {data.description ? <p className="text-stone-700">{data.description}</p> : null}

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-stone-600">
        {data.servings ? <span>{data.servings} servings</span> : null}
        {data.prepMinutes !== null ? <span>Prep {formatMinutes(data.prepMinutes)}</span> : null}
        {data.cookMinutes !== null ? <span>Cook {formatMinutes(data.cookMinutes)}</span> : null}
        {data.totalMinutes !== null ? <span>Total {formatMinutes(data.totalMinutes)}</span> : null}
      </div>

      {data.tags.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {data.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-900">
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold">Ingredients</h2>
          {data.ingredients.length === 0 ? (
            <p className="text-sm text-stone-500">No ingredients recorded.</p>
          ) : (
            <div className="space-y-4">
              {ingredientGroups.map((group, index) => (
                <div key={`${group.section ?? 'ingredients'}-${index}`}>
                  {group.section ? (
                    <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
                      {group.section}
                    </h3>
                  ) : null}
                  <ul className="space-y-1.5">
                    {group.items.map((ingredient, ingredientIndex) => (
                      <li key={ingredientIndex} className="text-sm text-stone-800">
                        {ingredientText(ingredient)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-3">
          <h2 className="mb-4 text-lg font-semibold">Method</h2>
          {data.steps.length === 0 ? (
            <p className="text-sm text-stone-500">No steps recorded.</p>
          ) : (
            <StepList steps={data.steps} />
          )}
        </Card>
      </div>

      {data.notes ? (
        <Card>
          <h2 className="mb-2 text-lg font-semibold">Notes</h2>
          <p className="whitespace-pre-line text-sm text-stone-700">{data.notes}</p>
        </Card>
      ) : null}

      {data.sourceUrl ? (
        <p className="text-sm text-stone-600">
          Source:{' '}
          <a
            href={data.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-emerald-800 hover:underline"
          >
            {data.sourceUrl}
          </a>
        </p>
      ) : null}

      {data.ingredients.length === 0 && data.steps.length === 0 ? (
        <EmptyState title="This recipe is still empty" description="Edit it to add ingredients and steps." />
      ) : null}
    </article>
  )
}
