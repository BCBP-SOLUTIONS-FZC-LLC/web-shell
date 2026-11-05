// The network behind the page for the e2e suite (platform-reactcommon test/fixtures/network.ts):
// Keycloak on its own origin, and the shell's origin answering from a route table (runtime config,
// manifest, IAM). Every request to the shell's origin is kept, headers included.
import { vi } from 'vitest'
import { IDP, type FakeKeycloak } from './keycloak'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
export type Handler = (req: Request) => Response | Promise<Response>

export class FakeNetwork {
  readonly requests: Request[] = []
  private readonly routes: { method: Method; path: string; handler: Handler }[] = []

  readonly kc: FakeKeycloak
  readonly origin: string

  constructor(kc: FakeKeycloak, origin: string) {
    this.kc = kc
    this.origin = origin
  }

  /** Answers 'METHOD /path' with a handler, a Response (cloned per request) or a JSON body; a later route wins. */
  on(route: `${Method} /${string}`, answer: Handler | Response | object): this {
    const [method, path] = route.split(' ') as [Method, string]
    const handler: Handler =
      typeof answer === 'function'
        ? (answer as Handler)
        : answer instanceof Response
          ? () => answer.clone()
          : () => Response.json(answer)
    this.routes.unshift({ method, path, handler })
    return this
  }

  /** Requests to `path` (no query). */
  sent(path: string): Request[] {
    return this.requests.filter((r) => new URL(r.url).pathname === path)
  }

  fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const href = input instanceof Request ? input.url : String(input)
    const url = new URL(href, this.origin)
    if (url.origin === IDP) return this.kc.fetch(url.href, init)
    if (url.origin !== this.origin) throw new TypeError(`Failed to fetch: no network to ${url.origin}`)
    const req = new Request(url, input instanceof Request ? input : init)
    this.requests.push(req.clone())
    // Telemetry is accepted and dropped, as the collector would.
    if (url.pathname.startsWith('/otel/')) return new Response(null, { status: 204 })
    const hit = this.routes.find((r) => r.method === req.method && r.path === url.pathname)
    if (!hit) return Response.json({ type: 'about:blank', title: 'Not Found', status: 404 }, { status: 404 })
    return hit.handler(req)
  })
}
