/**
 * Ensures the local dev user exists in realm "tenant-bcbp" (for existing imports that skip realm JSON).
 * Usage: npm run keycloak:seed-user
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { envWithFullPath } from './load-docker-env.mjs'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const runEnv = envWithFullPath()

const REALM = 'tenant-bcbp'
const DEV_EMAIL = 'balaji.selvarangam@bcbpsolutions.com'
const DEV_USERNAME = DEV_EMAIL
const DEV_PASSWORD = 'BS@bcbpsolutions'

const DEV_USER = {
  username: DEV_USERNAME,
  email: DEV_EMAIL,
  firstName: 'Balaji',
  lastName: 'Selvarangam',
}

function docker(args) {
  return spawnSync('node', [join(projectRoot, 'scripts', 'keycloak-compose.mjs'), ...args], {
    cwd: projectRoot,
    stdio: 'pipe',
    encoding: 'utf8',
    env: runEnv,
  })
}

function kcadm(args) {
  return docker(['exec', '-T', 'keycloak', '/opt/keycloak/bin/kcadm.sh', ...args])
}

console.log(`Seeding Keycloak dev user ${DEV_EMAIL}...`)

let login = kcadm([
  'config',
  'credentials',
  '--server',
  'http://127.0.0.1:8080',
  '--realm',
  'master',
  '--user',
  'admin',
  '--password',
  'admin',
])
if (login.status !== 0) {
  console.error(login.stderr || login.stdout || 'kcadm login failed. Is Keycloak running?')
  process.exit(login.status ?? 1)
}

function findUserByEmail(email) {
  const result = kcadm(['get', 'users', '-r', REALM, '-q', `email=${email}`])
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout)
    process.exit(result.status ?? 1)
  }
  const users = JSON.parse(result.stdout || '[]')
  return users[0] ?? null
}

function findUserByUsername(username) {
  const result = kcadm(['get', 'users', '-r', REALM, '-q', `username=${username}`])
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout)
    process.exit(result.status ?? 1)
  }
  const users = JSON.parse(result.stdout || '[]')
  return users[0] ?? null
}

function ensureUser({ username, email, firstName, lastName }) {
  let record = findUserByEmail(email) ?? findUserByUsername(username)

  if (!record) {
    const create = kcadm([
      'create',
      'users',
      '-r',
      REALM,
      '-s',
      `username=${username}`,
      '-s',
      `email=${email}`,
      '-s',
      'enabled=true',
      '-s',
      'emailVerified=true',
      '-s',
      `firstName=${firstName}`,
      '-s',
      `lastName=${lastName}`,
    ])
    if (create.status !== 0) {
      console.error(create.stderr || create.stdout)
      process.exit(create.status ?? 1)
    }
    record = findUserByUsername(username) ?? findUserByEmail(email)
  }

  if (!record?.id) {
    console.error(`User lookup failed for ${email}.`)
    process.exit(1)
  }

  const password = kcadm([
    'set-password',
    '-r',
    REALM,
    '--userid',
    record.id,
    '--new-password',
    DEV_PASSWORD,
  ])
  if (password.status !== 0) {
    console.error(password.stderr || password.stdout)
    process.exit(password.status ?? 1)
  }

  console.log(`Dev login ready: ${email} (password set).`)
}

ensureUser(DEV_USER)

console.log(`Realm "${REALM}" dev user updated.`)
