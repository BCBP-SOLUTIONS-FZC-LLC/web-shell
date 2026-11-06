import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IdentityProvider, Workspace } from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'
import en from '../../src/shared/i18n/en.json'

const resolve = vi.fn<(identifier: string) => Promise<Workspace | undefined>>()
const opened = vi.fn<(url: string) => void>()
const screens = await import('../../src/platform/SessionScreens')
const { resetScreen } = await import('../../src/platform/screen')
const { resolveWorkspaceUseCase } = await import('../../src/application/use-cases/resolveWorkspace')
const { requestPasswordResetUseCase } = await import('../../src/application/use-cases/requestPasswordReset')
const { localStorageRememberedEmail } = await import('../../src/platform/rememberedEmail')

// The real sign-in use cases, as the bootstrap builds them, over a fake PUB-1 and a recorded navigation.
const resolveWorkspace = resolveWorkspaceUseCase({ resolve: (i) => resolve(i) })
const useCases = {
  resolveWorkspace,
  requestPasswordReset: requestPasswordResetUseCase({
    resolveWorkspace,
    resetUrl: (w: Workspace) => `https://idp.test/realms/${w.realm}/login-actions/reset-credentials`,
    open: (url: string) => opened(url),
  }),
  rememberedEmail: localStorageRememberedEmail,
}

const acme: Workspace = { realm: 'tenant-acme', trial: false, slug: 'acme' }

afterEach(() => {
  act(() => resetScreen())
  resolve.mockReset()
  opened.mockReset()
})

async function typeEmail(email: string) {
  const user = userEvent.setup()
  await user.type(await screen.findByRole('textbox', { name: /work email address/i }), email)
  await user.click(screen.getByRole('button', { name: /continue with email/i }))
}

describe('askForWorkspace', () => {
  it('resolves the typed email to a workspace and returns it with the login hint', async () => {
    resolve.mockResolvedValue(acme)
    const choice = screens.askForWorkspace(useCases)
    await typeEmail('ada@acme.com')
    await expect(choice).resolves.toEqual({ workspace: acme, loginHint: 'ada@acme.com' })
    expect(resolve).toHaveBeenCalledWith('ada@acme.com')
  })

  it('shows one generic message for not found and for an unreachable resolver', async () => {
    resolve.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('429'))
    void screens.askForWorkspace(useCases, 'session.ended.default')
    expect(await screen.findByText(en['session.ended.default'])).toBeInTheDocument()
    await typeEmail('ada@acme.com')
    expect(await screen.findByText(en[screens.WORKSPACE_NOT_FOUND])).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: /continue with email/i }))
    await waitFor(() => expect(resolve).toHaveBeenCalledTimes(2))
    expect(screen.getByText(en[screens.WORKSPACE_NOT_FOUND])).toBeInTheDocument()
    // Announced to screen readers, as is the bootstrap's notice.
    expect(screen.getAllByRole('alert').map((e) => e.textContent)).toEqual([en['session.ended.default'], en[screens.WORKSPACE_NOT_FOUND]])
  })

  it("Forgot your password? resolves the email and goes to that realm's reset page", async () => {
    resolve.mockResolvedValueOnce(acme).mockResolvedValueOnce(undefined)
    void screens.askForWorkspace(useCases)
    const user = userEvent.setup()
    await user.type(await screen.findByRole('textbox', { name: /work email address/i }), 'ada@acme.com')
    await user.click(screen.getByRole('button', { name: 'Forgot your password?' }))
    await waitFor(() => expect(opened).toHaveBeenCalledWith('https://idp.test/realms/tenant-acme/login-actions/reset-credentials'))
    expect(resolve).toHaveBeenCalledWith('ada@acme.com')
  })

  it('Forgot your password? for an unknown email shows the generic message and stays', async () => {
    resolve.mockResolvedValueOnce(undefined)
    void screens.askForWorkspace(useCases)
    const user = userEvent.setup()
    await user.type(await screen.findByRole('textbox', { name: /work email address/i }), 'nobody@else.com')
    await user.click(screen.getByRole('button', { name: 'Forgot your password?' }))
    expect(await screen.findByText(en[screens.WORKSPACE_NOT_FOUND])).toBeInTheDocument()
    expect(opened).not.toHaveBeenCalled()
  })
})

