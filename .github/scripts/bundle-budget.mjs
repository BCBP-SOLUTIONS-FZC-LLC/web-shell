#!/usr/bin/env node
// Fails the build when the shipped bundle outgrows its budget (gzip -9, as served compressed).
// Run after `npm run build`; `npm run budget` locally. Raise a limit on purpose, in the same pull
// request as the growth, with the reason in the CHANGELOG.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { gzipSync } from 'node:zlib'

const DIST = 'dist'
const KB = 1024
/** Limits, about 15–20% over the size on 2026-11-05 (entry 8 KB, JS+CSS 247 KB, largest 67 KB, images 2.2 MB). */
export const BUDGET = {
  /** The scripts index.html loads before anything else (the async boundary). */
  entry: 12 * KB,
  /** Every JS and CSS file the shell can load (gzip). */
  total: 300 * KB,
  /** Any single JS or CSS file (gzip). */
  largest: 85 * KB,
  /** Images under /assets/ (bytes on disk; already compressed formats). */
  images: 2.7 * 1024 * KB,
}

const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]))
const gz = (f) => gzipSync(readFileSync(f), { level: 9 }).length
const kb = (n) => `${(n / KB).toFixed(1)} KB`

const files = walk(join(DIST, 'assets'))
const code = files.filter((f) => /\.(js|css)$/.test(f)).map((f) => ({ f, size: gz(f) }))
const html = readFileSync(join(DIST, 'index.html'), 'utf8')
const entryFiles = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map((m) => join(DIST, m[1]))
const largest = code.reduce((a, b) => (b.size > a.size ? b : a), { f: '-', size: 0 })

const measured = {
  entry: entryFiles.reduce((a, f) => a + gz(f), 0),
  total: code.reduce((a, c) => a + c.size, 0),
  largest: largest.size,
  images: files.filter((f) => /\.(jpe?g|png|webp|avif|gif|svg)$/.test(f)).reduce((a, f) => a + statSync(f).size, 0),
}

let failed = false
for (const key of Object.keys(BUDGET)) {
  const over = measured[key] > BUDGET[key]
  failed ||= over
  const note = key === 'largest' ? ` (${relative(DIST, largest.f)})` : ''
  console.log(`${over ? '✗' : '✓'} ${key.padEnd(8)} ${kb(measured[key]).padStart(10)} / ${kb(BUDGET[key])}${note}`)
  if (over) console.log(`::error title=Bundle budget::${key} is ${kb(measured[key])}, over its ${kb(BUDGET[key])} budget${note}`)
}
if (entryFiles.length === 0) {
  console.log('::error title=Bundle budget::index.html loads no /assets/ script; run npm run build first')
  failed = true
}
process.exit(failed ? 1 : 0)
