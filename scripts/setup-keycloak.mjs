import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { envWithFullPath, loadDockerCliFromFiles } from './load-docker-env.mjs'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const runEnv = envWithFullPath()

function runNodeScript(name, args = []) {
  const script = join(projectRoot, 'scripts', name)
  return spawnSync(process.execPath, [script, ...args], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: runEnv,
  })
}

const example = join(projectRoot, 'docker.local.env.example')
const local = join(projectRoot, 'docker.local.env')
if (!existsSync(local) && existsSync(example)) {
  copyFileSync(example, local)
  console.log('Created docker.local.env from example.')
}

const dockerCli =
  process.env.DOCKER_CLI ||
  loadDockerCliFromFiles(projectRoot) ||
  'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'

if (existsSync(dockerCli)) {
  writeFileSync(local, `DOCKER_CLI=${dockerCli}\n`, 'utf8')
  process.env.DOCKER_CLI = dockerCli
}

console.log('Starting Keycloak container...')
const up = runNodeScript('keycloak-compose.mjs', ['up', '-d'])
if (up.status !== 0) {
  process.exit(up.status ?? 1)
}

console.log('Waiting for Keycloak...')
for (let i = 0; i < 36; i += 1) {
  const check = runNodeScript('check-keycloak.mjs')
  if (check.status === 0) {
    console.log('Keycloak is ready at http://localhost:8080')
    console.log('Run npm run dev and sign in at http://localhost:5001 (realm tenant-bcbp).')
    const seed = runNodeScript('seed-keycloak-user.mjs')
    process.exit(seed.status === 0 ? 0 : (seed.status ?? 1))
  }
  spawnSync('powershell.exe', ['-Command', 'Start-Sleep -Seconds 5'], { stdio: 'ignore' })
}

console.error('Keycloak did not become ready. Run: npm run keycloak:logs')
process.exit(1)
