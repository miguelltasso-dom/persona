// @vitest-environment jsdom
// EQUIPE-REAL-SPEC §0 (Muse 05/11): o PLANO de um pedido como UM cartão vivo (o estado de cada parte muda no lugar, nunca linha nova), o cartão de ENTREGA
// por pedido e a regra "nenhum autor visível contém ':'". Atrás de persona.flag.teamwork.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeliveryCard } from '../src/client/chat/DeliveryCard.tsx'
import { MessageList, type GeneralChannelViewProps } from '../src/client/chat/GeneralChannelView.tsx'
import { PART_CHIP_TONE, TeamPlanCard, partStateText } from '../src/client/chat/TeamPlanCard.tsx'
import { TEAMWORK_FLAG_KEY } from '../src/client/chat/teamwork-flag.ts'
import { isSystemActor } from '../src/client/chat/system-actor.ts'
import { mapDeliveryCard, mapMessage, mapTeamPlan, shortPartTitle, type ChannelMessageUi, type DeliveryCardUi, type TeamPlanUi } from '../src/client/remote/map-host-ui.ts'
import type { DeliveryCardWire, MessageView, TeamPartStatusWire, TeamPlanPartWire, TeamPlanWire, TeamView } from '../src/client/remote/persona-remote-types.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { hostMessage } from './message-view-fixture.client.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}
beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); localStorage.clear() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as GeneralChannelViewProps['t']
const TEAM = {
  personas: [
    { id: 'p-lia', name: 'Lia', avatarRef: 'atlas', title: 'Coordenação' },
    { id: 'p-bia', name: 'Bia', avatarRef: 'nina', title: 'Texto' },
    { id: 'p-teo', name: 'Teo', avatarRef: 'luna', title: 'Arte' },
    { id: 'p-caio', name: 'Caio', avatarRef: 'bento', title: 'Posts' },
  ],
  members: [],
} as unknown as TeamView

const part = (extra: Partial<TeamPlanPartWire> = {}): TeamPlanPartWire => ({ taskId: 't-1', personaId: 'p-bia', title: 'Texto da campanha de lançamento', status: 'doing', ...extra })
const planWire = (parts: readonly TeamPlanPartWire[] = [part()]): TeamPlanWire => ({ requestId: 'req-1', title: 'Campanha de lançamento', parts })
const planUi = (parts?: readonly TeamPlanPartWire[]): TeamPlanUi => mapTeamPlan({ teamPlan: planWire(parts) } as unknown as MessageView, TEAM)!
const deliveryWire = (extra: Partial<DeliveryCardWire> = {}): DeliveryCardWire => ({
  requestId: 'req-1', title: 'Campanha de lançamento',
  parts: [{ taskId: 't-1', personaId: 'p-bia', title: 'Texto' }, { taskId: 't-2', personaId: 'p-teo', title: 'Arte' }, { taskId: 't-3', personaId: 'p-caio', title: 'Posts' }],
  reviewedBy: { personaId: 'p-lia' }, approvalId: 'approval-77', ...extra,
})
const deliveryUi = (extra: Partial<DeliveryCardWire> = {}): DeliveryCardUi => mapDeliveryCard({ deliveryCard: deliveryWire(extra) } as unknown as MessageView, TEAM)!

describe('shortPartTitle (corta só no espaço)', () => {
  it('até 48 passa inteiro; acima, corta no último espaço com "…", nunca no meio da palavra', () => {
    expect(shortPartTitle('Texto da campanha de lançamento')).toBe('Texto da campanha de lançamento')
    const source = 'Texto da campanha de lançamento do nosso produto novo para as redes sociais'
    const cut = shortPartTitle(source)
    expect(cut.endsWith('…')).toBe(true)
    expect(cut.length).toBeLessThanOrEqual(49)
    const lastWord = cut.slice(0, -1).trimEnd().split(' ').pop()
    expect(source.split(' ')).toContain(lastWord) // a última palavra que ficou é uma palavra INTEIRA do original
  })

  it('o "@nome" do começo some (o pedido cru nunca vira título) e uma palavra enorme não é cortada', () => {
    expect(shortPartTitle('@Lia Resumo curto do dia')).toBe('Resumo curto do dia')
    expect(shortPartTitle('A'.repeat(80))).toBe('A'.repeat(80))
  })
})

