// @vitest-environment jsdom
// Achados do Gauge no app real com o dia da equipe (05/11 03:06): (1) o cartão "Proposta de {persona}" é uma linha <li> da lista de mensagens (axe `list`);
// (2) LEAK-1: o marcador de cartão do host (`[[task-proposal:{json}]]`…) nunca chega à tela, nem com a flag do cartão desligada.
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageList, type GeneralChannelViewProps } from '../src/client/chat/GeneralChannelView.tsx'
import { stripWireMarkers } from '../src/client/chat/wire-markers.ts'
import { mapMessage } from '../src/client/remote/map-host-ui.ts'
import type { MessageView, TeamView } from '../src/client/remote/persona-remote-types.ts'
import type { TaskProposalsBinding } from '../src/client/proposal/use-connected-task-proposals.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as GeneralChannelViewProps['t']
const TEAM = {
  personas: [
    { id: 'p-teo', name: 'Teo', avatarRef: 'teo', title: 'Engenharia' },
    { id: 'p-nina', name: 'Nina', avatarRef: 'nina', title: 'Pesquisa' },
  ],
  members: [],
} as unknown as TeamView

const item = (id: string, personaId = 'p-teo', personaName = 'Teo') => ({ id, personaId, personaName, question: `Posso destravar “Tarefa ${id}”?`, reason: 'Está parada.' })
const SINGLE = { kind: 'single', items: [item('prop-1')] }
const DIGEST = { kind: 'digest', items: [item('a'), item('b', 'p-nina', 'Nina'), item('c')] }
const SENTENCE = 'Teo sugeriu: Posso destravar “Tarefa prop-1”? (Está parada.)'

/** Como o host manda: a frase simples + o marcador no fim do corpo, e o cartão também em campo próprio. */
const hostEvent = (card: { kind: string; items: unknown[] }, extra: Record<string, unknown> = {}): MessageView => ({
  id: 'm-prop', streamId: 'channel:geral', seq: 1, body: `${SENTENCE}\n[[task-proposal:${JSON.stringify(card)}]]`,
  actorId: 'p-teo', subjectId: '', occurredAt: '2026-11-05T09:00:00.000Z', type: 'message', source: 'host', attachmentIds: [], replyToId: '', editedAt: '',
  pinned: false, reactions: [], topicId: '', taskProposal: card, ...extra,
} as unknown as MessageView)

const binding = (extra: Partial<TaskProposalsBinding> = {}): TaskProposalsBinding => ({ liveById: {}, onDecide: vi.fn().mockResolvedValue(undefined), onUndo: vi.fn().mockResolvedValue(undefined), ...extra })

afterEach(() => { cleanup() })

describe('o cartão da proposta é uma linha <li> da lista de mensagens (axe list)', () => {
  const list = (container: HTMLElement): HTMLOListElement => {
    const ol = container.querySelector('ol')
    if (ol === null) throw new Error('sem <ol> das mensagens')
    return ol
  }

  it.each([
    ['único', SINGLE, {}],
    ['resumo de 3', DIGEST, {}],
    ['tudo decidido (o cartão encolhe)', SINGLE, { 'prop-1': { status: 'accepted', ticketId: 'tk-1', ticketTitle: 'Tarefa prop-1' } }],
    ['expirada', SINGLE, { 'prop-1': { status: 'expired' } }],
  ] as const)('%s: o filho do <ol> é <li> e todo filho do <ol> é <li>', (_name, card, liveById) => {
    const { container } = render(<MessageList t={t} team={TEAM} messages={[mapMessage(hostEvent(card), TEAM, 'owner')]} taskProposals={binding({ liveById: liveById as never })} />)
    const ol = list(container)
    const row = ol.querySelector('[data-task-proposal]')
    expect(row?.tagName).toBe('LI')
    expect(row?.parentElement).toBe(ol)
    expect([...ol.children].filter(child => child.tagName !== 'LI').map(child => child.tagName)).toEqual([])
  })

  it('no meio de outras mensagens a lista continua só de <li>', () => {
    const plain = (id: string, body: string): MessageView => ({ ...hostEvent(SINGLE), id, body, taskProposal: undefined } as unknown as MessageView)
    const messages = [plain('m1', 'Bom dia'), mapMessage(hostEvent(DIGEST), TEAM, 'owner'), plain('m3', 'Combinado')].map(row => ('authorId' in row ? row : mapMessage(row, TEAM, 'owner')))
    const { container } = render(<MessageList t={t} team={TEAM} messages={messages} taskProposals={binding()} />)
    expect([...list(container).children].map(child => child.tagName)).toEqual(['LI', 'LI', 'LI'])
  })
})

describe('LEAK-1: o marcador do host nunca vai à tela', () => {
  it('stripWireMarkers tira o marcador do fim, de qualquer tipo do host, e deixa o resto igual', () => {
    for (const kind of ['task-proposal', 'persona-ask', 'account-ask', 'account-swap', 'handoff', 'review', 'run-error']) {
      expect(stripWireMarkers(`Frase simples.\n[[${kind}:{"a":[1,[2]],"b":"x"}]]`)).toBe('Frase simples.')
      expect(stripWireMarkers(`Frase simples.\n[[${kind}:{"a":1}]]  \n`)).toBe('Frase simples.')
    }
    expect(stripWireMarkers('Sem marcador. [[uma nota]] no meio')).toBe('Sem marcador. [[uma nota]] no meio')
    expect(stripWireMarkers('Um marcador no meio [[review:{"a":1}]] e mais texto')).toBe('Um marcador no meio [[review:{"a":1}]] e mais texto')
    expect(stripWireMarkers('')).toBe('')
  })

  it('o corpo mapeado é só a frase simples: com ou sem o cartão', () => {
    expect(mapMessage(hostEvent(SINGLE), TEAM, 'owner').body).toBe(SENTENCE)
    expect(mapMessage(hostEvent(DIGEST), TEAM, 'owner').body).not.toContain('[[')
  })

  it('flag do cartão DESLIGADA (sem o binding): a pessoa lê só a frase, nenhum JSON, nenhum botão', () => {
    const { container } = render(<MessageList t={t} team={TEAM} messages={[mapMessage(hostEvent(SINGLE), TEAM, 'owner')]} />)
    expect(container.textContent).toContain(SENTENCE)
    expect(container.textContent).not.toMatch(/\[\[|task-proposal|"kind"|"items"/u)
    expect(container.querySelector('[data-task-proposal]')).toBeNull()
  })

  it('flag LIGADA: o cartão aparece e o marcador também não está em lugar nenhum', () => {
    const { container } = render(<MessageList t={t} team={TEAM} messages={[mapMessage(hostEvent(DIGEST), TEAM, 'owner')]} taskProposals={binding()} />)
    expect(container.querySelector('[data-task-proposal="digest"]')).not.toBeNull()
    expect(container.textContent).not.toMatch(/\[\[|task-proposal:|"kind"/u)
  })

  it('o mesmo vale para os outros cartões do host com a flag desligada (pergunta da persona)', () => {
    const body = 'Nina pergunta: Qual público?\n[[persona-ask:{"askId":"a1","question":"Qual público?","options":[]}]]'
    const { container } = render(<MessageList t={t} team={TEAM} messages={[mapMessage({ ...hostEvent(SINGLE), id: 'm-ask', body, taskProposal: undefined } as unknown as MessageView, TEAM, 'owner')]} />)
    expect(container.textContent).toContain('Nina pergunta: Qual público?')
    expect(container.textContent).not.toMatch(/\[\[|persona-ask|askId/u)
  })
})
