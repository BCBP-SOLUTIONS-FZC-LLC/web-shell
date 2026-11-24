// The shell's user-facing text: the `shell` namespace of the SDK's /i18n (the platform's localisation
// framework; constitution assessment V4, ADR 0005). Presentation reaches the SDK's i18n runtime only
// through this module, which offers text lookup and date formatting, nothing else. The composition root registers the
// catalogue (infrastructure/i18n/shellMessages.ts).
import { formatDate, t } from '@bcbp-solutions-fzc-llc/frontend-sdk/i18n'
import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import type en from './en.json'

export const SHELL_NAMESPACE = 'shell'

/** A message key of the shell's catalogue (the English one is the reference). */
export type ShellKey = keyof typeof en

type Vars = Record<string, string | number>

/** The shell's text in the current locale, outside React (an error message). */
export function shellText(key: ShellKey, vars?: Vars): string {
  return t(SHELL_NAMESPACE, key, vars)
}

/** The shell's text in React; re-renders when the locale or a catalogue changes. */
export function useShellText(): (key: ShellKey, vars?: Vars) => string {
  return useT(SHELL_NAMESPACE)
}

/** A calendar date (RFC 3339 in) in the current locale, e.g. "24 Dec 2026". Use inside a component that calls useShellText, so it follows the locale. */
export function shellDate(iso: string): string {
  return formatDate(iso, { dateStyle: 'medium' })
}
