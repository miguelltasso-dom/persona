// @vitest-environment jsdom
// Muse 07/11 (lote 1 da galeria, cena group-after-card): "Nina retomou «Relatório de sexta»" tem de ser a linha de EQUIPE TIPADA (MessageView.handoff, status 'resumed'): os dois rostos,
// SEM balão, e ela QUEBRA o grupo: a mensagem seguinte abre com o rosto + "Nome · função · hora". A cena da galeria usava um `harness` de forma inválida para o host (virava mensagem
// comum e o grupo não quebrava). Aqui a prova parte do EVENTO DO HOST, passando por `mapMessage`, como a tela real; o caso da mensagem comum fica como contraste.
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BUBBLES_FLAG_KEY } from '../src/client/chat/bubbles-flag.ts'
import { MessageList } from '../src/client/chat/GeneralChannelView.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { mapMessage, type ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'
import type { MessageView, TeamView } from '../src/client/remote/persona-remote-types.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}
beforeEach(() => {
  localStorage.setItem(BUBBLES_FLAG_KEY, '1')
  localStorage.setItem('persona.flag.teamwork', '1')
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

const t = (key: string, params?: Readonly<Record<string, string | number>>) => {
  const raw = chatPt[key as keyof typeof chatPt] ?? key
  return params === undefined ? raw : raw.replace(/\{(\w+)\}/gu, (_m, name: string) => String(params[name] ?? ''))
}

const TEAM = {
  members: [],
  personas: [
    { id: 'persona-nina', name: 'Nina', avatarRef: 'nina', title: 'Pesquisa' },
    { id: 'persona-bento', name: 'Bento', avatarRef: 'bento', title: 'Engenharia' },
  ],
} as unknown as TeamView

let seq = 0
const NOW = Date.parse('2026-11-07T15:00:00.000Z')
/** Um evento como o HOST o manda (`MessageView`), com `extra` para o campo tipado. */
const hostMessage = (id: string, actor: string, body: string, extra: Record<string, unknown> = {}, minutesAgo = 10): MessageView => {
  seq += 1
  return {
    id, streamId: 'channel:geral', seq, body, actorId: actor, subjectId: '', occurredAt: new Date(NOW - minutesAgo * 60_000 + seq * 1000).toISOString(),
    type: 'message', source: 'host', attachmentIds: [], replyToId: '', editedAt: '', pinned: false, reactions: [], topicId: '', ...extra,
  } as unknown as MessageView
}
const thread = (...events: MessageView[]): ChannelMessageUi[] => events.map(event => mapMessage(event, TEAM, 'owner'))
const RESUMED = { handoff: { fromPersonaId: 'persona-nina', toPersonaId: 'persona-bento', taskId: 'tk-1', title: 'Relatório de sexta', mode: 'handoff', status: 'resumed' } }
const RETOMOU = 'Nina retomou “Relatório de sexta” com a entrega de Bento'

const bubbles = (container: HTMLElement): HTMLElement[] => [...container.querySelectorAll<HTMLElement>('[data-persona-bubble]')]
/** A linha "Nome · função · hora" (a classe `meta`, sem a `metaSoft` que mora dentro dela). */
const metaLines = (container: HTMLElement): HTMLElement[] => [...container.querySelectorAll<HTMLElement>('[class*="meta"]')].filter(node => !node.className.includes('metaSoft'))
const list = (messages: readonly ChannelMessageUi[]) => render(<MessageList t={t as never} team={TEAM} messages={messages} />)

describe('a linha de equipe TIPADA "retomou" (o evento do host) no meio de um grupo de balões', () => {
  const typed = () => thread(
    hostMessage('g-1', 'persona-nina', 'Achei 3 concorrentes e comparei os preços.', {}, 12),
    hostMessage('g-2', 'persona-nina', RETOMOU, RESUMED, 11),
    hostMessage('g-3', 'persona-nina', 'Voltei com os números: estamos 8% mais caros no pão.', {}, 10),
    hostMessage('g-4', 'persona-nina', 'Quer que eu atualize o cardápio?', {}, 9),
  )

  it('vira UMA linha de equipe (os dois rostos), nunca um balão da Nina', () => {
    const { container } = list(typed())
    expect(container.querySelectorAll('[data-team-line="handoff-resumed"]')).toHaveLength(1)
    expect(bubbles(container).map(bubble => bubble.textContent)).toEqual([
      'Achei 3 concorrentes e comparei os preços.',
      'Voltei com os números: estamos 8% mais caros no pão.',
      'Quer que eu atualize o cardápio?',
    ])
  })

  it('QUEBRA o grupo: a mensagem seguinte abre grupo novo com o rosto e "Nome · função · hora", e a do meio do grupo novo continua sem cabeçalho', () => {
    const { container } = list(typed())
    const heads = metaLines(container).map(node => node.textContent)
    expect(heads).toHaveLength(2) // g-1 e g-3; g-4 continua o grupo de g-3
    for (const head of heads) expect(head).toMatch(/^Nina · Pesquisa · \d{2}:\d{2}$/u)
    expect(container.querySelectorAll('[data-persona-sprig]')).toHaveLength(0) // DESIGN-01 #04: a folhinha saiu dos balões comuns
  })
})

describe('contraste: o MESMO texto como mensagem comum (era o defeito da cena da galeria)', () => {
  it('sem o campo tipado vira um balão da Nina dentro do grupo e NÃO quebra: um só cabeçalho', () => {
    const { container } = list(thread(
      hostMessage('g-1', 'persona-nina', 'Achei 3 concorrentes e comparei os preços.', {}, 12),
      hostMessage('g-2', 'persona-nina', RETOMOU, {}, 11),
      hostMessage('g-3', 'persona-nina', 'Voltei com os números: estamos 8% mais caros no pão.', {}, 10),
    ))
    expect(container.querySelector('[data-team-line]')).toBeNull()
    expect(bubbles(container)).toHaveLength(3)
    expect(metaLines(container)).toHaveLength(1)
  })

  it('o `harness` de forma inválida que a galeria usava no lote 1 também vira mensagem comum (o host nunca o manda assim)', () => {
    const { container } = list(thread(
      hostMessage('g-1', 'persona-nina', 'Achei 3 concorrentes.', {}, 12),
      hostMessage('g-2', 'persona-nina', 'Nina retomou “Relatório de sexta”', { harness: { outcome: 'started', ticketId: 'tk-1', title: 'Relatório de sexta', personaId: 'persona-nina', personaName: 'Nina' } }, 11),
      hostMessage('g-3', 'persona-nina', 'Voltei com os números.', {}, 10),
    ))
    expect(container.querySelector('[data-team-line]')).toBeNull()
    expect(metaLines(container)).toHaveLength(1)
  })
})
