// The shell's session screens (SDK design doc §C1 /auth, §C2 step 7). None of them signs in on its
// own: every login starts from the user's click.
import { useEffect, useRef, type ReactNode } from 'react'
import type { IdentityProvider, SessionState, Workspace } from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'
import LoginPage from '../pages/LoginPage'
import { workspaceResolver } from './iam'
import { passwordResetUrl } from './passwordReset'
import { hideScreen, showScreen } from './screen'

/** Generic on purpose: never says whether the email or the workspace was the problem. */
export const WORKSPACE_NOT_FOUND = 'We could not find a workspace for that email.'

export interface SignInChoice {
  workspace: Workspace
  /** The email the user typed, passed to Keycloak as login_hint. */
  loginHint?: string
}

function Dialog({ title, role = 'dialog', children }: { title: string; role?: 'dialog' | 'alertdialog'; children: ReactNode }) {
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
          {title}
        </h1>
        {children}
      </div>
    </div>
  )
}

function Button({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-5 w-full cursor-pointer rounded-lg border-0 bg-[linear-gradient(90deg,#ff4fa3_0%,#8b5cf6_100%)] px-4 py-3 text-sm font-semibold text-white"
    >
      {children}
    </button>
  )
}

/**
 * The email-first sign-in screen (the existing login layouts). Resolves the email through PUB-1 and
 * returns the workspace; stays up with a generic error until one resolves.
 */
/** PUB-1 for the typed email; "not found", rate-limited and unreachable all throw the same message. */
async function resolveEmail(email: string): Promise<Workspace> {
  let workspace: Workspace | undefined
  try {
    workspace = await workspaceResolver.resolve(email)
  } catch {
    // Rate-limited or unreachable: the same generic message.
  }
  if (!workspace) throw new Error(WORKSPACE_NOT_FOUND)
  return workspace
}

export function askForWorkspace(notice?: string): Promise<SignInChoice> {
  return new Promise((resolve) => {
    showScreen(
      <LoginPage
        notice={notice ?? null}
        onContinue={async (email) => {
          resolve({ workspace: await resolveEmail(email), loginHint: email })
        }}
        onForgotPassword={async (email) => {
          // The realm decides where the reset happens, so the email is resolved first.
          window.location.assign(passwordResetUrl(await resolveEmail(email)))
        }}
      />,
    )
  })
}

export function showWorkspaceNotFound(): void {
  showScreen(
    <Dialog title="Workspace not found" role="alertdialog">
      <p className="mt-3 text-sm text-gray-600">We could not find that workspace.</p>
      <Button onClick={hideScreen}>OK</Button>
    </Dialog>,
  )
}

/** After a logout: never sign in automatically, or the live SSO session would undo the logout. */
export function showSignedOut(signIn: () => Promise<void>): void {
  showScreen(
    <Dialog title="You are signed out">
      <Button onClick={() => void signIn()}>Sign in</Button>
    </Dialog>,
  )
}

/** Sign-in refused because the device clock is far off: another attempt would fail the same way. */
export function showDeviceClock(signIn: () => Promise<void>): void {
  showScreen(
    <Dialog title="Check your device's clock" role="alertdialog">
      <p className="mt-3 text-sm text-gray-600">
        We couldn't sign you in because this device's date or time is wrong. Set it to update
        automatically, then try again.
      </p>
      <Button onClick={() => void signIn()}>Try again</Button>
    </Dialog>,
  )
}

/** Expired during use. serverEnded covers a trial → paid move ("your workspace has moved"). */
export function showSessionEnded(s: Extract<SessionState, { status: 'expired' }>, signIn: () => Promise<void>): void {
  const text = s.serverEnded
    ? 'Your session was ended. If your workspace has moved to its own plan, sign in again to continue there.'
    : s.idle
      ? 'You were signed out after a period of inactivity.'
      : 'Your session has ended.'
  showScreen(
    <Dialog title="Session ended" role="alertdialog">
      <p className="mt-3 text-sm text-gray-600">{text}</p>
      <Button
        onClick={() => {
          hideScreen()
          void signIn()
        }}
      >
        Sign in
      </Button>
    </Dialog>,
  )
}

/** A trial login that landed in another tenant than the invitation's: never cached, app not rendered. */
export function showWrongWorkspace(idp: IdentityProvider): void {
  showScreen(
    <Dialog title="You signed in to a different workspace" role="alertdialog">
      <p className="mt-3 text-sm text-gray-600">
        The account you used belongs to another workspace than the one you were invited to.
      </p>
      <Button onClick={() => void idp.logout()}>Sign out</Button>
      <Button onClick={() => void askForWorkspace().then(({ workspace }) => idp.switchWorkspace(workspace))}>
        Switch workspace
      </Button>
    </Dialog>,
  )
}
