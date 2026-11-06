import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import LoginLatest from '../../src/presentation/pages/login/LoginPage'
import { localStorageRememberedEmail as remembered } from '../../src/infrastructure/storage/rememberedEmail'
import { EMAIL_FIRST } from '../../src/presentation/pages/login/useEmailSignIn'
import en from '../../src/shared/i18n/en.json'

const pages = [['latest', LoginLatest]] as const

const emailBox = () => screen.getByRole('textbox', { name: /work email address/i })
const rememberBox = () => screen.getByRole('checkbox', { name: /remember email/i })
const submit = () => screen.getByRole('button', { name: /continue with email|redirecting/i })

describe.each(pages)('login page %s', (_name, LoginPage) => {
  it('shows the brand and feature list', () => {
    render(<LoginPage rememberedEmail={remembered} onContinue={vi.fn()} />)
    expect(screen.getByRole('img', { name: 'Beyond Code' })).toBeInTheDocument()
    expect(screen.getByText('95% Accuracy Forecasting')).toBeInTheDocument()
    expect(screen.getByText('Real-time Site Monitoring')).toBeInTheDocument()
    expect(screen.getByText('Safety & Compliance')).toBeInTheDocument()
  })

  it('prefills a remembered email', () => {
    localStorage.setItem('bcbp.rememberEmail', 'true')
    localStorage.setItem('bcbp.loginEmail', 'ada@bcbp.com')
    render(<LoginPage rememberedEmail={remembered} onContinue={vi.fn()} />)
    expect(emailBox()).toHaveValue('ada@bcbp.com')
    expect(rememberBox()).toBeChecked()
  })

  it('shows a notice from the bootstrap', () => {
    render(<LoginPage rememberedEmail={remembered} onContinue={vi.fn()} notice="session.ended.default" />)
    expect(screen.getByText('Your session has ended.')).toBeInTheDocument()
  })

  it('remembers the email and continues with it trimmed', async () => {
    const user = userEvent.setup()
    const onContinue = vi.fn(() => new Promise<void>(() => {}))
    render(<LoginPage rememberedEmail={remembered} onContinue={onContinue} />)

    await user.type(emailBox(), ' ada@bcbp.com ')
    await user.click(rememberBox())
    await user.click(submit())

    expect(onContinue).toHaveBeenCalledWith('ada@bcbp.com')
    expect(localStorage.getItem('bcbp.loginEmail')).toBe('ada@bcbp.com')
    expect(submit()).toBeDisabled()
    expect(submit()).toHaveTextContent('Redirecting…')
  })

  it('forgets a remembered email when the box is unchecked', async () => {
    localStorage.setItem('bcbp.rememberEmail', 'true')
    localStorage.setItem('bcbp.loginEmail', 'ada@bcbp.com')
    const user = userEvent.setup()
    render(<LoginPage rememberedEmail={remembered} onContinue={vi.fn(async () => {})} />)

    await user.click(rememberBox())
    await user.click(submit())

    expect(localStorage.getItem('bcbp.rememberEmail')).toBeNull()
    expect(localStorage.getItem('bcbp.loginEmail')).toBeNull()
  })

  it('shows why continuing failed and lets the user retry', async () => {
    const user = userEvent.setup()
    const onContinue = vi.fn().mockRejectedValueOnce(new Error('We could not find a workspace for that email.'))
    render(<LoginPage rememberedEmail={remembered} onContinue={onContinue} />)

    await user.type(emailBox(), 'ada@bcbp.com')
    await user.click(submit())

    expect(await screen.findByText('We could not find a workspace for that email.')).toBeInTheDocument()
    await waitFor(() => expect(submit()).toBeEnabled())
  })

  it('falls back to a generic message for a non-Error rejection', async () => {
    const user = userEvent.setup()
    render(<LoginPage rememberedEmail={remembered} onContinue={vi.fn().mockRejectedValueOnce('nope')} />)
    await user.type(emailBox(), 'ada@bcbp.com')
    await user.click(submit())
    expect(await screen.findByText('Unable to start sign-in.')).toBeInTheDocument()
  })

  it('has no dead links: no Forgot without a handler, and no help or legal link without a URL', () => {
    const { container } = render(<LoginPage rememberedEmail={remembered} onContinue={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Forgot your password?' })).toBeNull()
    expect(screen.queryByText('Trouble logging in?')).toBeNull()
    expect(container.querySelector('footer')).toBeNull()
    expect(container.querySelector('a[href^="#"]')).toBeNull()
  })

  it('Forgot your password? asks for the email first', async () => {
    const onForgotPassword = vi.fn(async () => {})
    render(<LoginPage rememberedEmail={remembered} onContinue={vi.fn()} onForgotPassword={onForgotPassword} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Forgot your password?' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(en[EMAIL_FIRST])
    expect(onForgotPassword).not.toHaveBeenCalled()
  })

  it('Forgot your password? continues with the typed email, and shows why it failed', async () => {
    const user = userEvent.setup()
    const onForgotPassword = vi
      .fn<(email: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('We could not find a workspace for that email.'))
      .mockRejectedValueOnce('nope')
    render(<LoginPage rememberedEmail={remembered} onContinue={vi.fn()} onForgotPassword={onForgotPassword} />)
    await user.type(emailBox(), ' ada@bcbp.com ')
    await user.click(screen.getByRole('button', { name: 'Forgot your password?' }))
    expect(onForgotPassword).toHaveBeenCalledWith('ada@bcbp.com')
    expect(await screen.findByText('We could not find a workspace for that email.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Forgot your password?' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Forgot your password?' }))
    expect(await screen.findByText('Unable to start the password reset.')).toBeInTheDocument()
  })
})
