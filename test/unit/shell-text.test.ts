// The shell's text (src/shared/i18n): the `shell` namespace of the SDK's /i18n, its English catalogue,
// and a guard that presentation has no hard-coded user-facing text (constitution V4, ADR 0005).
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { initializeI18n, setLocale } from '@bcbp-solutions-fzc-llc/frontend-sdk/i18n'
import ts from 'typescript'
import { afterEach, describe, expect, it } from 'vitest'
import en from '../../src/shared/i18n/en.json'
import { SHELL_NAMESPACE, shellText } from '../../src/shared/i18n'
import { catalogueFor } from '../../src/shared/i18n/catalogues'

describe('the shell namespace', () => {
  afterEach(async () => {
    await initializeI18n({ defaultLocale: 'en', supported: ['en'] })
  })

  it('is loaded by the time a screen renders (test/setup.ts registers it as the bootstrap does)', () => {
    expect(SHELL_NAMESPACE).toBe('shell')
    expect(shellText('login.heading')).toBe('Login to your account')
  })

  it('fills placeholders', () => {
    expect(shellText('login.carousel.show', { number: 3 })).toBe('Show slide 3')
  })

  it('falls back to English in a locale without a catalogue, and sets the page direction', async () => {
    await initializeI18n({ defaultLocale: 'en', supported: ['en', 'ar'] })
    await setLocale('ar')
    expect(document.documentElement.getAttribute('dir')).toBe('rtl')
    expect(shellText('session.signedOut.title')).toBe('You are signed out')
  })

  it('a default locale without its own catalogue (en-GB, or one not translated yet) still shows words, not keys', () => {
    expect(catalogueFor('en-GB')).toBe(en)
    expect(catalogueFor('fr')).toBe(en)
    expect(catalogueFor('en')).toBe(en)
  })

  it('with en-GB as the default locale the screens read English', async () => {
    const { registerShellMessages } = await import('../../src/infrastructure/i18n/shellMessages')
    await initializeI18n({ defaultLocale: 'en-GB', supported: ['en-GB'] })
    await registerShellMessages('en-GB')
    expect(shellText('login.heading')).toBe('Login to your account')
  })

  it('every catalogue value is plain text, not empty', () => {
    for (const [key, value] of Object.entries(en)) expect(value.trim(), key).not.toBe('')
  })
})

// Text the guard accepts as it is: the brand (not translated) and typography.
const BRAND = new Set(['BCBP SOLUTIONS', 'BCBP', 'SOLUTIONS', 'Beyond Code', '‹', '›', '|'])
/** A catalogue key (a `ShellKey` prop such as the dialogs' `title`), not text. */
const KEY = /^[a-z][A-Za-z]*(\.[A-Za-z0-9]+)+$/
/** Attributes whose value a person reads or hears. */
const READ_ATTRIBUTES = /^(aria-(label|description|roledescription|placeholder|valuetext)|alt|title|placeholder|label)$/
const words = (text: string) => /[A-Za-z]/.test(text) && !BRAND.has(text.trim()) && !KEY.test(text.trim())

/** User-facing literals in a .ts/.tsx source, found through the TypeScript syntax tree. */
function literals(fileName: string, source: string): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const found: string[] = []
  const visit = (node: ts.Node): void => {
    // JSX text, however it is laid out (several lines, next to child elements)
    if (ts.isJsxText(node)) found.push(node.text.replace(/\s+/g, ' ').trim())
    // a string in braces as a child: <p>{'Sign in'}</p>
    else if (ts.isJsxExpression(node) && ts.isJsxElement(node.parent) && node.expression && ts.isStringLiteralLike(node.expression)) found.push(node.expression.text)
    // a read attribute with a literal: aria-label="…", alt={'…'}
    else if (ts.isJsxAttribute(node) && READ_ATTRIBUTES.test(node.name.getText(file)) && node.initializer) {
      const init = node.initializer
      if (ts.isStringLiteral(init)) found.push(init.text)
      else if (ts.isJsxExpression(init) && init.expression && ts.isStringLiteralLike(init.expression)) found.push(init.expression.text)
    }
    // text assigned to the DOM: el.textContent = '…'
    else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(node.left) && ['textContent', 'innerText'].includes(node.left.name.text) && ts.isStringLiteralLike(node.right)) found.push(node.right.text)
    ts.forEachChild(node, visit)
  }
  visit(file)
  return found.filter(words)
}

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  )
}

describe('no hard-coded user-facing text', () => {
  const root = join(import.meta.dirname, '..', '..', 'src')
  // Everything that renders: presentation/, and app/ (routes, layouts, the unavailable page).
  const presentation = [...files(join(root, 'presentation')), ...files(join(root, 'app'))]

  it.each(presentation.map((f) => [f.slice(root.length + 1), f]))('%s', (_name, file) => {
    expect(literals(file, readFileSync(file, 'utf8'))).toEqual([])
  })

  it('catches each kind of literal (probe)', () => {
    const probe = `export const P = () => (
      <section aria-roledescription="carousel" aria-label={'Highlights'}>
        <p>
          We couldn't sign you in. <a href="/x">Try again</a>
        </p>
        <span>{'Sign in'}</span>
        <h1 title="session.ended.title">BCBP</h1>
      </section>
    )
    el.textContent = 'Unavailable'`
    expect(literals('probe.tsx', probe)).toEqual(['carousel', 'Highlights', "We couldn't sign you in.", 'Try again', 'Sign in', 'Unavailable'])
  })
})
