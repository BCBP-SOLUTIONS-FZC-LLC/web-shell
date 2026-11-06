// Infrastructure: the remembered email in localStorage (implements the domain's
// RememberedEmailRepository). The SDK's storage() is namespaced per workspace and ignores writes
// before sign-in, but this value is needed before a workspace is known and must survive sign-out, so
// it uses localStorage directly: with welcomeIntro.ts, the files exempt from no-raw-storage (eslint.config.js). It holds
// only the email the user typed, never a token.
import type { RememberedEmailRepository } from '../../domain/repositories/rememberedEmail'

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
      if (remember) {
        localStorage.setItem(REMEMBER_KEY, 'true')
        localStorage.setItem(EMAIL_KEY, email.trim())
        return
      }
      localStorage.removeItem(REMEMBER_KEY)
      localStorage.removeItem(EMAIL_KEY)
    } catch {
      // Storage blocked (private mode, policy): remembering is a convenience only.
    }
  },
}
