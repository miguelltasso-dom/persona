// @vitest-environment jsdom
// P1-7 "Enquanto você estava fora" com dados reais do host (getWhileAway: since, events[], waiting[], summary; dismissWhileAway).
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WhileAwayView } from '@deepseek-ai/dsh-persona-host/types'
import { AwayWhileOutPanel } from '../src/client/overview/AwayWhileOutPanel.tsx'
import { pt } from '../src/client/locale/shell/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { mapAwayLive, type AwayLive } from '../src/client/remote/map-host-ui.ts'
import { createPersonaLiveStore, type PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(pt, key, params)) as never
const TEAM = {
  personas: [{ id: 'p-nina', name: 'Nina', title: 'Design', workspaceId: 'ws', projectId: 'pp', description: '', avatarKind: 'gallery', avatarRef: 'nina', systemRoles: [], canRecruit: false }],
  members: [],
} as never

const VIEW: WhileAwayView = {
  since: new Date(Date.now() - 14 * 3_600_000).toISOString(),
  events: [
    { id: 'e1', at: '2026-11-04T10:00:00.000Z', body: 'Nina entregou o logo novo.', taskId: 't-logo', taskTitle: 'Logo da padaria', kind: 'delivery', personaId: 'p-nina', personaName: 'Nina' },
    { id: 'e3', at: '2026-11-04T10:02:00.000Z', body: 'Capa do cardápio', taskId: 't-capa', taskTitle: 'Capa do cardápio', kind: 'delivery', personaId: 'p-nina', personaName: 'Nina' },
    { id: 'e2', at: '2026-11-04T10:05:00.000Z', body: 'O Vigia viu um assunto parado.', taskId: 'subject-geral', taskTitle: 'subject-geral', kind: 'watchdog', personaId: '', personaName: '' },
  ],
  waiting: [
    { id: 'w1', kind: 'review', title: 'Logo da padaria', taskId: 't-logo', personaId: 'p-nina', personaName: 'Nina' },
    { id: 'w2', kind: 'question', title: 'Qual tom usar?', taskId: 't-tom', approvalId: 'att-1', approvalKind: 'attention', personaId: '', personaName: '' },
    { id: 'w3', kind: 'approval', title: 'Contratar a Bolota', taskId: '', approvalId: 'hire-1', approvalKind: 'hire', personaId: 'p-nina', personaName: 'Nina' },
  ],
  summary: { deliveries: 1, waitingOnYou: 3, awayMinutes: 14 * 60 },
}

describe('mapAwayLive (pure)', () => {
  it('título vazio ou com cara de id some (só o texto do host); personaId vazio = sem rosto; o retrato vem do time', () => {
    const live = mapAwayLive(VIEW, TEAM)
    expect(live.done[0]).toMatchObject({ taskLabel: 'Logo da padaria', taskId: 't-logo', persona: { name: 'Nina', characterId: 'nina' } })
    expect(live.done[0]?.deliveredTitle).toBeUndefined() // the host wrote a sentence
    expect(live.done[1]).toMatchObject({ deliveredTitle: 'Capa do cardápio' }) // the host's text is only the title
    expect(live.done[2]?.taskLabel).toBeUndefined()
    expect(live.done[2]?.persona).toBeUndefined()
    expect(live.waiting[1]).toMatchObject({ kind: 'question', approvalId: 'att-1', taskId: 't-tom' })
    expect(live.waiting[1]?.persona).toBeUndefined()
    expect(live.waiting[2]?.taskId).toBeUndefined()
    expect(live.awayMinutes).toBe(14 * 60)
  })

  it('host antigo (sem waiting nem summary): só as entregas, sem duração inventada', () => {
    const live = mapAwayLive({ since: VIEW.since, events: VIEW.events }, TEAM)
    expect(live.waiting).toEqual([])
    expect(live.awayMinutes).toBeUndefined()
    expect(live.done).toHaveLength(3)
  })
})