describe('askForWorkspace, other failures', () => {
  it("never shows an error's own message (untranslated, maybe a server's): the password reset says it could not start", async () => {
    void screens.askForWorkspace({
      ...useCases,
      requestPasswordReset: async () => {
        throw new Error('upstream said: reset page 503')
      },
    })
    const user = userEvent.setup()
    await user.type(await screen.findByRole('textbox', { name: /work email address/i }), 'ada@acme.com')
    await user.click(screen.getByRole('button', { name: 'Forgot your password?' }))
    expect(await screen.findByText(en['login.error.passwordReset'])).toBeInTheDocument()
    expect(screen.queryByText(/upstream said/)).toBeNull()
    expect(screen.queryByText(en[screens.WORKSPACE_NOT_FOUND])).toBeNull()
  })

  it('and Continue says sign-in could not start', async () => {
    void screens.askForWorkspace({
      ...useCases,
      resolveWorkspace: async () => {
        throw new TypeError('Failed to fetch')
      },
    })
    const user = userEvent.setup()
    await user.type(await screen.findByRole('textbox', { name: /work email address/i }), 'ada@acme.com')
    await user.click(screen.getByRole('button', { name: 'Continue with Email' }))
    expect(await screen.findByText(en['login.error.signIn'])).toBeInTheDocument()
    expect(screen.queryByText('Failed to fetch')).toBeNull()
  })
})

describe('dialogs', () => {
  it('moves focus into the dialog, so its title is announced and its action is next', () => {
    act(() => screens.showSignedOut(async () => {}))
    expect(document.activeElement).toBe(screen.getByRole('dialog', { name: 'You are signed out' }))
  })

  it('signed out: signs in only on click', async () => {
    const signIn = vi.fn(async () => {})
    act(() => screens.showSignedOut(signIn))
    expect(screen.getByRole('dialog', { name: 'You are signed out' })).toBeInTheDocument()
    expect(signIn).not.toHaveBeenCalled()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in' }))
    expect(signIn).toHaveBeenCalledOnce()
  })

  it('device clock: retries on click', async () => {
    const signIn = vi.fn(async () => {})
    act(() => screens.showDeviceClock(signIn))
    expect(screen.getByRole('alertdialog', { name: "Check your device's clock" })).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(signIn).toHaveBeenCalledOnce()
  })

  it.each([
    [{ serverEnded: true, idle: false }, /workspace has moved/],
    [{ serverEnded: false, idle: true }, /period of inactivity/],
    [{ serverEnded: false, idle: false }, /^Your session has ended\.$/],
  ])('session ended %o explains why and signs in on click', async (why, text) => {
    const signIn = vi.fn(async () => {})
    act(() => screens.showSessionEnded({ status: 'expired', ...why }, signIn))
    expect(screen.getByText(text)).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in' }))
    expect(signIn).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('workspace not found: dismisses with OK', async () => {
    act(() => screens.showWorkspaceNotFound())
    expect(screen.getByRole('alertdialog', { name: 'Workspace not found' })).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'OK' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('wrong workspace: signs out, or switches to a resolved workspace', async () => {
    const idp = { logout: vi.fn(async () => {}), switchWorkspace: vi.fn(async () => {}) } as unknown as IdentityProvider
    act(() => screens.showWrongWorkspace(idp, useCases))
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(idp.logout).toHaveBeenCalledOnce()

    resolve.mockResolvedValue(acme)
    await user.click(screen.getByRole('button', { name: 'Switch workspace' }))
    await typeEmail('ada@acme.com')
    await waitFor(() => expect(idp.switchWorkspace).toHaveBeenCalledWith(acme))
  })
})
