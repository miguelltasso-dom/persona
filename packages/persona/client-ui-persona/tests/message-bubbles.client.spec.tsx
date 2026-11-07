// @vitest-environment jsdom
// CV-9 (CONVERSAS-SPEC §CV-9): o fio em BALÕES. A pessoa em lilás à direita; a persona em creme à esquerda com o rosto e "Nome · função
// · hora" só no 1º do grupo; agrupamento por autor em < 5 min; a folhinha no 1º balão; os cartões estruturados ficam FORA do balão;
// tabela e código dentro do balão largo. O jsdom não calcula layout: aqui ficam provados a estrutura e os textos; as medidas e as cores,
// na captura no shell real.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BUBBLES_FLAG_KEY } from '../src/client/chat/bubbles-flag.ts'
import { MessageList } from '../src/client/chat/GeneralChannelView.tsx'
import { breaksGroup } from '../src/client/chat/group-breakers.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import type { ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'
import type { TeamView } from '../src/client/remote/persona-remote-types.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}
// CV-9 está atrás da flag `persona.flag.bubbles` (Muse, D-077): estes testes valem com ela LIGADA.
beforeEach(() => { localStorage.setItem(BUBBLES_FLAG_KEY, '1') })
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
    { id: 'p-nina', name: 'Nina', title: 'Pesquisa' },
    { id: 'p-bento', name: 'Bento', title: 'Engenharia' },
  ],
} as unknown as TeamView

const msg = (id: string, authorId: string, timeLabel: string, body: string, over: Partial<ChannelMessageUi> = {}): ChannelMessageUi => ({
  id,
  authorId,
  authorName: authorId === 'user' ? 'Você' : authorId.charAt(0).toUpperCase() + authorId.slice(1),
  body,
  timeLabel,
  reactions: [],
  ...(authorId === 'user' ? {} : { authorPersonaId: `p-${authorId}` }),
  ...over,
})

function list(messages: readonly ChannelMessageUi[]) {
  return render(<MessageList t={t as never} team={TEAM} messages={messages} />)
}

const bubbles = (container: HTMLElement): HTMLElement[] => [...container.querySelectorAll<HTMLElement>('[data-persona-bubble]')]
/** A linha "Nome · função · hora" (a classe `meta`, sem a `metaSoft` que mora dentro dela). */
const metaLines = (container: HTMLElement): HTMLElement[] => [...container.querySelectorAll<HTMLElement>('[class*="meta"]')].filter(node => !node.className.includes('metaSoft'))
const rows = (container: HTMLElement): HTMLElement[] => [...container.querySelectorAll<HTMLElement>('[data-message-id]')]

describe('a pessoa: lilás, à direita', () => {
  it('um balão da pessoa, sem rosto, com "Você · hora" embaixo', () => {
    const { container } = list([msg('m1', 'user', '14:02', 'Pesquise os preços dos concorrentes.')])
    const bubble = bubbles(container)[0] as HTMLElement
    expect(bubble.getAttribute('data-author')).toBe('user')
    expect(bubble.textContent).toBe('Pesquise os preços dos concorrentes.')
    expect(container.querySelector('[class*="gutter"]')).toBeNull()
    expect(screen.getByText(/^Você ·/u).textContent).toBe('Você · 14:02')
    expect(container.querySelector('[data-persona-sprig]')).toBeNull() // a folhinha é só da persona
  })

  it('o texto da pessoa continua texto simples (markdown não vira elemento)', () => {
    const { container } = list([msg('m1', 'user', '14:02', 'olha **isto**')])
    expect(container.querySelector('strong')).toBeNull()
    expect(bubbles(container)[0]?.textContent).toBe('olha **isto**')
  })

  it('o chip "Direcionou {persona}" fica junto da linha "Você · hora"', () => {
    const { container } = list([msg('m1', 'user', '14:02', 'Muda para o plano B', { steeredPersonaName: 'Nina' })])
    expect(container.textContent).toContain('Você · 14:02')
    expect(container.textContent).toContain('Direcionou')
  })

  it('envio que falhou: o aviso "Não enviado" ocupa o lugar da hora (nunca "Você · hora" de uma mensagem que não saiu)', () => {
    const { container } = list([msg('m1', 'user', '14:02', 'Oi', { sendFailed: true })])
    expect(container.querySelector('[data-persona-send-failed]')).toBeTruthy()
    expect(screen.queryByText(/^Você ·/u)).toBeNull()
    expect(bubbles(container)).toHaveLength(1) // o balão continua, com o texto
  })
})

