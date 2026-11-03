import { useState, type FormEvent } from 'react'
import { getRememberedEmail, persistRememberEmail } from './rememberEmail'

export type LoginPageProps = {
  /**
   * Resolves the email to a workspace and redirects to Keycloak. Rejects with a message the page
   * shows when no workspace matches or the resolver is unreachable.
   */
  onContinue: (email: string) => Promise<void>
  /** A message from the bootstrap, e.g. why the last sign-in did not complete. */
  notice?: string | null
}

/** The email form state shared by both login layouts. */
export function useEmailSignIn(onContinue: LoginPageProps['onContinue']) {
  const [email, setEmail] = useState(getRememberedEmail)
  const [remember, setRemember] = useState(() => getRememberedEmail() !== '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      persistRememberEmail(email, remember)
      await onContinue(email.trim())
    } catch (err) {
      setSubmitting(false)
      setError(err instanceof Error ? err.message : 'Unable to start sign-in.')
    }
  }

  return { email, setEmail, remember, setRemember, submitting, error, handleSubmit }
}
