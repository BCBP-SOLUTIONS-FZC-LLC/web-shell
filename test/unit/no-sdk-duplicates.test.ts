// @vitest-environment node
// Guards against re-implementing or duplicating platform-reactcommon (LLD §1.2), on every PR:
//
// 1. No module-level declaration in the shell's code has the name of an SDK public export. A
//    re-implementation usually keeps the name; so do the shell's copies of unpublished platform code
//    (retrySessionContext, createStore, isTransient, ShellRoot from examples/shell; buildCsp from
//    examples/cloudfront). The day the SDK publishes one of them, this fails: import it, delete the copy.
// 2. Tests and the dev server answer errors with the SDK's /testing mockProblem, never a hand-built
//    problem body (which drifts from what platform-gincommon writes and from what the SDK parses).
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '..', '..')
const sdkDist = join(root, 'node_modules/@bcbp-solutions-fzc-llc/frontend-sdk/dist')

const walk = (dir: string, ext: RegExp): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name), ext) : ext.test(e.name) ? [join(dir, e.name)] : [],
  )

/** Every name the SDK exports from its public subpaths (dist/<subpath>/index.d.ts). */
function sdkExports(): Map<string, string> {
  const names = new Map<string, string>()
  for (const sub of readdirSync(sdkDist, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    let dts: string
    try {
      dts = readFileSync(join(sdkDist, sub.name, 'index.d.ts'), 'utf8')
    } catch {
      continue
    }
    for (const [, list] of dts.matchAll(/export (?:type )?\{([^}]*)\}/g)) {
      for (const part of list!.split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop()
        if (name) names.set(name, `/${sub.name}`)
      }
    }
  }
  return names
}

/** The shell's own code: application, dev server, browser-suite server. */
const shellFiles = [
  ...walk(join(root, 'src'), /\.(ts|tsx)$/),
  ...walk(join(root, 'config'), /\.(mjs|ts)$/),
  join(root, 'test/browser/server.ts'),
]

const MODULE_LEVEL_DECLARATION = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|let|class|interface|type)\s+([A-Za-z_$][\w$]*)/gm

describe('no re-implementation of an SDK export', () => {
  it('reads the SDK exports (sanity: the guard is not vacuous)', () => {
    const sdk = sdkExports()
    expect(sdk.size).toBeGreaterThan(100)
    for (const known of ['loadRemote', 'createOidcProvider', 'storage', 'mockProblem', 'getServiceMeter']) expect(sdk.has(known)).toBe(true)
  })

  it('no module-level name in the shell is an SDK export', () => {
    const sdk = sdkExports()
    const collisions = shellFiles.flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(MODULE_LEVEL_DECLARATION)]
        .map((m) => m[1]!)
        .filter((name) => sdk.has(name))
        .map((name) => `${relative(root, file)}: "${name}" is exported by the SDK (${sdk.get(name)}); import it instead and delete this copy (LLD §1.2)`),
    )
    expect(collisions).toEqual([])
  })

  it('catches a collision (the check itself works)', () => {
    const sdk = sdkExports()
    const probe = 'export function loadRemote() {}\nconst storage = 1\n  const navigate = 2\nimport { type Workspace } from "x"\n'
    expect([...probe.matchAll(MODULE_LEVEL_DECLARATION)].map((m) => m[1]).filter((n) => sdk.has(n!))).toEqual(['loadRemote', 'storage'])
  })
})

describe('no hand-built problem responses', () => {
  const HAND_BUILT = /\{\s*(?:type:\s*['"]about:blank['"]|title:\s*['"](?:Unauthorized|Forbidden|Not Found|Bad Request|Conflict|Too Many Requests|Internal Server Error|Bad Gateway|Service Unavailable|Gateway Timeout)['"])/

  it('tests and the dev server use the SDK mockProblem', () => {
    const files = [...walk(join(root, 'test'), /\.(ts|tsx)$/), ...walk(join(root, 'config'), /\.(mjs|ts)$/)].filter(
      (f) => !f.endsWith('no-sdk-duplicates.test.ts'),
    )
    const found = files.flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, i) => (HAND_BUILT.test(line) ? [`${relative(root, file)}:${i + 1}: hand-built problem body; use mockProblem(PlatformProblemTypes.…)`] : [])),
    )
    expect(found).toEqual([])
  })

  it('catches a hand-built one (the check itself works)', () => {
    expect(HAND_BUILT.test("Response.json({ title: 'Unauthorized', status: 401 })")).toBe(true)
    expect(HAND_BUILT.test("mockProblem(PlatformProblemTypes.Unauthorized)")).toBe(false)
  })
})
