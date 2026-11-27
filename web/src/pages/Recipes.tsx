import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { formatMinutes, useRecipes, useTags } from '../api'
import { Button, Card, EmptyState, ErrorBox, FullPageLoader, Input, cx } from '../components/ui'

export default function RecipesPage(): React.ReactNode {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [sort, setSort] = useState<'recent' | 'title'>('recent')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search)
      setPage(1)
    }, 250)
    return () => clearTimeout(timer)
  }, [search])

  const recipes = useRecipes({ q: query, tags, sort, page })
  const allTags = useTags()

  const toggleTag = (tag: string): void => {
    setTags((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag],
    )
    setPage(1)
  }

  const total = recipes.data?.total ?? 0
  const pageSize = recipes.data?.pageSize ?? 50
  const hasNext = page * pageSize < total

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Recipes</h1>
        <Link to="/recipes/new">
          <Button type="button">New recipe</Button>
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          type="search"
          aria-label="Search recipes"
          placeholder="Search title or ingredients…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={sort === 'recent' ? 'primary' : 'secondary'}
            onClick={() => setSort('recent')}
          >
            Recent
          </Button>
          <Button
            type="button"
            variant={sort === 'title' ? 'primary' : 'secondary'}
            onClick={() => setSort('title')}
          >
            A–Z
          </Button>
        </div>
      </div>

      {allTags.data && allTags.data.tags.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {allTags.data.tags.map((entry) => (
            <button
              key={entry.tag}
              type="button"
              onClick={() => toggleTag(entry.tag)}
              className={cx(
                'rounded-full border px-3 py-1 text-xs font-medium',
                tags.includes(entry.tag)
                  ? 'border-emerald-700 bg-emerald-700 text-white'
                  : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-100',
              )}
            >
              {entry.tag}
              <span className="ml-1 opacity-60">{entry.count}</span>
            </button>
          ))}
        </div>
      ) : null}

      {recipes.isError ? <ErrorBox message="Could not load recipes." /> : null}
      {recipes.isLoading ? <FullPageLoader /> : null}

      {recipes.data && recipes.data.items.length === 0 ? (
        <EmptyState
          title="No recipes match"
          description={query || tags.length > 0 ? 'Try clearing the search or tags.' : 'Create your first recipe.'}
          action={
            query || tags.length > 0 ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setSearch('')
                  setQuery('')
                  setTags([])
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Link to="/recipes/new">
                <Button type="button">New recipe</Button>
              </Link>
            )
          }
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {recipes.data?.items.map((recipe) => (
          <Link key={recipe.id} to={`/recipes/${recipe.slug}`} className="group block">
            <Card className="h-full transition group-hover:border-emerald-300 group-hover:shadow-md">
              <div className="mb-3 aspect-[4/3] overflow-hidden rounded-lg bg-stone-100">
                {recipe.thumbUrl ? (
                  <img
                    src={recipe.thumbUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-3xl text-stone-300">
                    🍲
                  </div>
                )}
              </div>
              <h2 className="text-base font-semibold text-stone-900">{recipe.title}</h2>
              {recipe.description ? (
                <p className="mt-1 line-clamp-2 text-sm text-stone-600">{recipe.description}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                {recipe.servings ? <span>{recipe.servings} servings</span> : null}
                {recipe.totalMinutes !== null ? <span>· {formatMinutes(recipe.totalMinutes)}</span> : null}
              </div>
              {recipe.tags.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {recipe.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </Card>
          </Link>
        ))}
      </div>

      {total > pageSize ? (
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <span className="text-sm text-stone-500">
            Page {page} of {Math.max(1, Math.ceil(total / pageSize))}
          </span>
          <Button
            type="button"
            variant="secondary"
            disabled={!hasNext}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  )
}
