// ARCHITECTURE.md embeds each docs/architecture/mermaid/*.mmd as a ```mermaid block under a
// `> Source:` line (docs/architecture/README.md). Exits 1 and names every block that differs from its
// source, and every .mmd under that directory that is not embedded.
import { existsSync, readdirSync, readFileSync } from 'node:fs'

const doc = readFileSync('ARCHITECTURE.md', 'utf8')
const re = /> Source: \[`(docs\/architecture\/mermaid\/[^`]+\.mmd)`\][^\n]*\n\n```mermaid\n([\s\S]*?)```/g
const problems = []
const embedded = new Set()
for (const [, path, block] of doc.matchAll(re)) {
  embedded.add(path)
  if (!existsSync(path)) problems.push(`${path}: named in ARCHITECTURE.md but missing`)
  else if (readFileSync(path, 'utf8').trimEnd() !== block.trimEnd()) problems.push(`${path}: differs from its block in ARCHITECTURE.md; make them identical`)
}
for (const name of readdirSync('docs/architecture/mermaid')) {
  const path = `docs/architecture/mermaid/${name}`
  if (name.endsWith('.mmd') && !embedded.has(path)) problems.push(`${path}: not embedded in ARCHITECTURE.md`)
}
if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
