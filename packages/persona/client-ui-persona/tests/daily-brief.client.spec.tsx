// @vitest-environment jsdom
// D-090 / EQUIPE-REAL-SPEC §(b) (TEAM-7): o cartão "Bom dia" no #geral. Estruturado (não prosa), sem IA, atrás de `persona.flag.teamwork`:
// Ontem (até 3 + "e mais n"), Hoje, Precisa de você; seção vazia não aparece; recolhível; 320 px + "Ver tudo"; "⋯ → Pausar".
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DailyBriefCard, DAILY_MAX_HEIGHT_PX, joinParts, weekdayLabel } from '../src/client/chat/DailyBriefCard.tsx'
import { MessageList, type GeneralChannelViewProps } from '../src/client/chat/GeneralChannelView.tsx'
import { TEAMWORK_FLAG_KEY, isTeamworkEnabled } from '../src/client/chat/teamwork-flag.ts'
import { mapDailyBrief, mapMessage, type ChannelMessageUi, type DailyBriefUi } from '../src/client/remote/map-host-ui.ts'
import type { DailyBriefWire, MessageView, TeamView } from '../src/client/remote/persona-remote-types.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { hostMessage } from './message-view-fixture.client.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}
beforeEach(() => { localStorage.clear() })
afterEach(() => {
  cleanup()
  localStorage.clear()
  delete (window as unknown as { __PERSONA_FLAGS__?: unknown }).__PERSONA_FLAGS__
})

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as GeneralChannelViewProps['t']

const TEAM = {
  personas: [
    { id: 'persona-atlas', name: 'Atlas', avatarRef: 'atlas', title: 'Coordenação', systemRoles: ['coordination'] },
    { id: 'persona-nina', name: 'Nina', avatarRef: 'nina', title: 'Pesquisa' },
    { id: 'persona-bento', name: 'Bento', avatarRef: 'bento', title: 'Texto' },
    { id: 'persona-luna', name: 'Luna', avatarRef: 'luna', title: 'Design' },
  ],
  members: [{ id: 'ana', workspaceId: 'ws', displayName: 'Ana', handle: 'ana', role: 'owner' }],
} as unknown as TeamView

const wire = (extra: Partial<DailyBriefWire> = {}): DailyBriefWire => ({
  day: '2026-11-05',
  coordinatorPersonaId: 'persona-atlas',
  yesterday: [
    { taskId: 'task-1', personaId: 'persona-nina', title: 'Pesquisa de preços' },
    { taskId: 'task-2', personaId: 'persona-bento', title: 'Texto do cardápio' },
  ],
  today: [{ taskId: 'task-3', personaId: 'persona-nina', title: 'Logo da padaria' }],
  needsYou: { count: 2 },
  paused: false,
  routineId: 'routine-morning',
  ...extra,
})

const brief = (extra: Partial<DailyBriefWire> = {}): DailyBriefUi => mapDailyBrief({ dailyBrief: wire(extra) } as unknown as MessageView, TEAM)!

