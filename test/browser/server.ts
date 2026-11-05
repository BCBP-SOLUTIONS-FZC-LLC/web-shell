// The real-browser suite's servers (test/browser/README.md), modelled on platform-reactcommon
// test/browser/server.ts:
//
// - the app (https://127.0.0.1:<port>): the production build in dist/ with the PRODUCTION response
//   headers (platform-reactcommon examples/cloudfront/csp.mjs, copied below), the nginx SPA rule, a
//   runtime config pointed at the fake Keycloak, a manifest with one remote whose entry is a stub
//   built only on the shared SDK (as mfe-dashboard is), IAM PUB-1 and P-35, and recorders for
//   /otel/* and /csp-report;
// - a fake Keycloak on a second origin (https://127.0.0.1:<port>): authorize (the user is taken as
//   signed in), the token endpoint with PKCE and CORS, and the end-session endpoint the SDK's
//   global sign-out POSTs a form to.
//
// With REMOTE_DIST set to a built mfe-dashboard's dist/ (the dashboard contract run, CI `Dashboard
// contract`), the manifest's `dashboard` is that real build instead of the stub: its remoteEntry.js and
// chunks served under /remotes/dashboard/<version>/, with the integrity its build wrote to
// remote-manifest-entry.json.
//
// HTTPS with a throwaway self-signed certificate: the production CSP has upgrade-insecure-requests,
// which WebKit applies to http://127.0.0.1 too. Tests read what the servers saw at GET /__test/state.
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createServer, type Server } from 'node:https'
import type { AddressInfo } from 'node:net'
import { extname, join, normalize } from 'node:path'
import { PlatformProblemTypes } from '@bcbp-solutions-fzc-llc/frontend-sdk/problem'
import { mockProblem } from '@bcbp-solutions-fzc-llc/frontend-sdk/testing'

const ROOT = join(import.meta.dirname, '..', '..')
const DIST = join(ROOT, 'dist')
const BUILD_DIR = join(import.meta.dirname, '.build')
export const CLIENT = 'tender-web'
export const EMAIL = 'ada@acme.test'
/** The remote this shell loads (src/App.tsx DASHBOARD_REMOTE): manifest key, container `__platform_mfe_<name>`, path. */
export const REMOTE = 'dashboard'
const REALM = 'tenant-acme'

/** The platform CSP (platform-reactcommon examples/cloudfront/csp.mjs buildCsp, alpha.4). */
export function buildCsp(idpOrigin: string): string {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${idpOrigin}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "base-uri 'none'",
    `form-action 'self' ${idpOrigin}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    'upgrade-insecure-requests',
    "require-trusted-types-for 'script'",
    "trusted-types platform-sdk platform-webpack dompurify 'allow-duplicates'",
    'report-uri /csp-report',
    'report-to csp',
  ].join('; ')
}

/** A self-signed certificate for 127.0.0.1 in .build/ (made once with openssl; valid 30 days). */
function certificate(): { key: Buffer; cert: Buffer } {
  const key = join(BUILD_DIR, 'tls-key.pem')
  const cert = join(BUILD_DIR, 'tls-cert.pem')
  if (!existsSync(key) || !existsSync(cert)) {
    mkdirSync(BUILD_DIR, { recursive: true })
    // prettier-ignore
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '30',
      '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' })
  }
  return { key: readFileSync(key), cert: readFileSync(cert) }
}

/**
 * The remote's entry: defines __platform_mfe_dashboard as remoteEntry.js does, and builds the dashboard
 * from the shell's shared React and SDK (no bundle of its own), reading the user, navigation and
 * sign-out through SDK hooks.
 */
const REMOTE_ENTRY = `(() => {
  let scope
  const shared = async (name) => {
    const versions = scope[name]
    return (await versions[Object.keys(versions)[0]].get())()
  }
  window.__platform_mfe_dashboard = {
    init(s) { scope = s },
    async get(module) {
      if (module !== './App') throw new Error('Module "' + module + '" does not exist in container.')
      const React = await shared('react')
      const sdk = await shared('@bcbp-solutions-fzc-llc/frontend-sdk/react')
      const nav = await shared('@bcbp-solutions-fzc-llc/frontend-sdk/nav')
      const h = React.createElement
      function Dashboard() {
        const user = sdk.useCurrentUser()
        const workspace = sdk.useWorkspace()
        const canManage = sdk.useHasPermission('manage', 'members')
        const signOut = sdk.useSignOut()
        return h('main', null,
          h('h1', null, 'Dashboard for ' + (user && user.name) + ' in ' + (workspace && workspace.slug)),
          canManage ? h('button', { type: 'button' }, 'Invite') : null,
          h('button', { type: 'button', onClick: () => nav.navigate('dashboard', '/t/' + workspace.slug + '/dashboard/members') }, 'Members'),
          h('button', { type: 'button', onClick: () => void signOut() }, 'Sign out'))
      }
      return () => ({ default: Dashboard })
    },
  }
})()
`

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url')
const jwt = (claims: Record<string, unknown>) =>
  `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}.${b64url('sig')}`

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

export interface State {
  otel: { path: string; body: string }[]
  cspReports: string[]
  logouts: Record<string, string>[]
  tokenRequests: number
}

async function body(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

/** REMOTE_DIST: a built mfe-dashboard dist/ with its remote-manifest-entry.json. */
function remoteBuild(): { dir: string; base: string; version: string; integrity: string } | undefined {
  const dist = process.env.REMOTE_DIST
  if (!dist) return undefined
  const dir = normalize(dist.startsWith('/') ? dist : join(ROOT, dist))
  const entryFile = join(dir, 'remote-manifest-entry.json')
  if (!existsSync(entryFile)) throw new Error(`test/browser: REMOTE_DIST=${dist} has no remote-manifest-entry.json; build mfe-dashboard first.`)
  const entries = Object.entries(JSON.parse(readFileSync(entryFile, 'utf8')) as Record<string, { version: string; integrity: string }>)
  const [name, entry] = entries[0] ?? []
  // The shell loads REMOTE (src/App.tsx DASHBOARD_REMOTE); a build named otherwise cannot load.
  if (entries.length !== 1 || name !== REMOTE || !entry) {
    throw new Error(`test/browser: REMOTE_DIST's build names its remote ${JSON.stringify(entries.map(([n]) => n))}; this shell loads "${REMOTE}". Rebuild the matching mfe-dashboard, or rename on both sides together.`)
  }
  return { dir, base: `/remotes/${REMOTE}/${entry.version}/`, version: entry.version, integrity: entry.integrity }
}

