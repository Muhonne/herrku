export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export interface HerrkuClientOptions {
  baseUrl: string
  token: string
  fetchImpl?: FetchLike
  timeoutMs?: number
}

export class HerrkuError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'HerrkuError'
    this.status = status
    this.code = code
  }
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

export interface RecipeList {
  items: RecipeSummary[]
  page: number
  pageSize: number
  total: number
}

export interface TagCount {
  tag: string
  count: number
}

export interface ShoppingLine {
  name: string
  unit: string | null
  quantity: number | null
  quantityMax: number | null
  notes: string[]
}

export interface ShoppingResult {
  text: string
  lines: ShoppingLine[]
}

export interface SearchRecipesInput {
  query?: string
  tag?: string | string[]
  sort?: 'recent' | 'title'
  page?: number
  pageSize?: number
}

export type JsonObject = Record<string, unknown>

export interface ShoppingSelection {
  recipeId: number
  servings?: number | null
}

export class HerrkuClient {
  private readonly baseUrl: string
  private readonly token: string
  private readonly fetchImpl: FetchLike
  private readonly timeoutMs: number

  constructor(options: HerrkuClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.token = options.token
    this.fetchImpl = options.fetchImpl ?? fetch
    this.timeoutMs = options.timeoutMs ?? 30_000
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.token}`,
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      throw new HerrkuError(
        0,
        'network_error',
        `Could not reach herrku at ${this.baseUrl}: ${(error as Error).message}`,
      )
    }

    if (!response.ok) {
      let code = 'http_error'
      let message = `Request failed with status ${response.status}`
      try {
        const payload = (await response.json()) as {
          error?: { code?: string; message?: string }
        }
        if (payload.error?.message) message = payload.error.message
        if (payload.error?.code) code = payload.error.code
      } catch {
        // keep the generic message
      }
      throw new HerrkuError(response.status, code, message)
    }

    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  searchRecipes(input: SearchRecipesInput = {}): Promise<RecipeList> {
    const params = new URLSearchParams()
    if (input.query) params.set('q', input.query)
    const tags = Array.isArray(input.tag) ? input.tag : input.tag ? [input.tag] : []
    for (const tag of tags) params.append('tag', tag)
    if (input.sort) params.set('sort', input.sort)
    if (input.page !== undefined) params.set('page', String(input.page))
    if (input.pageSize !== undefined) params.set('pageSize', String(input.pageSize))

    const query = params.toString()
    return this.request<RecipeList>('GET', `/api/recipes${query ? `?${query}` : ''}`)
  }

  getRecipe(slug: string): Promise<JsonObject> {
    return this.request<JsonObject>('GET', `/api/recipes/${encodeURIComponent(slug)}`)
  }

  createRecipe(input: unknown): Promise<JsonObject> {
    return this.request<JsonObject>('POST', '/api/recipes', input)
  }

  updateRecipe(slug: string, input: unknown): Promise<JsonObject> {
    return this.request<JsonObject>('PUT', `/api/recipes/${encodeURIComponent(slug)}`, input)
  }

  listTags(): Promise<{ tags: TagCount[] }> {
    return this.request<{ tags: TagCount[] }>('GET', '/api/tags')
  }

  shoppingList(items: ShoppingSelection[]): Promise<ShoppingResult> {
    return this.request<ShoppingResult>('POST', '/api/shopping-list', { items })
  }
}
