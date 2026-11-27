import { useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { request, useMe } from '../api'
import { Button, FullPageLoader, cx } from './ui'

export default function Layout(): React.ReactNode {
  const me = useMe()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const location = useLocation()

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
    cx('nav-link', isActive && 'nav-link-active')

  return (
    <div className="min-h-full">
      <header className="border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2.5">
          <Link to="/recipes" className="mr-1 flex items-center gap-2">
            <img
              src="/brand.png"
              alt=""
              width={18}
              height={18}
              className="h-[18px] w-[18px] object-contain"
            />
            <span className="mono text-[15px] font-semibold uppercase tracking-[0.2em]">
              herrku
            </span>
          </Link>
          <nav className="flex flex-wrap items-center gap-1">
            <NavLink to="/recipes" className={linkClass}>
              Recipes
            </NavLink>
            <NavLink to="/shopping-list" className={linkClass}>
              Shopping list
            </NavLink>
            <NavLink to="/help" className={linkClass}>
              Help
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
            <span className="label hidden sm:inline">{me.data.displayName}</span>
            <Button variant="secondary" type="button" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div key={location.pathname} className="rise">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
