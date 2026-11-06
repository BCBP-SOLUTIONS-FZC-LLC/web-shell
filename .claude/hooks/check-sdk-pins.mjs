// The three platform packages move together (CLAUDE.md, SDK upgrades): exact versions, one version.
// Exit 1 with the reason when package.json breaks that; used by post-edit.sh and the sdk-upgrade skill.
import { readFileSync } from 'node:fs'

const PACKAGES = ['frontend-sdk', 'webpack-preset', 'eslint-plugin'].map((p) => `@bcbp-solutions-fzc-llc/${p}`)
const pkg = JSON.parse(readFileSync(process.argv[2] ?? 'package.json', 'utf8'))
const all = { ...pkg.dependencies, ...pkg.devDependencies }
const found = PACKAGES.map((name) => [name, all[name]])
const problems = []
for (const [name, version] of found) {
  if (!version) problems.push(`${name} is missing`)
  else if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version)) problems.push(`${name} is "${version}": pin an exact version (no ^, ~ or range)`)
}
const versions = new Set(found.map(([, v]) => v).filter(Boolean))
if (versions.size > 1) problems.push(`the platform packages differ (${found.map(([n, v]) => `${n.split('/')[1]} ${v}`).join(', ')}): upgrade all three together`)
if (problems.length) {
  console.error(`Platform package pins:\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log(`platform packages: ${[...versions][0]} (exact, all three)`)
