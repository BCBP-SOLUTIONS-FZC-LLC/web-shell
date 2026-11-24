// The shell's session screens (SDK design doc §C1 /auth, §C2 step 7), as components: what each one
// shows and which callback a click calls. None of them signs in on its own: every login starts from
// the user's click. app/layouts/sessionScreens.tsx mounts them over the page.
import { useEffect, useRef, type ReactNode } from 'react'
import type { SessionState, Workspace } from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'
import type { SignInUseCases } from '../../../application/signIn'
import { WorkspaceNotFoundError } from '../../../domain/errors'
import { isEmailIdentifier } from '../../../domain/rules/identifier'
import type { WorkspaceBlock } from '../../../domain/rules/workspaceAccess'
import LoginPage from '../../pages/login/LoginPage'
import { shellText, useShellText, type ShellKey } from '../../../shared/i18n'

/** Generic on purpose: one text for every miss (email, workspace name, URL, 429), never saying which. */
export const WORKSPACE_NOT_FOUND: ShellKey = 'login.workspaceNotFound'

export interface SignInChoice {
  workspace: Workspace
  /** The email the user typed, passed to Keycloak as login_hint; absent for a workspace name or URL. */
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
function Text({ id, vars }: { id: ShellKey; vars?: Record<string, string | number> }) {
  return <p className="mt-3 text-sm text-gray-600">{useShellText()(id, vars)}</p>
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
 * reaches no API, storage or browser navigation itself. `onChosen` gets the workspace and the email.
 */
export function SignInScreen({ useCases, notice, onChosen }: { useCases: SignInUseCases; notice?: ShellKey | undefined; onChosen: (choice: SignInChoice) => void }) {
  return (
    <LoginPage
      notice={notice ?? null}
      rememberedEmail={useCases.rememberedEmail}
      onContinue={async (identifier) => {
        const workspace = await withPageMessage(useCases.resolveWorkspace(identifier), 'login.error.signIn')
        // A workspace name or URL is not a login: only an email becomes Keycloak's login_hint.
        onChosen({ workspace, ...(isEmailIdentifier(identifier) ? { loginHint: identifier } : {}) })
      }}
      onForgotPassword={(identifier) => withPageMessage(useCases.requestPasswordReset(identifier), 'login.error.passwordReset')}
    />
  )
}

export function WorkspaceNotFoundDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="session.workspaceNotFound.title" role="alertdialog">
      <Text id="session.workspaceNotFound.text" />
      <Button onClick={onClose} label="common.ok" />
    </Dialog>
  )
}

/** After a logout: never sign in automatically, or the live SSO session would undo the logout. */
export function SignedOutDialog({ onSignIn }: { onSignIn: () => void }) {
  return (
    <Dialog title="session.signedOut.title">
      <Button onClick={onSignIn} label="common.signIn" />
    </Dialog>
  )
}

/** Sign-in refused because the device clock is far off: another attempt would fail the same way. */
export function DeviceClockDialog({ onRetry }: { onRetry: () => void }) {
  return (
    <Dialog title="session.deviceClock.title" role="alertdialog">
      <Text id="session.deviceClock.text" />
      <Button onClick={onRetry} label="common.tryAgain" />
    </Dialog>
  )
}

/** Expired during use. serverEnded covers a trial → paid move ("your workspace has moved"). */
export function SessionEndedDialog({ state, onSignIn }: { state: Extract<SessionState, { status: 'expired' }>; onSignIn: () => void }) {
  const text: ShellKey = state.serverEnded ? 'session.ended.serverEnded' : state.idle ? 'session.ended.idle' : 'session.ended.default'
  return (
    <Dialog title="session.ended.title" role="alertdialog">
      <Text id={text} />
      <Button onClick={onSignIn} label="common.signIn" />
    </Dialog>
  )
}

const UNAVAILABLE: Record<WorkspaceBlock, { title: ShellKey; text: ShellKey }> = {
  'trial-expired': { title: 'session.trialExpired.title', text: 'session.trialExpired.text' },
  'tenant-unavailable': { title: 'session.workspaceUnavailable.title', text: 'session.workspaceUnavailable.text' },
  'member-paused': { title: 'session.accessPaused.title', text: 'session.accessPaused.text' },
  'no-access': { title: 'session.noAccess.title', text: 'session.noAccess.text' },
}

/**
 * IAM refuses this user the workspace (spec A6 trial ended, A8 workspace unavailable or access
 * paused): the app is not rendered. Sign out, or switch to another workspace. No retry: the answer is
 * final until someone changes the workspace or the membership.
 */
export function WorkspaceUnavailableDialog({ block, onSignOut, onSwitch }: { block: WorkspaceBlock; onSignOut: () => void; onSwitch: () => void }) {
  const { title, text } = UNAVAILABLE[block]
  return (
    <Dialog title={title} role="alertdialog">
      <Text id={text} />
      <Button onClick={onSignOut} label="common.signOut" />
      <Button onClick={onSwitch} label="session.wrongWorkspace.switch" />
    </Dialog>
  )
}

/**
 * The workspace moved from its trial to a paid plan (spec A5): welcome words only, never "error". Shown
 * once per device over the running app; the user already set a new password (and MFA, if they had it)
 * on the new sign-in page.
 */
export function UpgradeWelcomeDialog({ name, onContinue }: { name: string; onContinue: () => void }) {
  return (
    <Dialog title="session.upgraded.title">
      <Text id="session.upgraded.text" vars={{ name }} />
      <Button onClick={onContinue} label="common.continue" />
    </Dialog>
  )
}

/** A trial login that landed in another tenant than the invitation's: never cached, app not rendered. */
export function WrongWorkspaceDialog({ onSignOut, onSwitch }: { onSignOut: () => void; onSwitch: () => void }) {
  return (
    <Dialog title="session.wrongWorkspace.title" role="alertdialog">
      <Text id="session.wrongWorkspace.text" />
      <Button onClick={onSignOut} label="common.signOut" />
      <Button onClick={onSwitch} label="session.wrongWorkspace.switch" />
    </Dialog>
  )
}
