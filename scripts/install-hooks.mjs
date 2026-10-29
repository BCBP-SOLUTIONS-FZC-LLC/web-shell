/**
 * Copies .githooks/pre-commit into .git/hooks, matching `make install-hooks`
 * in iam-org-membership. Re-run after the hook file changes.
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, '.githooks', 'pre-commit')
const gitDir = join(root, '.git')

if (!existsSync(source)) {
  console.error('Missing .githooks/pre-commit')
  process.exit(1)
}

if (!existsSync(gitDir)) {
  console.error('No .git directory. Run this inside a clone of web-shell.')
  process.exit(1)
}

const hooksDir = join(gitDir, 'hooks')
mkdirSync(hooksDir, { recursive: true })
const dest = join(hooksDir, 'pre-commit')
copyFileSync(source, dest)
chmodSync(dest, 0o755)
console.log('Installed .githooks/pre-commit into .git/hooks/pre-commit')
