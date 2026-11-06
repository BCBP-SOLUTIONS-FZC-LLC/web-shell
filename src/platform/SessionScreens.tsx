// The shell's session screens (SDK design doc §C1 /auth, §C2 step 7). None of them signs in on its
// own: every login starts from the user's click.
import { useEffect, useRef, type ReactNode } from 'react'
import type { IdentityProvider, SessionState, Workspace } from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'
import type { SignInUseCases } from '../application/signIn'
import { WorkspaceNotFoundError } from '../domain/errors'
import LoginPage from '../pages/LoginPage'
import { shellText, useShellText, type ShellKey } from '../shared/i18n'
import { hideScreen, showScreen } from './screen'

/** Generic on purpose: never says whether the email or the workspace was the problem. */
export const WORKSPACE_NOT_FOUND: ShellKey = 'login.workspaceNotFound'

export interface SignInChoice {
  workspace: Workspace
  /** The email the user typed, passed to Keycloak as login_hint. */
  loginHint?: string
}

function Dialog({ title, role = 'dialog', children }: { title: ShellKey; role?: 'dialog' | 'alertdialog'; children?: ReactNode }) {
  const text = useShellText()
  // Move keyboard and screen-reader focus into the dialog, so its title and first action are next.
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [title])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030d1b]/90 px-6 font-sans">
      <div
        ref={ref}
        tabIndex={-1}
        role={role}
        aria-modal="true"
        aria-labelledby="shell-dialog-title"
        className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-login-card outline-none"
      >
        <h1 id="shell-dialog-title" className="m-0 text-lg font-semibold text-[#1a1a2e]">
          {text(title)}
        </h1>
        {children}
      </div>
    </div>
  )
}

/** A paragraph of the dialog. */
function Text({ id }: { id: ShellKey }) {
  return <p className="mt-3 text-sm text-gray-600">{useShellText()(id)}</p>
}

function Button({ onClick, label }: { onClick: () => void; label: ShellKey }) {
  const text = useShellText()
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-5 w-full cursor-pointer rounded-lg border-0 bg-[linear-gradient(90deg,#ff4fa3_0%,#8b5cf6_100%)] px-4 py-3 text-sm font-semibold text-white"
    >
      {text(label)}
    </button>
  )
}

/**
 * The words the page shows when a use case fails: WORKSPACE_NOT_FOUND for WorkspaceNotFoundError,
 * else `otherwise`. Never an error's own message: it is not translated, and may be a server's.
 */
async function withPageMessage<T>(work: Promise<T>, otherwise: ShellKey): Promise<T> {
  try {
    return await work
  } catch (error) {
    throw new Error(shellText(error instanceof WorkspaceNotFoundError ? WORKSPACE_NOT_FOUND : otherwise))
  }
}

/**
 * The email-first sign-in screen. Calls the sign-in use cases (application layer) it is given: it
 * reaches no API, storage or browser navigation itself.
 */
export function askForWorkspace(useCases: SignInUseCases, notice?: ShellKey): Promise<SignInChoice> {
  return new Promise((resolve) => {
    showScreen(
      <LoginPage
        notice={notice ?? null}
        rememberedEmail={useCases.rememberedEmail}
        onContinue={async (email) => {
          resolve({ workspace: await withPageMessage(useCases.resolveWorkspace(email), 'login.error.signIn'), loginHint: email })
        }}
        onForgotPassword={(email) => withPageMessage(useCases.requestPasswordReset(email), 'login.error.passwordReset')}
      />,
    )
  })
}

export function showWorkspaceNotFound(): void {
  showScreen(
    <Dialog title="session.workspaceNotFound.title" role="alertdialog">
      <Text id="session.workspaceNotFound.text" />
      <Button onClick={hideScreen} label="common.ok" />
    </Dialog>,
  )
}

/** After a logout: never sign in automatically, or the live SSO session would undo the logout. */
export function showSignedOut(signIn: () => Promise<void>): void {
  showScreen(
    <Dialog title="session.signedOut.title">
      <Button onClick={() => void signIn()} label="common.signIn" />
    </Dialog>,
  )
}

/** Sign-in refused because the device clock is far off: another attempt would fail the same way. */
export function showDeviceClock(signIn: () => Promise<void>): void {
  showScreen(
    <Dialog title="session.deviceClock.title" role="alertdialog">
      <Text id="session.deviceClock.text" />
      <Button onClick={() => void signIn()} label="common.tryAgain" />
    </Dialog>,
  )
}

/** Expired during use. serverEnded covers a trial → paid move ("your workspace has moved"). */
export function showSessionEnded(s: Extract<SessionState, { status: 'expired' }>, signIn: () => Promise<void>): void {
  const text: ShellKey = s.serverEnded ? 'session.ended.serverEnded' : s.idle ? 'session.ended.idle' : 'session.ended.default'
  showScreen(
    <Dialog title="session.ended.title" role="alertdialog">
      <Text id={text} />
      <Button
        onClick={() => {
          hideScreen()
          void signIn()
        }}
        label="common.signIn"
      />
    </Dialog>,
  )
}

/** A trial login that landed in another tenant than the invitation's: never cached, app not rendered. */
export function showWrongWorkspace(idp: IdentityProvider, useCases: SignInUseCases): void {
  showScreen(
    <Dialog title="session.wrongWorkspace.title" role="alertdialog">
      <Text id="session.wrongWorkspace.text" />
      <Button onClick={() => void idp.logout()} label="common.signOut" />
      <Button
        onClick={() => void askForWorkspace(useCases).then(({ workspace }) => idp.switchWorkspace(workspace))}
        label="session.wrongWorkspace.switch"
      />
    </Dialog>,
  )
}
