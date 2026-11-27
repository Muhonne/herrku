import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join, relative } from 'node:path'
import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { HttpError } from './errors.js'
import { randomToken, sha256Buffer } from './tokens.js'

const WEBP_QUALITY = 82
const FULL_EDGE = 1600
const THUMB_EDGE = 400
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export type ImageKind = 'jpeg' | 'png' | 'webp'

export function sniffImage(head: Buffer): ImageKind | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg'
  if (head.length >= 8 && head.subarray(0, 8).equals(PNG_MAGIC)) return 'png'
  if (
    head.length >= 12 &&
    head.toString('ascii', 0, 4) === 'RIFF' &&
    head.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp'
  }
  return null
}

export function readHead(path: string, length = 16): Buffer {
  const descriptor = openSync(path, 'r')
  try {
    const buffer = Buffer.alloc(length)
    const read = readSync(descriptor, buffer, 0, length, 0)
    return buffer.subarray(0, read)
  } finally {
    closeSync(descriptor)
  }
}

function writeAtomic(target: string, data: Buffer): void {
  const temporary = `${target}.tmp-${randomToken()}`
  writeFileSync(temporary, data)
  renameSync(temporary, target)
}

export interface StoredImage {
  imagePath: string
  thumbPath: string
}

export async function processAndStoreImage(options: {
  tempPath: string
  dataDir: string
  recipeId: number
}): Promise<StoredImage> {
  const directory = join(options.dataDir, 'uploads', String(options.recipeId))
  mkdirSync(directory, { recursive: true })

  let full: Buffer
  let thumb: Buffer
  try {
    const source = sharp(options.tempPath, { failOn: 'error' }).rotate()
    full = await source
      .clone()
      .resize({ width: FULL_EDGE, height: FULL_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer()
    thumb = await source
      .clone()
      .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer()
  } catch {
    throw new HttpError(415, 'unsupported_media_type', 'That file is not a supported image')
  }

  const hash = sha256Buffer(full).slice(0, 8)
  const fullPath = join(directory, `${hash}.webp`)
  const thumbPath = join(directory, `${hash}-thumb.webp`)
  writeAtomic(fullPath, full)
  writeAtomic(thumbPath, thumb)

  return {
    imagePath: relative(options.dataDir, fullPath),
    thumbPath: relative(options.dataDir, thumbPath),
  }
}

export function deleteStoredImages(
  dataDir: string,
  paths: Array<string | null>,
  keep: Array<string | null> = [],
): void {
  const keepSet = new Set(keep.filter((path): path is string => path !== null))
  for (const path of paths) {
    if (!path || keepSet.has(path)) continue
    try {
      rmSync(join(dataDir, path), { force: true })
    } catch {
      // best effort
    }
  }
}

export function cleanupOrphanImages(app: FastifyInstance): void {
  const root = join(app.config.dataDir, 'uploads')
  if (!existsSync(root)) return

  const referenced = new Set<string>()
  const rows = app.sqlite
    .prepare('select image_path, image_thumb_path from recipes')
    .all() as Array<{ image_path: string | null; image_thumb_path: string | null }>
  for (const row of rows) {
    if (row.image_path) referenced.add(row.image_path)
    if (row.image_thumb_path) referenced.add(row.image_thumb_path)
  }

  let directories: string[] = []
  try {
    directories = readdirSync(root)
  } catch {
    return
  }

  for (const entry of directories) {
    const entryPath = join(root, entry)
    let stats
    try {
      stats = statSync(entryPath)
    } catch {
      continue
    }
    if (!stats.isDirectory()) {
      if (entry.startsWith('.tmp-')) unlinkQuietly(entryPath)
      continue
    }

    let files: string[] = []
    try {
      files = readdirSync(entryPath)
    } catch {
      continue
    }
    for (const file of files) {
      const relativePath = relative(app.config.dataDir, join(entryPath, file))
      if (!referenced.has(relativePath)) unlinkQuietly(join(entryPath, file))
    }

    try {
      if (readdirSync(entryPath).length === 0) rmdirSync(entryPath)
    } catch {
      // ignore
    }
  }
}

function unlinkQuietly(path: string): void {
  try {
    unlinkSync(path)
  } catch {
    // ignore
  }
}
