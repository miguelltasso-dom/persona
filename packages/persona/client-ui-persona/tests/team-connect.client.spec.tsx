// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ILLUSTRATIONS } from '../src/client/assets/generated-imports.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { ConnectedTeamAi } from '../src/client/team-connect/ConnectedTeamAi.tsx'
import { TeamAiBanner } from '../src/client/team-connect/TeamAiBanner.tsx'
import { TeamConnectDialog, accountLine } from '../src/client/team-connect/TeamConnectDialog.tsx'
import {
  TEAM_AI_EMPTY, TEAM_CONNECT_IDLE, fetchTeamAi, startFromWire, teamAiFromWire, teamConnectFromWire,
  type TeamAiUi, type TeamConnectRemoteWire, type TeamConnectUi,
} from '../src/client/team-connect/team-connect-wire.ts'

/**
 * Item 13 (Tally, 11/11), the screen: banner "N pessoas da equipe estão sem IA", the modal that wakes the whole team, the real progress (one persona at a time), the honest
 * failure row. The host is a fake: nothing here calls a CLI or a model. Texts and measures come from COLHEITA-MUSE §13.
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
  choices: [
    { id: 'codex', provider: 'codex', label: 'codex', room: 'sobra' },
    { id: 'claude', provider: 'claude', label: 'claude', room: 'quase_no_limite' },
  ],
}

describe('the wire never accuses by accident', () => {
  it('a strange answer is "nothing to show", never a banner', () => {
    expect(teamAiFromWire(undefined)).toEqual(TEAM_AI_EMPTY)
    expect(teamAiFromWire('x')).toEqual(TEAM_AI_EMPTY)
    expect(teamAiFromWire({ without: 'bia', choices: 3, unsure: 'many' })).toEqual(TEAM_AI_EMPTY)
    expect(teamConnectFromWire(null)).toEqual(TEAM_CONNECT_IDLE)
    expect(teamConnectFromWire({ state: 'weird', rows: [{ personaId: 'x', status: 'weird' }] }).rows[0]?.status).toBe('esperando')
    expect(startFromWire(7)).toEqual({ ok: false, code: 'failed' })
    expect(startFromWire({ ok: false, code: 'no_account' })).toEqual({ ok: false, code: 'no_account' })
  })

  it('a host that fails or has no such method is nobody without AI (no banner)', async () => {
    const scope = { workspaceId: 'ws', projectId: 'pp' }
    expect(await fetchTeamAi({}, scope)).toEqual(TEAM_AI_EMPTY)
    expect(await fetchTeamAi({ getTeamAi: () => { throw new Error('busy') } }, scope)).toEqual(TEAM_AI_EMPTY)
    const ok = await fetchTeamAi({ getTeamAi: () => Promise.resolve({ ok: true, value: { without: [{ personaId: 'bia', name: 'Bia', title: '' }], unsure: 1, choices: [{ id: 'c', provider: 'claude', label: 'Claude', room: 'sobra' }] } }) }, scope)
    expect(ok.without).toHaveLength(1)
    expect(ok.unsure).toBe(1)
  })

  it('keeps only the engines and rooms the screen knows (an unknown engine is never offered)', () => {
    const view = teamAiFromWire({ without: [], unsure: 0, choices: [{ id: 'a', provider: 'dsh', label: 'x', room: 'sobra' }, { id: 'b', provider: 'codex', label: 'codex', room: 'weird' }] })
    expect(view.choices).toEqual([{ id: 'b', provider: 'codex', label: 'codex', room: 'desconhecida' }])
  })
})

describe('TeamAiBanner (COLHEITA-MUSE §13.1)', () => {
  it('says how many are without AI and offers "Ligar para todas"; one person never gets "todas"; zero draws nothing', () => {
    const onOpen = vi.fn()
    const { rerender, container } = render(<TeamAiBanner t={t} count={3} onOpen={onOpen} />)
    expect(screen.getByText('3 pessoas da equipe estão sem IA.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ligar para todas' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    rerender(<TeamAiBanner t={t} count={1} onOpen={onOpen} />)
    expect(screen.getByText('1 pessoa da equipe está sem IA.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ligar para todas' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Ligar a IA' })).toBeTruthy()
    rerender(<TeamAiBanner t={t} count={0} onOpen={onOpen} />)
    expect(container.textContent).toBe('')
  })
})

describe('TeamConnectDialog (COLHEITA-MUSE §13.2-3)', () => {
  const noop = (): void => undefined
  const dialog = (over: { connect?: TeamConnectUi; accountId?: string; refused?: 'no_account' | 'no_one' | 'failed' | null; starting?: boolean } = {}) => (
    <TeamConnectDialog
      t={t} open ai={AI} connect={over.connect ?? TEAM_CONNECT_IDLE} accountId={over.accountId ?? 'codex'} starting={over.starting ?? false} refused={over.refused ?? null}
      onChooseAccount={noop} onStart={noop} onRetryOne={noop} onClose={noop}
    />
  )

  it('shows the art, the title, who is without AI ("Sem motor") and the accounts by room, the first one marked, no "Recomendado", no money', () => {
    const { container } = render(dialog())
    expect(screen.getByRole('dialog', { name: 'Ligar a IA para a equipe toda' })).toBeTruthy()
    const art = container.querySelector('img') as HTMLImageElement
    expect(art.getAttribute('src')).toBe(ILLUSTRATIONS['ligar-ia-equipe'])
    expect(art.getAttribute('alt')).toBe('')
    expect([art.getAttribute('width'), art.getAttribute('height')]).toEqual(['240', '140'])
    expect(screen.getAllByText('Sem motor')).toHaveLength(2)
    expect(screen.getByText('Bia')).toBeTruthy()
    const radios = screen.getAllByRole('radio') as HTMLInputElement[]
    expect(radios.map(radio => radio.value)).toEqual(['codex', 'claude'])
    expect(radios.map(radio => radio.checked)).toEqual([true, false])
    expect(screen.getByText('Codex · sobra bastante')).toBeTruthy()
    expect(screen.getByText('Claude · quase no limite')).toBeTruthy()
    expect(container.textContent).not.toMatch(/Recomendad|R\$|US\$|\$/u)
    expect(screen.getByRole('button', { name: 'Ligar para as 2' })).toBeTruthy()
  })

  it('an account whose window the vendor did not publish shows only its name (never a made-up room)', () => {
    expect(accountLine(t, { id: 'x', provider: 'claude', label: 'claude', room: 'desconhecida' })).toBe('Claude')
    expect(accountLine(t, { id: 'y', provider: 'claude', label: 'Claude da loja', room: 'sobra' })).toBe('Claude da loja · sobra bastante')
  })

  it('while it runs the list moves by the host\'s word: one connecting, the done one is "Disponível" with the check, the waiting one still "Sem motor"', () => {
    const connect: TeamConnectUi = { state: 'running', accountId: 'codex', provider: 'codex', rows: [{ personaId: 'bia', name: 'Bia', status: 'conectada' }, { personaId: 'teo', name: 'Teo', status: 'conectando' }] }
    const { container } = render(dialog({ connect }))
    expect(screen.getByText('Disponível')).toBeTruthy()
    expect(screen.getByText('Conectando…')).toBeTruthy()
    expect(screen.queryAllByRole('radio')).toHaveLength(0) // the choice is made; it does not come back mid-run
    expect(container.querySelectorAll('[data-status="conectada"]').length).toBeGreaterThan(0)
    expect((screen.getByRole('button', { name: 'Ligando…' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('a persona that did not connect says so and can be tried again alone, while the others stay connected', () => {
    const onRetryOne = vi.fn()
    const connect: TeamConnectUi = { state: 'partial', accountId: 'codex', provider: 'codex', rows: [{ personaId: 'bia', name: 'Bia', status: 'conectada' }, { personaId: 'teo', name: 'Teo', status: 'nao_conectou', reason: 'sem_login' }] }
    render(
      <TeamConnectDialog t={t} open ai={AI} connect={connect} accountId="codex" starting={false} refused={null} onChooseAccount={() => undefined} onStart={() => undefined} onRetryOne={onRetryOne} onClose={() => undefined} />,
    )
    expect(screen.getByText('Não conectou')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(onRetryOne).toHaveBeenCalledWith('teo')
    expect(screen.getByText('Disponível')).toBeTruthy()
    expect(screen.queryByText('Pronto: a equipe toda tem IA.')).toBeNull() // not everyone connected
  })

  it('the end is "Pronto: a equipe toda tem IA." and a Fechar button', () => {
    const connect: TeamConnectUi = { state: 'done', accountId: 'codex', provider: 'codex', rows: [{ personaId: 'bia', name: 'Bia', status: 'conectada' }, { personaId: 'teo', name: 'Teo', status: 'conectada' }] }
    render(dialog({ connect }))
    expect(screen.getByText('Pronto: a equipe toda tem IA.')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Fechar' }).length).toBeGreaterThan(0)
  })

  it('a refusal is said in words (no account to use)', () => {
    render(dialog({ refused: 'no_account' }))
    expect(screen.getByRole('alert').textContent).toMatch(/Entre em uma conta/u)
  })
})

/** A fake host: who is without AI, a progress that advances one persona per read, and the calls it received. */
function fakeHost(): { remote: TeamConnectRemoteWire; calls: string[]; stage: { value: number } } {
  const calls: string[] = []
  const stage = { value: 0 }
  const rows = (statuses: readonly string[]): unknown[] => [{ personaId: 'bia', name: 'Bia', status: statuses[0] }, { personaId: 'teo', name: 'Teo', status: statuses[1] }]
  const remote: TeamConnectRemoteWire = {
    getTeamAi: () => { calls.push('getTeamAi'); return stage.value >= 3 ? { without: [], unsure: 0, choices: [] } : AI },
    connectTeam: (request) => { calls.push(`connectTeam:${String(request.accountId)}`); stage.value = 1; return { ok: true, view: { state: 'running', accountId: 'codex', provider: 'codex', rows: rows(['esperando', 'esperando']) } } },
    getTeamConnect: () => {
      calls.push('getTeamConnect')
      if (stage.value === 0) return { state: 'idle', rows: [] }
      if (stage.value === 1) { stage.value = 2; return { state: 'running', accountId: 'codex', provider: 'codex', rows: rows(['conectando', 'esperando']) } }
      if (stage.value === 2) { stage.value = 3; return { state: 'running', accountId: 'codex', provider: 'codex', rows: rows(['conectada', 'conectando']) } }
      return { state: 'done', accountId: 'codex', provider: 'codex', rows: rows(['conectada', 'conectada']) }
    },
  }
  return { remote, calls, stage }
}

