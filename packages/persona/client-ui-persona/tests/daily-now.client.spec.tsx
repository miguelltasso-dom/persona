// @vitest-environment jsdom
// "Resumir o dia" (EQUIPE-REAL-SPEC §(b) "O resumo a pedido", Muse; `postDailyBriefNow` do Bolt): o botão na Visão geral, a frase por `outcome`, ir ao
// cartão e piscar 1× (posted/already), o título "Resumo do dia · {hora}" sem o spot depois das 12:00 e o método do liveStore (sem requestId = o cartão do dia).
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMemo } from 'react'
import { DailyBriefCard, dailyBriefMoment, dailyBriefShowsLate } from '../src/client/chat/DailyBriefCard.tsx'
import type { GeneralChannelViewProps } from '../src/client/chat/GeneralChannelView.tsx'
import {
  FOCUS_PULSE_ATTRIBUTE, clearMessageFocus, pendingMessageFocus, requestMessageFocus, useMessageFocus,
} from '../src/client/chat/message-focus.ts'
import { OverviewView, type OverviewViewProps } from '../src/client/overview/OverviewView.tsx'
import { planDailyNow } from '../src/client/overview/daily-now.ts'
import { createPersonaLiveStore, type PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'
import { mapDailyBrief, type DailyBriefUi } from '../src/client/remote/map-host-ui.ts'
import type { DailyBriefWire, MessageView, TeamView } from '../src/client/remote/persona-remote-types.ts'
import { en as shellEn, pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { ILLUSTRATIONS } from '../src/client/assets/generated-imports.ts'

installPreviewTheme()
beforeEach(() => { clearMessageFocus() })
afterEach(() => { cleanup(); clearMessageFocus(); vi.useRealTimers() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellPt, key, params)) as OverviewViewProps['t']
const tEn = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellEn, key, params)) as OverviewViewProps['t']
const chatT = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as GeneralChannelViewProps['t']

const askWith = (outcome: string, messageId?: string) => vi.fn(async () => ({ outcome, ...(messageId === undefined ? {} : { messageId }) }))

function overview(props: Partial<OverviewViewProps> = {}): ReturnType<typeof render> {
  return render(
    <PreviewFrame brandLabel="Persona">
      <OverviewView t={t} nowRows={[]} awayEvents={[]} onNavigate={vi.fn()} {...props} />
    </PreviewFrame>,
  )
}
const askButton = (): HTMLButtonElement => screen.getByRole('button', { name: /^(Resumir o dia|Resumindo…)$/u }) as HTMLButtonElement

describe('planDailyNow: um plano por outcome do host', () => {
  it('posted vai ao cartão, sem aviso', () => {
    expect(planDailyNow({ outcome: 'posted', messageId: 'm-1' })).toEqual({ kind: 'go', messageId: 'm-1' })
  })
  it('already: aviso neutro com "Ver", que leva ao cartão do dia', () => {
    expect(planDailyNow({ outcome: 'already', messageId: 'm-2' })).toEqual({
      kind: 'notice', textKey: 'daily.alreadyPosted', tone: 'neutral', action: { kind: 'see', labelKey: 'daily.see', messageId: 'm-2' },
    })
  })
  it('nothing-to-say: aviso neutro, sem ação', () => {
    expect(planDailyNow({ outcome: 'nothing-to-say' })).toEqual({ kind: 'notice', textKey: 'daily.nothingYet', tone: 'neutral' })
  })
  it('off: "pausado" com Retomar SÓ se o host aceita retomar; senão sem ação', () => {
    expect(planDailyNow({ outcome: 'off' })).toEqual({ kind: 'notice', textKey: 'daily.paused', tone: 'neutral' })
    expect(planDailyNow({ outcome: 'off' }, { canResume: true })).toEqual({
      kind: 'notice', textKey: 'daily.paused', tone: 'neutral', action: { kind: 'resume', labelKey: 'daily.resume' },
    })
  })
  it('no-coordination: "Ver a equipe"; no-channel: sem ação', () => {
    expect(planDailyNow({ outcome: 'no-coordination' })).toEqual({
      kind: 'notice', textKey: 'daily.noCoordination', tone: 'neutral', action: { kind: 'team', labelKey: 'daily.seeTeam' },
    })
    expect(planDailyNow({ outcome: 'no-channel' })).toEqual({ kind: 'notice', textKey: 'daily.noChannel', tone: 'neutral' })
  })
  it('um outcome que esta versão não conhece vira a frase honesta de "não deu agora" (nunca texto cru do host)', () => {
    expect(planDailyNow({ outcome: 'algo-novo' })).toEqual({
      kind: 'notice', textKey: 'daily.failed', tone: 'warning', action: { kind: 'retry', labelKey: 'daily.retry' },
    })
  })
})

