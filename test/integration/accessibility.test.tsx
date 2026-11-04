// axe-core over every screen the shell owns: both login layouts (empty, and with a notice and an
// error), each session dialog, and the "unavailable" page. Colour contrast needs real layout, which
// happy-dom does not compute, so that rule is left to a browser check.
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IdentityProvider } from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'
import LoginPage from '../../src/pages/LoginPage'
import LoginPage1 from '../../src/pages/LoginPage1'

vi.mock('../../src/platform/iam', () => ({ workspaceResolver: { resolve: async () => undefined } }))
const screens = await import('../../src/platform/SessionScreens')
const { resetScreen } = await import('../../src/platform/screen')

async function violations(): Promise<string[]> {
  const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
  return result.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)
}

afterEach(() => {
  act(() => resetScreen())
  document.body.querySelectorAll('#app').forEach((n) => n.remove())
})

describe('accessibility (axe)', () => {
  it.each([
    ['latest', LoginPage],
    ['login1', LoginPage1],
  ] as const)('the %s login layout, with a notice and an error', async (_name, Page) => {
    render(
      <Page
        notice="Your session has ended."
        onContinue={async () => {
          throw new Error(screens.WORKSPACE_NOT_FOUND)
        }}
      />,
    )
    expect(await violations()).toEqual([])
    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox', { name: /work email address/i }), 'ada@acme.test')
    await user.click(screen.getByRole('button', { name: /continue with email/i }))
    await screen.findByText(screens.WORKSPACE_NOT_FOUND)
    expect(await violations()).toEqual([])
  })

  const idp = { logout: async () => {}, switchWorkspace: async () => {} } as unknown as IdentityProvider
  it.each([
    ['signed out', () => screens.showSignedOut(async () => {})],
    ['device clock', () => screens.showDeviceClock(async () => {})],
    ['session ended', () => screens.showSessionEnded({ status: 'expired', idle: true } as never, async () => {})],
    ['wrong workspace', () => screens.showWrongWorkspace(idp)],
    ['workspace not found', () => screens.showWorkspaceNotFound()],
  ])('the %s dialog', async (_name, show) => {
    act(() => show())
    expect(await violations()).toEqual([])
  })

  it('the "unavailable" page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const app = document.createElement('div')
    app.id = 'app'
    document.body.append(app)
    const { showUnavailable } = await import('../../src/index')
    showUnavailable(new Error('x'))
    expect(await violations()).toEqual([])
  })
})