describe('a persona: creme, à esquerda, com rosto e nome no 1º do grupo', () => {
  it('"Nome · função · hora" acima do balão (a função vem da equipe)', () => {
    const { container } = list([msg('m1', 'nina', '14:05', 'Achei 3 concorrentes.')])
    const head = metaLines(container)[0] as HTMLElement
    expect(head.textContent).toBe('Nina · Pesquisa · 14:05')
    expect(bubbles(container)[0]?.getAttribute('data-author')).toBe('persona')
    expect(container.querySelector('[class*="gutter"]')).toBeTruthy() // o rosto
  })

  it('sem a função na equipe, a linha segue com nome e hora (nada de "undefined")', () => {
    const { container } = render(<MessageList t={t as never} team={null} messages={[msg('m1', 'nina', '14:05', 'Oi')]} />)
    const head = metaLines(container)[0] as HTMLElement
    expect(head.textContent).not.toContain('undefined')
    expect(head.textContent).toContain('Nina')
    expect(head.textContent).toContain('14:05')
  })
})

describe('o agrupamento por autor (< 5 min)', () => {
  const run = [
    msg('a', 'nina', '14:05', 'Achei 3 concorrentes.'),
    msg('b', 'nina', '14:06', 'Estamos mais caros no pão.'),
    msg('c', 'nina', '14:07', 'Quer que eu atualize o cardápio?'),
  ]

  it('três seguidas: primeiro, do meio e último; o rosto e o nome só no 1º', () => {
    const { container } = list(run)
    expect(bubbles(container).map(b => b.getAttribute('data-position'))).toEqual(['first', 'middle', 'last'])
    expect(metaLines(container)).toHaveLength(1)
    expect(rows(container).map(r => r.getAttribute('data-group'))).toEqual(['first', 'middle', 'last'])
    // só o 1º tem o botão/rosto na lateral; os outros trazem só a hora (ao passar o mouse)
    expect(container.querySelectorAll('[class*="gutter"] time')).toHaveLength(2)
  })

  it('a folhinha só no 1º balão do grupo da persona (aria-hidden, fora do texto)', () => {
    const { container } = list(run)
    const sprigs = container.querySelectorAll('[data-persona-sprig]')
    expect(sprigs).toHaveLength(1)
    expect(sprigs[0]?.getAttribute('aria-hidden')).toBe('true')
    expect(bubbles(container)[0]?.contains(sprigs[0] as Element)).toBe(true)
    expect(bubbles(container)[0]?.textContent).toBe('Achei 3 concorrentes.') // a folhinha não entra no texto
  })

  it('5 minutos ou mais: grupo novo (rosto, nome e folhinha de novo)', () => {
    const { container } = list([run[0] as ChannelMessageUi, msg('b', 'nina', '14:11', 'Outra coisa.')])
    expect(bubbles(container).map(b => b.getAttribute('data-position'))).toEqual(['single', 'single'])
    expect(metaLines(container)).toHaveLength(2)
    expect(container.querySelectorAll('[data-persona-sprig]')).toHaveLength(2)
  })

  it('intercalado com a pessoa: cada bloco da persona é um grupo', () => {
    const { container } = list([run[0] as ChannelMessageUi, msg('u', 'user', '14:06', 'Pode atualizar.'), msg('c', 'nina', '14:07', 'Atualizando.')])
    expect(bubbles(container).map(b => `${b.getAttribute('data-author')}:${b.getAttribute('data-position')}`)).toEqual(['persona:single', 'user:single', 'persona:single'])
  })

  it('o instante ISO do host vale mais que o rótulo: mesma hora em dias diferentes não agrupa', () => {
    const { container } = list([
      msg('a', 'nina', '14:05', 'ontem', { occurredAt: '2026-11-03T17:05:00Z' }),
      msg('b', 'nina', '14:06', 'hoje', { occurredAt: '2026-11-04T17:06:00Z' }),
    ])
    expect(bubbles(container).map(b => b.getAttribute('data-position'))).toEqual(['single', 'single'])
  })

  it('a pessoa também agrupa os seus balões (a hora só embaixo do último)', () => {
    const { container } = list([msg('a', 'user', '14:00', 'um'), msg('b', 'user', '14:01', 'dois')])
    expect(bubbles(container).map(b => b.getAttribute('data-position'))).toEqual(['first', 'last'])
    expect(screen.getAllByText(/^Você ·/u)).toHaveLength(1)
  })
})

