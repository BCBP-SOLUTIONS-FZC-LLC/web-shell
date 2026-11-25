// Mounts the session screens over the page (the screen host) and turns their clicks into the
// bootstrap's callbacks. The screens themselves (presentation/features/session-screens) only render.
import type { IdentityProvider, SessionState } from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'
import type { SignInUseCases } from '../../application/signIn'
import type { WorkspaceBlock } from '../../application/use-cases/loadSessionContext'
import type { ShellKey } from '../../shared/i18n'
import {
  DeviceClockDialog,
  SessionEndedDialog,
  SignedOutDialog,
  SignInScreen,
  UpgradeWelcomeDialog,
  WorkspaceNotFoundDialog,
  WorkspaceUnavailableDialog,
  WrongWorkspaceDialog,
  type SignInChoice,
} from '../../presentation/features/session-screens/SessionScreens'
import { hideScreen, showScreen } from './screen'

export { WORKSPACE_NOT_FOUND, type SignInChoice } from '../../presentation/features/session-screens/SessionScreens'

/** The email-first sign-in screen; resolves with the workspace and the email the user typed. */
export function askForWorkspace(useCases: SignInUseCases, notice?: ShellKey): Promise<SignInChoice> {
  return new Promise((resolve) => showScreen(<SignInScreen useCases={useCases} notice={notice} onChosen={resolve} />))
}

export function showWorkspaceNotFound(): void {
  showScreen(<WorkspaceNotFoundDialog onClose={hideScreen} />)
}

/** After a logout: never sign in automatically, or the live SSO session would undo the logout. */
export function showSignedOut(signIn: () => Promise<void>): void {
  showScreen(<SignedOutDialog onSignIn={() => void signIn()} />)
}

/** Sign-in refused because the device clock is far off: another attempt would fail the same way. */
export function showDeviceClock(signIn: () => Promise<void>): void {
  showScreen(<DeviceClockDialog onRetry={() => void signIn()} />)
}

/** Expired during use. */
export function showSessionEnded(s: Extract<SessionState, { status: 'expired' }>, signIn: () => Promise<void>): void {
  showScreen(
    <SessionEndedDialog
      state={s}
      onSignIn={() => {
        hideScreen()
        void signIn()
      }}
    />,
  )
}

/** Sends the user to the email screen, then to the workspace they choose. */
function switchWorkspace(idp: IdentityProvider, useCases: SignInUseCases): void {
  void askForWorkspace(useCases).then(({ workspace }) => idp.switchWorkspace(workspace))
}

/** A trial login that landed in another tenant than the invitation's: never cached, app not rendered. */
export function showWrongWorkspace(idp: IdentityProvider, useCases: SignInUseCases): void {
  showScreen(<WrongWorkspaceDialog onSignOut={() => void idp.logout()} onSwitch={() => switchWorkspace(idp, useCases)} />)
}

/** IAM refuses this user the workspace (trial ended, suspended, access paused, not a member): app not rendered. */
export function showWorkspaceUnavailable(block: WorkspaceBlock, idp: IdentityProvider, useCases: SignInUseCases): void {
  showScreen(
    <WorkspaceUnavailableDialog block={block} onSignOut={() => void idp.logout()} onSwitch={() => switchWorkspace(idp, useCases)} />,
  )
}

/** The "workspace upgraded" welcome (A5) over the running app; `onSeen` runs when the user continues. */
export function showUpgradeWelcome(name: string, onSeen: () => void): void {
  showScreen(
    <UpgradeWelcomeDialog
      name={name}
      onContinue={() => {
        onSeen()
        hideScreen()
      }}
    />,
  )
}
