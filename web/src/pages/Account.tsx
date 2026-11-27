import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  ApiError,
  formatDate,
  request,
  useSessions,
  useTokens,
  type ApiTokenCreated,
  type SessionInfo,
} from '../api'
import { copyText } from '../lib/clipboard'
import { Button, Card, ConfirmButton, ErrorBox, Field, Input, Select, useToast } from '../components/ui'

type TokenExpiry = 'never' | '30' | '90' | '365'

export default function AccountPage(): React.ReactNode {
  const sessions = useSessions()
  const tokens = useTokens()
  const queryClient = useQueryClient()
  const toast = useToast()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [tokenName, setTokenName] = useState('')
  const [tokenExpiry, setTokenExpiry] = useState<TokenExpiry>('never')
  const [newSecret, setNewSecret] = useState<string | null>(null)

  const changePassword = useMutation({
    mutationFn: () =>
      request<void>('POST', '/api/auth/password', { currentPassword, newPassword }),
    onSuccess: async () => {
      setCurrentPassword('')
      setNewPassword('')
      toast('Password updated')
      await queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
  })

  const revoke = useMutation({
    mutationFn: (id: number) => request<void>('DELETE', `/api/sessions/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
  })

  const revokeAll = useMutation({
    mutationFn: () => request<void>('DELETE', '/api/sessions'),
    onSuccess: () => {
      queryClient.setQueryData(['me'], null)
      window.location.assign('/login')
    },
  })

  const createToken = useMutation({
    mutationFn: () =>
      request<ApiTokenCreated>('POST', '/api/tokens', {
        name: tokenName.trim(),
        expiresInDays: tokenExpiry === 'never' ? null : Number(tokenExpiry),
      }),
    onSuccess: async (data) => {
      setNewSecret(data.secret)
      setTokenName('')
      await queryClient.invalidateQueries({ queryKey: ['tokens'] })
    },
  })

  const revokeToken = useMutation({
    mutationFn: (id: number) => request<void>('DELETE', `/api/tokens/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tokens'] })
    },
  })

  const passwordError =
    changePassword.error instanceof ApiError ? changePassword.error.message : null
  const tokenError =
    createToken.error instanceof ApiError
      ? createToken.error.message
      : createToken.error
        ? 'Could not create the token.'
        : revokeToken.error instanceof ApiError
          ? revokeToken.error.message
          : revokeToken.error
            ? 'Could not revoke the token.'
            : null

  const describe = (session: SessionInfo): string => {
    const agent = session.userAgent ?? 'Unknown device'
    return `${agent}${session.ip ? ` · ${session.ip}` : ''}`
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Account</h1>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">Change password</h2>
        {passwordError ? <ErrorBox message={passwordError} /> : null}
        {changePassword.isSuccess ? <p className="text-sm text-[var(--accent)]">Password updated.</p> : null}
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            changePassword.mutate()
          }}
        >
          <Field label="Current password">
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </Field>
          <Field label="New password" hint="At least 12 characters">
            <Input
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={200}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </Field>
          <Button type="submit" disabled={changePassword.isPending}>
            {changePassword.isPending ? 'Saving…' : 'Update password'}
          </Button>
        </form>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Sessions</h2>
          <Button
            type="button"
            variant="secondary"
            onClick={() => revokeAll.mutate()}
            disabled={revokeAll.isPending}
          >
            Sign out everywhere
          </Button>
        </div>

        {sessions.isLoading ? <p className="text-sm text-[var(--muted)]">Loading…</p> : null}
        {sessions.isError ? <ErrorBox message="Could not load sessions." /> : null}

        <ul className="divide-y divide-[var(--line)]">
          {sessions.data?.sessions.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-[var(--text)]">
                  {describe(session)}
                  {session.current ? (
                    <span className="ml-2 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs text-[var(--accent-bright)]">
                      this device
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  Signed in {formatDate(session.createdAt)} · last seen {formatDate(session.lastSeenAt)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => revoke.mutate(session.id)}
                disabled={revoke.isPending}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">API tokens</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            For scripts and AI tools. Send{' '}
            <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 text-xs">
              Authorization: Bearer &lt;token&gt;
            </code>{' '}
            instead of a session cookie. Tokens inherit your role.
          </p>
        </div>

        {newSecret ? (
          <div className="space-y-2 rounded-lg border border-[var(--accent-edge)] bg-[var(--accent-soft)] p-3">
            <p className="text-sm font-medium text-[var(--accent-bright)]">
              Copy this token now — it is shown only once.
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                readOnly
                aria-label="New API token"
                value={newSecret}
                className="flex-1 font-mono text-xs"
              />
              <Button
                type="button"
                onClick={async () => {
                  const ok = await copyText(newSecret)
                  toast(ok ? 'Token copied' : 'Copy failed — select the token and copy it manually')
                }}
              >
                Copy
              </Button>
              <Button type="button" variant="ghost" onClick={() => setNewSecret(null)}>
                Dismiss
              </Button>
            </div>
          </div>
        ) : null}

        {tokenError ? <ErrorBox message={tokenError} /> : null}

        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            createToken.mutate()
          }}
        >
          <div className="min-w-48 flex-1">
            <Field label="Token name">
              <Input
                aria-label="Token name"
                required
                maxLength={80}
                placeholder="laptop-cli"
                value={tokenName}
                onChange={(event) => setTokenName(event.target.value)}
              />
            </Field>
          </div>
          <div>
            <Field label="Expires">
              <Select
                aria-label="Token expiry"
                value={tokenExpiry}
                onChange={(event) => setTokenExpiry(event.target.value as TokenExpiry)}
              >
                <option value="never">Never</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="365">1 year</option>
              </Select>
            </Field>
          </div>
          <Button type="submit" disabled={createToken.isPending || tokenName.trim() === ''}>
            {createToken.isPending ? 'Creating…' : 'Create token'}
          </Button>
        </form>

        {tokens.isLoading ? <p className="text-sm text-[var(--muted)]">Loading…</p> : null}
        {tokens.isError ? <ErrorBox message="Could not load API tokens." /> : null}
        {tokens.data && tokens.data.tokens.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No API tokens yet.</p>
        ) : null}

        <ul className="divide-y divide-[var(--line)]">
          {tokens.data?.tokens.map((token) => (
            <li key={token.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--text)]">
                  {token.name}
                  <span className="ml-2 font-mono text-xs text-[var(--muted)]">{token.prefix}…</span>
                </p>
                <p className="text-xs text-[var(--muted)]">
                  Created {formatDate(token.createdAt)} ·{' '}
                  {token.lastUsedAt ? `last used ${formatDate(token.lastUsedAt)}` : 'never used'} ·{' '}
                  {token.expiresAt ? `expires ${formatDate(token.expiresAt)}` : 'no expiry'}
                </p>
              </div>
              <ConfirmButton
                confirmLabel="Revoke"
                onConfirm={() => revokeToken.mutate(token.id)}
                disabled={revokeToken.isPending}
              >
                Revoke
              </ConfirmButton>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
