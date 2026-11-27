import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { formatMinutes, useRecipes, useTags } from '../api'
import { Button, EmptyState, ErrorBox, FullPageLoader, Input, cx } from '../components/ui'

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
  const filtering = query.length > 0 || tags.length > 0

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-4">
        <div>
          <p className="label">Index</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Recipes</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {total} {total === 1 ? 'record' : 'records'} in the shared library
          </p>
        </div>
        <Link to="/recipes/new">
          <Button type="button">New recipe</Button>
        </Link>
      </header>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="panel flex flex-1 items-center gap-2 p-2">
          <span className="label px-1" aria-hidden="true">
            Find
          </span>
          <Input
            type="search"
            aria-label="Search recipes"
            placeholder="Title or ingredient…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="flex-1 border-0 bg-transparent shadow-none"
          />
          {filtering ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSearch('')
                setQuery('')
                setTags([])
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSort('recent')}
            className={cx('chip', sort === 'recent' && 'chip-active')}
          >
            Recent
          </button>
          <button
            type="button"
            onClick={() => setSort('title')}
            className={cx('chip', sort === 'title' && 'chip-active')}
          >
            A–Z
          </button>
        </div>
      </div>

      {allTags.data && allTags.data.tags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="label mr-1" aria-hidden="true">
            Tags
          </span>
          {allTags.data.tags.map((entry) => (
            <button
              key={entry.tag}
              type="button"
              onClick={() => toggleTag(entry.tag)}
              className={cx('chip', tags.includes(entry.tag) && 'chip-active')}
            >
              {entry.tag}
              <span className="opacity-50">{entry.count}</span>
            </button>
          ))}
        </div>
      ) : null}

      {recipes.isError ? <ErrorBox message="Could not load recipes." /> : null}
      {recipes.isLoading ? <FullPageLoader /> : null}

      {recipes.data && recipes.data.items.length === 0 ? (
        <EmptyState
          title={filtering ? 'No records match' : 'The shelf is empty'}
          description={
            filtering ? 'Clear the search or tags.' : 'Create the first recipe in this library.'
          }
          action={
            filtering ? (
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

      {recipes.data && recipes.data.items.length > 0 ? (
        <div className="ledger">
          <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3 px-4 py-2 sm:grid-cols-[2.5rem_minmax(0,1fr)_11rem_5rem_4rem]">
            <span className="label">No</span>
            <span className="label">Title</span>
            <span className="label hidden sm:block">Tags</span>
            <span className="label hidden text-right sm:block">Time</span>
            <span className="label hidden text-right sm:block">Serves</span>
          </div>

          {recipes.data.items.map((recipe, index) => (
            <Link
              key={recipe.id}
              to={`/recipes/${recipe.slug}`}
              className="ledger-row rise grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3 px-4 py-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_11rem_5rem_4rem]"
              style={{ animationDelay: `${Math.min(index, 8) * 28}ms` }}
            >
              <span className="mono text-xs text-[var(--muted)]">
                {String((page - 1) * pageSize + index + 1).padStart(2, '0')}
              </span>
              <span className="min-w-0">
                <h2 className="block truncate text-[15px] font-medium text-[var(--text)]">
                  {recipe.title}
                </h2>
                {recipe.description ? (
                  <span className="block truncate text-xs text-[var(--muted)]">
                    {recipe.description}
                  </span>
                ) : null}
              </span>
              <span className="hidden flex-wrap gap-1 sm:flex">
                {recipe.tags.length > 0 ? (
                  recipe.tags.map((tag) => (
                    <span key={tag} className="chip">
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className="mono text-xs text-[var(--muted-low)]">—</span>
                )}
              </span>
              <span className="mono hidden text-right text-xs text-[var(--muted)] sm:block">
                {formatMinutes(recipe.totalMinutes)}
              </span>
              <span className="mono hidden text-right text-xs text-[var(--muted)] sm:block">
                {recipe.servings ?? '—'}
              </span>
            </Link>
          ))}
        </div>
      ) : null}

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
          <span className="mono text-xs text-[var(--muted)]">
            Page {page} / {Math.max(1, Math.ceil(total / pageSize))}
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
