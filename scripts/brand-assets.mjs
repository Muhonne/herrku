#!/usr/bin/env node
/**
 * Build brand assets from a photo cutout on a white background.
 *
 *   node scripts/brand-assets.mjs <source.jpg>
 *
 * Writes into web/public: brand.png (transparent header logo),
 * favicon-16.png, favicon-32.png, favicon.ico, apple-touch-icon.png
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const source = process.argv[2]
if (!source) {
  console.error('usage: node scripts/brand-assets.mjs <source.jpg>')
  process.exit(1)
}

const outDir = join(process.cwd(), 'web', 'public')
mkdirSync(outDir, { recursive: true })

const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const { width, height } = info
const px = new Uint8ClampedArray(data)

const BG = { r: 255, g: 255, b: 255 }
const clamp255 = (value) => Math.max(0, Math.min(255, Math.round(value)))
const smoothstep = (edge0, edge1, value) => {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

// Distance-from-white matte. Near-white pixels become transparent; the
// anti-aliased rim gets partial alpha, and its white contribution is removed
// (decontamination) so no light halo survives on the dark UI.
for (let p = 0; p < width * height; p += 1) {
  const i = p * 4
  const r = px[i]
  const g = px[i + 1]
  const b = px[i + 2]
  const distance = Math.max(
    Math.abs(r - BG.r),
    Math.abs(g - BG.g),
    Math.abs(b - BG.b),
  )
  const alpha = smoothstep(8, 34, distance)

  if (alpha <= 0.02) {
    px[i + 3] = 0
    continue
  }
  if (alpha < 0.98) {
    px[i] = clamp255((r - BG.r * (1 - alpha)) / alpha)
    px[i + 1] = clamp255((g - BG.g * (1 - alpha)) / alpha)
    px[i + 2] = clamp255((b - BG.b * (1 - alpha)) / alpha)
  }
  px[i + 3] = clamp255(alpha * 255)
}

// Choke the matte: erode alpha a few pixels so any light rim baked into the
// source is cut away instead of glowing against the dark surface.
let alphaPlane = new Uint8Array(width * height)
for (let p = 0; p < width * height; p += 1) alphaPlane[p] = px[p * 4 + 3]
for (let pass = 0; pass < 3; pass += 1) {
  const next = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let min = 255
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const value = alphaPlane[ny * width + nx]
          if (value < min) min = value
        }
      }
      next[y * width + x] = min
    }
  }
  alphaPlane = next
}
for (let p = 0; p < width * height; p += 1) px[p * 4 + 3] = alphaPlane[p]

let minX = width
let minY = height
let maxX = -1
let maxY = -1
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    if (px[(y * width + x) * 4 + 3] > 32) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
}

const cropped = await sharp(Buffer.from(px), { raw: { width, height, channels: 4 } })
  .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
  .png()
  .toBuffer()

const MASTER = 512
const art = await sharp(cropped)
  .resize(MASTER - 48, MASTER - 48, { fit: 'inside', withoutEnlargement: false })
  .png()
  .toBuffer()
const artMeta = await sharp(art).metadata()
const padLeft = Math.floor((MASTER - (artMeta.width ?? MASTER)) / 2)
const padTop = Math.floor((MASTER - (artMeta.height ?? MASTER)) / 2)
const master = await sharp(art)
  .extend({
    top: padTop,
    bottom: MASTER - (artMeta.height ?? MASTER) - padTop,
    left: padLeft,
    right: MASTER - (artMeta.width ?? MASTER) - padLeft,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toBuffer()

const png = (size) => sharp(master).resize(size, size).png({ compressionLevel: 9 }).toBuffer()

const sizes = { 16: await png(16), 32: await png(32), 48: await png(48) }
writeFileSync(join(outDir, 'favicon-16.png'), sizes[16])
writeFileSync(join(outDir, 'favicon-32.png'), sizes[32])
writeFileSync(join(outDir, 'brand.png'), await png(128))

const apple = await sharp(master)
  .resize(180, 180)
  .flatten({ background: '#0a0a09' })
  .png()
  .toBuffer()
writeFileSync(join(outDir, 'apple-touch-icon.png'), apple)

// Pack PNG entries into a minimal ICO container (Vista+ PNG ICO).
const entries = [16, 32, 48].map((size) => ({ size, buffer: sizes[size] }))
const header = Buffer.alloc(6 + entries.length * 16)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(entries.length, 4)
let offset = header.length
entries.forEach((entry, index) => {
  const base = 6 + index * 16
  header.writeUInt8(entry.size === 256 ? 0 : entry.size, base)
  header.writeUInt8(entry.size === 256 ? 0 : entry.size, base + 1)
  header.writeUInt8(0, base + 2)
  header.writeUInt8(0, base + 3)
  header.writeUInt16LE(1, base + 4)
  header.writeUInt16LE(32, base + 6)
  header.writeUInt32LE(entry.buffer.length, base + 8)
  header.writeUInt32LE(offset, base + 12)
  offset += entry.buffer.length
})
writeFileSync(join(outDir, 'favicon.ico'), Buffer.concat([header, ...entries.map((e) => e.buffer)]))

console.log(`source ${width}x${height} -> trimmed ${maxX - minX + 1}x${maxY - minY + 1}`)
console.log('wrote web/public/brand.png, favicon-16.png, favicon-32.png, favicon.ico, apple-touch-icon.png')
