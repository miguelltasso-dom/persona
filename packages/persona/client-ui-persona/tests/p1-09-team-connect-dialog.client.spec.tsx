// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { ConnectedTeamAi } from '../src/client/team-connect/ConnectedTeamAi.tsx'
import { TeamConnectDialog } from '../src/client/team-connect/TeamConnectDialog.tsx'
import { TEAM_CONNECT_IDLE, type TeamAiUi, type TeamConnectRemoteWire } from '../src/client/team-connect/team-connect-wire.ts'

/**
 * Carbon P1-09 (Tally), the screen. Written RED first:
 *  - with no account signed in (`choices: []`) the modal opened BLANK with a dead button and no way out: it now says what to do and takes the person to Conexões;
 *  - after a run that ended `partial`, closing and reopening the modal froze it on the old rows: it now offers the choice again.
 */
installPreviewTheme()
const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellPt, key, params)) as never

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }) })
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

async function pass(ms = 0): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
}

const AI: TeamAiUi = {
  without: [{ personaId: 'bia', name: 'Bia', title: 'Redação' }, { personaId: 'teo', name: 'Teo', title: 'Arte' }],
  unsure: 0,
  choices: [{ id: 'codex', provider: 'codex', label: 'codex', room: 'sobra' }],
}

const noop = (): void => undefined

describe('the modal with no account to wake the team with', () => {
  it('says what to do and opens Conexões (not a blank modal with a dead button)', () => {
    const onOpenConnections = vi.fn()
    render(
      <TeamConnectDialog t={t} open ai={{ ...AI, choices: [] }} connect={TEAM_CONNECT_IDLE} accountId={undefined} starting={false} refused={null}
        onChooseAccount={noop} onStart={noop} onRetryOne={noop} onClose={noop} onOpenConnections={onOpenConnections} />,
    )
    expect(screen.getByText(/Ainda não há nenhuma assinatura de IA ligada neste computador/u)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Ligar para as 2/u }), 'the dead button is gone').toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Conexões' }))
    expect(onOpenConnections).toHaveBeenCalledTimes(1)
  })

  it('with an account to choose there is no guide, and without a way to Conexões the old button stays (nothing invented)', () => {
    const { rerender } = render(
      <TeamConnectDialog t={t} open ai={AI} connect={TEAM_CONNECT_IDLE} accountId="codex" starting={false} refused={null}
        onChooseAccount={noop} onStart={noop} onRetryOne={noop} onClose={noop} onOpenConnections={vi.fn()} />,
    )
    expect(screen.queryByText(/Ainda não há nenhuma assinatura/u)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Abrir Conexões' })).toBeNull()
    rerender(
      <TeamConnectDialog t={t} open ai={{ ...AI, choices: [] }} connect={TEAM_CONNECT_IDLE} accountId={undefined} starting={false} refused={null}
        onChooseAccount={noop} onStart={noop} onRetryOne={noop} onClose={noop} />,
    )
    expect(screen.queryByRole('button', { name: 'Abrir Conexões' })).toBeNull()
    expect((screen.getByRole('button', { name: /Ligar para as 2/u }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('after a run that ended partial', () => {
  it('closing and reopening the modal offers the choice again (it is not frozen on the old rows)', async () => {
    const remote: TeamConnectRemoteWire = {
      getTeamAi: () => AI,
      getTeamConnect: () => ({
        state: 'partial', accountId: 'codex', provider: 'codex',
        rows: [{ personaId: 'bia', name: 'Bia', status: 'conectada' }, { personaId: 'teo', name: 'Teo', status: 'nao_conectou', reason: 'sem_login' }],
      }),
    }
    render(<ConnectedTeamAi t={t} remote={remote} workspaceId="ws" projectId="pp" />)
    await pass(0)
    fireEvent.click(screen.getByRole('button', { name: 'Ligar para todas' }))
    expect(screen.getByText('Não conectou'), 'the run that ended partial is what the modal shows first').toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Fechar' })[0] as HTMLElement)
    await pass(0)
    fireEvent.click(screen.getByRole('button', { name: 'Ligar para todas' }))
    expect(screen.queryByText('Não conectou'), 'reopened: the old failure is not the screen any more').toBeNull()
    expect(screen.queryAllByRole('radio').length, 'the choice of account is back').toBeGreaterThan(0)
  })
})
