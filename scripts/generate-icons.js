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
//   dot: gold #c4922a
// Just the gold circle, centered on a transparent canvas. Android/iOS launchers
// place it on the user's wallpaper; no dark rounded-square behind it.
// `safeZone` trims the radius so the circle stays fully inside the Android
// maskable safe area (80% of the icon's min edge).
function buildSvg({ size, safeZone = false }) {
  const cx = size / 2
  const cy = size / 2
  // Non-maskable icons can almost touch the edge (48% of min edge).
  // Maskable icons must keep content in the central 80%, so 40% of min edge.
  const dotR = Math.round(size * (safeZone ? 0.40 : 0.48))
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
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
  await render(buildSvg({ size: 192 }),                    path.join(pub, 'icon-192.png'))
  await render(buildSvg({ size: 512 }),                    path.join(pub, 'icon-512.png'))
  // Maskable variant: gold circle sized for Android's 80% safe zone.
  await render(buildSvg({ size: 512, safeZone: true }),    path.join(pub, 'icon-512-maskable.png'))
  await render(buildSvg({ size: 180 }),                    path.join(pub, 'apple-touch-icon.png'))
  // Site favicon served by Next's file-based icon convention at /app/icon.png.
  await render(buildSvg({ size: 64 }),                     path.join(app, 'icon.png'))
}

main().catch(e => { console.error(e); process.exit(1) })
