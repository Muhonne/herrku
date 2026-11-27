import { useQuery } from '@tanstack/react-query'
import type { Unit } from '@herrku/shared'

export interface User {
  id: number
  username: string
  displayName: string
  role: 'admin' | 'member'
}

export interface RecipeSummary {
  id: number
  slug: string
  title: string
  description: string | null
  tags: string[]
  servings: number | null
  totalMinutes: number | null
  hasImage: boolean
  thumbUrl: string | null
  updatedAt: string
}

export interface RecipeIngredient {
  section: string | null
  quantity: number | null
  quantityMax: number | null
  unit: Unit | null
  name: string
  note: string | null
  rawText: string | null
}

export interface RecipeStep {
  section: string | null
  text: string
}

export interface Recipe {
  id: number
  slug: string
  title: string
  description: string | null
  servings: number | null
  prepMinutes: number | null
  cookMinutes: number | null
  totalMinutes: number | null
  sourceUrl: string | null
  notes: string | null
  tags: string[]
  ingredients: RecipeIngredient[]
  steps: RecipeStep[]
  createdBy: { id: number; displayName: string }
  createdAt: string
  updatedAt: string
  image: { fullUrl: string; thumbUrl: string } | null
}

export interface RecipeInput {
  title: string
  description: string | null
  servings: number | null
  prepMinutes: number | null
  cookMinutes: number | null
  sourceUrl: string | null
  notes: string | null
  tags: string[]
  ingredients: Array<{
    section: string | null
    rawText: string | null
    quantity: number | null
    quantityMax: number | null
    unit: Unit | null
    name: string
    note: string | null
  }>
  steps: Array<{ section: string | null; text: string }>
}

export interface ShoppingLine {
  name: string
  unit: Unit | null
  quantity: number | null
  quantityMax: number | null
  notes: string[]
}

export interface ShoppingResponse {
  text: string
  lines: ShoppingLine[]
}

export interface SessionInfo {
  id: number
  createdAt: string
  lastSeenAt: string
  userAgent: string | null
  ip: string | null
  current: boolean
}

export interface ApiToken {
  id: number
  name: string
  prefix: string
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
}

export interface ApiTokenCreated {
  secret: string
  token: ApiToken
}

export interface AdminUser {
  id: number
  username: string
  displayName: string
  role: 'admin' | 'member'
  disabled: boolean
  createdAt: string
  lastLoginAt: string | null
}

export interface AdminInvite {
  id: number
  role: 'admin' | 'member'
  createdAt: string
  expiresAt: string
  createdBy: number | null
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Array<{ path: string; message: string }>,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const NON_REDIRECTING = [
  '/api/auth/login',
  '/api/auth/me',
  '/api/auth/invite/',
  '/api/auth/accept-invite',
  '/api/health',
]

function redirectToLogin(): void {
  if (window.location.pathname.startsWith('/login')) return
  if (window.location.pathname.startsWith('/invite/')) return
  const next = window.location.pathname + window.location.search
  window.location.assign(`/login?next=${encodeURIComponent(next)}`)
}

async function toApiError(response: Response): Promise<ApiError> {
  let payload: { error?: { code?: string; message?: string; details?: Array<{ path: string; message: string }> } } = {}
  try {
    payload = await response.json()
  } catch {
    // ignore body parse failures
  }
  return new ApiError(
    response.status,
    payload.error?.code ?? 'unknown',
    payload.error?.message ?? response.statusText,
    payload.error?.details,
  )
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!response.ok) {
    const error = await toApiError(response)
    if (response.status === 401 && !NON_REDIRECTING.some((prefix) => path.startsWith(prefix))) {
      redirectToLogin()
    }
    throw error
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export async function uploadImage(slug: string, file: File): Promise<void> {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch(`/api/recipes/${slug}/image`, {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  })
  if (!response.ok) throw await toApiError(response)
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async (): Promise<User | null> => {
      try {
        const result = await request<{ user: User }>('GET', '/api/auth/me')
        return result.user
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }
    },
    staleTime: 30_000,
  })
}

export interface RecipeListParams {
  q: string
  tags: string[]
  sort: 'recent' | 'title'
  page: number
}

export function recipesUrl(params: RecipeListParams): string {
  const search = new URLSearchParams()
  if (params.q.trim().length > 0) search.set('q', params.q.trim())
  for (const tag of params.tags) search.append('tag', tag)
  search.set('sort', params.sort)
  search.set('page', String(params.page))
  search.set('pageSize', '50')
  return `/api/recipes?${search.toString()}`
}

export function useRecipes(params: RecipeListParams) {
  return useQuery({
    queryKey: ['recipes', params.q, params.tags, params.sort, params.page],
    queryFn: () =>
      request<{ items: RecipeSummary[]; page: number; pageSize: number; total: number }>(
        'GET',
        recipesUrl(params),
      ),
  })
}

export function useRecipe(slug: string | undefined) {
  return useQuery({
    queryKey: ['recipe', slug],
    queryFn: () => request<Recipe>('GET', `/api/recipes/${slug}`),
    enabled: Boolean(slug),
  })
}

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: () => request<{ tags: Array<{ tag: string; count: number }> }>('GET', '/api/tags'),
    staleTime: 30_000,
  })
}

export interface Selection {
  recipeId: number
  servings: number | null
}

export function useShoppingList(selection: Selection[], enabled: boolean) {
  return useQuery({
    queryKey: ['shopping', selection],
    queryFn: () =>
      request<ShoppingResponse>('POST', '/api/shopping-list', {
        items: selection.map((item) => ({
          recipeId: item.recipeId,
          ...(item.servings === null ? {} : { servings: item.servings }),
        })),
      }),
    enabled: enabled && selection.length > 0,
  })
}

export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: () => request<{ sessions: SessionInfo[] }>('GET', '/api/sessions'),
  })
}

export function useTokens() {
  return useQuery({
    queryKey: ['tokens'],
    queryFn: () => request<{ tokens: ApiToken[] }>('GET', '/api/tokens'),
  })
}

export function useAdminUsers(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => request<{ users: AdminUser[] }>('GET', '/api/admin/users'),
    enabled,
  })
}

export function useAdminInvites(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'invites'],
    queryFn: () => request<{ invites: AdminInvite[] }>('GET', '/api/admin/invites'),
    enabled,
  })
}

export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return '—'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

export function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return value
  }
}
