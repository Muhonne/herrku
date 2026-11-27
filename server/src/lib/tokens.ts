import { createHash, randomBytes } from 'node:crypto'

export const randomToken = (): string => randomBytes(32).toString('base64url')

export const sha256 = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex')

export const sha256Buffer = (value: Buffer): string =>
  createHash('sha256').update(value).digest('hex')