describe('o botão "Resumir o dia" na Visão geral', () => {
  it('existe só com o handler (host sem o pedido = sem botão morto), ao lado de "Nova tarefa"', () => {
    overview()
    expect(screen.queryByRole('button', { name: 'Resumir o dia' })).toBeNull()
    cleanup()
    overview({ onAskDailyBrief: askWith('posted', 'm-1') })
    expect(askButton().textContent).toContain('Resumir o dia')
    expect(screen.getByRole('button', { name: /Nova tarefa/u })).toBeTruthy()
    // secundário e pequeno, com o ícone bom-dia (mascara de ícone aria-hidden)
    expect(askButton().querySelector('[aria-hidden="true"][style*="--persona-icon-url"]')).toBeTruthy()
  })

  it('o rótulo em inglês', () => {
    overview({ t: tEn, onAskDailyBrief: askWith('posted', 'm-1') })
    expect(screen.getByRole('button', { name: 'Sum up the day' })).toBeTruthy()
  })

  it('durante a chamada fica "Resumindo…" e desabilitado; o 2º clique não pede de novo', async () => {
    let finish: (value: { outcome: string; messageId?: string }) => void = () => undefined
    const ask = vi.fn(() => new Promise<{ outcome: string; messageId?: string }>((resolve) => { finish = resolve }))
    overview({ onAskDailyBrief: ask })
    fireEvent.click(askButton())
    await waitFor(() => { expect(askButton().textContent).toContain('Resumindo…') })
    expect(askButton().disabled).toBe(true)
    fireEvent.click(askButton())
    expect(ask).toHaveBeenCalledTimes(1)
    await act(async () => { finish({ outcome: 'nothing-to-say' }) })
    await waitFor(() => { expect(askButton().textContent).toContain('Resumir o dia') })
    expect(askButton().disabled).toBe(false)
  })

  it('posted: vai ao #geral e pede o foco no cartão novo; SEM aviso', async () => {
    const onNavigate = vi.fn()
    overview({ onAskDailyBrief: askWith('posted', 'brief-9'), onNavigate })
    fireEvent.click(askButton())
    await waitFor(() => { expect(onNavigate).toHaveBeenCalledWith('channels') })
    expect(pendingMessageFocus()).toBe('brief-9')
    // nenhum Toast: a região de avisos do resumo nem existe
    expect(screen.queryByLabelText('Avisos do resumo do dia')).toBeNull()
  })

  it('already: aviso "O resumo de hoje já está no #geral" com Ver, que leva ao cartão', async () => {
    const onNavigate = vi.fn()
    overview({ onAskDailyBrief: askWith('already', 'brief-3'), onNavigate })
    fireEvent.click(askButton())
    expect(await screen.findByText('O resumo de hoje já está no #geral')).toBeTruthy()
    expect(onNavigate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Ver' }))
    expect(onNavigate).toHaveBeenCalledWith('channels')
    expect(pendingMessageFocus()).toBe('brief-3')
    expect(screen.queryByText('O resumo de hoje já está no #geral')).toBeNull()
  })

  it('nothing-to-say: "Ainda não há o que resumir hoje." e nada mais (nem ação, nem navegação)', async () => {
    const onNavigate = vi.fn()
    overview({ onAskDailyBrief: askWith('nothing-to-say'), onNavigate })
    fireEvent.click(askButton())
    expect(await screen.findByText('Ainda não há o que resumir hoje.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ver' })).toBeNull()
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('off: "O resumo do dia está pausado." sem ação quando o host não retoma; com Retomar quando o handler existe', async () => {
    overview({ onAskDailyBrief: askWith('off') })
    fireEvent.click(askButton())
    expect(await screen.findByText('O resumo do dia está pausado.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Retomar' })).toBeNull()
    cleanup()
    const onResume = vi.fn()
    overview({ onAskDailyBrief: askWith('off'), onResumeDailyBrief: onResume })
    fireEvent.click(askButton())
    fireEvent.click(await screen.findByRole('button', { name: 'Retomar' }))
    expect(onResume).toHaveBeenCalledTimes(1)
  })

  it('no-coordination: "Ver a equipe" abre a Equipe', async () => {
    const onNavigate = vi.fn()
    overview({ onAskDailyBrief: askWith('no-coordination'), onNavigate })
    fireEvent.click(askButton())
    expect(await screen.findByText('Para resumir o dia, a equipe precisa de uma Coordenação.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver a equipe' }))
    expect(onNavigate).toHaveBeenCalledWith('team')
  })

  it('no-channel: a frase honesta, sem ação', async () => {
    overview({ onAskDailyBrief: askWith('no-channel') })
    fireEvent.click(askButton())
    expect(await screen.findByText('O resumo aparece no #geral, que não está disponível agora.')).toBeTruthy()
  })

  it('o pedido que falha (host fora) mostra a frase honesta de atenção, o botão volta e o Toast tem "Tentar de novo"', async () => {
    const ask = vi.fn(async () => { throw new Error('host fora') })
    overview({ onAskDailyBrief: ask })
    fireEvent.click(askButton())
    expect(await screen.findByText('Não consegui pedir o resumo agora. Tente de novo.')).toBeTruthy()
    expect(askButton().disabled).toBe(false)
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
    expect(ask).toHaveBeenCalledTimes(1)
  })

  it('"Tentar de novo" pede de novo: se agora dá certo, o aviso some e a tela vai ao cartão', async () => {
    const onNavigate = vi.fn()
    let attempt = 0
    const ask = vi.fn(async () => {
      attempt += 1
      if (attempt === 1) throw new Error('rede')
      return { outcome: 'posted', messageId: 'brief-retry' }
    })
    overview({ onAskDailyBrief: ask, onNavigate })
    fireEvent.click(askButton())
    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() => { expect(onNavigate).toHaveBeenCalledWith('channels') })
    expect(ask).toHaveBeenCalledTimes(2)
    expect(pendingMessageFocus()).toBe('brief-retry')
    expect(screen.queryByText('Não consegui pedir o resumo agora. Tente de novo.')).toBeNull()
  })

  it('"Tentar de novo" só existe na falha (nenhum outro aviso a oferece)', async () => {
    overview({ onAskDailyBrief: askWith('nothing-to-say') })
    fireEvent.click(askButton())
    expect(await screen.findByText('Ainda não há o que resumir hoje.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull()
  })

  it('o aviso some sozinho (8 s) e a pessoa também pode fechá-lo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    overview({ onAskDailyBrief: askWith('nothing-to-say') })
    fireEvent.click(askButton())
    expect(await screen.findByText('Ainda não há o que resumir hoje.')).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(8_100) })
    expect(screen.queryByText('Ainda não há o que resumir hoje.')).toBeNull()
    fireEvent.click(askButton())
    expect(await screen.findByText('Ainda não há o que resumir hoje.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByText('Ainda não há o que resumir hoje.')).toBeNull()
  })
})

