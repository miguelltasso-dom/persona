// @vitest-environment jsdom
// TEAM-8 (EQUIPE-REAL-SPEC, D-090): as linhas do fio da equipe real — passou / pediu ajuda / ajudou / entregou / retomou, e a revisão
// (pediu · aprovou · pediu ajustes · ajustou e aprovou · deixou n pontos em aberto). Atrás de persona.flag.teamwork; nunca um id na tela.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageList, type GeneralChannelViewProps } from '../src/client/chat/GeneralChannelView.tsx'
import { mapMessage, mapMessageHandoff, mapMessageReview, mapSortedMessageStream, mapStateLine, type ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'
import {
  analyzeTeamStreamNoise,
  groupHelpRuns,
  handoffLineText,
  mapHandoffLine,
  mapReviewedBy,
  mapReviewLine,
  reviewLineText,
  reviewSkippedLineText,
  truncateAtWordBoundary,
  type HandoffLineUi,
  type ReviewLineUi,
  type StreamNoiseRowInput,
  type TeamPersonaUi,
} from '../src/client/teamwork/team-lines-model.ts'
import { TEAMWORK_FLAG_KEY } from '../src/client/chat/teamwork-flag.ts'
import type { MessageView, TeamView } from '../src/client/remote/persona-remote-types.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { pt as approvalsPt } from '../src/client/locale/approvals/locales.ts'
import { ReviewDeliveryPanel } from '../src/client/review/ReviewDeliveryPanel.tsx'
import { MOCK_REVIEW_SUMMARY } from '../src/client/review/mock-data.ts'
import { ReactiveApprovalsList } from '../src/client/approvals/ReactiveApprovalsList.tsx'
import { InboxDetail } from '../src/client/approvals/InboxDetail.tsx'
import { buildInboxGroups } from '../src/client/approvals/inbox-model.ts'
import type { ApprovalItem } from '../src/client/approvals/mock-data.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { HandoffLine, ReviewLine } from '../src/client/chat/TeamLine.tsx'
import { ReviewedBySeal } from '../src/client/teamwork/ReviewedBySeal.tsx'
import { BrandIcon, type BrandIconName } from '../src/client/primitives/index.ts'
import type { ReactElement } from 'react'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as GeneralChannelViewProps['t']

const TEAM = {
  personas: [
    { id: 'p-bia', name: 'Bia', avatarRef: 'nina', title: 'Redação' },
    { id: 'p-teo', name: 'Téo', avatarRef: 'bento', title: 'Arte' },
    { id: 'p-atlas', name: 'Atlas', avatarRef: 'atlas', title: 'Coordenação' },
  ],
  members: [],
} as unknown as TeamView

const BIA: TeamPersonaUi = { id: 'p-bia', name: 'Bia', characterId: 'nina' }
const TEO: TeamPersonaUi = { id: 'p-teo', name: 'Téo', characterId: 'bento' }
const ATLAS: TeamPersonaUi = { id: 'p-atlas', name: 'Atlas', characterId: 'atlas' }
const lookup = (id: string): TeamPersonaUi | undefined => [BIA, TEO, ATLAS].find(p => p.id === id)

const handoff = (extra: Partial<HandoffLineUi> = {}): HandoffLineUi => ({
  mode: 'help', status: 'asked', from: BIA, to: TEO, taskId: 'tk-9f3a', title: 'Arte do bolo de cenoura', ...extra,
})
const review = (extra: Partial<ReviewLineUi> = {}): ReviewLineUi => ({
  kind: 'reviewed', reviewer: ATLAS, author: BIA, taskId: 'tk-1', title: 'Post de sexta', round: 0, maxRounds: 2, ...extra,
})

beforeEach(() => { localStorage.clear() })
afterEach(cleanup)

function hostEvent(extra: Record<string, unknown>, id = 'm1', occurredAt = '2026-11-04T20:00:10.000Z'): MessageView {
  return {
    id, streamId: 'channel:geral', seq: 1, body: 'Texto simples do host', actorId: 'p-bia', subjectId: '', occurredAt, type: 'message', source: 'host',
    attachmentIds: [], replyToId: '', editedAt: '', pinned: false, reactions: [], topicId: '', ...extra,
  } as unknown as MessageView
}

describe('as frases (texto da spec; o host manda dados)', () => {
  it('passar adiante × pedir ajuda; ajudou × entregou; retomou', () => {
    expect(handoffLineText(handoff({ mode: 'handoff' }))).toEqual({ key: 'handoff.passed', params: { from: 'Bia', to: 'Téo', next: 'Arte do bolo de cenoura' } })
    expect(handoffLineText(handoff())?.key).toBe('handoff.asked')
    expect(handoffLineText(handoff({ status: 'delivered' }))?.key).toBe('handoff.helped')
    expect(handoffLineText(handoff({ status: 'delivered', mode: 'handoff' }))?.key).toBe('handoff.delivered')
    expect(handoffLineText(handoff({ status: 'resumed' }))?.key).toBe('handoff.resumed')
  })

  it('esperando: os mesmos estados do HT-3; motivo desconhecido e bloqueio sem conector não têm frase (o corpo do host aparece)', () => {
    expect(handoffLineText(handoff({ status: 'held', reason: 'paused' }))?.key).toBe('harness.held.paused')
    expect(handoffLineText(handoff({ status: 'held', reason: 'silence' }))?.key).toBe('harness.held.silence')
    expect(handoffLineText(handoff({ status: 'held', reason: 'qualquer coisa' }))).toBeUndefined()
    expect(handoffLineText(handoff({ status: 'blocked' }))).toBeUndefined()
    expect(handoffLineText(handoff({ status: 'blocked', connector: 'Drive' }))).toEqual({ key: 'handoff.blocked', params: { from: 'Bia', to: 'Téo', title: 'Arte do bolo de cenoura', connector: 'Drive' } })
  })

  it('a etapa de revisão: o pedido tem frase própria; o resultado vem como `review`', () => {
    expect(handoffLineText(handoff({ purpose: 'review', to: ATLAS }))?.key).toBe('review.asked')
    expect(handoffLineText(handoff({ purpose: 'review', status: 'delivered' }))).toBeUndefined()
  })

  it('revisão: aprovou (round 0 = sem voltas) · ajustou e aprovou (round ≥ 1 = depois das voltas) · pediu ajustes (com o ponto) · deixou n pontos em aberto', () => {
    expect(reviewLineText(review())).toEqual({ key: 'review.approved', params: { reviewer: 'Atlas', title: 'Post de sexta' } })
    expect(reviewLineText(review({ round: 1 }))?.key).toBe('review.adjusted')
    expect(reviewLineText(review({ kind: 'returned', summary: 'Falta o preço' }))).toEqual({ key: 'review.changes', params: { reviewer: 'Atlas', note: 'Falta o preço' } })
    expect(reviewLineText(review({ kind: 'returned' }))).toBeUndefined()
    expect(reviewLineText(review({ kind: 'returned', round: 2, openPoints: 2 }))).toEqual({ key: 'review.open', params: { name: 'Atlas', count: 2 } })
    expect(reviewLineText(review({ kind: 'returned', round: 2, openPoints: 1 }))?.key).toBe('review.open.one')
  })
})

describe('o mapa do host: nunca um id, nunca sem nome', () => {
  it('descarta persona desconhecida, a si mesma e título que é id', () => {
    const base = { fromPersonaId: 'p-bia', toPersonaId: 'p-teo', taskId: 'tk-9f3a', title: 'Arte do bolo', mode: 'help' as const, status: 'asked' as const }
    expect(mapHandoffLine(base, lookup)?.title).toBe('Arte do bolo')
    expect(mapHandoffLine({ ...base, toPersonaId: 'p-fantasma' }, lookup)).toBeUndefined()
    expect(mapHandoffLine({ ...base, toPersonaId: 'p-bia' }, lookup)).toBeUndefined()
    expect(mapHandoffLine({ ...base, title: 'tk-9f3a' }, lookup)).toBeUndefined()
    expect(mapHandoffLine({ ...base, title: 'task-abc123' }, lookup)).toBeUndefined()
    expect(mapHandoffLine(undefined, lookup)).toBeUndefined()
  })

  it('a revisão tira o título do mapa título-por-tarefa; sem ele não há linha', () => {
    const card = { kind: 'reviewed' as const, reviewerPersonaId: 'p-atlas', authorPersonaId: 'p-bia', taskId: 'tk-1', round: 0, maxRounds: 2 }
    expect(mapReviewLine(card, lookup, id => (id === 'tk-1' ? 'Post de sexta' : undefined))?.title).toBe('Post de sexta')
    expect(mapReviewLine(card, lookup, () => undefined)).toBeUndefined()
    expect(mapReviewLine({ ...card, openPoints: 0 }, lookup, () => 'Post')?.openPoints).toBeUndefined()
    expect(mapReviewLine({ ...card, kind: 'returned', openPoints: 2.9 }, lookup, () => 'Post')?.openPoints).toBe(2)
  })

  it('MessageView.handoff e .review viram os campos da mensagem', () => {
    const h = hostEvent({ handoff: { fromPersonaId: 'p-bia', toPersonaId: 'p-teo', taskId: 'tk-9', fromTaskId: 'tk-8', title: 'Arte do bolo', mode: 'help', status: 'asked' } })
    expect(mapMessageHandoff(h, TEAM)?.to.name).toBe('Téo')
    expect(mapMessage(h, TEAM, 'owner').teamHandoff?.from.name).toBe('Bia')
    const r = hostEvent({ review: { kind: 'reviewed', reviewerPersonaId: 'p-atlas', authorPersonaId: 'p-bia', taskId: 'tk-1', round: 0, maxRounds: 2 } })
    expect(mapMessageReview(r, TEAM, new Map([['tk-1', 'Post de sexta']]))?.title).toBe('Post de sexta')
    expect(mapMessage(r, TEAM, 'owner', new Map([['tk-1', 'Post de sexta']])).teamReview?.reviewer.name).toBe('Atlas')
  })
})

describe('o agrupamento por minuto', () => {
  const item = (index: number, extra: Partial<HandoffLineUi> = {}, occurredAt = '2026-11-04T20:00:05.000Z') => ({ index, line: handoff(extra), occurredAt })

  it('2 ou mais pedidos de ajuda consecutivos da mesma persona no mesmo minuto formam um grupo', () => {
    expect(groupHelpRuns([item(0), item(1, { to: ATLAS })]).map(run => run.map(row => row.index))).toEqual([[0, 1]])
    expect(groupHelpRuns([item(0)])).toEqual([])
  })

  it('outra persona, outro minuto, mensagem no meio, entrega ou revisão quebram o grupo', () => {
    expect(groupHelpRuns([item(0), item(1, { from: ATLAS })])).toEqual([])
    expect(groupHelpRuns([item(0), item(1, {}, '2026-11-04T20:01:05.000Z')])).toEqual([])
    expect(groupHelpRuns([item(0), item(2)])).toEqual([])
    expect(groupHelpRuns([item(0), item(1, { status: 'delivered' })])).toEqual([])
    expect(groupHelpRuns([item(0), item(1, { purpose: 'review' })])).toEqual([])
    expect(groupHelpRuns([item(0, { mode: 'handoff' }), item(1, { mode: 'handoff' })])).toEqual([])
  })
})

function thread(messages: readonly ChannelMessageUi[], extra: Partial<Parameters<typeof MessageList>[0]> = {}): ReturnType<typeof render> {
  return render(<ol><MessageList t={t} team={TEAM} messages={messages} {...extra} /></ol>)
}

const handoffMessage = (id: string, extra: Record<string, unknown> = {}, occurredAt?: string): ChannelMessageUi => mapMessage(hostEvent({
  handoff: { fromPersonaId: 'p-bia', toPersonaId: 'p-teo', taskId: 'tk-9f3a', fromTaskId: 'tk-8', title: 'Arte do bolo de cenoura', mode: 'help', status: 'asked', ...extra },
}, id, occurredAt), TEAM, 'owner')

describe('no fio, com e sem a flag persona.flag.teamwork', () => {
  it('sem a flag o corpo simples do host aparece, como antes', () => {
    thread([handoffMessage('m1')])
    expect(screen.getByText('Texto simples do host')).toBeTruthy()
    expect(document.querySelector('[data-team-line]')).toBeNull()
  })

  it('com a flag: a linha com os dois rostos e a frase da spec, e o "Ver tarefa" só com destino', () => {
    localStorage.setItem(TEAMWORK_FLAG_KEY, '1')
    const onOpenTaskOnBoard = vi.fn()
    thread([handoffMessage('m1')], { onOpenTaskOnBoard })
    const line = document.querySelector('[data-team-line="handoff-asked"]') as HTMLElement
    expect(line).not.toBeNull()
    expect(within(line).getByText(/Bia pediu ajuda a Téo: Arte do bolo de cenoura/u)).toBeTruthy()
    expect(screen.queryByText('Texto simples do host')).toBeNull()
    expect(line.querySelectorAll('img, [data-initial], [class*="avatar"]').length).toBeGreaterThanOrEqual(0)
    fireEvent.click(within(line).getByRole('button', { name: 'Ver tarefa' }))
    expect(onOpenTaskOnBoard).toHaveBeenCalledWith('tk-9f3a')
  })

  it('sem o handler ou sem a tarefa conhecida não há botão (nenhum controle morto)', () => {
    localStorage.setItem(TEAMWORK_FLAG_KEY, '1')
    thread([handoffMessage('m1')])
    expect(screen.queryByRole('button', { name: 'Ver tarefa' })).toBeNull()
    cleanup()
    thread([handoffMessage('m2', { taskId: '' })], { onOpenTaskOnBoard: vi.fn() })
    expect(screen.queryByRole('button', { name: 'Ver tarefa' })).toBeNull()
  })

  it('entrega: "{B} entregou para {A}" com "Ver"; ajuda: "{B} ajudou {A}"', () => {
    localStorage.setItem(TEAMWORK_FLAG_KEY, '1')
    thread([handoffMessage('m1', { status: 'delivered', mode: 'handoff' }), handoffMessage('m2', { status: 'delivered', mode: 'help' }, '2026-11-04T21:00:00.000Z')], { onOpenTaskOnBoard: vi.fn() })
    expect(screen.getByText(/Téo entregou para Bia: Arte do bolo de cenoura/u)).toBeTruthy()
    expect(screen.getByText(/Téo ajudou Bia: Arte do bolo de cenoura/u)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Ver' })).toHaveLength(2)
  })

  it('nunca mostra o id da tarefa nem o bilhete', () => {
    localStorage.setItem(TEAMWORK_FLAG_KEY, '1')
    thread([handoffMessage('m1', { status: 'delivered' })], { onOpenTaskOnBoard: vi.fn() })
    expect(document.body.textContent).not.toContain('tk-9f3a')
    expect(document.body.textContent).not.toContain('<bilhete>')
  })

  it('o bloqueio por conector: a frase e o "Liberar para {B}" só quando alguém sabe liberar (sem o handler, sem o botão)', () => {
    localStorage.setItem(TEAMWORK_FLAG_KEY, '1')
    thread([handoffMessage('m1', { status: 'blocked', connector: 'Drive' })])
    expect(screen.getByText(/Bia pediu a Téo Arte do bolo de cenoura, mas Téo não pode usar o Drive\./u)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Liberar/u })).toBeNull()
  })

  it('3 pedidos no mesmo minuto: UM grupo "Bia pediu ajuda a 3 colegas", fechado (são mais de 2), e abre com Ver tudo', () => {
    localStorage.setItem(TEAMWORK_FLAG_KEY, '1')
    thread([
      handoffMessage('m1', { toPersonaId: 'p-teo', title: 'Arte do bolo' }, '2026-11-04T20:00:01.000Z'),
      handoffMessage('m2', { toPersonaId: 'p-atlas', title: 'Revisar o texto' }, '2026-11-04T20:00:20.000Z'),
      handoffMessage('m3', { toPersonaId: 'p-teo', title: 'Foto do bolo' }, '2026-11-04T20:00:40.000Z'),
    ])
    expect(document.querySelectorAll('[data-team-line="handoff-group"]')).toHaveLength(1)
    expect(screen.getByText(/Bia pediu ajuda a 3 colegas/u)).toBeTruthy()
    expect(document.querySelectorAll('[data-team-line="handoff-asked"]')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Ver tudo' }))
    expect(document.querySelectorAll('[data-team-line="handoff-asked"]')).toHaveLength(3)
  })

  it('2 pedidos no mesmo minuto: o grupo já vem aberto', () => {
    localStorage.setItem(TEAMWORK_FLAG_KEY, '1')
    thread([
      handoffMessage('m1', { toPersonaId: 'p-teo', title: 'Arte do bolo' }, '2026-11-04T20:00:01.000Z'),
      handoffMessage('m2', { toPersonaId: 'p-atlas', title: 'Revisar o texto' }, '2026-11-04T20:00:20.000Z'),
    ])
    expect(screen.getByText(/Bia pediu ajuda a 2 colegas/u)).toBeTruthy()
    expect(document.querySelectorAll('[data-team-line="handoff-asked"]')).toHaveLength(2)
  })

  it('a revisão: aprovou, com o título da tarefa; sem título conhecido, o corpo do host', () => {
    localStorage.setItem(TEAMWORK_FLAG_KEY, '1')
    const approved = mapMessage(hostEvent({ review: { kind: 'reviewed', reviewerPersonaId: 'p-atlas', authorPersonaId: 'p-bia', taskId: 'tk-1', round: 0, maxRounds: 2 } }), TEAM, 'owner', new Map([['tk-1', 'Post de sexta']]))
    thread([approved])
    expect(screen.getByText(/Atlas aprovou: Post de sexta/u)).toBeTruthy()
    cleanup()
    const untitled = mapMessage(hostEvent({ review: { kind: 'reviewed', reviewerPersonaId: 'p-atlas', authorPersonaId: 'p-bia', taskId: 'tk-1', round: 0, maxRounds: 2 } }), TEAM, 'owner')
    thread([untitled])
    expect(screen.getByText('Texto simples do host')).toBeTruthy()
  })

  it('a 3ª volta: "{R} deixou {n} ponto(s) em aberto" só quando há pontos; o pedido de ajustes leva o 1º ponto', () => {
    localStorage.setItem(TEAMWORK_FLAG_KEY, '1')
    const titles = new Map([['tk-1', 'Post de sexta']])
    const open = mapMessage(hostEvent({ review: { kind: 'returned', reviewerPersonaId: 'p-atlas', authorPersonaId: 'p-bia', taskId: 'tk-1', round: 2, maxRounds: 2, openPoints: 2 } }, 'r1'), TEAM, 'owner', titles)
    const changes = mapMessage(hostEvent({ review: { kind: 'returned', reviewerPersonaId: 'p-atlas', authorPersonaId: 'p-bia', taskId: 'tk-1', round: 1, maxRounds: 2, summary: 'Falta o preço' } }, 'r2'), TEAM, 'owner', titles)
    const adjusted = mapMessage(hostEvent({ review: { kind: 'reviewed', reviewerPersonaId: 'p-atlas', authorPersonaId: 'p-bia', taskId: 'tk-1', round: 2, maxRounds: 2 } }, 'r3'), TEAM, 'owner', titles)
    thread([open, changes, adjusted])
    expect(screen.getByText(/Atlas deixou 2 pontos em aberto/u)).toBeTruthy()
    expect(screen.getByText(/Atlas pediu ajustes: Falta o preço/u)).toBeTruthy()
    expect(screen.getByText(/Bia ajustou e Atlas aprovou/u)).toBeTruthy()
  })

  it('o pedido de revisão (handoff com purpose review) usa a frase da revisão', () => {
    localStorage.setItem(TEAMWORK_FLAG_KEY, '1')
    thread([handoffMessage('m1', { purpose: 'review', toPersonaId: 'p-atlas', title: 'Post de sexta' })])
    expect(screen.getByText(/Bia pediu revisão a Atlas: Post de sexta/u)).toBeTruthy()
  })
})

describe('o selo "Revisado por {R}" nos 3 lugares (EQUIPE-REAL-SPEC §d)', () => {
  it('mapReviewedBy exige persona conhecida e sem pontos em aberto', () => {
    expect(mapReviewedBy({ reviewedBy: { personaId: 'p-atlas', at: '2026-11-04T20:05:00.000Z' } }, lookup)).toEqual(ATLAS)
    expect(mapReviewedBy({ reviewedBy: { personaId: 'p-atlas', at: '2026-11-04T20:05:00.000Z', openPoints: 0 } }, lookup)).toEqual(ATLAS)
    expect(mapReviewedBy({ reviewedBy: { personaId: 'p-atlas', at: '2026-11-04T20:05:00.000Z', openPoints: 2 } }, lookup)).toBeUndefined()
    expect(mapReviewedBy({ reviewedBy: { personaId: 'p-fantasma', at: '2026-11-04T20:05:00.000Z' } }, lookup)).toBeUndefined()
    expect(mapReviewedBy({}, lookup)).toBeUndefined()
  })

  it('lugar 1 — cartão de entrega do fio: mostra "Revisado por {R}" com a flag e sem pontos em aberto; na 3ª volta sem o selo', () => {
    const titles = new Map([['tk-1', 'Post de sexta']])
    const reviewEvent = hostEvent({
      review: { kind: 'reviewed', reviewerPersonaId: 'p-atlas', authorPersonaId: 'p-bia', taskId: 'tk-1', round: 0, maxRounds: 2 },
    }, 'ev-rev', '2026-11-04T20:01:00.000Z')
    const deliveryEvent = hostEvent({
      type: 'task_delivered',
      subjectId: 'tk-1',
      body: 'Pronto para publicar.',
    }, 'ev-deliv', '2026-11-04T20:02:00.000Z')
    const stream = mapSortedMessageStream([reviewEvent, deliveryEvent], TEAM, 'owner', titles)
    expect(stream[1]?.taskReviewedBy?.name).toBe('Atlas')

    // Sem a flag: nenhum selo
    thread(stream)
    expect(document.querySelector('[data-teamwork="reviewed-seal"]')).toBeNull()
    cleanup()

    // Com a flag: o selo aparece no cartão da tarefa no fio
    localStorage.setItem(TEAMWORK_FLAG_KEY, '1')
    thread(stream)
    const seal = document.querySelector('[data-teamwork="reviewed-seal"]') as HTMLElement
    expect(seal).not.toBeNull()
    expect(seal.textContent).toContain('Revisado por Atlas')
    cleanup()

    // Na 3ª volta com pontos em aberto: o trabalho segue SEM o selo
    const openReturn = hostEvent({
      review: { kind: 'returned', reviewerPersonaId: 'p-atlas', authorPersonaId: 'p-bia', taskId: 'tk-1', round: 2, maxRounds: 2, openPoints: 2 },
    }, 'ev-open', '2026-11-04T20:01:30.000Z')
    const streamOpen = mapSortedMessageStream([openReturn, deliveryEvent], TEAM, 'owner', titles)
    expect(streamOpen[1]?.taskReviewedBy).toBeUndefined()
    thread(streamOpen)
    expect(document.querySelector('[data-teamwork="reviewed-seal"]')).toBeNull()
  })

  it('lugar 2 — cabeçalho do "Revisar mudanças": mostra o selo com a flag e esconde quando há pontos em aberto', () => {
    localStorage.setItem(TEAMWORK_FLAG_KEY, '1')
    render(
      <ReviewDeliveryPanel
        taskTitle="Post de sexta"
        personaName="Bia"
        summary={{ ...MOCK_REVIEW_SUMMARY, reviewedBy: { name: 'Atlas', characterId: 'atlas' } }}
      />,
    )
    const seal = document.querySelector('[data-teamwork="reviewed-seal"]') as HTMLElement
    expect(seal).not.toBeNull()
    expect(seal.textContent).toContain('Revisado por Atlas')
    cleanup()

    render(
      <ReviewDeliveryPanel
        taskTitle="Post de sexta"
        personaName="Bia"
        summary={{ ...MOCK_REVIEW_SUMMARY, reviewedBy: { name: 'Atlas', characterId: 'atlas', openPoints: 1 } }}
      />,
    )
    expect(document.querySelector('[data-teamwork="reviewed-seal"]')).toBeNull()
  })

  it('lugar 3 — cartão de Aprovações (lista e detalhe): mostra o selo com a flag e esconde sem revisão', () => {
    localStorage.setItem(TEAMWORK_FLAG_KEY, '1')
    const item: ApprovalItem = {
      id: 'ap-1',
      kind: 'attention',
      title: 'Publicar o post de sexta',
      question: 'Posso publicar no Instagram?',
      primaryKey: 'action.primary.attention',
      proposerName: 'Bia',
      proposerPersonaId: 'p-bia',
      reviewedBy: { name: 'Atlas', characterId: 'atlas' },
    }
    render(
      <ReactiveApprovalsList
        dict={approvalsPt}
        items={[item]}
        scopeFor={() => undefined}
        exitStampId={null}
        rememberFor={() => ({ grant: false, validity: 'once' })}
        rememberStampNote={null}
        onRememberChange={() => {}}
        onCelebrateAccept={() => {}}
      />,
    )
    expect(document.querySelector('[data-teamwork="reviewed-seal"]')?.textContent).toContain('Revisado por Atlas')
    cleanup()

    const groups = buildInboxGroups(approvalsPt, [item], [])
    const row = groups[0]!.rows[0]!
    render(
      <InboxDetail
        dict={approvalsPt}
        row={row}
        scope={undefined}
        choice={{ grant: false, validity: 'once' }}
        onRememberChange={() => {}}
        rememberStampNote={null}
        stamped={false}
        leaving={false}
        deciding={false}
        locked={false}
        canDecide
        onApprove={() => {}}
        onDismiss={() => {}}
        detailsOpen={false}
        onDetailsChange={() => {}}
        focusHighlight={false}
      />,
    )
    expect(document.querySelector('[data-teamwork="reviewed-seal"]')?.textContent).toContain('Revisado por Atlas')
  })
})

describe('EQUIPE-REAL-SPEC §0 e TEAM-R1: regra de ruído do fio e falha de revisão agrupada', () => {
  it('truncateAtWordBoundary remove @nome inicial e corta só no espaço com reticências', () => {
    expect(truncateAtWordBoundary('@Bia Texto da campanha de lançamento')).toBe('Texto da campanha de lançamento')
    const longTitle = 'Texto: preciso de uma campanha de lançamento do nosso produto: texto, arte e posts'
    const cut = truncateAtWordBoundary(longTitle, 48)
    expect(cut.length).toBeLessThanOrEqual(48)
    expect(cut.endsWith('…')).toBe(true)
    expect(cut).not.toMatch(/pos…$/u)
  })

  it('reviewSkippedLineText devolve singular em 1 e plural em >= 2; no DeliveryCard omite o selo e mostra UMA linha agrupada com "Ver"', () => {
    expect(reviewSkippedLineText(0)).toBeUndefined()
    expect(reviewSkippedLineText(1)).toEqual({ key: 'review.skipped.one', params: { count: 1 } })
    expect(reviewSkippedLineText(6)).toEqual({ key: 'review.skipped', params: { count: 6 } })

    localStorage.setItem(TEAMWORK_FLAG_KEY, '1')
    const onOpenTaskOnBoard = vi.fn()
    const deliveryMsg = mapMessage(hostEvent({
      deliveryCard: {
        requestId: 'req-1',
        title: 'Campanha de lançamento',
        parts: [
          { taskId: 'tk-1', personaId: 'p-bia', title: 'Texto da campanha' },
          { taskId: 'tk-2', personaId: 'p-teo', title: 'Arte da campanha' },
        ],
        reviewedBy: { personaId: 'p-atlas', name: 'Atlas' },
        reviewSkippedCount: 2,
      },
    }, 'del-1'), TEAM, 'owner')

    thread([deliveryMsg], { onOpenTaskOnBoard })
    const note = document.querySelector('[data-teamwork="review-skipped"]') as HTMLElement
    expect(note).not.toBeNull()
    expect(note.textContent).toContain('A revisão não rodou em 2 partes; seguiram sem o selo')
    expect(screen.queryByText(/Revisado por Atlas/u)).toBeNull()
    fireEvent.click(within(note).getByRole('button', { name: 'Ver' }))
    expect(onOpenTaskOnBoard).toHaveBeenCalledWith('tk-1')
  })

  it('TEAM-R1 (Muse 00:19, zero regex em texto): usa só dados tipados (autor técnico com ":", review.kind="failed", a aprovação simples de 1ª volta e micro-estados tipados absorvidos pelo plano/entrega) e preserva qualquer texto de pessoa ou persona', () => {
    localStorage.setItem(TEAMWORK_FLAG_KEY, '1')
    const titles = new Map([['tk-1', 'Texto da campanha'], ['tk-2', 'Arte da campanha']])
    const rawEvents = [
      hostEvent({ actorId: 'owner', body: 'Pronto: aqui está o meu briefing! Em andamento: o que vocês acham?' }, 'm-user'),
      hostEvent({ actorId: 'team:split', body: 'Parte de Bia: texto' }, 'm-split-1'),
      hostEvent({ actorId: 'routine:manha', body: '@Lia Resumo curto da equipe' }, 'm-routine'),
      hostEvent({ actorId: 'p-atlas', body: 'Olá, em que posso ajudar?' }, 'm-lia-real-text'),
      hostEvent({
        actorId: 'p-atlas',
        teamPlan: {
          requestId: 'req-camp',
          title: 'Campanha de lançamento',
          parts: [
            { taskId: 'tk-1', personaId: 'p-bia', title: 'Texto da campanha', status: 'doing' },
            { taskId: 'tk-2', personaId: 'p-teo', title: 'Arte da campanha', status: 'doing' },
          ],
        },
      }, 'm-plan'),
      hostEvent({
        actorId: 'p-bia',
        handoff: { fromPersonaId: 'p-bia', toPersonaId: 'p-atlas', taskId: 'tk-1', title: 'Texto da campanha', mode: 'help', status: 'asked', purpose: 'review' },
      }, 'm-ask-rev'),
      hostEvent({
        actorId: 'p-atlas',
        review: { kind: 'reviewed', reviewerPersonaId: 'p-atlas', authorPersonaId: 'p-bia', taskId: 'tk-1', round: 0, maxRounds: 2 },
      }, 'm-rev-round0'),
      hostEvent({
        actorId: 'p-atlas',
        review: { kind: 'returned', reviewerPersonaId: 'p-atlas', authorPersonaId: 'p-bia', taskId: 'tk-1', round: 1, maxRounds: 2, summary: 'Ajuste interno' },
      }, 'm-rev-round1'),
      hostEvent({
        actorId: 'p-atlas',
        review: { kind: 'returned', reviewerPersonaId: 'p-atlas', authorPersonaId: 'p-bia', taskId: 'tk-1', round: 2, maxRounds: 2, summary: 'Ajuste que atrasou a entrega' },
      }, 'm-rev-round2'),
      hostEvent({
        actorId: 'p-atlas',
        review: { kind: 'returned', reviewerPersonaId: 'p-atlas', authorPersonaId: 'p-bia', taskId: 'tk-2', round: 2, maxRounds: 2, openPoints: 2 },
      }, 'm-rev-open'),
      ...Array.from({ length: 6 }, (_, idx) =>
        hostEvent({
          actorId: 'p-atlas',
          review: { kind: 'failed', reviewerPersonaId: 'p-atlas', authorPersonaId: 'p-bia', taskId: 'tk-2', round: 0, maxRounds: 2 },
        }, `m-fail-${idx}`),
      ),
      hostEvent({
        actorId: 'p-bia',
        type: 'task_delivered',
        subjectId: 'tk-1',
        body: 'Entrega individual de parte absorvida pelo DeliveryCard',
      }, 'm-part-delivered'),
      hostEvent({
        actorId: 'p-atlas',
        deliveryCard: {
          requestId: 'req-camp',
          title: 'Campanha de lançamento',
          parts: [
            { taskId: 'tk-1', personaId: 'p-bia', title: 'Texto da campanha' },
            { taskId: 'tk-2', personaId: 'p-teo', title: 'Arte da campanha' },
          ],
          reviewedBy: { personaId: 'p-atlas', name: 'Atlas' },
        },
      }, 'm-delivery'),
    ]
    const stream = mapSortedMessageStream(rawEvents, TEAM, 'owner', titles)

    const analysis = analyzeTeamStreamNoise(stream.map(row => ({
      authorId: row.authorId,
      authorName: row.authorName,
      harnessStatus: row.harness?.outcome,
      teamHandoff: row.teamHandoff,
      teamReview: row.teamReview,
      hasTeamPlan: row.teamPlan !== undefined,
      hasDeliveryCard: row.deliveryCard !== undefined,
      hasTaskCard: row.taskTitle !== undefined && row.taskTitle.length > 0,
    })))
    expect(analysis.reviewSkippedCount).toBe(6)

    thread(stream, { onOpenTaskOnBoard: vi.fn() })
    // Mensagens reais que começam com "Pronto:", "Em andamento:" ou "Olá, em que posso ajudar?" NUNCA somem por regex de texto
    expect(screen.getByText(/Pronto: aqui está o meu briefing!/u)).toBeTruthy()
    expect(screen.getByText(/Olá, em que posso ajudar\?/u)).toBeTruthy()
    // Autores técnicos com ":" nunca entram no fio
    expect(screen.queryByText(/Parte de Bia: texto/u)).toBeNull()
    expect(screen.queryByText(/Resumo curto da equipe/u)).toBeNull()
    // Revisão interna de 1ª volta e falhas individuais não geram linhas soltas no fio
    expect(screen.queryByText(/Bia pediu revisão a Atlas/u)).toBeNull()
    expect(screen.queryByText(/Atlas aprovou: Texto da campanha/u)).toBeNull()
    // "Pediu ajustes" de QUALQUER volta NUNCA é absorvido (Muse 00:54): round 1, round 2 e com pontos continuam visíveis no fio
    expect(screen.getByText(/Atlas pediu ajustes: Ajuste interno/u)).toBeTruthy()
    expect(screen.getByText(/Atlas pediu ajustes: Ajuste que atrasou a entrega/u)).toBeTruthy()
    expect(screen.getByText(/Atlas deixou 2 pontos em aberto/u)).toBeTruthy()
    // As 6 falhas tipadas de revisão viram UMA linha agrupada no cartão de entrega
    const skipped = document.querySelector('[data-teamwork="review-skipped"]') as HTMLElement
    expect(skipped).not.toBeNull()
    expect(skipped.textContent).toContain('A revisão não rodou em 6 partes; seguiram sem o selo')
  })
})

describe('R1 — linha de estado tipada (team-real.md §9): absorvida pelos cartões, nunca pelo texto', () => {
  it('mapStateLine: o campo tipado vira a linha de estado; tipo ou resultado desconhecido e tarefa sem id não viram nada', () => {
    expect(mapStateLine(hostEvent({ stateLine: { kind: 'part_done', ticketId: 'tk-1', groupId: 'split-m1', text: 'status' } })))
      .toEqual({ kind: 'part_done', ticketId: 'tk-1', groupId: 'split-m1', text: 'status' })
    expect(mapStateLine(hostEvent({ stateLine: { kind: 'task_done', ticketId: 'tk-1', text: 'result' } })))
      .toEqual({ kind: 'task_done', ticketId: 'tk-1', text: 'result' })
    expect(mapStateLine(hostEvent({ stateLine: { kind: 'nope', ticketId: 'tk-1', text: 'status' } }))).toBeUndefined()
    expect(mapStateLine(hostEvent({ stateLine: { kind: 'task_done', ticketId: 'tk-1', text: 'other' } }))).toBeUndefined()
    expect(mapStateLine(hostEvent({ stateLine: { kind: 'task_done', ticketId: '  ', text: 'status' } }))).toBeUndefined()
    expect(mapStateLine(hostEvent({}))).toBeUndefined()
  })

  it('"Em andamento" tipado sai do fio mesmo sem cartão; a MESMA frase sem o campo tipado continua visível', () => {
    localStorage.setItem(TEAMWORK_FLAG_KEY, '1')
    const stream = mapSortedMessageStream([
      hostEvent({ actorId: 'p-bia', body: 'Em andamento: Tarefa tipada', stateLine: { kind: 'task_progress', ticketId: 'tk-1', text: 'status' } }, 'm-progress'),
      hostEvent({ actorId: 'p-bia', body: 'Em andamento: Frase comum' }, 'm-plain'),
    ], TEAM, 'owner', new Map([['tk-1', 'Arte do bolo']]))
    expect(stream.find(row => row.id === 'm-progress')?.stateLine).toEqual({ kind: 'task_progress', ticketId: 'tk-1', text: 'status' })
    thread(stream)
    expect(screen.queryByText(/Tarefa tipada/u)).toBeNull()
    expect(screen.getByText(/Frase comum/u)).toBeTruthy()
  })

  it('"Pronto" de uma parte sai quando o cartão do PEDIDO está na janela; sem cartão, ou com o cartão de outro pedido, a linha fica', () => {
    const rows: StreamNoiseRowInput[] = [
      { hasTeamPlan: true, planRequestId: 'split-m1' },
      { stateLine: { kind: 'part_done', ticketId: 'tk-1', groupId: 'split-m1', text: 'status' } },
      { stateLine: { kind: 'part_done', ticketId: 'tk-2', groupId: 'split-m1', text: 'result' } },
      { stateLine: { kind: 'part_done', ticketId: 'tk-3', groupId: 'split-outro', text: 'status' } },
    ]
    expect([...analyzeTeamStreamNoise(rows).hiddenIndices].sort((a, b) => a - b)).toEqual([1, 2])
    expect([...analyzeTeamStreamNoise(rows.slice(1)).hiddenIndices]).toEqual([])
  })

  it('"Em andamento" (task_progress, status) sai sempre; a fala da persona com o mesmo tipo (result) fica quando nenhum cartão a absorve', () => {
    const rows: StreamNoiseRowInput[] = [
      { stateLine: { kind: 'task_progress', ticketId: 'tk-7', text: 'status' } },
      { stateLine: { kind: 'task_progress', ticketId: 'tk-7', text: 'result' } },
    ]
    expect([...analyzeTeamStreamNoise(rows).hiddenIndices]).toEqual([0])
  })

  it('tarefa avulsa: o "Pronto" e a fala da persona saem só com o cartão da PRÓPRIA tarefa na janela; sem cartão, a fala fica', () => {
    const rows: StreamNoiseRowInput[] = [
      { hasTaskCard: true, ticketId: 'tk-5' },
      { stateLine: { kind: 'task_done', ticketId: 'tk-5', text: 'status' } },
      { stateLine: { kind: 'task_done', ticketId: 'tk-5', text: 'result' } },
      { stateLine: { kind: 'task_done', ticketId: 'tk-6', text: 'result' } },
    ]
    expect([...analyzeTeamStreamNoise(rows).hiddenIndices].sort((a, b) => a - b)).toEqual([1, 2])
  })

  it('a entrega individual de parte sai só com o cartão de entrega do PRÓPRIO pedido; tarefa avulsa com a entrega de outro pedido na janela continua visível', () => {
    const rows: StreamNoiseRowInput[] = [
      { hasDeliveryCard: true, deliveryRequestId: 'split-m1', deliveryTaskIds: ['tk-1', 'tk-2'] },
      { hasTaskCard: true, ticketId: 'tk-1' },
      { hasTaskCard: true, ticketId: 'tk-9' },
    ]
    expect([...analyzeTeamStreamNoise(rows).hiddenIndices]).toEqual([1])
  })

  it('a própria mensagem nunca se absorve: a linha que É o cartão de tarefa e traz o estado dele continua visível', () => {
    const rows: StreamNoiseRowInput[] = [
      { hasTaskCard: true, ticketId: 'tk-5', stateLine: { kind: 'task_done', ticketId: 'tk-5', text: 'result' } },
    ]
    expect(analyzeTeamStreamNoise(rows).hiddenIndices.size).toBe(0)
  })

  it('"pediu ajustes" (returned) NUNCA some, de qualquer volta ou com pontos; só a aprovação simples de 1ª volta (reviewed, round 0) sai com o cartão', () => {
    const rows: StreamNoiseRowInput[] = [
      { hasTeamPlan: true, planRequestId: 'split-m1' },
      { review: { kind: 'returned', round: 0 } },
      { review: { kind: 'returned', round: 1 } },
      { review: { kind: 'returned', round: 2, openPoints: 2 } },
      { review: { kind: 'reviewed', round: 0 } },
      { review: { kind: 'reviewed', round: 1 } },
      { handoff: { purpose: 'review', status: 'asked' } },
    ]
    expect([...analyzeTeamStreamNoise(rows).hiddenIndices].sort((a, b) => a - b)).toEqual([4, 6])
  })
})

describe('BR-P6 (Muse 01:43): os ícones da equipe real ficam ao lado do texto', () => {
  const iconStyle = (name: BrandIconName, size: number): string | null => {
    const probe = render(<BrandIcon name={name} size={size} />)
    const style = probe.container.querySelector('span')?.getAttribute('style') ?? null
    probe.unmount()
    return style
  }

  it('passar-adiante, pedir-ajuda, ajudou e entregou na passagem; revisao e pediu-ajustes na revisão; cada ícone dentro do texto da linha', () => {
    const cases: ReadonlyArray<{ readonly name: BrandIconName; readonly node: ReactElement }> = [
      { name: 'passar-adiante', node: <HandoffLine t={t} line={handoff({ mode: 'handoff', status: 'asked' })} rowTag="div" /> },
      { name: 'pedir-ajuda', node: <HandoffLine t={t} line={handoff({ mode: 'help', status: 'asked' })} rowTag="div" /> },
      { name: 'ajudou', node: <HandoffLine t={t} line={handoff({ mode: 'help', status: 'delivered' })} rowTag="div" /> },
      { name: 'entregou', node: <HandoffLine t={t} line={handoff({ mode: 'handoff', status: 'delivered' })} rowTag="div" /> },
      { name: 'revisao', node: <ReviewLine t={t} line={review({ kind: 'reviewed', round: 0 })} rowTag="div" /> },
      { name: 'pediu-ajustes', node: <ReviewLine t={t} line={review({ kind: 'returned', round: 1, summary: 'Ajuste interno' })} rowTag="div" /> },
    ]
    for (const { name, node } of cases) {
      const view = render(node)
      const icon = view.container.querySelector('p > span[style]')
      expect(icon, `ícone ${name} dentro do texto`).not.toBeNull()
      expect(icon?.getAttribute('style')).toBe(iconStyle(name, 16))
      view.unmount()
    }
  })

  it('o selo "Revisado por" leva o ícone revisao (12 px) no lugar do ✓', () => {
    localStorage.setItem(TEAMWORK_FLAG_KEY, '1')
    const view = render(<ReviewedBySeal reviewer={{ name: 'Atlas', characterId: 'atlas' }} />)
    const icon = view.container.querySelector('[data-teamwork="reviewed-seal"] span[style]')
    expect(icon?.getAttribute('style')).toBe(iconStyle('revisao', 12))
    view.unmount()
  })
})
