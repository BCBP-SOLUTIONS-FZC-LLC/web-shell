import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import LoginLatest from '../../src/pages/LoginPage'
import LoginPrevious from '../../src/pages/LoginPage1'

const pages = [
  ['latest', LoginLatest],
  ['login1', LoginPrevious],
] as const

const emailBox = () => screen.getByRole('textbox', { name: /work email address/i })
const rememberBox = () => screen.getByRole('checkbox', { name: /remember email/i })
const submit = () => screen.getByRole('button', { name: /continue with email|redirecting/i })

describe.each(pages)('login page %s', (_name, LoginPage) => {
  it('shows the brand and feature list', () => {
    render(<LoginPage onContinue={vi.fn()} />)
    expect(screen.getByRole('img', { name: 'Beyond Code' })).toBeInTheDocument()
    expect(screen.getByText('95% Accuracy Forecasting')).toBeInTheDocument()
    expect(screen.getByText('Real-time Site Monitoring')).toBeInTheDocument()
    expect(screen.getByText('Safety & Compliance')).toBeInTheDocument()
  })

  it('prefills a remembered email', () => {
    localStorage.setItem('bcbp.rememberEmail', 'true')
    localStorage.setItem('bcbp.loginEmail', 'ada@bcbp.com')
    render(<LoginPage onContinue={vi.fn()} />)
    expect(emailBox()).toHaveValue('ada@bcbp.com')
    expect(rememberBox()).toBeChecked()
  })

  it('shows a notice from the bootstrap', () => {
    render(<LoginPage onContinue={vi.fn()} notice="Your session has ended." />)
    expect(screen.getByText('Your session has ended.')).toBeInTheDocument()
  })

  it('remembers the email and continues with it trimmed', async () => {
    const user = userEvent.setup()
    const onContinue = vi.fn(() => new Promise<void>(() => {}))
    render(<LoginPage onContinue={onContinue} />)

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
    render(<LoginPage onContinue={vi.fn(async () => {})} />)

    await user.click(rememberBox())
    await user.click(submit())

    expect(localStorage.getItem('bcbp.rememberEmail')).toBeNull()
    expect(localStorage.getItem('bcbp.loginEmail')).toBeNull()
  })

  it('shows why continuing failed and lets the user retry', async () => {
    const user = userEvent.setup()
    const onContinue = vi.fn().mockRejectedValueOnce(new Error('We could not find a workspace for that email.'))
    render(<LoginPage onContinue={onContinue} />)

    await user.type(emailBox(), 'ada@bcbp.com')
    await user.click(submit())

    expect(await screen.findByText('We could not find a workspace for that email.')).toBeInTheDocument()
    await waitFor(() => expect(submit()).toBeEnabled())
  })

  it('falls back to a generic message for a non-Error rejection', async () => {
    const user = userEvent.setup()
    render(<LoginPage onContinue={vi.fn().mockRejectedValueOnce('nope')} />)
    await user.type(emailBox(), 'ada@bcbp.com')
    await user.click(submit())
    expect(await screen.findByText('Unable to start sign-in.')).toBeInTheDocument()
  })
})
