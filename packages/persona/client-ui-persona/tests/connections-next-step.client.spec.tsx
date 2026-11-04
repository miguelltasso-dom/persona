// @vitest-environment jsdom
// UX-PHASE #3: every tool shows ONE next step that works (no dead buttons), and "Já fiz login" checks live.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConnectionsView } from '../src/client/connections/ConnectionsView.tsx'
import type { ConnectionAccountUiRow, ConnectionsAccountsUi } from '../src/client/data/adapters/connection-accounts.ts'
import { pt } from '../src/client/locale/connections/locales.ts'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function row(partial: Partial<ConnectionAccountUiRow> & Pick<ConnectionAccountUiRow, 'id' | 'status'>): ConnectionAccountUiRow {
  return {
    name: 'Conta principal',
    accountLabel: 'Conta principal',
    kind: 'claude',
    detail: '',
    ...partial,
  }
}

function ui(accounts: ConnectionAccountUiRow[], kind: 'claude' | 'codex' = 'claude'): ConnectionsAccountsUi {
  return {
    groups: [{ provider: kind, providerName: kind === 'claude' ? 'Claude' : 'Codex', accounts }],
    swapPolicy: 'next_on_limit',
    swapPolicyScope: 'workspace',
    legacySingleSeat: true,
  }
}

const loggedOut = ui([row({ id: 'a1', status: 'expired', errorCode: 'not_logged_in', copyCommand: 'claude login' })])
const ready = ui([row({ id: 'a1', status: 'ready' })])
const recheckLabel = pt['action.alreadyLoggedIn'] as string

describe('Conexões: a next step that works', () => {
  it('a signed-out tool offers the command to copy AND "Já fiz login"; the check says ready when it is', () => {
    const onRecheck = vi.fn()
    const { rerender } = render(<ConnectionsView accountsUi={loggedOut} onRecheck={onRecheck} />)
    expect(screen.getByRole('button', { name: pt['action.copyCommand'] as string })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: recheckLabel }))
    expect(onRecheck).toHaveBeenCalledTimes(1)
    // while checking: spinner label, button disabled (no double probe)
    const busy = screen.getByRole('button', { name: pt['action.checking'] as string })
    expect((busy as HTMLButtonElement).disabled).toBe(true)

    rerender(<ConnectionsView accountsUi={ready} onRecheck={onRecheck} />)
    expect(screen.getByText('Claude está pronta.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: recheckLabel })).toBeNull() // nothing left to confirm
  })

  it('still signed out after the check: an honest "ainda não", not a silent spinner', () => {
    const { rerender } = render(<ConnectionsView accountsUi={loggedOut} onRecheck={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: recheckLabel }))
    rerender(<ConnectionsView accountsUi={{ ...loggedOut }} onRecheck={() => {}} />)
    expect(screen.getByText(/Ainda não vejo o login de Claude/u)).toBeTruthy()
    // and the button is back so the person can try again
    expect(screen.getByRole('button', { name: recheckLabel }).hasAttribute('disabled')).toBe(false)
  })

  it('no answer from the host in 8 s → says "ainda não" instead of spinning forever', () => {
    vi.useFakeTimers()
    render(<ConnectionsView accountsUi={loggedOut} onRecheck={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: recheckLabel }))
    act(() => { vi.advanceTimersByTime(8_100) })
    expect(screen.getByText(/Ainda não vejo o login de Claude/u)).toBeTruthy()
    expect(screen.getByRole('button', { name: recheckLabel }).hasAttribute('disabled')).toBe(false)
  })

  it('"Já fiz login" only exists when there is something to confirm and a way to check', () => {
    const { rerender } = render(<ConnectionsView accountsUi={ready} onRecheck={() => {}} />)
    expect(screen.queryByRole('button', { name: recheckLabel })).toBeNull()
    rerender(<ConnectionsView accountsUi={loggedOut} />)
    expect(screen.queryByRole('button', { name: recheckLabel })).toBeNull()
  })

  it('install / connect / usage actions are wired (they used to be empty handlers)', () => {
    const onOpenGuide = vi.fn()
    const onOpenUsage = vi.fn()
    const view = render(
      <ConnectionsView
        accountsUi={ui([row({ id: 'm1', status: 'missing', errorCode: 'cli_not_found' })], 'codex')}
        onOpenGuide={onOpenGuide}
        onOpenUsage={onOpenUsage}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: pt['action.install'] as string }))
    expect(onOpenGuide).toHaveBeenCalledTimes(1)
    view.unmount()

    render(
      <ConnectionsView
        accountsUi={ui([row({ id: 'q1', status: 'expired', errorCode: 'quota_exhausted' })])}
        onOpenGuide={onOpenGuide}
        onOpenUsage={onOpenUsage}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: pt['action.usage'] as string }))
    expect(onOpenUsage).toHaveBeenCalledTimes(1)
  })
})
