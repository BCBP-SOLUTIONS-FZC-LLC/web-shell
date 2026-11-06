import { useState, type FormEvent } from 'react'
import type { RememberedEmailRepository } from '../domain/repositories/rememberedEmail'
import { useShellText, type ShellKey } from '../shared/i18n'

export type LoginPageProps = {
  /**
   * Resolves the email to a workspace and redirects to Keycloak. Rejects with a message the page
   * shows when no workspace matches or the resolver is unreachable.
   */
  onContinue: (email: string) => Promise<void>
  /**
   * Sends the user to their workspace's password reset (Keycloak). Rejects with a message the page
   * shows. Without it, "Forgot your password?" is not shown.
   */
  onForgotPassword?: (email: string) => Promise<void>
  /** A message from the bootstrap (a catalogue key), e.g. why the last sign-in did not complete. */
  notice?: ShellKey | null
  /** "Remember Email": given by the composition root (the page never touches storage itself). */
  rememberedEmail: RememberedEmailRepository
}

/** Shown when "Forgot your password?" is chosen before an email is typed. */
export const EMAIL_FIRST: ShellKey = 'login.emailFirst'

/** The email form state shared by both login layouts. */
export function useEmailSignIn(
  onContinue: LoginPageProps['onContinue'],
  rememberedEmail: RememberedEmailRepository,
  onForgotPassword?: LoginPageProps['onForgotPassword'],
) {
  const text = useShellText()
  const [email, setEmail] = useState(() => rememberedEmail.get())
  const [remember, setRemember] = useState(() => rememberedEmail.get() !== '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      rememberedEmail.save(email, remember)
      await onContinue(email.trim())
    } catch (err) {
      setSubmitting(false)
      setError(err instanceof Error ? err.message : text('login.error.signIn'))
    }
  }

  async function forgotPassword(send: (email: string) => Promise<void>) {
    setError(null)
    const typed = email.trim()
    if (typed === '') {
      setError(text(EMAIL_FIRST))
      return
    }
    setSubmitting(true)
    try {
      await send(typed)
    } catch (err) {
      setSubmitting(false)
      setError(err instanceof Error ? err.message : text('login.error.passwordReset'))
    }
  }

  /** Only when the page was given a handler: otherwise there is no "Forgot your password?" to show. */
  const handleForgotPassword = onForgotPassword ? () => void forgotPassword(onForgotPassword) : undefined

  return { email, setEmail, remember, setRemember, submitting, error, handleSubmit, handleForgotPassword }
}
