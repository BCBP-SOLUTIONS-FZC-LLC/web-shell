// Infrastructure: whether this browser has seen the welcome intro, in localStorage (implements the
// domain's WelcomeIntroRepository). It is read before any workspace is known, when the SDK's
// storage() ignores writes, so it uses localStorage directly; with rememberedEmail.ts, the files
// exempt from no-raw-storage (eslint.config.js). It holds the flag '1' only.
import type { WelcomeIntroRepository } from '../../domain/repositories/welcomeIntro'

const WELCOME_SEEN_KEY = 'bcbp.welcomeSeen'

export const localStorageWelcomeIntro: WelcomeIntroRepository = {
  seen() {
    try {
      return localStorage.getItem(WELCOME_SEEN_KEY) === '1'
    } catch {
      return false
    }
  },
  markSeen() {
    try {
      localStorage.setItem(WELCOME_SEEN_KEY, '1')
    } catch {
      // Storage blocked (private mode, policy): the intro may show again on the next visit.
    }
  },
}
