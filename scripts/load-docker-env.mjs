import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

/** Merge Machine + User PATH (Cursor terminals often miss Docker until restart). */
export function getWindowsPathFromRegistry() {
  if (process.platform !== 'win32') {
    return process.env.Path || process.env.PATH || ''
  }

  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')",
    ],
    { encoding: 'utf8' },
  )

  const merged = (result.stdout || '').trim()
  return merged || process.env.Path || process.env.PATH || ''
}

export function loadDockerCliFromFiles(projectRoot) {
  const files = ['docker.local.env', 'docker.env', '.env']
  for (const name of files) {
    const filePath = join(projectRoot, name)
    if (!existsSync(filePath)) {
      continue
    }
    const text = readFileSync(filePath, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        continue
      }
      const match = trimmed.match(/^DOCKER_CLI\s*=\s*(.+)$/)
      if (match) {
        return match[1].trim().replace(/^["']|["']$/g, '')
      }
    }
  }
  return ''
}

export function envWithFullPath() {
  const pathKey = process.platform === 'win32' ? 'Path' : 'PATH'
  const fullPath = getWindowsPathFromRegistry()
  return {
    ...process.env,
    [pathKey]: fullPath,
  }
}
