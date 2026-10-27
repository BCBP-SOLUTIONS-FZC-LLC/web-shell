import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  envWithFullPath,
  getWindowsPathFromRegistry,
  loadDockerCliFromFiles,
} from './load-docker-env.mjs'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const composeFile = join(projectRoot, 'docker-compose.keycloak.yml')
const runEnv = envWithFullPath()

const fileDockerCli = loadDockerCliFromFiles(projectRoot)
if (fileDockerCli && !process.env.DOCKER_CLI) {
  process.env.DOCKER_CLI = fileDockerCli
}

function findDockerViaPowerShell() {
  if (process.platform !== 'win32') {
    return null
  }

  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      [
        '$paths = @($env:DOCKER_CLI)',
        "if ($env:ProgramFiles) { $paths += Join-Path $env:ProgramFiles 'Docker\\Docker\\resources\\bin\\docker.exe' }",
        "if (${env:ProgramFiles(x86)}) { $paths += Join-Path ${env:ProgramFiles(x86)} 'Docker\\Docker\\resources\\bin\\docker.exe' }",
        'foreach ($p in $paths) { if ($p -and (Test-Path -LiteralPath $p)) { Write-Output $p; exit 0 } }',
        '$c = Get-Command docker -ErrorAction SilentlyContinue',
        'if ($c) { Write-Output $c.Source; exit 0 }',
        'exit 1',
      ].join('; '),
    ],
    { encoding: 'utf8', env: runEnv },
  )

  const line = (result.stdout || '').trim().split(/\r?\n/).pop()?.trim()
  return line && existsSync(line) ? line : null
}

function findDockerOnPath() {
  const pathKey = process.platform === 'win32' ? 'Path' : 'PATH'
  const dirs = (runEnv[pathKey] || '').split(';').filter(Boolean)
  for (const dir of dirs) {
    const candidate = join(dir.trim(), process.platform === 'win32' ? 'docker.exe' : 'docker')
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

const winDockerPaths =
  process.platform === 'win32'
    ? [
        process.env.DOCKER_CLI,
        `${process.env.ProgramFiles || 'C:\\Program Files'}\\Docker\\Docker\\resources\\bin\\docker.exe`,
        `${process.env['ProgramFiles(x86)'] || ''}\\Docker\\Docker\\resources\\bin\\docker.exe`,
      ].filter(Boolean)
    : []

const dockerCandidates = [...winDockerPaths, 'docker'].filter(Boolean)

function probeDocker(cmd) {
  const isPath = cmd.includes('/') || cmd.includes('\\')
  if (isPath && !existsSync(cmd)) {
    return false
  }
  const probe = spawnSync(isPath ? cmd : 'docker', isPath ? ['version'] : ['version'], {
    stdio: 'ignore',
    shell: !isPath,
    env: runEnv,
  })
  return probe.status === 0
}

function findDocker() {
  for (const cmd of dockerCandidates) {
    if (probeDocker(cmd)) {
      return cmd.includes('/') || cmd.includes('\\') ? cmd : findDockerOnPath() || 'docker'
    }
  }

  const fromPath = findDockerOnPath()
  if (fromPath && probeDocker(fromPath)) {
    return fromPath
  }

  return findDockerViaPowerShell()
}

const docker = findDocker()
if (!docker) {
  const pathPreview = getWindowsPathFromRegistry().split(';').filter((p) => /docker/i.test(p))
  console.error('Docker CLI not found.')
  console.error('')
  console.error('Do this:')
  console.error('  1. Open Docker Desktop and wait until the engine is running.')
  console.error('  2. Copy docker.local.env.example -> docker.local.env and set DOCKER_CLI to your docker.exe path.')
  console.error('  3. Or in this terminal: $env:DOCKER_CLI = "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe"')
  console.error('  4. Then: npm run keycloak:dev:detach')
  if (pathPreview.length) {
    console.error('')
    console.error('PATH entries containing "docker":', pathPreview.join('; '))
  }
  process.exit(1)
}

console.error(`Using Docker: ${docker}`)

const composeArgs = ['compose', '-f', composeFile, ...process.argv.slice(2)]
const run = spawnSync(docker, composeArgs, {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: false,
  env: runEnv,
})

process.exit(run.status ?? 1)
