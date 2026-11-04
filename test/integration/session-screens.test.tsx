import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IdentityProvider, Workspace } from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'

const resolve = vi.fn<(identifier: string) => Promise<Workspace | undefined>>()
vi.mock('../../src/platform/iam', () => ({ workspaceResolver: { resolve: (i: string) => resolve(i) } }))

const screens = await import('../../src/platform/SessionScreens')
const { resetScreen } = await import('../../src/platform/screen')

const acme: Workspace = { realm: 'tenant-acme', trial: false, slug: 'acme' }

afterEach(() => {
  act(() => resetScreen())
  resolve.mockReset()
})

async function typeEmail(email: string) {
  const user = userEvent.setup()
  await user.type(await screen.findByRole('textbox', { name: /work email address/i }), email)
  await user.click(screen.getByRole('button', { name: /continue with email/i }))
}

describe('askForWorkspace', () => {
  it('resolves the typed email to a workspace and returns it with the login hint', async () => {
    resolve.mockResolvedValue(acme)
    const choice = screens.askForWorkspace()
    await typeEmail('ada@acme.com')
    await expect(choice).resolves.toEqual({ workspace: acme, loginHint: 'ada@acme.com' })
    expect(resolve).toHaveBeenCalledWith('ada@acme.com')
  })

  it('shows one generic message for not found and for an unreachable resolver', async () => {
    resolve.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('429'))
    void screens.askForWorkspace('Your session has ended.')
    expect(await screen.findByText('Your session has ended.')).toBeInTheDocument()
    await typeEmail('ada@acme.com')
    expect(await screen.findByText(screens.WORKSPACE_NOT_FOUND)).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: /continue with email/i }))
    await waitFor(() => expect(resolve).toHaveBeenCalledTimes(2))
    expect(screen.getByText(screens.WORKSPACE_NOT_FOUND)).toBeInTheDocument()
    // Announced to screen readers, as is the bootstrap's notice.
    expect(screen.getAllByRole('alert').map((e) => e.textContent)).toEqual(['Your session has ended.', screens.WORKSPACE_NOT_FOUND])
  })

  it('uses the previous layout for ?variant=login1', async () => {
    window.history.replaceState({}, '', '/?variant=login1')
    void screens.askForWorkspace()
    expect(await screen.findByText(/Trouble logging in\?/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Product highlights' })).not.toBeInTheDocument()
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
    act(() => screens.showWrongWorkspace(idp))
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(idp.logout).toHaveBeenCalledOnce()

    resolve.mockResolvedValue(acme)
    await user.click(screen.getByRole('button', { name: 'Switch workspace' }))
    await typeEmail('ada@acme.com')
    await waitFor(() => expect(idp.switchWorkspace).toHaveBeenCalledWith(acme))
  })
})
