import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { ApiError, request, useMe, type User } from '../api'
import { Button, ErrorBox, Field, FullPageLoader, Input, Switch } from '../components/ui'

export default function LoginPage(): React.ReactNode {
  const me = useMe()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [staySignedIn, setStaySignedIn] = useState(true)

  const next = params.get('next') ?? '/recipes'

  const login = useMutation({
    mutationFn: () =>
      request<{ user: User }>('POST', '/api/auth/login', {
        username,
        password,
        staySignedIn,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['me'], data.user)
      navigate(next, { replace: true })
    },
  })

  if (me.isLoading) return <FullPageLoader />
  if (me.data) return <Navigate to={next} replace />

  const errorMessage =
    login.error instanceof ApiError ? login.error.message : login.error ? 'Sign in failed' : null

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-16">
      <div className="panel w-full max-w-sm">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3">
          <span className="flex items-center gap-2">
            <span
              className="lamp inline-block h-2 w-2 bg-[var(--accent)]"
              aria-hidden="true"
            />
            <span className="label">Herrku / recipe terminal</span>
          </span>
          <span className="mono text-[10px] text-[var(--muted-low)]">v1.0</span>
        </div>

        <div className="p-5">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Shared recipe shelf. Private access.</p>

          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              login.mutate()
            }}
          >
            {errorMessage ? <ErrorBox message={errorMessage} /> : null}

            <Field label="Username">
              <Input
                name="username"
                autoComplete="username"
                autoFocus
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </Field>

            <Field label="Password">
              <Input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>

            <Switch
              name="staySignedIn"
              checked={staySignedIn}
              onChange={setStaySignedIn}
              label="Stay signed in"
            />

            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-5 border-t border-[var(--line)] pt-3 text-xs text-[var(--muted-low)]">
            Accounts are created by an admin. Ask them for an invite link.
          </p>
        </div>
      </div>
    </div>
  )
}