describe('ConnectedTeamAi: the whole flow against a fake host', () => {
  it('banner → modal → "Ligar para as 2" on the FIRST account → the list advances one persona at a time → "Pronto" → the banner is gone', async () => {
    const host = fakeHost()
    render(<ConnectedTeamAi t={t} remote={host.remote} workspaceId="ws" projectId="pp" />)
    await pass(0)
    expect(screen.getByText('2 pessoas da equipe estão sem IA.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ligar para todas' }))
    expect(screen.getByRole('dialog', { name: 'Ligar a IA para a equipe toda' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ligar para as 2' }))
    await pass(0)
    expect(host.calls).toContain('connectTeam:codex') // the default (most room) was used
    await pass(650)
    expect(screen.getByText('Conectando…')).toBeTruthy()
    await pass(650)
    expect(screen.getByText('Disponível')).toBeTruthy()
    expect(screen.getByText('Conectando…')).toBeTruthy() // Bia is done, Teo is the one being woken: one at a time
    await pass(650)
    expect(screen.getByText('Pronto: a equipe toda tem IA.')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Fechar' })[0] as HTMLElement)
    await pass(0)
    expect(screen.queryByText(/estão sem IA/u)).toBeNull() // nobody is left without AI: the banner went away by itself
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('without a host, or with nobody without AI, nothing is drawn (never an accusation by silence)', async () => {
    const { container, rerender } = render(<ConnectedTeamAi t={t} remote={undefined} workspaceId="ws" projectId="pp" />)
    await pass(0)
    expect(container.textContent).toBe('')
    rerender(<ConnectedTeamAi t={t} remote={{ getTeamAi: () => ({ without: [], unsure: 2, choices: [] }) }} workspaceId="ws" projectId="pp" />)
    await pass(0)
    expect(container.textContent).toBe('') // two personas are only being checked: they are NOT "sem IA"
  })
})
