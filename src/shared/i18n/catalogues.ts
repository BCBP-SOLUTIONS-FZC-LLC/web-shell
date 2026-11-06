import en from './en.json'

/** The shell's catalogues by locale tag. English is the reference: every key is in it. */
const CATALOGUES: Readonly<Record<string, Readonly<Record<string, string>>>> = { en }

/**
 * The shell's catalogue for `locale`: the exact tag, else its language (`en-GB` → `en`), else
 * English. It only picks a file: the SDK's `t` does the lookup and the fallback to the default
 * locale. English as the last resort keeps a default locale without its own catalogue (`en-GB`,
 * or one not translated yet) from showing raw keys.
 */
export function catalogueFor(locale: string): Readonly<Record<string, string>> {
  return CATALOGUES[locale] ?? CATALOGUES[new Intl.Locale(locale).language] ?? en
}
