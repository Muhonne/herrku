import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiError, request } from '../api'
import {
  Button,
  Card,
  ErrorBox,
  Field,
  FullPageLoader,
  Input,
  useToast,
} from '../components/ui'

interface InviteInfo {
  valid: boolean
  purpose: 'invite' | 'reset'
  username?: string | null
}

export default function InvitePage(): React.ReactNode {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  const info = useQuery({
    queryKey: ['invite', token],
    queryFn: () => request<InviteInfo>('GET', `/api/auth/invite/${encodeURIComponent(token)}`),
    retry: false,
  })

  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')

  const accept = useMutation({
    mutationFn: () =>
      request<{ user: unknown }>('POST', '/api/auth/accept-invite', {
        token,
        password,
        ...(info.data?.purpose === 'reset' ? {} : { username, displayName: displayName || undefined }),
      }),
    onSuccess: () => {
      toast(info.data?.purpose === 'reset' ? 'Password updated — sign in.' : 'Account created — sign in.')
      navigate('/login', { replace: true })
    },
  })

  if (info.isLoading) return <FullPageLoader />

  if (info.isError || !info.data) {
    const message =
      info.error instanceof ApiError ? info.error.message : 'This invite is invalid or has expired.'
    return (
      <div className="flex min-h-full items-center justify-center px-4 py-16">
        <Card className="w-full max-w-sm text-center">
          <h1 className="text-lg font-semibold">Invite unavailable</h1>
          <p className="mt-2 text-sm text-stone-600">{message}</p>
          <Link to="/login" className="mt-4 inline-block text-sm font-medium text-emerald-800 hover:underline">
            Back to sign in
          </Link>
        </Card>
      </div>
    )
  }

  const isReset = info.data.purpose === 'reset'
  const errorMessage =
    accept.error instanceof ApiError ? accept.error.message : accept.error ? 'Could not complete' : null

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm">
        <h1 className="text-xl font-semibold">
          {isReset ? 'Set a new password' : 'Create your account'}
        </h1>
        {isReset && info.data.username ? (
          <p className="mt-1 text-sm text-stone-600">
            for <span className="font-medium">{info.data.username}</span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-stone-500">You are joining herrku.</p>
        )}

        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            accept.mutate()
          }}
        >
          {errorMessage ? <ErrorBox message={errorMessage} /> : null}

          {!isReset ? (
            <>
              <Field label="Username" hint="3–32 characters: lowercase letters, digits, - or _">
                <Input
                  name="username"
                  required
                  minLength={3}
                  maxLength={32}
                  pattern="[a-z0-9][a-z0-9_-]*"
                  value={username}
                  onChange={(event) => setUsername(event.target.value.toLowerCase())}
                />
              </Field>
              <Field label="Display name" hint="Optional">
                <Input
                  name="displayName"
                  maxLength={80}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </Field>
            </>
          ) : null}

          <Field label="Password" hint="At least 12 characters">
            <Input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={200}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>

          <Button type="submit" className="w-full" disabled={accept.isPending}>
            {accept.isPending ? 'Saving…' : isReset ? 'Set password' : 'Create account'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