describe('AwayWhileOutPanel com dados do host', () => {
  const live = (): AwayLive => mapAwayLive(VIEW, TEAM)
  const panel = (over: Partial<Parameters<typeof AwayWhileOutPanel>[0]> = {}) => {
    const handlers = { onOpenTask: vi.fn(), onOpenApproval: vi.fn(), onDismiss: vi.fn() }
    render(<AwayWhileOutPanel t={t} events={[]} away={live()} {...handlers} {...over} />)
    return handlers
  }

  it('diz desde quando e quanto tempo, e conta o que espera e o que ficou pronto (sem inventar zero)', () => {
    panel()
    expect(screen.getByRole('heading', { name: 'Enquanto você estava fora' })).toBeTruthy()
    expect(screen.getByText(/^Desde .* · 14 h fora$/u)).toBeTruthy()
    expect(screen.getByText('3 coisas esperam você · 3 entregas')).toBeTruthy()
    cleanup()
    panel({ away: { ...live(), waiting: live().waiting.slice(0, 1), done: [], awayMinutes: undefined } })
    expect(screen.getByText('1 coisa espera você')).toBeTruthy()
    expect(screen.getByText(/^Desde /u).textContent).not.toContain('fora')
  })

  it('1ª visita: o host manda a época como "desde"; a tela não diz "Desde 1 jan 1970", só o que espera e o que ficou pronto', () => {
    panel({ away: { ...live(), since: '1970-01-01T00:00:00.000Z', awayMinutes: undefined } })
    expect(screen.queryByText(/^Desde /u)).toBeNull()
    expect(document.body.textContent).not.toMatch(/1970/u)
    expect(screen.getByText('3 coisas esperam você · 3 entregas')).toBeTruthy()
  })

  it('"Espera você": revisar abre a tarefa; pergunta e aprovação abrem o cartão em Aprovações; cada linha diz o tipo', () => {
    const handlers = panel()
    const waiting = screen.getByRole('heading', { name: 'Espera você' }).parentElement!
    const rows = within(waiting).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(within(rows[0]!).getByText('Revisão')).toBeTruthy()
    expect(within(rows[1]!).getByText('Pergunta')).toBeTruthy()
    expect(within(rows[2]!).getByText('Aprovação')).toBeTruthy()
    fireEvent.click(within(rows[0]!).getByRole('button', { name: 'Abrir Logo da padaria' }))
    expect(handlers.onOpenTask).toHaveBeenCalledWith('t-logo')
    fireEvent.click(within(rows[1]!).getByRole('button', { name: 'Abrir Qual tom usar?' }))
    expect(handlers.onOpenApproval).toHaveBeenCalledWith('att-1')
    fireEvent.click(within(rows[2]!).getByRole('button', { name: 'Abrir Contratar a Bolota' }))
    expect(handlers.onOpenApproval).toHaveBeenCalledWith('hire-1')
  })

  it('quem já está em "Precisa de você" não se repete: a contagem com "Ver em Precisa de você" (o link foca o cartão); os outros seguem na lista', () => {
    const onOpenAttention = vi.fn()
    const handlers = panel({ onScreenAttention: [{ id: 'att-1', title: 'Qual tom usar?' }], onOpenAttention })
    const waiting = screen.getByRole('heading', { name: 'Espera você' }).parentElement!
    expect(within(waiting).queryByText('Qual tom usar?')).toBeNull()
    expect(within(waiting).getAllByRole('listitem')).toHaveLength(2)
    expect(waiting.textContent).toContain('1 coisa espera você')
    expect(waiting.textContent).toContain('Ver em Precisa de você')
    fireEvent.click(within(waiting).getByRole('button', { name: 'Ver em Precisa de você' }))
    expect(onOpenAttention).toHaveBeenCalledTimes(1)
    expect(handlers.onOpenApproval).not.toHaveBeenCalled()
  })

  it('com todos os itens em espera já em "Precisa de você", a linha-resumo do topo some; o grupo e "Ficou pronto" ficam', () => {
    const onOpenAttention = vi.fn()
    panel({
      away: { ...live(), waiting: live().waiting.slice(0, 1) },
      onScreenAttention: [{ id: 't-logo', title: 'Logo da padaria' }],
      onOpenAttention,
    })
    expect(screen.queryByText('1 coisa espera você')).toBeNull()
    const waiting = screen.getByRole('heading', { name: 'Espera você' }).parentElement!
    expect(waiting.textContent).toContain('1 coisa espera você')
    expect(waiting.textContent).toContain('Ver em Precisa de você')
    expect(within(waiting).queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByRole('heading', { name: 'Ficou pronto' })).toBeTruthy()
    fireEvent.click(within(waiting).getByRole('button', { name: 'Ver em Precisa de você' }))
    expect(onOpenAttention).toHaveBeenCalledTimes(1)
  })

  it('"Ficou pronto": o texto do host; sem título real da tarefa o botão é neutro e o id nunca aparece', () => {
    panel()
    const done = screen.getByRole('heading', { name: 'Ficou pronto' }).parentElement!
    expect(within(done).getByText('Nina entregou o logo novo.')).toBeTruthy()
    expect(within(done).getByRole('button', { name: 'Abrir tarefa Logo da padaria' })).toBeTruthy()
    expect(within(done).getByRole('button', { name: 'Abrir a tarefa' })).toBeTruthy()
    // a delivery whose host text is only the title reads as a sentence, and the button does not repeat the title
    expect(within(done).getByText('Nina entregou “Capa do cardápio”')).toBeTruthy()
    expect(within(done).getByRole('button', { name: 'Abrir tarefa Capa do cardápio' }).textContent).toBe('Ver tarefa')
    expect(document.body.textContent).not.toContain('subject-geral')
  })

  it('sem quem abrir não há botão morto', () => {
    panel({ onOpenTask: undefined, onOpenApproval: undefined })
    expect(screen.queryByRole('button', { name: /^Abrir/u })).toBeNull()
    expect(screen.getByRole('button', { name: 'Entendi' })).toBeTruthy()
  })

  it('"Entendi" some com o cartão e avisa o host uma vez', () => {
    const handlers = panel()
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }))
    expect(handlers.onDismiss).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('heading', { name: 'Enquanto você estava fora' })).toBeNull()
  })

  it('nada a mostrar (ou já dispensado: null) = sem cartão; sem away ligado, o caminho antigo com os eventos continua', () => {
    panel({ away: null })
    expect(screen.queryByRole('heading', { name: 'Enquanto você estava fora' })).toBeNull()
    cleanup()
    panel({ away: { ...live(), done: [], waiting: [] } })
    expect(screen.queryByRole('heading', { name: 'Enquanto você estava fora' })).toBeNull()
    cleanup()
    render(<AwayWhileOutPanel t={t} events={[{ id: 'x', body: 'Algo aconteceu.' }]} />)
    expect(screen.getByText('Algo aconteceu.')).toBeTruthy()
  })
})

