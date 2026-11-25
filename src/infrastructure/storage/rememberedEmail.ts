// Infrastructure: the remembered email in localStorage (implements the domain's
// RememberedEmailRepository). The SDK's storage() is namespaced per workspace and ignores writes
// before sign-in, but this value is needed before a workspace is known and must survive sign-out, so
// it uses localStorage directly: the one file exempt from no-raw-storage (eslint.config.js). It holds
// only an email or a bare workspace name the user typed (isRememberableIdentifier), never a URL (a
// pasted link may carry a token or code) and never a token.
import type { RememberedEmailRepository } from '../../domain/repositories/rememberedEmail'
import { isRememberableIdentifier } from '../../domain/rules/identifier'

const REMEMBER_KEY = 'bcbp.rememberEmail'
const EMAIL_KEY = 'bcbp.loginEmail'

export const localStorageRememberedEmail: RememberedEmailRepository = {
  get() {
    try {
      if (localStorage.getItem(REMEMBER_KEY) !== 'true') return ''
      return localStorage.getItem(EMAIL_KEY) ?? ''
    } catch {
      return ''
    }
  },
  save(email, remember) {
    try {
      const value = email.trim()
      if (remember && isRememberableIdentifier(value)) {
        localStorage.setItem(REMEMBER_KEY, 'true')
        localStorage.setItem(EMAIL_KEY, value)
        return
      }
      localStorage.removeItem(REMEMBER_KEY)
      localStorage.removeItem(EMAIL_KEY)
    } catch {
      // Storage blocked (private mode, policy): remembering is a convenience only.
    }
  },
}