describe('mapDailyBrief', () => {
  it('mapeia o resumo: dia, Coordenação (rosto), linhas com a persona do time e o título da tarefa', () => {
    expect(brief()).toMatchObject({
      day: '2026-11-05', coordinatorName: 'Atlas', coordinatorCharacterId: 'atlas', waitingCount: 2, routineId: 'routine-morning',
      yesterday: [{ taskId: 'task-1', title: 'Pesquisa de preços', personaName: 'Nina', characterId: 'nina' }, { taskId: 'task-2', personaName: 'Bento' }],
      today: [{ taskId: 'task-3', title: 'Logo da padaria', personaName: 'Nina' }],
    })
  })

  it('título com cara de id some a linha (nunca o id na tela); persona fora do time fica sem rosto', () => {
    const mapped = brief({
      yesterday: [{ taskId: 'task-1', personaId: 'persona-nina', title: 'task-9f3a' }, { taskId: 'task-2', personaId: 'persona-desconhecida', title: 'Revisar contrato' }],
    })
    expect(mapped.yesterday).toHaveLength(1)
    expect(mapped.yesterday[0]).toMatchObject({ title: 'Revisar contrato' })
    expect(mapped.yesterday[0]).not.toHaveProperty('personaName')
  })

  it('sem nada a dizer (sem ontem, sem hoje, ninguém esperando) não há cartão', () => {
    expect(mapDailyBrief({ dailyBrief: wire({ yesterday: [], today: [], needsYou: { count: 0 } }) } as unknown as MessageView, TEAM)).toBeUndefined()
    expect(mapDailyBrief({} as MessageView, TEAM)).toBeUndefined()
  })

  it('contagem estranha vira 0 (nunca NaN nem negativa); mapMessage carrega o resumo', () => {
    expect(brief({ needsYou: { count: -3 } }).waitingCount).toBe(0)
    expect(brief({ needsYou: { count: Number.NaN } }).waitingCount).toBe(0)
    const row = mapMessage(hostMessage({ id: 'm1', seq: 1, actorId: 'persona-atlas', body: 'Bom dia', subjectId: '', occurredAt: '2026-11-05T09:00:00.000Z', dailyBrief: wire() } as never), TEAM, 'ana')
    expect(row.dailyBrief).toMatchObject({ day: '2026-11-05', waitingCount: 2 })
  })
})

describe('weekdayLabel', () => {
  it('o dia da semana em português a partir da data (sem cair no dia vizinho por fuso)', () => {
    expect(weekdayLabel('2026-11-05')).toBe('quinta-feira')
    expect(weekdayLabel('2026-11-02')).toBe('segunda-feira')
    expect(weekdayLabel('lixo')).toBe('')
  })
})