describe('tabela e código: balão largo, rolando por dentro', () => {
  it('tabela ou bloco de código pedem o balão largo (860 px); texto comum não', () => {
    const { container } = list([
      msg('a', 'nina', '14:00', 'Só texto.'),
      msg('b', 'nina', '14:10', '| Dia | Meta |\n|---|---|\n| Seg | 24 |'),
      msg('c', 'nina', '14:20', 'Para rodar:\n\n```sh\nnpm run relatorio\n```'),
    ])
    expect(bubbles(container).map(b => b.hasAttribute('data-wide'))).toEqual([false, true, true])
  })

  it('a tabela fica dentro do balão e o renderizador do IV-3 segue (nada de HTML cru)', () => {
    const { container } = list([msg('a', 'nina', '14:00', '| Dia | Meta |\n|---|---|\n| Seg | 24 |')])
    expect(bubbles(container)[0]?.querySelector('table')).toBeTruthy()
  })

  it('o balão da pessoa nunca é largo (o texto dela é simples)', () => {
    const { container } = list([msg('a', 'user', '14:00', '| a | b |\n|---|---|')])
    expect(bubbles(container)[0]?.hasAttribute('data-wide')).toBe(false)
  })
})

describe('os cartões estruturados NÃO ficam dentro do balão', () => {
  it('a ficha da tarefa (título + ações) é irmã do balão, na coluna da persona', () => {
    const onLoad = vi.fn()
    const onBoard = vi.fn()
    const { container } = render(
      <MessageList
        t={t as never}
        team={TEAM}
        messages={[msg('a', 'nina', '14:00', 'Pronto: relatório da semana.', { taskTitle: 'Relatório da semana', ticketId: 'tk-1' })]}
        onLoadTurnContext={onLoad}
        onOpenTaskOnBoard={onBoard}
      />,
    )
    const bubble = bubbles(container)[0] as HTMLElement
    const card = container.querySelector('[role="group"][aria-label="Relatório da semana"]') as HTMLElement
    expect(card).toBeTruthy()
    expect(bubble.contains(card)).toBe(false)
    expect(bubble.parentElement).toBe(card.parentElement) // mesma coluna
  })

  it('uma mensagem com cartão fica sozinha: não entra em grupo com as vizinhas', () => {
    const { container } = list([
      msg('a', 'nina', '14:00', 'Oi.'),
      msg('b', 'nina', '14:01', 'Pronto.', { taskTitle: 'Relatório', ticketId: 'tk-1' }),
      msg('c', 'nina', '14:02', 'Tchau.'),
    ])
    expect(bubbles(container).map(b => b.getAttribute('data-position'))).toEqual(['single', 'single', 'single'])
  })

  it('uma mensagem só com cartão (sem texto) não cria balão vazio', () => {
    const { container } = list([msg('a', 'nina', '14:00', '', { taskTitle: 'Relatório', ticketId: 'tk-1' })])
    expect(bubbles(container)).toHaveLength(0)
  })
})

