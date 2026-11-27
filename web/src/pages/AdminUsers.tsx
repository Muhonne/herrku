import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  ApiError,
  formatDate,
  request,
  useAdminInvites,
  useAdminUsers,
  useMe,
  type AdminUser,
} from '../api'
import { copyText } from '../lib/clipboard'
import {
  Button,
  Card,
  ConfirmButton,
  ErrorBox,
  FullPageLoader,
  Input,
  Select,
  useToast,
} from '../components/ui'

export default function AdminUsersPage(): React.ReactNode {
  const me = useMe()
  const isAdmin = me.data?.role === 'admin'
  const users = useAdminUsers(Boolean(isAdmin))
  const invites = useAdminInvites(Boolean(isAdmin))
  const queryClient = useQueryClient()
  const toast = useToast()

  const [role, setRole] = useState<'member' | 'admin'>('member')
  const [link, setLink] = useState<string | null>(null)

  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['admin'] })
  }

  const createInvite = useMutation({
    mutationFn: () =>
      request<{ id: number; url: string; expiresAt: string }>('POST', '/api/admin/invites', { role }),
    onSuccess: async (data) => {
      setLink(data.url)
      await refresh()
    },
  })

  const revokeInvite = useMutation({
    mutationFn: (id: number) => request<void>('DELETE', `/api/admin/invites/${id}`),
    onSuccess: refresh,
  })

  const patchUser = useMutation({
    mutationFn: (input: { id: number; body: { disabled?: boolean; role?: 'admin' | 'member' } }) =>
      request<{ user: AdminUser }>('PATCH', `/api/admin/users/${input.id}`, input.body),
    onSuccess: refresh,
  })

  const issueReset = useMutation({
    mutationFn: (id: number) => request<{ url: string }>('POST', `/api/admin/users/${id}/reset`),
    onSuccess: async (data) => {
      setLink(data.url)
      await refresh()
    },
  })

  if (me.isLoading) return <FullPageLoader />
  if (!isAdmin) return <ErrorBox message="Admin access required." />

  const failure =
    createInvite.error ?? revokeInvite.error ?? patchUser.error ?? issueReset.error ?? null
  const failureMessage =
    failure instanceof ApiError ? failure.message : failure ? 'The action failed.' : null

  const copy = async (): Promise<void> => {
    if (!link) return
    const ok = await copyText(link)
    toast(ok ? 'Link copied' : 'Copy failed — select the link and copy it manually')
  }

  const selfId = me.data?.id

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <div className="flex items-end gap-2">
          <label className="text-sm text-[var(--muted)]">
            <span className="block text-xs font-medium text-[var(--muted)]">Role</span>
            <Select value={role} onChange={(event) => setRole(event.target.value as 'member' | 'admin')}>
              <option value="member">member</option>
              <option value="admin">admin</option>
            </Select>
          </label>
          <Button type="button" onClick={() => createInvite.mutate()} disabled={createInvite.isPending}>
            {createInvite.isPending ? 'Creating…' : 'Invite'}
          </Button>
        </div>
      </div>

      {failureMessage ? <ErrorBox message={failureMessage} /> : null}

      {link ? (
        <Card className="space-y-2 border-[var(--accent-edge)] bg-[var(--accent-soft)]">
          <p className="text-sm font-medium text-[var(--accent-bright)]">
            Single-use link — copy it now, it cannot be shown again.
          </p>
          <div className="flex flex-wrap gap-2">
            <Input readOnly value={link} aria-label="One-time link" className="flex-1" />
            <Button type="button" onClick={() => void copy()}>
              Copy
            </Button>
            <Button type="button" variant="ghost" onClick={() => setLink(null)}>
              Dismiss
            </Button>
          </div>
        </Card>
      ) : null}

      <Card>
        {users.isLoading ? <FullPageLoader /> : null}
        {users.isError ? <ErrorBox message="Could not load users." /> : null}
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="pb-2">User</th>
              <th className="pb-2">Role</th>
              <th className="pb-2">Status</th>
              <th className="pb-2">Last login</th>
              <th className="pb-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {users.data?.users.map((user) => {
              const isSelf = user.id === selfId
              return (
                <tr key={user.id}>
                  <td className="py-2.5">
                    <span className="font-medium text-[var(--text)]">{user.displayName}</span>
                    <span className="block text-xs text-[var(--muted)]">@{user.username}</span>
                  </td>
                  <td className="py-2.5">
                    <Select
                      aria-label={`Role for ${user.username}`}
                      className="w-28"
                      value={user.role}
                      disabled={isSelf || patchUser.isPending}
                      onChange={(event) =>
                        patchUser.mutate({
                          id: user.id,
                          body: { role: event.target.value as 'admin' | 'member' },
                        })
                      }
                    >
                      <option value="member">member</option>
                      <option value="admin">admin</option>
                    </Select>
                  </td>
                  <td className="py-2.5">
                    <span
                      className={
                        user.disabled
                          ? 'rounded-full bg-[var(--danger-soft)] px-2 py-0.5 text-xs text-[#ffb3a2]'
                          : 'rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs text-[var(--accent-bright)]'
                      }
                    >
                      {user.disabled ? 'disabled' : 'active'}
                    </span>
                  </td>
                  <td className="py-2.5 text-xs text-[var(--muted)]">
                    {user.lastLoginAt ? formatDate(user.lastLoginAt) : 'never'}
                  </td>
                  <td className="py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => issueReset.mutate(user.id)}
                        disabled={issueReset.isPending}
                      >
                        Reset link
                      </Button>
                      {user.disabled ? (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => patchUser.mutate({ id: user.id, body: { disabled: false } })}
                          disabled={patchUser.isPending}
                        >
                          Enable
                        </Button>
                      ) : isSelf ? null : (
                        <ConfirmButton
                          confirmLabel="Disable"
                          disabled={patchUser.isPending}
                          onConfirm={() => patchUser.mutate({ id: user.id, body: { disabled: true } })}
                        >
                          Disable
                        </ConfirmButton>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Pending invites</h2>
        {invites.isLoading ? <p className="text-sm text-[var(--muted)]">Loading…</p> : null}
        {invites.data && invites.data.invites.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No pending invites.</p>
        ) : null}
        <ul className="divide-y divide-[var(--line)]">
          {invites.data?.invites.map((invite) => (
            <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="text-sm text-[var(--text-soft)]">
                <span className="font-medium">{invite.role}</span>
                <span className="text-[var(--muted)]"> · expires {formatDate(invite.expiresAt)}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => revokeInvite.mutate(invite.id)}
                disabled={revokeInvite.isPending}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Invite links are shown once. To get a new link, revoke and create another.
        </p>
      </Card>
    </div>
  )
}
