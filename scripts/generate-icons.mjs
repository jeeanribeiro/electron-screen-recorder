/**
 * Programmatic icon set: app icon + tray icons, rendered with a tiny
 * software rasterizer and written as PNGs with zero image dependencies.
 *
 *   node scripts/generate-icons.mjs
 *
 * Outputs:
 *   build/icon.png                  512px app icon (electron-builder converts
 *                                   this to .icns / .ico at package time)
 *   resources/icons/icon-256.png    window icon (Windows / Linux)
 *   resources/icons/tray-idle.png   + @2x — tray, idle
 *   resources/icons/tray-recording.png + @2x — tray, recording
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---------- minimal PNG encoder (8-bit RGBA) ----------

const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c >>> 0
}

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const chunk = Buffer.alloc(8 + data.length + 4)
  chunk.writeUInt32BE(data.length, 0)
  chunk.write(type, 4, 'ascii')
  data.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length)
  return chunk
}

function encodePng(size, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------- tiny rasterizer with 4x supersampling ----------

/**
 * shade(u, v) receives coordinates in [0, 1) and returns [r, g, b, a]
 * (0-255 floats, straight alpha) or null for transparent.
 */
function render(size, shade) {
  const SS = 4
  const rgba = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size
          const v = (y + (sy + 0.5) / SS) / size
          const sample = shade(u, v)
          if (sample) {
            const [sr, sg, sb, sa] = sample
            const alpha = sa / 255
            r += sr * alpha
            g += sg * alpha
            b += sb * alpha
            a += sa
          }
        }
      }
      const samples = SS * SS
      const alpha = a / samples
      const index = (y * size + x) * 4
      if (alpha > 0) {
        rgba[index] = Math.round(r / samples / (alpha / 255))
        rgba[index + 1] = Math.round(g / samples / (alpha / 255))
        rgba[index + 2] = Math.round(b / samples / (alpha / 255))
        rgba[index + 3] = Math.round(alpha)
      }
    }
  }
  return rgba
}

const dist = (u, v, cx, cy) => Math.hypot(u - cx, v - cy)

function roundedRectMask(u, v, radius) {
  const x = Math.min(u, 1 - u)
  const y = Math.min(v, 1 - v)
  if (x >= radius || y >= radius) return true
  return Math.hypot(radius - x, radius - y) <= radius
}

const mix = (a, b, t) => a.map((channel, i) => channel + (b[i] - channel) * t)

/** App icon: dark rounded tile, white record ring, red dot. */
function appIconShade(u, v) {
  if (!roundedRectMask(u, v, 0.22)) return null
  let color = mix([35, 44, 58, 255], [13, 17, 23, 255], v)
  const d = dist(u, v, 0.5, 0.5)
  if (d <= 0.24) {
    color = mix([251, 113, 133, 255], [225, 29, 72, 255], v)
  }
  if (d >= 0.315 && d <= 0.36) {
    color = [236, 242, 248, 255]
  }
  return color
}

/** Tray icons: transparent background, bold ring (+ red dot when recording). */
function trayShade(recording) {
  return (u, v) => {
    const d = dist(u, v, 0.5, 0.5)
    if (recording && d <= 0.24) return [244, 63, 94, 255]
    if (d >= 0.32 && d <= 0.44) return [240, 244, 249, 255]
    return null
  }
}

function writePng(relPath, size, shade) {
  const filePath = join(root, relPath)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, encodePng(size, render(size, shade)))
  console.log(`wrote ${relPath} (${size}x${size})`)
}

writePng('build/icon.png', 512, appIconShade)
writePng('resources/icons/icon-256.png', 256, appIconShade)
writePng('resources/icons/tray-idle.png', 16, trayShade(false))
writePng('resources/icons/tray-idle@2x.png', 32, trayShade(false))
writePng('resources/icons/tray-recording.png', 16, trayShade(true))
writePng('resources/icons/tray-recording@2x.png', 32, trayShade(true))
