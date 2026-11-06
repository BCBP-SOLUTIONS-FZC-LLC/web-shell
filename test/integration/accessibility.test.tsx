// axe-core over every screen the shell owns: both login layouts (empty, and with a notice and an
// error), each session dialog, and the "unavailable" page. Colour contrast needs real layout, which
// happy-dom does not compute, so that rule is left to a browser check.
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IdentityProvider } from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'
import LoginPage from '../../src/presentation/pages/login/LoginPage'
import { localStorageRememberedEmail as remembered } from '../../src/infrastructure/storage/rememberedEmail'
import { resolveWorkspaceUseCase } from '../../src/application/use-cases/resolveWorkspace'
import { requestPasswordResetUseCase } from '../../src/application/use-cases/requestPasswordReset'
import en from '../../src/shared/i18n/en.json'

const screens = await import('../../src/app/layouts/sessionScreens')
// Sign-in use cases over a resolver that finds nothing, as the screens get them from the bootstrap.
const resolveWorkspace = resolveWorkspaceUseCase({ resolve: async () => undefined })
const useCases = {
  resolveWorkspace,
  requestPasswordReset: requestPasswordResetUseCase({ resolveWorkspace, resetUrl: () => '', open: () => {} }),
  rememberedEmail: remembered,
}
const { resetScreen } = await import('../../src/app/layouts/screen')

async function violations(): Promise<string[]> {
  const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
  return result.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)
}

afterEach(() => {
  act(() => resetScreen())
  document.body.querySelectorAll('#app').forEach((n) => n.remove())
})

describe('accessibility (axe)', () => {
  it.each([['latest', LoginPage]] as const)('the %s login layout, with a notice and an error', async (_name, Page) => {
    render(
      <Page
        rememberedEmail={remembered}
        notice="session.ended.default"
        onContinue={async () => {
          throw new Error(en[screens.WORKSPACE_NOT_FOUND])
        }}
      />,
    )
    expect(await violations()).toEqual([])
    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox', { name: /work email address/i }), 'ada@acme.test')
    await user.click(screen.getByRole('button', { name: /continue with email/i }))
    await screen.findByText(en[screens.WORKSPACE_NOT_FOUND])
    expect(await violations()).toEqual([])
  })

  const idp = { logout: async () => {}, switchWorkspace: async () => {} } as unknown as IdentityProvider
  it.each([
    ['signed out', () => screens.showSignedOut(async () => {})],
    ['device clock', () => screens.showDeviceClock(async () => {})],
    ['session ended', () => screens.showSessionEnded({ status: 'expired', idle: true } as never, async () => {})],
    ['wrong workspace', () => screens.showWrongWorkspace(idp, useCases)],
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
    const { showUnavailable } = await import('../../src/app/bootstrap/index')
    showUnavailable(new Error('x'))
    expect(await violations()).toEqual([])
  })

  it('the error page around the shell\'s own screens, with a reference', async () => {
    const { AppError } = await import('../../src/presentation/widgets/AppError')
    render(<AppError reference="4bf92f3577b34da6a3ce929d0e0e4736" onRetry={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Reference: 4bf92f3577b34da6a3ce929d0e0e4736')
    expect(await violations()).toEqual([])
  })
})