describe('message-focus: ir até a mensagem e piscar 1×', () => {
  function List({ ids }: { readonly ids: readonly string[] }) {
    useMessageFocus(useMemo(() => ids, [ids]))
    return <ol>{ids.map(id => <li key={id} data-message-id={id}>{id}</li>)}</ol>
  }

  it('o pedido espera a mensagem chegar pelo fio; ao chegar, rola até ela e marca o pisco', async () => {
    const scroll = vi.fn()
    HTMLElement.prototype.scrollIntoView = scroll
    requestMessageFocus('brief-1')
    const view = render(<List ids={['m-1']} />)
    expect(document.querySelector(`[${FOCUS_PULSE_ATTRIBUTE}]`)).toBeNull()
    expect(pendingMessageFocus()).toBe('brief-1')
    view.rerender(<List ids={['m-1', 'brief-1']} />)
    await waitFor(() => { expect(document.querySelector('[data-message-id="brief-1"]')?.hasAttribute(FOCUS_PULSE_ATTRIBUTE)).toBe(true) })
    expect(scroll).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-message-id="m-1"]')?.hasAttribute(FOCUS_PULSE_ATTRIBUTE)).toBe(false)
    expect(pendingMessageFocus()).toBeUndefined()
  })

  it('o pisco sai com a animação (animationend)', async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
    requestMessageFocus('brief-1')
    render(<List ids={['brief-1']} />)
    const row = document.querySelector('[data-message-id="brief-1"]')!
    await waitFor(() => { expect(row.hasAttribute(FOCUS_PULSE_ATTRIBUTE)).toBe(true) })
    fireEvent.animationEnd(row)
    expect(row.hasAttribute(FOCUS_PULSE_ATTRIBUTE)).toBe(false)
  })

  it('um pedido que ninguém atendeu em 15 s expira (a pessoa já foi para outro lugar)', () => {
    vi.useFakeTimers()
    requestMessageFocus('brief-1')
    expect(pendingMessageFocus()).toBe('brief-1')
    vi.advanceTimersByTime(15_100)
    expect(pendingMessageFocus()).toBeUndefined()
  })

  it('a tela já montada também atende um pedido novo (Ver no aviso com o canal aberto)', async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
    render(<List ids={['brief-5']} />)
    expect(document.querySelector(`[${FOCUS_PULSE_ATTRIBUTE}]`)).toBeNull()
    act(() => { requestMessageFocus('brief-5') })
    await waitFor(() => { expect(document.querySelector('[data-message-id="brief-5"]')?.hasAttribute(FOCUS_PULSE_ATTRIBUTE)).toBe(true) })
  })
})

