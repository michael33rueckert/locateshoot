// Copy maplibre-gl's worker + shared runtime out of node_modules
// into public/ so Next.js serves them with a real text/javascript
// MIME type. Turbopack (dev bundler) can't serve maplibre-gl's
// worker via the default `new URL(..., import.meta.url)` path
// — it returns HTML, and module workers require JS MIME. This
// side-steps that entirely by shipping the worker as a static
// asset the browser fetches over HTTP.
//
// Runs from package.json's postinstall so the files are always
// in sync with the installed maplibre-gl version.
import { cp } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const src = path.join(root, 'node_modules', 'maplibre-gl', 'dist')
const dst = path.join(root, 'public')

const files = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']

for (const name of files) {
  try {
    await cp(path.join(src, name), path.join(dst, name))
    console.log(`[maplibre-worker] copied ${name} → public/`)
  } catch (err) {
    console.warn(`[maplibre-worker] skipped ${name}: ${err.message}`)
  }
}
