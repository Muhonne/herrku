import { randomBytes } from 'node:crypto'
import { sha256 } from './tokens.js'

export const API_TOKEN_PREFIX = 'hk_'
export const API_TOKEN_PREFIX_LENGTH = API_TOKEN_PREFIX.length + 8

export interface GeneratedApiToken {
  token: string
  hash: string
  prefix: string
}

export function generateApiToken(): GeneratedApiToken {
  const token = `${API_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`
  return {
    token,
    hash: sha256(token),
    prefix: token.slice(0, API_TOKEN_PREFIX_LENGTH),
  }
}