const TEAM = {
  personas: [{ id: 'persona-atlas', name: 'Atlas', avatarRef: 'atlas', title: 'Coordenação', systemRoles: ['coordination'] }, { id: 'persona-nina', name: 'Nina', avatarRef: 'nina', title: 'Pesquisa' }],
  members: [],
} as unknown as TeamView
const wire = (): DailyBriefWire => ({
  day: '2026-11-05', coordinatorPersonaId: 'persona-atlas',
  yesterday: [{ taskId: 'task-1', personaId: 'persona-nina', title: 'Pesquisa de preços' }], today: [], needsYou: { count: 1 }, paused: false, routineId: 'routine-morning',
})
const briefAt = (occurredAt: string | undefined, variant?: 'morning' | 'on-demand'): DailyBriefUi => mapDailyBrief({
  dailyBrief: { ...wire(), ...(variant === undefined ? {} : { variant }) }, ...(occurredAt === undefined ? {} : { occurredAt }),
} as unknown as MessageView, TEAM)!
/** Um instante LOCAL (a regra é a hora local da pessoa): evita depender do fuso da máquina de teste. */
const localIso = (hour: number, minute = 0): string => new Date(2026, 10, 5, hour, minute, 0).toISOString()

describe('o título do cartão segue o momento (depois das 12:00 = "Resumo do dia · {hora}", sem o spot)', () => {
  it('dailyBriefMoment: antes do meio-dia é da manhã; depois é "tarde" com a hora local HH:MM', () => {
    expect(dailyBriefMoment(localIso(8, 5))).toEqual({ late: false, time: '08:05' })
    expect(dailyBriefMoment(localIso(11, 59))).toEqual({ late: false, time: '11:59' })
    expect(dailyBriefMoment(localIso(12, 0))).toEqual({ late: true, time: '12:00' })
    expect(dailyBriefMoment(localIso(16, 40))).toEqual({ late: true, time: '16:40' })
    expect(dailyBriefMoment(undefined)).toEqual({ late: false, time: '' })
    expect(dailyBriefMoment('não é data')).toEqual({ late: false, time: '' })
  })

  it('o automático da manhã segue "Bom dia · {dia}" com o spot do sol nascendo', () => {
    const { container } = render(<DailyBriefCard t={chatT} brief={briefAt(localIso(8))} rowTag="div" />)
    expect(container.querySelector('article')!.getAttribute('aria-label')).toMatch(/^Bom dia · /u)
    expect(container.querySelector('[data-daily-spot]')).toBeTruthy()
  })

  it('o pedido à mão depois das 12:00 diz "Resumo do dia · 16:40", com o ícone e SEM o spot', () => {
    const { container } = render(<DailyBriefCard t={chatT} brief={briefAt(localIso(16, 40))} rowTag="div" />)
    expect(container.querySelector('article')!.getAttribute('aria-label')).toBe('Resumo do dia · 16:40')
    expect(container.querySelector('[data-daily-spot]')).toBeNull()
    expect(container.querySelector('[aria-hidden="true"][style*="--persona-icon-url"]')).toBeTruthy()
    // as seções não mudam
    expect(container.textContent).toContain('Ontem')
  })

  it('o TIPO do motor (`variant`) manda nos dois sentidos, a hora do cartão só dá o "{hora}" (Tally, contracts/morning-brief.md)', () => {
    // pedido à mão às 08:05 já é on-demand: o motor decide, a tela não adivinha
    const onDemand = render(<DailyBriefCard t={chatT} brief={briefAt(localIso(8, 5), 'on-demand')} rowTag="div" />)
    expect(onDemand.container.querySelector('article')!.getAttribute('aria-label')).toBe('Resumo do dia · 08:05')
    expect(onDemand.container.querySelector('[data-daily-spot]')).toBeNull()
    onDemand.unmount()
    // um cartão `morning` postado às 16:40 segue "Bom dia" com o spot (o motor mandou)
    const morning = render(<DailyBriefCard t={chatT} brief={briefAt(localIso(16, 40), 'morning')} rowTag="div" />)
    expect(morning.container.querySelector('article')!.getAttribute('aria-label')).toMatch(/^Bom dia · /u)
    expect(morning.container.querySelector('[data-daily-spot]')).toBeTruthy()
  })

  it('`variant` lido da mensagem do host; valor desconhecido é ignorado (cai na reserva da hora)', () => {
    expect(briefAt(localIso(8), 'on-demand').variant).toBe('on-demand')
    expect(briefAt(localIso(8), 'morning').variant).toBe('morning')
    expect(briefAt(localIso(8), 'noite' as never).variant).toBeUndefined()
    expect(briefAt(localIso(8)).variant).toBeUndefined()
  })

  it('dailyBriefShowsLate: o tipo vence; sem tipo, a hora em que foi postado (a rotina da manhã nunca posta depois das 12:00)', () => {
    expect(dailyBriefShowsLate({ variant: 'on-demand', postedAt: localIso(8) })).toBe(true)
    expect(dailyBriefShowsLate({ variant: 'morning', postedAt: localIso(17) })).toBe(false)
    expect(dailyBriefShowsLate({ postedAt: localIso(17) })).toBe(true)
    expect(dailyBriefShowsLate({ postedAt: localIso(9) })).toBe(false)
    expect(dailyBriefShowsLate({})).toBe(false)
  })

  it('on-demand SEM a hora do cartão: só "Resumo do dia" (nunca "Resumo do dia · " pendurado)', () => {
    const { container } = render(<DailyBriefCard t={chatT} brief={briefAt(undefined, 'on-demand')} rowTag="div" />)
    expect(container.querySelector('article')!.getAttribute('aria-label')).toBe('Resumo do dia')
  })

  it('sem o instante do host vale o da manhã (nunca inventa uma hora)', () => {
    const { container } = render(<DailyBriefCard t={chatT} brief={briefAt(undefined)} rowTag="div" />)
    expect(container.querySelector('article')!.getAttribute('aria-label')).toMatch(/^Bom dia · /u)
  })

  it('o mapper guarda o instante do host (occurredAt) e o cartão leva o id da mensagem para o foco', () => {
    expect(briefAt('2026-11-05T15:00:00.000Z').postedAt).toBe('2026-11-05T15:00:00.000Z')
    expect(briefAt('lixo').postedAt).toBeUndefined()
    const { container } = render(<DailyBriefCard t={chatT} brief={briefAt(localIso(8))} messageId="brief-77" rowTag="div" />)
    expect(container.querySelector('[data-daily-brief]')!.getAttribute('data-message-id')).toBe('brief-77')
  })

  it('o título "Resumo do dia · {hora}" existe em inglês e o spot continua sendo a ilustração do sol nascendo na manhã', () => {
    expect(bindLocale(shellEn as never, 'daily.askNow')).toBe('Sum up the day')
    expect(ILLUSTRATIONS['spot-bom-dia']).toBeTruthy()
  })
})