describe('mapTeamPlan / mapDeliveryCard', () => {
  it('o plano com as partes, a persona do time (rosto) e o colega de "com {nome}"', () => {
    const plan = planUi([part({ status: 'with-colleague', withPersonaId: 'p-teo' }), part({ taskId: 't-2', personaId: 'p-teo', status: 'needs-you', approvalId: 'approval-9' })])
    expect(plan.parts[0]).toMatchObject({ personaName: 'Bia', characterId: 'nina', withName: 'Teo', withCharacterId: 'luna', status: 'with-colleague' })
    expect(plan.parts[1]).toMatchObject({ approvalId: 'approval-9', status: 'needs-you' })
  })

  it('approvalId só vale em "precisa de você" e o motivo só em "parou" (nada sem destino)', () => {
    const plan = planUi([part({ status: 'doing', approvalId: 'x', reason: 'y' }), part({ taskId: 't-2', status: 'stopped', reason: 'O Gmail recusou.' })])
    expect(plan.parts[0]).not.toHaveProperty('approvalId')
    expect(plan.parts[0]).not.toHaveProperty('reason')
    expect(plan.parts[1]).toMatchObject({ reason: 'O Gmail recusou.' })
  })

  it('parte sem título usável some; sem nenhuma parte não há cartão; persona fora do time fica sem rosto', () => {
    expect(planUi([part({ title: '  ' }), part({ taskId: 't-2', title: '@Bia' })])).toBeUndefined()
    const plan = planUi([part({ personaId: 'p-fantasma' })])
    expect(plan.parts[0]).not.toHaveProperty('personaName')
  })

  it('a entrega: partes com a persona, o selo (revisor do time) e o approvalId do "Revisar"', () => {
    expect(deliveryUi()).toMatchObject({ title: 'Campanha de lançamento', reviewedByName: 'Lia', approvalId: 'approval-77' })
    expect(deliveryUi().parts[1]).toMatchObject({ title: 'Arte', personaName: 'Teo' })
    expect(deliveryUi({ reviewedBy: undefined as never })).not.toHaveProperty('reviewedByName')
    expect(mapDeliveryCard({ deliveryCard: deliveryWire({ parts: [] }) } as unknown as MessageView, TEAM)).toBeUndefined()
  })

  it('mapMessage carrega os dois cartões', () => {
    const row = mapMessage(hostMessage({ id: 'm1', seq: 1, actorId: 'p-lia', body: 'Dividi assim:', subjectId: '', occurredAt: '2026-11-05T08:30:00.000Z', teamPlan: planWire() } as never), TEAM, 'ana')
    expect(row.teamPlan).toMatchObject({ requestId: 'req-1' })
    const delivery = mapMessage(hostMessage({ id: 'm2', seq: 2, actorId: 'p-lia', body: 'Pronto', subjectId: '', occurredAt: '2026-11-05T10:45:00.000Z', deliveryCard: deliveryWire() } as never), TEAM, 'ana')
    expect(delivery.deliveryCard).toMatchObject({ requestId: 'req-1' })
  })
})