const listen = (s: Server) =>
  new Promise<string>((resolve) => s.listen(0, '127.0.0.1', () => resolve(`https://127.0.0.1:${(s.address() as AddressInfo).port}`)))

export async function startServers(): Promise<{ app: string; idp: string; close: () => Promise<void> }> {
  if (!existsSync(join(DIST, 'index.html'))) throw new Error('test/browser: no dist/index.html. Run `npm run build` first.')
  const tls = certificate()
  let state: State = { otel: [], cspReports: [], logouts: [], tokenRequests: 0 }
  /** Whether the user has a Keycloak SSO session (prompt=none succeeds). */
  let sso = false
  const codes = new Map<string, { redirectUri: string; challenge: string; nonce: string }>()

  const appServer = createServer(tls)
  const idpServer = createServer(tls)
  const app = await listen(appServer)
  const idp = await listen(idpServer)
  const issuer = `${idp}/realms/${REALM}`
  const config = JSON.parse(readFileSync(join(ROOT, 'public/config/runtime.json'), 'utf8'))
  const runtimeConfig = {
    ...config,
    telemetry: { ...config.telemetry, sampleRatio: 1 },
    auth: { ...config.auth, idpOrigin: idp, clientId: CLIENT },
    remotes: { ...config.remotes, retries: 0 },
  }
  const entryPath = `/remotes/${REMOTE}/1.0.0/remoteEntry.js`
  const integrity = `sha384-${createHash('sha384').update(REMOTE_ENTRY).digest('base64')}`
  /** The real dashboard build (REMOTE_DIST), or undefined for the stub. */
  const real = remoteBuild()
  const manifest = real
    ? { [REMOTE]: { entry: `${real.base}remoteEntry.js`, version: real.version, ownerDomain: 'portal', integrity: real.integrity } }
    : { [REMOTE]: { entry: entryPath, version: '1.0.0', ownerDomain: 'portal', integrity } }
  const headers = {
    'Content-Security-Policy': buildCsp(idp),
    'Reporting-Endpoints': 'csp="/csp-report"',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
  }

  const send = (res: ServerResponse, status: number, data: string | Buffer, type: string, extra: Record<string, string> = {}) => {
    res.writeHead(status, { ...headers, 'Content-Type': type, 'Cache-Control': 'no-cache', ...extra })
    res.end(data)
  }
  const json = (res: ServerResponse, status: number, data: unknown) => send(res, status, JSON.stringify(data), 'application/json')

  appServer.on('request', async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', app)
    const p = url.pathname
    if (p === '/__test/state') return json(res, 200, state)
    if (p === '/__test/reset') {
      state = { otel: [], cspReports: [], logouts: [], tokenRequests: 0 }
      sso = false
      return json(res, 200, {})
    }
    if (p.startsWith('/otel/')) {
      state.otel.push({ path: p, body: await body(req) })
      return send(res, 204, '', 'text/plain')
    }
    if (p === '/csp-report') {
      state.cspReports.push(await body(req))
      return send(res, 204, '', 'text/plain')
    }
    if (p === '/config/runtime.json') return json(res, 200, runtimeConfig)
    if (p === '/remotes/manifest.json') return json(res, 200, manifest)
    if (!real && p === entryPath) return send(res, 200, REMOTE_ENTRY, TYPES['.js']!)
    if (real && p.startsWith(real.base)) {
      const file = normalize(join(real.dir, p.slice(real.base.length)))
      if (!file.startsWith(real.dir) || !existsSync(file) || file.endsWith('.map')) return send(res, 404, 'Not Found', 'text/plain')
      return send(res, 200, readFileSync(file), TYPES[extname(file)] ?? 'application/octet-stream')
    }
    if (p === '/api/v1/public/tenants/resolve') {
      const found = url.searchParams.get('identifier') === EMAIL
      return json(res, 200, found ? { found: true, realm: REALM, strategy: 'dedicated' } : { found: false })
    }
    if (p === '/api/v1/me/session-context') {
      if (!req.headers.authorization?.startsWith('Bearer ')) {
        const r = mockProblem(PlatformProblemTypes.Unauthorized)
        return send(res, r.status, await r.text(), r.headers.get('content-type') ?? 'application/problem+json')
      }
      return json(res, 200, {
        tenant_id: '7d3c1f9e-2b4a-4c6d-8e0f-1a2b3c4d5e6f',
        slug: 'acme',
        roles: ['member', 'tenant_owner'],
        feature_flags: [],
        read_only: false,
        locale: 'en',
      })
    }
    // nginx's SPA rule: only extension-less paths are app routes; a missing file is 404.
    if (/^\/(api|otel|config|remotes|assets)(\/|$)/.test(p) || extname(p)) {
      const file = normalize(join(DIST, p))
      if (!file.startsWith(DIST) || !existsSync(file)) return send(res, 404, 'Not Found', 'text/plain')
      return send(res, 200, readFileSync(file), TYPES[extname(file)] ?? 'application/octet-stream')
    }
    return send(res, 200, readFileSync(join(DIST, 'index.html')), TYPES['.html']!)
  })

  idpServer.on('request', async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', idp)
    const cors = {
      'Access-Control-Allow-Origin': app,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] ?? 'content-type',
    }
    const redirect = (to: string) => {
      res.writeHead(302, { Location: to })
      res.end()
    }
    if (url.pathname === `/realms/${REALM}/protocol/openid-connect/auth`) {
      const q = url.searchParams
      const back = new URL(q.get('redirect_uri')!)
      back.searchParams.set('state', q.get('state')!)
      back.searchParams.set('iss', issuer)
      // A real Keycloak shows its login form unless prompt=none; here the user signs in at once.
      if (q.get('prompt') === 'none' && !sso) {
        back.searchParams.set('error', 'login_required')
        return redirect(back.href)
      }
      sso = true
      const code = randomBytes(12).toString('hex')
      codes.set(code, { redirectUri: q.get('redirect_uri')!, challenge: q.get('code_challenge')!, nonce: q.get('nonce')! })
      back.searchParams.set('code', code)
      return redirect(back.href)
    }
    if (url.pathname === `/realms/${REALM}/protocol/openid-connect/token`) {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, cors)
        return res.end()
      }
      state.tokenRequests++
      const form = new URLSearchParams(await body(req))
      const reply = (status: number, data: unknown) => {
        res.writeHead(status, { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        res.end(JSON.stringify(data))
      }
      const g = codes.get(form.get('code') ?? '')
      codes.delete(form.get('code') ?? '')
      const verified =
        g &&
        form.get('grant_type') === 'authorization_code' &&
        form.get('client_id') === CLIENT &&
        g.redirectUri === form.get('redirect_uri') &&
        createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url') === g.challenge
      if (!verified) return reply(400, { error: 'invalid_grant' })
      const now = Math.floor(Date.now() / 1000)
      return reply(200, {
        access_token: `at-${randomBytes(8).toString('hex')}`,
        id_token: jwt({ iss: issuer, aud: CLIENT, azp: CLIENT, sub: 'user-1', nonce: g.nonce, iat: now, auth_time: now, exp: now + 300, name: 'Ada Lovelace', email: EMAIL }),
        refresh_token: randomBytes(16).toString('hex'),
        expires_in: 300,
        refresh_expires_in: 28_800,
        token_type: 'Bearer',
      })
    }
    if (url.pathname === `/realms/${REALM}/protocol/openid-connect/logout` && req.method === 'POST') {
      const fields = Object.fromEntries(new URLSearchParams(await body(req)))
      state.logouts.push(fields)
      sso = false
      return redirect(fields.post_logout_redirect_uri ?? app)
    }
    res.writeHead(404)
    res.end()
  })

  return {
    app,
    idp,
    close: () => new Promise<void>((resolve) => appServer.close(() => idpServer.close(() => resolve()))),
  }
}