// ── the live store ──────────────────────────────────────────────────────────────────────────────
type Result = { ok: true; value: unknown }
const ok = (value: unknown): Promise<Result> => Promise.resolve({ ok: true, value })

describe('loja: dispensar o cartão', () => {
  let store: PersonaLiveStore | undefined
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
  afterEach(() => { store?.dispose(); store = undefined; vi.useRealTimers() })

  function host(view: () => unknown, dismiss: () => unknown) {
    const stream = { async* [Symbol.asyncIterator]() { yield { kind: 'baseline', events: [], order: [] } } }
    return {
      listProjects: () => ok([{ id: 'proj-pessoal' }]),
      listChannels: () => ok([{ id: 'geral', name: 'geral' }]),
      getOnboarding: () => ok({ firstUse: false, completed: true, personalProjectId: 'proj-pessoal', hasPersonalProject: true }),
      ping: () => ok({ protocol: 1 }),
      getOverviewNow: () => ok({ personas: [] }),
      getWhileAway: () => ok(view()),
      dismissWhileAway: () => ok(dismiss()),
      getOverview: () => ok({ needsYou: [], inProgress: [] }),
      listTeam: () => ok({ personas: (TEAM as unknown as { personas: unknown[] }).personas, members: [{ id: 'ana', workspaceId: 'ws', displayName: 'Ana', handle: 'ana', role: 'owner' }] }),
      listTasks: () => ok([]),
      listMessages: () => ok({ events: [] }),
      listDms: () => ok([]),
      markVisit: () => ok(true),
      followMessages: () => stream,
      listApprovals: () => ok([]),
      listGestorPlans: () => ok([]),
    }
  }

  it('o host entrega a janela; "Entendi" esconde NA HORA, chama o host e a mesma janela não volta na próxima leitura', async () => {
    let window: unknown = VIEW
    const dismiss = vi.fn(() => { window = { since: new Date().toISOString(), events: [], waiting: [] }; return true })
    store = createPersonaLiveStore(host(() => window, dismiss) as never)
    await store.bootstrap(() => {})
    expect(store.observable.getSnapshot().away?.waiting).toHaveLength(3)

    await store.dismissWhileAway?.()
    expect(dismiss).toHaveBeenCalledTimes(1)
    expect(store.observable.getSnapshot().away ?? null).toBeNull()
    // a nova janela está vazia: continua sem cartão
    await store.refresh()
    expect(store.observable.getSnapshot().away ?? null).toBeNull()
  })

  it('se o host ainda devolver a MESMA janela (ainda não reiniciou), ela continua escondida', async () => {
    store = createPersonaLiveStore(host(() => VIEW, () => true) as never)
    await store.bootstrap(() => {})
    await store.dismissWhileAway?.()
    await store.refresh()
    expect(store.observable.getSnapshot().away ?? null).toBeNull()
  })

  it('host antigo (só events, sem since/waiting/dismiss): mostra as entregas e não quebra', async () => {
    const old = host(() => ({ events: VIEW.events }), () => true) as Record<string, unknown>
    delete old.dismissWhileAway
    store = createPersonaLiveStore(old as never)
    await store.bootstrap(() => {})
    expect(store.observable.getSnapshot().away?.done).toHaveLength(3)
    await expect(store.dismissWhileAway?.()).resolves.toBeUndefined()
    expect(store.observable.getSnapshot().away ?? null).toBeNull()
  })
})
