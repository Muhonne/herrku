import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { ApiError, request, useMe, type User } from '../api'
import { Button, Card, ErrorBox, Field, FullPageLoader, Input } from '../components/ui'

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
      <Card className="w-full max-w-sm">
        <h1 className="text-xl font-semibold text-stone-900">Sign in to herrku</h1>
        <p className="mt-1 text-sm text-stone-500">Your household recipe shelf.</p>

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

          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-stone-300 text-emerald-700"
              checked={staySignedIn}
              onChange={(event) => setStaySignedIn(event.target.checked)}
            />
            Stay signed in
          </label>

          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-4 text-xs text-stone-500">
          Accounts are created by an admin. Ask them for an invite link.
        </p>
      </Card>
    </div>
  )
}
