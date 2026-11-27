import { useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, NavLink, Outlet, useNavigate } from 'react-router'
import { request, useMe } from '../api'
import { Button, FullPageLoader, cx } from './ui'

export default function Layout(): React.ReactNode {
  const me = useMe()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  if (me.isLoading) return <FullPageLoader />
  if (!me.data) {
    const next = window.location.pathname + window.location.search
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }

  const signOut = async (): Promise<void> => {
    await request('POST', '/api/auth/logout')
    queryClient.setQueryData(['me'], null)
    queryClient.clear()
    navigate('/login')
  }

  const linkClass = ({ isActive }: { isActive: boolean }): string =>
    cx(
      'rounded-lg px-3 py-1.5 text-sm font-medium',
      isActive ? 'bg-emerald-100 text-emerald-900' : 'text-stone-600 hover:bg-stone-100',
    )

  return (
    <div className="min-h-full">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/recipes" className="mr-2 text-lg font-semibold tracking-tight text-emerald-800">
            herrku
          </Link>
          <nav className="flex flex-wrap items-center gap-1">
            <NavLink to="/recipes" className={linkClass}>
              Recipes
            </NavLink>
            <NavLink to="/shopping-list" className={linkClass}>
              Shopping list
            </NavLink>
            <NavLink to="/account" className={linkClass}>
              Account
            </NavLink>
            {me.data.role === 'admin' ? (
              <NavLink to="/admin/users" className={linkClass}>
                Admin
              </NavLink>
            ) : null}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-stone-500 sm:inline">{me.data.displayName}</span>
            <Button variant="secondary" type="button" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
