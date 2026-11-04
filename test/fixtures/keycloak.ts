// A Keycloak at the HTTP level and a BroadcastChannel across "tabs", for the e2e suite. Modelled on
// platform-reactcommon test/fixtures/keycloak.ts: the authorize step is approve() (the user signs in
// at the IdP), the token endpoint is fetch(), and PKCE is checked as Keycloak checks it.
import { createHash, randomBytes } from 'node:crypto'
import { vi } from 'vitest'

export const IDP = 'https://auth.example.test'
export const CLIENT = 'tender-web'

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url')

/** An unsigned-looking JWT: the SDK reads the ID token's claims; the token endpoint is trusted over TLS. */
export function jwt(claims: Record<string, unknown>): string {
  return `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}.${b64url('sig')}`
}

/** BroadcastChannel across the "tabs" of one test; delivered asynchronously, never to the sender. */
export class FakeBroadcastChannel extends EventTarget {
  static open = new Set<FakeBroadcastChannel>()
  static sent: unknown[] = []
  readonly name: string
  constructor(name: string) {
    super()
    this.name = name
    FakeBroadcastChannel.open.add(this)
  }
  postMessage(data: unknown): void {
    FakeBroadcastChannel.sent.push(data)
    for (const c of FakeBroadcastChannel.open) {
      if (c !== this && c.name === this.name) queueMicrotask(() => c.dispatchEvent(new MessageEvent('message', { data })))
    }
  }
  close(): void {
    FakeBroadcastChannel.open.delete(this)
  }
  static reset(): void {
    FakeBroadcastChannel.open.clear()
    FakeBroadcastChannel.sent = []
  }
}

interface Grant {
  realm: string
  redirectUri: string
  challenge: string
  nonce: string
  claims: Record<string, unknown>
}

export class FakeKeycloak {
  readonly requests: { grant: string; body: URLSearchParams }[] = []
  private readonly codes = new Map<string, Grant>()
  private readonly refresh = new Map<string, Grant>()
  accessTtl = 300
  /** Claims added to the next ID tokens. */
  extraClaims: Record<string, unknown> = {}
  /** The provider's clock; set it off the page's to test the device-clock check. */
  now: () => number = () => Date.now()

  issuer(realm: string): string {
    return `${IDP}/realms/${realm}`
  }

  /** The user signs in at the authorize URL; returns the callback URL Keycloak redirects to. */
  approve(authorizeUrl: string): string {
    const u = new URL(authorizeUrl)
    const realm = /^\/realms\/([^/]+)\/protocol\/openid-connect\/auth$/.exec(u.pathname)?.[1]
    if (!realm) throw new Error(`not an authorize URL: ${authorizeUrl}`)
    const p = u.searchParams
    const code = randomBytes(12).toString('hex')
    this.codes.set(code, {
      realm,
      redirectUri: p.get('redirect_uri')!,
      challenge: p.get('code_challenge')!,
      nonce: p.get('nonce')!,
      claims: { ...this.extraClaims },
    })
    const cb = new URL(p.get('redirect_uri')!)
    cb.searchParams.set('code', code)
    cb.searchParams.set('state', p.get('state')!)
    cb.searchParams.set('iss', this.issuer(realm))
    return cb.href
  }

  private tokens(g: Grant) {
    const now = Math.floor(this.now() / 1000)
    const refresh = randomBytes(16).toString('hex')
    this.refresh.set(refresh, g)
    const claims = {
      iss: this.issuer(g.realm),
      aud: CLIENT,
      azp: CLIENT,
      sub: 'user-1',
      nonce: g.nonce,
      iat: now,
      auth_time: now,
      exp: now + this.accessTtl,
      name: 'Ada Lovelace',
      email: 'ada@acme.test',
      ...g.claims,
    }
    return {
      access_token: `at-${randomBytes(8).toString('hex')}`,
      id_token: jwt(claims),
      refresh_token: refresh,
      expires_in: this.accessTtl,
      refresh_expires_in: 28_800,
      token_type: 'Bearer',
    }
  }

  fetch = vi.fn(async (input: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(input)
    const body = new URLSearchParams(String(init?.body ?? ''))
    const grant = body.get('grant_type') ?? ''
    this.requests.push({ grant, body })
    const json = (status: number, b: unknown) => Response.json(b, { status })
    const realm = /^\/realms\/([^/]+)\/protocol\/openid-connect\/token$/.exec(url.pathname)?.[1]
    if (!realm) return json(404, { error: 'not_found' })
    if (body.get('client_id') !== CLIENT) return json(401, { error: 'invalid_client' })
    if (grant === 'authorization_code') {
      const code = body.get('code') ?? ''
      const g = this.codes.get(code)
      this.codes.delete(code)
      const verifier = body.get('code_verifier') ?? ''
      const ok =
        g &&
        g.realm === realm &&
        g.redirectUri === body.get('redirect_uri') &&
        createHash('sha256').update(verifier).digest('base64url') === g.challenge
      return ok ? json(200, this.tokens(g)) : json(400, { error: 'invalid_grant' })
    }
    if (grant === 'refresh_token') {
      const sent = body.get('refresh_token') ?? ''
      const g = this.refresh.get(sent)
      this.refresh.delete(sent) // rotation
      return g ? json(200, this.tokens(g)) : json(400, { error: 'invalid_grant' })
    }
    return json(400, { error: 'unsupported_grant_type' })
  })
}
