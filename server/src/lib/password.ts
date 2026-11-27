import { hash, verify } from '@node-rs/argon2'

const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 }

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS)
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password, OPTIONS)
  } catch {
    return false
  }
}

let dummyHash: Promise<string> | null = null

export function verifyAgainstDummy(password: string): Promise<boolean> {
  dummyHash ??= hashPassword('dummy-password-for-timing')
  return dummyHash.then((value) => verifyPassword(value, password)).then(() => false)
}
