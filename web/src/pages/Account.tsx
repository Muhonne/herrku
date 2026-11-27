import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError, formatDate, request, useSessions, type SessionInfo } from '../api'
import { Button, Card, ErrorBox, Field, Input, useToast } from '../components/ui'

export default function AccountPage(): React.ReactNode {
  const sessions = useSessions()
  const queryClient = useQueryClient()
  const toast = useToast()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')

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

  const passwordError =
    changePassword.error instanceof ApiError ? changePassword.error.message : null

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
        {changePassword.isSuccess ? <p className="text-sm text-emerald-800">Password updated.</p> : null}
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

        {sessions.isLoading ? <p className="text-sm text-stone-500">Loading…</p> : null}
        {sessions.isError ? <ErrorBox message="Could not load sessions." /> : null}

        <ul className="divide-y divide-stone-100">
          {sessions.data?.sessions.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-stone-800">
                  {describe(session)}
                  {session.current ? (
                    <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900">
                      this device
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-stone-500">
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
    </div>
  )
}
