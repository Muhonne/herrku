import type { Generated } from 'kysely'

export interface UsersTable {
  id: Generated<number>
  username: string
  display_name: string | null
  password_hash: string
  role: 'admin' | 'member'
  disabled_at: string | null
  last_login_at: string | null
  created_at: string
  updated_at: string
}

export interface SessionsTable {
  id: Generated<number>
  token_hash: string
  user_id: number
  persistent: number
  created_at: string
  last_seen_at: string
  expires_at: string
  user_agent: string | null
  ip: string | null
}

export interface InvitesTable {
  id: Generated<number>
  token_hash: string
  purpose: 'invite' | 'reset'
  role: 'admin' | 'member'
  user_id: number | null
  created_by: number | null
  created_at: string
  expires_at: string
  used_at: string | null
}

export interface RecipesTable {
  id: Generated<number>
  slug: string
  title: string
  description: string | null
  servings: number | null
  prep_minutes: number | null
  cook_minutes: number | null
  source_url: string | null
  notes: string | null
  search_text: string
  created_by: number
  created_at: string
  updated_at: string
  image_path: string | null
  image_thumb_path: string | null
}

export interface IngredientsTable {
  id: Generated<number>
  recipe_id: number
  position: number
  section: string | null
  quantity: number | null
  quantity_max: number | null
  unit: string | null
  name: string
  note: string | null
  raw_text: string | null
}

export interface StepsTable {
  id: Generated<number>
  recipe_id: number
  position: number
  section: string | null
  text: string
}

export interface RecipeTagsTable {
  recipe_id: number
  tag: string
}

export interface Database {
  users: UsersTable
  sessions: SessionsTable
  invites: InvitesTable
  recipes: RecipesTable
  ingredients: IngredientsTable
  steps: StepsTable
  recipe_tags: RecipeTagsTable
}
