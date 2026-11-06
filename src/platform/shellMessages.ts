// Registers the shell's text with the SDK's /i18n. Infrastructure: it changes the page's locale, so
// only the composition root calls it (presentation cannot import platform/).
import { registerNamespace, setLocale } from '@bcbp-solutions-fzc-llc/frontend-sdk/i18n'
import { catalogueFor } from '../shared/i18n/catalogues'
import { SHELL_NAMESPACE } from '../shared/i18n'

/**
 * Registers the `shell` namespace and loads it for `defaultLocale` before the first screen renders:
 * the sign-in screens show before initializeI18n (after sign-in) picks the user's locale, and the
 * SDK's `t` gives back the key itself while no catalogue is loaded. Call it after setRuntimeConfig
 * (the SDK's supported locales start as the config's default).
 */
export async function registerShellMessages(defaultLocale: string): Promise<void> {
  registerNamespace(SHELL_NAMESPACE, async (locale) => catalogueFor(locale))
  await setLocale(defaultLocale)
}
