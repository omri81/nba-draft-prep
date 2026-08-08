#!/usr/bin/env node
/**
 * Generates the PWA / apple-touch icons into public/ with no image
 * dependencies — just a hand-rolled PNG writer over zlib.
 *
 *   npm run gen-icons
 *
 * Re-run only if you change the artwork below.
 */

import { deflateSync } from 'node:zlib'
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public')

const BG = [11, 13, 16]
const BALL = [242, 118, 46]
const SEAM = [26, 13, 4]

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** rgb: Uint8Array of size*size*3 */
function encodePng(size, rgb) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour
  const stride = size * 3
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    Buffer.from(rgb.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Colour of one sub-sample, in unit coordinates centred on (0.5, 0.5). */
function sample(x, y) {
  const cx = 0.5
  const cy = 0.5
  const r = 0.335
  const dx = x - cx
  const dy = y - cy
  const dist = Math.hypot(dx, dy)
  if (dist > r) return BG

  const seamW = 0.02
  // Straight seams: one vertical, one horizontal.
  if (Math.abs(dx) < seamW / 2) return SEAM
  if (Math.abs(dy) < seamW / 2) return SEAM
  // Curved seams: arcs of circles offset sideways so each one meets the ball
  // at top and bottom and crosses the equator at ±0.6r.
  const arcR = r * 1.1333
  const arcOffset = r * 0.5333
  for (const sign of [-1, 1]) {
    const d = Math.hypot(x - (cx + sign * arcOffset), y - cy)
    if (Math.abs(d - arcR) < seamW / 2) return SEAM
  }
  return BALL
}

function render(size) {
  const rgb = new Uint8Array(size * size * 3)
  const SS = 3 // 3x3 supersampling
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0
      let g = 0
      let b = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size)
          r += c[0]
          g += c[1]
          b += c[2]
        }
      }
      const n = SS * SS
      const i = (py * size + px) * 3
      rgb[i] = Math.round(r / n)
      rgb[i + 1] = Math.round(g / n)
      rgb[i + 2] = Math.round(b / n)
    }
  }
  return rgb
}

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="18" fill="#0b0d10"/>
  <circle cx="50" cy="50" r="33.5" fill="#f2762e"/>
  <g stroke="#1a0d04" stroke-width="2" fill="none">
    <path d="M50 16.5v67M16.5 50h67"/>
    <path d="M50 16.5A38 38 0 0 1 50 83.5M50 16.5A38 38 0 0 0 50 83.5"/>
  </g>
</svg>
`

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const targets = [
    ['icon-192.png', 192],
    ['icon-512.png', 512],
    ['apple-touch-icon.png', 180],
  ]
  for (const [file, size] of targets) {
    const png = encodePng(size, render(size))
    await writeFile(resolve(OUT_DIR, file), png)
    console.log(`  ${file} (${size}x${size}, ${png.length} bytes)`)
  }
  await writeFile(resolve(OUT_DIR, 'favicon.svg'), FAVICON, 'utf8')
  console.log('  favicon.svg')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