describe('o CSS do pisco 1× respeita "reduzir movimento"', () => {
  it('anima 1× e, em prefers-reduced-motion, fica só o anel parado', () => {
    const css = readFileSync(join(import.meta.dirname, '../src/client/chat/DailyBriefCard.module.css'), 'utf8').replaceAll('\r\n', '\n')
    expect(css).toMatch(/\.row\[data-focus-pulse\] \.card \{\n  animation: dailyFocus 1200ms var\(--ease-standard\) 1;/u)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\n[^]*\.row\[data-focus-pulse\] \.card \{\n    animation: none;\n    outline: 3px solid/u)
  })
})

type Result = { ok: true; value: unknown } | { ok: false; error: { code: string; message: string } }
const ok = (value: unknown): Promise<Result> => Promise.resolve({ ok: true, value })

describe('liveStore.postDailyBriefNow', () => {
  let live: PersonaLiveStore | undefined
  afterEach(() => { live?.dispose(); live = undefined })

  function build(extra: Record<string, unknown> = {}): Record<string, unknown> {
    const stream = { async* [Symbol.asyncIterator]() { yield { kind: 'baseline', events: [], order: [] } } }
    return {
      listProjects: () => ok([{ id: 'proj-pessoal' }]),
      listChannels: () => ok([{ id: 'geral', name: 'geral' }]),
      getOnboarding: () => ok({ firstUse: false, completed: true, personalProjectId: 'proj-pessoal', hasPersonalProject: true }),
      ping: () => ok({ protocol: 1 }),
      getOverviewNow: () => ok({ personas: [] }),
      getWhileAway: () => ok({ events: [] }),
      getOverview: () => ok({ needsYou: [], inProgress: [] }),
      listTeam: () => ok({ personas: [], members: [{ id: 'ana', workspaceId: 'ws', displayName: 'Ana', handle: 'ana', role: 'owner' }] }),
      listTasks: () => ok([]),
      listMessages: () => ok({ events: [] }),
      listDms: () => ok([]),
      markVisit: () => ok(true),
      followMessages: () => stream,
      listApprovals: () => ok([]),
      listGestorPlans: () => ok([]),
      ...extra,
    }
  }

  it('sem requestId pede o cartão do DIA (idempotente), no escopo do projeto, e devolve o outcome e o messageId', async () => {
    const postDailyBriefNow = vi.fn(() => ok({ outcome: 'posted', messageId: 'morning-brief:proj-pessoal:2026-11-05', text: 'Resumo do dia.' }))
    live = createPersonaLiveStore(build({ postDailyBriefNow }) as never)
    await live.bootstrap(() => {})
    const view = await live.postDailyBriefNow!()
    expect(view).toMatchObject({ outcome: 'posted', messageId: 'morning-brief:proj-pessoal:2026-11-05' })
    expect(postDailyBriefNow).toHaveBeenCalledTimes(1)
    const request = (postDailyBriefNow.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    expect(request).toMatchObject({ projectId: 'proj-pessoal' })
    expect(typeof request.workspaceId).toBe('string')
    expect('requestId' in request).toBe(false)
  })

  it('com requestId leva a chave (um cartão extra próprio)', async () => {
    const postDailyBriefNow = vi.fn(() => ok({ outcome: 'posted', messageId: 'x', text: '' }))
    live = createPersonaLiveStore(build({ postDailyBriefNow }) as never)
    await live.bootstrap(() => {})
    await live.postDailyBriefNow!('resuma-1')
    expect((postDailyBriefNow.mock.calls[0] as unknown as [Record<string, unknown>])[0]).toMatchObject({ requestId: 'resuma-1' })
  })

  it('host sem o pedido: rejeita (o botão nem existe sem o método, e a tela mostra a frase honesta se chegar a chamar)', async () => {
    live = createPersonaLiveStore(build() as never)
    await live.bootstrap(() => {})
    await expect(live.postDailyBriefNow!()).rejects.toThrow()
  })
})