describe('MUSE 04:01: um cartão, uma linha de evento ou uma linha de equipe QUEBRAM o grupo (autor visível depois de cartão)', () => {
  const CARDS: readonly (readonly [string, Partial<ChannelMessageUi>])[] = [
    ['plano do Gestor', { gestorPlanId: 'gp-1' }],
    ['erro de execução', { runError: { code: 'quota' } as never }],
    ['linha de evento (retomou)', { harness: { outcome: 'started', ticketId: 'tk-1', title: 'Relatório' } as never }],
    ['bom dia', { dailyBrief: {} as never }],
    ['prévia de ação', { actionPreview: {} as never }],
    ['linha de ação', { actionEvent: {} as never }],
    ['pedido de iniciativa', { initiativeAsk: {} as never }],
    ['plano da equipe', { teamPlan: {} as never }],
    ['cartão de entrega', { deliveryCard: {} as never }],
    ['respostas da equipe', { fanout: {} as never }],
    ['pedido de opinião', { opinion: {} as never }],
    ['proposta de tarefa', { taskProposal: {} as never }],
    ['pergunta com chips', { personaAsk: {} as never }],
    ['passagem de trabalho', { teamHandoff: {} as never }],
    ['revisão', { teamReview: {} as never }],
    ['linha de estado', { stateLine: {} as never }],
    ['ficha da tarefa', { taskTitle: 'Relatório', ticketId: 'tk-1' }],
  ]

  it.each(CARDS)('%s quebra o grupo', (_name, over) => {
    expect(breaksGroup(msg('c', 'nina', '14:01', 'x', over))).toBe(true)
  })

  it('uma mensagem comum NÃO quebra (nem com taskTitle vazio)', () => {
    expect(breaksGroup(msg('a', 'nina', '14:00', 'Oi.'))).toBe(false)
    expect(breaksGroup(msg('a', 'nina', '14:00', 'Oi.', { taskTitle: '' }))).toBe(false)
  })

  it('"Teo retomou…" no meio: a mensagem DEPOIS da linha abre um grupo novo, com o rosto e o "Nome · função · hora"', () => {
    const { container } = list([
      msg('a', 'nina', '14:00', 'Achei 3 concorrentes.'),
      msg('line', 'nina', '14:01', '', { harness: { outcome: 'started', ticketId: 'tk-1', title: 'Relatório', personaName: 'Nina' } as never }),
      msg('b', 'nina', '14:02', 'Voltei com os números.'),
    ])
    expect(bubbles(container).map(b => b.getAttribute('data-position'))).toEqual(['single', 'single'])
    expect(metaLines(container)).toHaveLength(2)
    expect(container.querySelectorAll('[data-persona-sprig]')).toHaveLength(2)
  })

  it('o cartão no meio de duas mensagens do mesmo autor: as duas têm cabeçalho (a de depois não se junta à de antes)', () => {
    const { container } = list([
      msg('a', 'nina', '14:00', 'Antes do cartão.'),
      msg('card', 'nina', '14:01', 'Proposta', { taskProposal: {} as never }),
      msg('b', 'nina', '14:02', 'Depois do cartão.'),
    ])
    const positions = bubbles(container).map(b => b.getAttribute('data-position'))
    expect(positions.at(0)).toBe('single')
    expect(positions.at(-1)).toBe('single')
    expect(metaLines(container).length).toBeGreaterThanOrEqual(2)
  })

  it('o fio de antes (balões desligados): a mensagem depois do cartão também volta a ter cabeçalho (não "continua" o autor)', () => {
    localStorage.setItem(BUBBLES_FLAG_KEY, '0')
    const { container } = list([
      msg('a', 'nina', '14:00', 'Antes.'),
      msg('line', 'nina', '14:01', '', { harness: { outcome: 'started', ticketId: 'tk-1', title: 'Relatório', personaName: 'Nina' } as never }),
      msg('b', 'nina', '14:02', 'Depois.'),
    ])
    const rowB = container.querySelector('[data-message-id="b"]') as HTMLElement
    expect(rowB.textContent).toContain('Nina')
  })
})
