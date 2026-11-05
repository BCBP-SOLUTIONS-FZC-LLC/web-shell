// Dev server only: what CloudFront and the platform APIs provide in a real environment, as one
// connect-style middleware for Rsbuild's dev server (dev.setupMiddlewares).
// - /config/runtime.json and /remotes/manifest.json come from config/*.local.json.
// - The IAM endpoints the shell calls (PUB-1 tenant resolve, P-35 session context) are stubbed so
//   sign-in works against the local Keycloak realm. Set DEV_API_URL to proxy /api to a real API
//   instead; DEV_REALM picks the realm the stub resolves every identifier to (default
//   "tenant-bcbp", the local Keycloak realm).
// - /otel accepts and drops telemetry.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PlatformProblemTypes } from '@bcbp-solutions-fzc-llc/frontend-sdk/problem'
import { mockProblem } from '@bcbp-solutions-fzc-llc/frontend-sdk/testing'

function send(res, status, body, type = 'application/json') {
  res.statusCode = status
  res.setHeader('cache-control', 'no-cache')
  if (body === undefined) return res.end()
  res.setHeader('content-type', type)
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

/** A problem response exactly as platform-gincommon writes it (the SDK's mockProblem), not a hand-built one. */
function sendProblem(res, type, extra) {
  const r = mockProblem(type, extra)
  void r.text().then((body) => send(res, r.status, body, r.headers.get('content-type') ?? 'application/problem+json'))
}

async function proxy(req, res, upstream) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  const r = await fetch(new URL(req.url, upstream), {
    method: req.method,
    headers: Object.fromEntries(Object.entries(req.headers).filter(([k]) => k !== 'host')),
    ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
  })
  res.statusCode = r.status
  r.headers.forEach((v, k) => res.setHeader(k, v))
  res.end(Buffer.from(await r.arrayBuffer()))
}

/** @param {string} root the project root (config/ lives there) */
export function devPlatformMiddleware(root) {
  const local = (file) => readFileSync(join(root, 'config', file), 'utf8')
  const upstream = process.env.DEV_API_URL
  const realm = process.env.DEV_REALM ?? 'tenant-bcbp'

  return (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname

    if (req.method === 'GET' && path === '/config/runtime.json') return send(res, 200, local('runtime.local.json'))
    if (req.method === 'GET' && path === '/remotes/manifest.json') return send(res, 200, local('remotes.local.json'))
    if (req.method === 'POST' && path.startsWith('/otel/')) return send(res, 204)
    if (!path.startsWith('/api/')) return next()

    if (upstream) {
      // The platform has no 502 problem type: an unreachable upstream answers 503, as a gateway would.
      proxy(req, res, upstream).catch((e) => sendProblem(res, PlatformProblemTypes.ServiceUnavailable, { detail: String(e) }))
      return
    }
    if (path === '/api/v1/public/tenants/resolve') {
      const identifier = (url.searchParams.get('identifier') ?? '').trim()
      return send(res, 200, identifier ? { found: true, realm, strategy: 'dedicated' } : { found: false })
    }
    if (path === '/api/v1/me/session-context') {
      if (!/^Bearer \S+/.test(req.headers.authorization ?? '')) {
        return sendProblem(res, PlatformProblemTypes.Unauthorized)
      }
      return send(res, 200, {
        tenant_id: 'local-tenant',
        slug: realm.replace(/^tenant-/, ''),
        // The signup owner: tenant_owner without tenant_admin (IAM P-35). DEV_ROLES overrides it.
        roles: (process.env.DEV_ROLES ?? 'member,tenant_owner').split(','),
        feature_flags: [],
        read_only: false,
      })
    }
    return sendProblem(res, PlatformProblemTypes.NotFound)
  }
}