describe('o nome curto da parte (Muse, EQUIPE-REAL §0 "Ajustes")', () => {
  it('com o campo separado, o cartão mostra só o NOME CURTO ("Texto") e o título completo vai no tooltip', () => {
    const plan = planUi([part({ shortName: 'Texto' }), part({ taskId: 't-2', personaId: 'p-teo', title: 'Arte da campanha de lançamento', shortName: 'Arte' })])
    expect(plan.parts.map(row => row.title)).toEqual(['Texto', 'Arte'])
    expect(plan.parts[0]).toMatchObject({ fullTitle: 'Texto da campanha de lançamento' })
    render(<TeamPlanCard t={t} plan={plan} rowTag="div" />)
    expect(screen.getByText('Texto').getAttribute('title')).toBe('Texto da campanha de lançamento')
    expect(screen.queryByText('Texto da campanha de lançamento')).toBeNull()
  })

  it('sem o campo, vale o título que vier, cortado no espaço (sem tooltip repetido)', () => {
    const plan = planUi([part()])
    expect(plan.parts[0]).toMatchObject({ title: 'Texto da campanha de lançamento' })
    expect(plan.parts[0]).not.toHaveProperty('fullTitle')
  })

  it('o cartão de entrega: "Texto (Bia)" com o nome curto, e o título do cartão continua sendo o pedido', () => {
    const delivery = deliveryUi({ parts: [{ taskId: 't-1', personaId: 'p-bia', title: 'Texto da campanha de lançamento', shortName: 'Texto' }, { taskId: 't-2', personaId: 'p-teo', title: 'Arte da campanha de lançamento', shortName: 'Arte' }] })
    render(<DeliveryCard t={t} delivery={delivery} rowTag="div" />)
    expect(screen.getByRole('article', { name: 'Pronto: Campanha de lançamento' })).toBeTruthy()
    expect(screen.getByText('Texto (Bia)')).toBeTruthy()
    expect(screen.getByText('Arte (Teo)')).toBeTruthy()
  })

  it('nome curto vazio ou comprido demais não vira texto torto: cai no título; passa de 24 e corta no espaço', () => {
    expect(planUi([part({ shortName: '   ' })]).parts[0]!.title).toBe('Texto da campanha de lançamento')
    expect(planUi([part({ shortName: 'Texto da campanha de lançamento do produto novo' })]).parts[0]!.title.endsWith('…')).toBe(true)
  })
})