describe('DailyBriefCard', () => {
  const card = (b: DailyBriefUi, extra: Partial<Parameters<typeof DailyBriefCard>[0]> = {}) => render(<DailyBriefCard t={t} brief={b} rowTag="div" {...extra} />)

  it('as 3 seções com as palavras certas, o eyebrow com o dia da semana e o rosto da Coordenação', () => {
    card(brief())
    expect(screen.getByRole('article', { name: 'Bom dia · quinta-feira' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Ontem' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Hoje' })).toBeTruthy()
    expect(screen.getByText('Nina terminou Pesquisa de preços')).toBeTruthy()
    expect(screen.getByText('Bento terminou Texto do cardápio')).toBeTruthy()
    expect(screen.getByText('Nina: Logo da padaria')).toBeTruthy()
    expect(screen.getByText('2 coisas esperam você')).toBeTruthy()
  })

  it('seção sem nada não aparece (sem "Hoje", sem "Precisa de você")', () => {
    card(brief({ today: [], needsYou: { count: 0 } }))
    expect(screen.getByRole('heading', { name: 'Ontem' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Hoje' })).toBeNull()
    expect(screen.queryByText(/esperam você|espera você/u)).toBeNull()
  })

  it('1 coisa: singular', () => {
    card(brief({ needsYou: { count: 1 } }))
    expect(screen.getByText('1 coisa espera você')).toBeTruthy()
  })

  it('o "e mais n" vem do host (yesterdayMore, ele corta em 3) e soma com o que passar de 3 aqui', () => {
    expect(brief({ yesterdayMore: 4 }).yesterdayMore).toBe(4)
    expect(brief({ yesterdayMore: -2 }).yesterdayMore).toBe(0)
    expect(brief({ yesterday: [], yesterdayMore: 4 }).yesterdayMore).toBe(0)
    card(brief({ yesterdayMore: 4 }))
    expect(screen.getByText('e mais 4').tagName).toBe('P')
  })

  it('"Ontem" mostra até 3 linhas e "e mais n" (texto puro sem destino; link para Quadros com destino)', () => {
    const many = brief({ yesterday: [1, 2, 3, 4, 5].map(n => ({ taskId: `task-${n}`, personaId: 'persona-nina', title: `Tarefa ${n} pronta` })) })
    const { unmount } = card(many)
    expect(screen.getAllByText(/terminou Tarefa/u)).toHaveLength(3)
    expect(screen.getByText('e mais 2').tagName).toBe('P')
    unmount()
    const board = vi.fn()
    card(many, { onOpenBoard: board })
    fireEvent.click(screen.getByRole('button', { name: 'e mais 2' }))
    expect(board).toHaveBeenCalledTimes(1)
  })

  it('"Ver" abre Aprovações só quando há destino (nenhum botão morto)', () => {
    const { unmount } = card(brief())
    expect(screen.queryByRole('button', { name: 'Ver' })).toBeNull()
    unmount()
    const approvals = vi.fn()
    card(brief(), { onOpenApprovals: approvals })
    fireEvent.click(screen.getByRole('button', { name: 'Ver' }))
    expect(approvals).toHaveBeenCalledTimes(1)
  })

  it('a linha de uma tarefa abre a tarefa no quadro quando há destino; sem destino é texto', () => {
    const open = vi.fn()
    const { unmount } = card(brief())
    expect(screen.queryByRole('button', { name: /Logo da padaria/u })).toBeNull()
    unmount()
    card(brief(), { onOpenTask: open })
    fireEvent.click(screen.getByRole('button', { name: 'Nina: Logo da padaria' }))
    expect(open).toHaveBeenCalledWith('task-3')
  })

  it('"⋯ → Pausar o resumo da manhã" leva à rotina; sem destino não há menu', () => {
    const routines = vi.fn()
    const { unmount } = card(brief())
    expect(screen.queryByRole('button', { name: 'Mais ações do resumo da manhã' })).toBeNull()
    unmount()
    card(brief(), { onOpenRoutines: routines })
    fireEvent.click(screen.getByRole('button', { name: 'Mais ações do resumo da manhã' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pausar o resumo da manhã' }))
    expect(routines).toHaveBeenCalledTimes(1)
  })

  it('recolhe e abre (aria-expanded), sem perder o cabeçalho', () => {
    card(brief())
    const toggle = screen.getByRole('button', { name: 'Recolher o resumo da manhã' })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(toggle)
    const open = screen.getByRole('button', { name: 'Abrir o resumo da manhã' })
    expect(open.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('heading', { name: 'Ontem' })).toBeNull()
    expect(screen.getByRole('article', { name: /Bom dia/u })).toBeTruthy()
    fireEvent.click(open)
    expect(screen.getByRole('heading', { name: 'Ontem' })).toBeTruthy()
  })

  it('passou de 320 px: aparece "Ver tudo" (e "Ver menos" depois); até 320 px não há', () => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
    try {
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => DAILY_MAX_HEIGHT_PX + 120 })
      const { container, unmount } = card(brief())
      const body = container.querySelector('[data-clamped]')
      expect(body).not.toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Ver tudo' }))
      expect(container.querySelector('[data-clamped]')).toBeNull()
      expect(screen.getByRole('button', { name: 'Ver menos' })).toBeTruthy()
      unmount()
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => DAILY_MAX_HEIGHT_PX })
      card(brief())
      expect(screen.queryByRole('button', { name: 'Ver tudo' })).toBeNull()
    } finally {
      if (original === undefined) delete (HTMLElement.prototype as unknown as { scrollHeight?: number }).scrollHeight
      else Object.defineProperty(HTMLElement.prototype, 'scrollHeight', original)
    }
  })

  it('nenhum id nem palavra técnica na tela', () => {
    card(brief(), { onOpenApprovals: () => undefined, onOpenRoutines: () => undefined, onOpenTask: () => undefined })
    expect(document.body.textContent).not.toMatch(/task-\d|persona-|routine-|dailyBrief|undefined/u)
  })
})

describe('no MessageList (#geral) e a flag persona.flag.teamwork', () => {
  const plain: ChannelMessageUi = { id: 'm1', authorId: 'user', authorName: 'Você', body: 'Oi', timeLabel: '08:59', reactions: [] }
  const row = (): ChannelMessageUi => ({ id: 'm2', authorId: 'atlas', authorName: 'Atlas', body: 'Bom dia! Ontem Nina terminou Pesquisa de preços.', timeLabel: '09:00', reactions: [], dailyBrief: brief() })

  it('flag desligada (padrão): a mensagem do host aparece como texto, como antes', () => {
    expect(isTeamworkEnabled()).toBe(false)
    render(<MessageList t={t} messages={[plain, row()]} />)
    expect(screen.getByText(/Bom dia! Ontem Nina terminou/u)).toBeTruthy()
    expect(document.querySelector('[data-daily-brief]')).toBeNull()
  })

  it('flag ligada: o resumo vira o cartão, em <li>, e o texto do host não repete', () => {
    localStorage.setItem(TEAMWORK_FLAG_KEY, '1')
    expect(isTeamworkEnabled()).toBe(true)
    const board = vi.fn()
    render(<MessageList t={t} messages={[plain, row()]} dailyBriefActions={{ onOpenBoard: board, onOpenTask: () => undefined }} />)
    const card = document.querySelector('[data-daily-brief]')
    expect(card).not.toBeNull()
    expect(card!.tagName).toBe('LI')
    expect(within(card as HTMLElement).getByRole('heading', { name: 'Ontem' })).toBeTruthy()
    expect(screen.queryByText(/Bom dia! Ontem Nina terminou/u)).toBeNull()
    expect(screen.getByText('Oi')).toBeTruthy()
  })

  it('a flag também liga por window.__PERSONA_FLAGS__.teamwork', () => {
    ;(window as unknown as { __PERSONA_FLAGS__: { teamwork: boolean } }).__PERSONA_FLAGS__ = { teamwork: true }
    expect(isTeamworkEnabled()).toBe(true)
  })
})

describe('trilha de patinhas entre "Ontem" e "Hoje" (Muse 22:12; atrás de houseDecor além da teamwork)', () => {
  const card = (b: DailyBriefUi) => render(<DailyBriefCard t={t} brief={b} rowTag="div" />)

  it('sem a flag houseDecor não há nenhum nó a mais (a teamwork sozinha não basta)', () => {
    card(brief())
    expect(document.querySelector('[data-house-decor="paw-trail"]')).toBeNull()
  })

  it('com a flag: um divisor aria-hidden entre as duas seções, sem texto, nunca dentro de uma seção', () => {
    localStorage.setItem('persona.flag.houseDecor', '1')
    const { container } = card(brief())
    const trail = container.querySelector('[data-house-decor="paw-trail"]') as HTMLElement
    expect(trail).not.toBeNull()
    expect(trail.getAttribute('aria-hidden')).toBe('true')
    expect(trail.textContent).toBe('')
    expect(trail.closest('section')).toBeNull()
    const sections = Array.from(container.querySelectorAll('section'))
    expect(sections).toHaveLength(3)
    // a ordem no DOM: Ontem · trilha · Hoje
    const order = Array.from(container.querySelectorAll('section, [data-house-decor="paw-trail"]'))
    expect(order.indexOf(trail)).toBe(1)
  })

  it('só existe entre as duas seções: sem "Ontem" ou sem "Hoje" não há divisor', () => {
    localStorage.setItem('persona.flag.houseDecor', '1')
    const { unmount } = card(brief({ today: [] }))
    expect(document.querySelector('[data-house-decor="paw-trail"]')).toBeNull()
    unmount()
    card(brief({ yesterday: [] }))
    expect(document.querySelector('[data-house-decor="paw-trail"]')).toBeNull()
  })
})

describe('Ontem: o pedido terminado em UM item (Muse 05/11 01:07)', () => {
  const requestItem = (extra: Record<string, unknown> = {}) => ({
    taskId: 'task-9', personaId: 'persona-atlas', title: 'Campanha de Natal',
    request: { requestId: 'req-1', title: 'Campanha de Natal', parts: ['Texto', 'Arte', 'Posts'], personaIds: ['persona-nina', 'persona-bento', 'persona-luna'], ...extra },
  })
  const card = (b: DailyBriefUi) => render(<DailyBriefCard t={t} brief={b} rowTag="div" />)
  const withRequest = (item: Record<string, unknown>, more: Partial<DailyBriefWire> = {}) => brief({ yesterday: [item as never], yesterdayMore: 0, ...more })

  it('"[rostos 16] Campanha de Natal: tudo pronto · Texto, Arte e Posts", sem o rosto da Coordenação', () => {
    const { container } = card(withRequest(requestItem()))
    const line = container.querySelector('[data-daily-request]') as HTMLElement
    expect(line.textContent).toContain('Campanha de Natal: tudo pronto')
    expect(line.textContent).toContain('Texto, Arte e Posts')
    const faces = line.querySelectorAll('img')
    expect(faces).toHaveLength(3)
    expect(line.querySelector('[role="img"]')!.getAttribute('aria-label')).toBe('Quem fez: Nina, Bento, Luna')
    // nenhum rosto da Coordenação (Atlas) no item
    expect(line.innerHTML).not.toContain('atlas')
  })

  it('mais de 3 participantes: 3 rostos + "+n"', () => {
    const team = ['persona-nina', 'persona-bento', 'persona-luna', 'persona-atlas']
    const { container } = card(withRequest(requestItem({ personaIds: team })))
    const line = container.querySelector('[data-daily-request]') as HTMLElement
    expect(line.querySelectorAll('img')).toHaveLength(3)
    expect(line.textContent).toContain('+1')
  })

  it('sem os personaIds dos participantes (ou fora do time) NENHUM rosto, e o texto continua', () => {
    const { container } = card(withRequest(requestItem({ personaIds: undefined })))
    const line = container.querySelector('[data-daily-request]') as HTMLElement
    expect(line.querySelectorAll('img')).toHaveLength(0)
    expect(line.textContent).toContain('Campanha de Natal: tudo pronto')
    const outsiders = card(withRequest(requestItem({ personaIds: ['persona-fantasma'] })))
    expect(outsiders.container.querySelectorAll('[data-daily-request] img')).toHaveLength(0)
  })

  it('parte de um pedido ainda ABERTO segue como hoje: "{nome} terminou {parte}" (com o rosto 24 da persona)', () => {
    card(brief({ yesterday: [{ taskId: 'task-1', personaId: 'persona-nina', title: 'Pesquisa de preços' }], yesterdayMore: 0 }))
    expect(screen.getByText('Nina terminou Pesquisa de preços')).toBeTruthy()
  })

  it('a frase é NEUTRA, sem gênero: "{pedido}: tudo pronto" para qualquer substantivo (Site, Vídeo, Página, Lista, Post…)', () => {
    for (const title of ['Site novo', 'Vídeo de bastidores', 'Página de contato', 'Lista de preços', 'Post de lançamento', 'Campanha de Natal', 'Cardápio da semana']) {
      const { container, unmount } = card(withRequest(requestItem({ title, parts: ['Texto'] })))
      const text = container.querySelector('[data-daily-request]')!.textContent ?? ''
      expect(text, title).toContain(`${title}: tudo pronto`)
      expect(text, title).not.toMatch(/ficou pront[oa]/u)
      unmount()
    }
  })

  it('as partes em português: "A", "A e B", "A, B e C"', () => {
    expect(joinParts(['Texto'])).toBe('Texto')
    expect(joinParts(['Texto', 'Arte'])).toBe('Texto e Arte')
    expect(joinParts(['Texto', 'Arte', 'Posts'])).toBe('Texto, Arte e Posts')
  })

  it('a linha do pedido abre a tarefa quando há destino; título com cara de id não vira item (nunca o id)', () => {
    const open = vi.fn()
    render(<DailyBriefCard t={t} brief={withRequest(requestItem())} rowTag="div" onOpenTask={open} />)
    fireEvent.click(screen.getByRole('button', { name: /Campanha de Natal: tudo pronto/u }))
    expect(open).toHaveBeenCalledWith('task-9')
    cleanup()
    const mapped = mapDailyBrief({ dailyBrief: wire({ yesterday: [{ taskId: 'task-9', personaId: 'persona-atlas', title: 'task-9f3a' }] }) } as unknown as MessageView, TEAM)
    expect(mapped?.yesterday ?? []).toHaveLength(0)
  })
})
