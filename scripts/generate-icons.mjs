// Renders public/icon.svg into the PNG sizes the manifest + iOS expect.
// One-shot. Run with: `node scripts/generate-icons.mjs`
//
// Why this exists: PWA manifests want PNGs (Android/older iOS), and iOS
// home-screen needs a non-transparent PNG via apple-touch-icon. The SVG
// is the source of truth — every PNG here is generated from it so the
// design only has to be edited in one place.

import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const svg = readFileSync(join(root, 'public/icon.svg'), 'utf8')

const targets = [
  { out: 'public/icon-192.png',          size: 192,  maskable: false },
  { out: 'public/icon-512.png',          size: 512,  maskable: false },
  { out: 'public/icon-512-maskable.png', size: 512,  maskable: true  },
  { out: 'public/apple-touch-icon.png',  size: 180,  maskable: false },
  { out: 'public/favicon-32.png',        size: 32,   maskable: false },
  { out: 'public/favicon-16.png',        size: 16,   maskable: false },
]

// Maskable variants need ~10% safe-area padding on every side per the PWA
// spec, so they don't get clipped to a square inside Android's adaptive
// icon mask. We accomplish this by rendering the SVG smaller inside the
// canvas — Resvg's `fitTo` doesn't add padding directly, so we wrap the
// source in a background SVG of full size when the maskable flag is on.
function buildSvgFor(size, maskable) {
  if (!maskable) return svg
  // Drop the source SVG into the center of a gold-filled square at full
  // size, scaled down to ~80% so the rasterizer's mask cropping doesn't
  // shave the L's serifs.
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
  const inset = Math.round(size * 0.10)
  const innerSize = size - inset * 2
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="#c4922a"/>
  <svg x="${inset}" y="${inset}" width="${innerSize}" height="${innerSize}" viewBox="0 0 512 512">${inner}</svg>
</svg>`
}

for (const { out, size, maskable } of targets) {
  const sourceSvg = buildSvgFor(size, maskable)
  const resvg = new Resvg(sourceSvg, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)',
  })
  const png = resvg.render().asPng()
  writeFileSync(join(root, out), png)
  console.log(`✓ ${out}  (${size}×${size}${maskable ? ', maskable' : ''})`)
}
