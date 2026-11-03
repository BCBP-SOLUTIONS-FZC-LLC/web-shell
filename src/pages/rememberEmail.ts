// "Remember Email" on the login page. The SDK's storage() is namespaced per workspace and ignores
// writes before sign-in, but this value is needed before a workspace is known, so it uses
// localStorage directly. It holds only the email the user typed, never a token.

const REMEMBER_KEY = 'bcbp.rememberEmail'
const EMAIL_KEY = 'bcbp.loginEmail'

export function getRememberedEmail(): string {
  try {
    if (localStorage.getItem(REMEMBER_KEY) !== 'true') return ''
    return localStorage.getItem(EMAIL_KEY) ?? ''
  } catch {
    return ''
  }
}

export function persistRememberEmail(email: string, remember: boolean): void {
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
}