describe('o cartão vivo do plano (os 8 estados)', () => {
  const card = (parts: readonly TeamPlanPartWire[], extra: Partial<Parameters<typeof TeamPlanCard>[0]> = {}) =>
    render(<TeamPlanCard t={t} plan={planUi(parts)} rowTag="div" {...extra} />)

  it('"Dividi assim", o pedido curto, e cada parte com o rosto, o título curto e o chip', () => {
    card([part(), part({ taskId: 't-2', personaId: 'p-teo', title: 'Arte da campanha de lançamento', status: 'waiting', withPersonaId: 'p-bia' })])
    expect(screen.getByRole('article', { name: 'Dividi assim · Campanha de lançamento' })).toBeTruthy()
    expect(screen.getByText('Texto da campanha de lançamento')).toBeTruthy()
    expect(screen.getByText('fazendo')).toBeTruthy()
    expect(screen.getByText('esperando Bia')).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it.each([
    ['queued', undefined, 'na fila'],
    ['doing', undefined, 'fazendo'],
    ['waiting', 'p-teo', 'esperando Teo'],
    ['waiting', undefined, 'esperando'],
    ['with-colleague', 'p-teo', 'com Teo'],
    ['with-colleague', undefined, 'com um colega'],
    ['reviewing', undefined, 'revisando'],
    ['needs-you', undefined, 'precisa de você'],
    ['done', undefined, 'pronto'],
    ['stopped', undefined, 'parou'],
  ] as const)('estado %s (%s) -> "%s"', (status, withId, text) => {
    const ui = planUi([part({ status, ...(withId === undefined ? {} : { withPersonaId: withId }) })]).parts[0]!
    expect(partStateText(t, ui)).toBe(text)
  })

  it('as cores: andamento neutro, revisando info, precisa de você warning, pronto success, parou danger', () => {
    const tones: Record<TeamPartStatusWire, string> = { queued: 'neutral', doing: 'neutral', waiting: 'neutral', 'with-colleague': 'neutral', reviewing: 'info', 'needs-you': 'warning', done: 'success', stopped: 'danger' }
    expect(PART_CHIP_TONE).toEqual(tones)
  })

  it('o estado muda NO LUGAR: o mesmo cartão e a mesma lista (nenhuma linha nova), só o chip', () => {
    const { rerender } = card([part()])
    const before = screen.getAllByRole('listitem').length
    expect(screen.getByText('fazendo')).toBeTruthy()
    rerender(<TeamPlanCard t={t} plan={planUi([part({ status: 'with-colleague', withPersonaId: 'p-teo' })])} rowTag="div" />)
    expect(screen.queryByText('fazendo')).toBeNull()
    expect(screen.getByText('com Teo')).toBeTruthy()
    rerender(<TeamPlanCard t={t} plan={planUi([part({ status: 'done' })])} rowTag="div" />)
    expect(screen.getByText('pronto')).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(before)
    expect(screen.getAllByRole('article')).toHaveLength(1)
  })

  it('"precisa de você" abre Aprovações com o item; sem o approvalId ou sem o handler é só rótulo (nenhum botão morto)', () => {
    const open = vi.fn()
    const { unmount } = card([part({ status: 'needs-you', approvalId: 'approval-9' })], { onOpenApproval: open })
    fireEvent.click(screen.getByRole('button', { name: 'precisa de você' }))
    expect(open).toHaveBeenCalledWith('approval-9')
    unmount()
    const semId = card([part({ status: 'needs-you' })], { onOpenApproval: open })
    expect(screen.queryByRole('button')).toBeNull()
    semId.unmount()
    card([part({ status: 'needs-you', approvalId: 'approval-9' })])
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('"parou" tem "Ver motivo" que abre o motivo; sem o motivo não há "Ver motivo"', () => {
    const { unmount } = card([part({ status: 'stopped', reason: 'O Gmail recusou o envio.' })])
    fireEvent.click(screen.getByRole('button', { name: 'Ver motivo' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('Por que parou')
    expect(dialog.textContent).toContain('O Gmail recusou o envio.')
    expect(dialog.textContent).toContain('Texto da campanha de lançamento')
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    unmount()
    card([part({ status: 'stopped' })])
    expect(screen.queryByRole('button', { name: 'Ver motivo' })).toBeNull()
  })

  it('partes ainda não abertas (taskId vazio, "na fila") convivem sem chave repetida nem aviso do React', () => {
    const errors: unknown[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => { errors.push(args) })
    card([part({ taskId: '', title: 'Texto da campanha', status: 'queued' }), part({ taskId: '', title: 'Arte da campanha', status: 'queued' }), part({ taskId: 't-3', title: 'Posts da campanha', status: 'doing' })])
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getAllByText('na fila')).toHaveLength(2)
    expect(errors.filter(args => String((args as unknown[])[0]).includes('same key'))).toEqual([])
    spy.mockRestore()
  })

  it('nenhum id nem palavra técnica na tela', () => {
    card([part({ status: 'needs-you', approvalId: 'approval-9' }), part({ taskId: 't-2', status: 'stopped', reason: 'Faltou acesso.' })], { onOpenApproval: vi.fn() })
    expect(document.body.textContent).not.toMatch(/approval-9|req-1|t-1|p-bia|undefined/u)
  })
})

describe('o cartão de entrega', () => {
  const card = (delivery: DeliveryCardUi, onOpenApproval?: (id: string) => void) =>
    render(<DeliveryCard t={t} delivery={delivery} rowTag="div" {...(onOpenApproval === undefined ? {} : { onOpenApproval })} />)

  it('"Pronto: {pedido}", as partes com o rosto e a pessoa, o selo "Revisado por Lia" e "Revisar"', () => {
    const open = vi.fn()
    card(deliveryUi(), open)
    expect(screen.getByRole('article', { name: 'Pronto: Campanha de lançamento' })).toBeTruthy()
    expect(screen.getByText('Texto (Bia)')).toBeTruthy()
    expect(screen.getByText('Arte (Teo)')).toBeTruthy()
    expect(screen.getByText('Posts (Caio)')).toBeTruthy()
    expect(screen.getByText('Revisado por Lia')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Revisar e aplicar' })) // DESIGN-01 (Fio real d): o botão diz o que faz
    expect(open).toHaveBeenCalledWith('approval-77')
  })

  it('sem revisão: sem selo; sem approvalId ou sem handler: sem "Revisar" (nada sem destino)', () => {
    const { unmount } = card(deliveryUi({ reviewedBy: undefined as never, approvalId: undefined as never }), vi.fn())
    expect(screen.queryByText(/Revisado por/u)).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    unmount()
    card(deliveryUi())
    expect(screen.queryByRole('button', { name: 'Revisar' })).toBeNull()
    expect(screen.getByText('Revisado por Lia')).toBeTruthy()
  })
})

describe('no MessageList: flag persona.flag.teamwork e "nenhum autor com :"', () => {
  const base = { timeLabel: '08:30', reactions: [] } as const
  const planRow = (): ChannelMessageUi => ({ id: 'plan', authorId: 'atlas', authorName: 'Lia', body: 'Dividi assim:', ...base, teamPlan: planUi() })
  const deliveryRow = (): ChannelMessageUi => ({ id: 'delivery', authorId: 'atlas', authorName: 'Lia', body: 'Pronto.', ...base, deliveryCard: deliveryUi() })

  it('flag desligada (padrão): as mensagens do host aparecem como texto, como antes', () => {
    render(<MessageList t={t} messages={[planRow(), deliveryRow()]} />)
    expect(screen.getByText('Dividi assim:')).toBeTruthy()
    expect(document.querySelector('[data-team-plan], [data-delivery-card]')).toBeNull()
  })

  it('flag ligada: o plano e a entrega viram os cartões (em <li>) e os botões chegam a Aprovações', () => {
    localStorage.setItem(TEAMWORK_FLAG_KEY, '1')
    const open = vi.fn()
    render(<MessageList t={t} messages={[planRow(), deliveryRow()]} onOpenApprovalItem={open} />)
    expect((document.querySelector('[data-team-plan]') as HTMLElement).tagName).toBe('LI')
    const delivery = document.querySelector('[data-delivery-card]') as HTMLElement
    expect(delivery.tagName).toBe('LI')
    fireEvent.click(within(delivery).getByRole('button', { name: 'Revisar e aplicar' }))
    expect(open).toHaveBeenCalledWith('approval-77')
    expect(screen.queryByText('Dividi assim:')).toBeNull()
  })

  it('autor técnico (routine:manha, team:split) NUNCA é desenhado; os demais seguem', () => {
    const rows: ChannelMessageUi[] = [
      { id: 'a', authorId: 'user', authorName: 'Ana', body: 'preciso de uma campanha', ...base },
      { id: 'b', authorId: 'team:split', authorName: 'team:split', body: 'Em andamento: Texto', ...base },
      { id: 'c', authorId: 'routine:manha', authorName: 'routine:manha', body: '@Lia Resumo curto', ...base },
      { id: 'd', authorId: 'atlas', authorName: 'Lia', body: 'Dividi assim', ...base },
    ]
    render(<MessageList t={t} messages={rows} />)
    expect(screen.getByText('preciso de uma campanha')).toBeTruthy()
    expect(screen.getByText('Dividi assim')).toBeTruthy()
    expect(screen.queryByText(/Em andamento|Resumo curto|team:split|routine:manha/u)).toBeNull()
    expect(document.body.textContent).not.toMatch(/[a-z][a-z0-9_-]*:[a-z]/iu) // nenhum autor/id técnico (as horas "08:30" têm dígitos dos dois lados)
  })

  it('isSystemActor: só o formato técnico prefixo:resto; nomes comuns passam', () => {
    for (const technical of ['routine:manha', 'team:split', 'routine:daily-brief']) expect(isSystemActor({ authorId: technical, authorName: 'x' })).toBe(true)
    for (const ok of ['Ana', 'Você', 'Lia', 'atlas', 'Dr. Souza']) expect(isSystemActor({ authorId: ok, authorName: ok })).toBe(false)
  })
})
