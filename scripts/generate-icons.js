// Generate branded PWA icons from an inline SVG. Writes:
//   public/icon-192.png         (Android, manifest)
//   public/icon-512.png         (Android, manifest)
//   public/icon-512-maskable.png (Android maskable variant with safe-area padding)
//   public/apple-touch-icon.png (iOS, 180x180)
//
// Run: node scripts/generate-icons.js
// Safe to re-run — overwrites existing files.

const sharp = require('sharp')
const path  = require('path')

// Brand:
//   background: ink  #1a1612
//   dot:        gold #c4922a
// Centered gold circle on a dark rounded-square — the dot from the LocateShoot logo,
// scaled up to make the whole icon.
function buildSvg({ size, padding = 0, transparent = false }) {
  const cx = size / 2
  const cy = size / 2
  const bgR = Math.round(size * 0.18)
  const pad = padding
  // Circle fills ~45% of the icon; leaves visual padding inside the rounded bg.
  const availEdge = size - pad * 2
  const dotR = Math.round(availEdge * 0.32)
  const bg = transparent
    ? ''
    : `<rect x="${pad}" y="${pad}" width="${availEdge}" height="${availEdge}" rx="${bgR}" fill="#1a1612"/>`
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  ${bg}
  <circle cx="${cx}" cy="${cy}" r="${dotR}" fill="#c4922a"/>
</svg>`
}

async function render(svg, outPath) {
  await sharp(Buffer.from(svg)).png().toFile(outPath)
  console.log('wrote', outPath)
}

async function main() {
  const pub = path.join(__dirname, '..', 'public')
  const app = path.join(__dirname, '..', 'app')
  await render(buildSvg({ size: 192 }),                            path.join(pub, 'icon-192.png'))
  await render(buildSvg({ size: 512 }),                            path.join(pub, 'icon-512.png'))
  // Maskable icons must keep content inside a circle with ~80% of the icon's min-edge.
  // 14% padding keeps the dot safely inside that safe-zone when Android clips to shapes.
  await render(buildSvg({ size: 512, padding: 72 }),               path.join(pub, 'icon-512-maskable.png'))
  await render(buildSvg({ size: 180 }),                            path.join(pub, 'apple-touch-icon.png'))
  // Site favicon served by Next's file-based icon convention at /app/icon.png.
  // Dropping at 64px keeps it crisp at tab-icon sizes without bloat.
  await render(buildSvg({ size: 64 }),                             path.join(app, 'icon.png'))
}

main().catch(e => { console.error(e); process.exit(1) })
