// @vitest-environment jsdom
// D-090 / EQUIPE-REAL-SPEC §(c) (TEAM-8): o PEDIDO DE OPINIÃO no fio. Nomes finais do Anvil (team-real.md §7). Prova: o mapper do fio é cuidadoso, as
// linhas de um pedido viram UM cartão, a pergunta/rascunho/respostas são TEXTO (nunca HTML), imagem com `alt` (e o alt de reserva), marcas, "e mais n sem
// nada a acrescentar", sem visão + Trocar o motor, consolidação com Antes · Depois (imagem e texto), recolhe depois de consolidado, teto de rodadas,
// e sem a flag `persona.flag.teamwork` a mensagem aparece como texto, como antes.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GeneralChannelView } from '../src/client/chat/GeneralChannelView.tsx'
import { OpinionBlock } from '../src/client/chat/opinion/OpinionBlock.tsx'
import { buildOpinionBlocks, mapOpinion, needsReadAll, roundsCapReached, splitReplies, type OpinionUi } from '../src/client/chat/opinion/opinion-model.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { attachmentBytesRemoteFrom, clearAttachmentImageCache, resolveAttachmentImage } from '../src/client/remote/attachment-image.ts'
import type { ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'
import type { MessageView, OpinionWire, TeamView } from '../src/client/remote/persona-remote-types.ts'
import { hostMessage } from './message-view-fixture.client.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

const t = (key: string, params?: Readonly<Record<string, string | number>>) => {
  const raw = chatPt[key as keyof typeof chatPt] ?? key
  return params === undefined ? raw : raw.replace(/\{(\w+)\}/gu, (_m, name: string) => String(params[name] ?? ''))
}

beforeEach(() => { localStorage.clear(); localStorage.setItem('persona.hint.whoResponds', '1'); clearAttachmentImageCache() })
afterEach(() => { cleanup(); localStorage.clear() })

const TEAM = { personas: [
  { id: 'persona-nina', name: 'Nina', avatarRef: 'nina' },
  { id: 'persona-bento', name: 'Bento', avatarRef: 'bento' },
] } as unknown as TeamView

const wire = (over: Partial<OpinionWire> = {}): OpinionWire => ({ kind: 'request', requestId: 'req-1', taskId: 'tk-1', round: 1, maxRounds: 2, ...over })
const withOpinion = (opinion: unknown): MessageView => ({
  ...hostMessage({ id: 'm1', seq: 1, actorId: 'persona-nina', body: 'Qual destas capas?', subjectId: 'subject-geral', occurredAt: '2026-11-04T13:00:00.000Z' }),
  opinion,
} as MessageView)

const ui = (over: Partial<OpinionUi> = {}): OpinionUi => ({ kind: 'request', requestId: 'req-1', taskId: 'tk-1', round: 1, maxRounds: 2, imageIds: [], audience: 'team', noVision: [], ...over })
const msg = (id: string, authorId: string, authorName: string, body: string, opinion?: OpinionUi, extra: Partial<ChannelMessageUi> = {}): ChannelMessageUi => ({
  id, authorId, authorName, body, timeLabel: '10:00', reactions: [], ...(opinion === undefined ? {} : { opinion }), ...extra,
})
const request = (over: Partial<OpinionUi> = {}) => msg('m-req', 'nina', 'Nina', 'Qual destas capas funciona melhor?', ui(over))
const reply = (id: string, authorId: string, authorName: string, body: string, mark: OpinionUi['mark']) => msg(id, authorId, authorName, body, ui({ kind: 'reply', ...(mark === undefined ? {} : { mark }) }))

describe('mapOpinion (o fio do host, com cuidado)', () => {
  it('lê o pedido com os nomes finais: pergunta no corpo, rascunho, alt, público, estimativa, sem visão', () => {
    const mapped = mapOpinion(withOpinion(wire({ draftText: 'Versão 1 do texto', attachmentIds: ['att-1'], alt: 'Capa azul com um gato', audience: 'some', estimate: { responses: 3, cost: '≈ 3 chamadas' }, noVision: ['persona-bento'] })))
    expect(mapped).toMatchObject({ kind: 'request', requestId: 'req-1', draftText: 'Versão 1 do texto', imageIds: ['att-1'], alt: 'Capa azul com um gato', audience: 'some', estimate: { responses: 3, cost: '≈ 3 chamadas' }, noVision: ['persona-bento'] })
  })

  it('a resposta traz a marca; só as 4 conhecidas valem', () => {
    expect(mapOpinion(withOpinion(wire({ kind: 'reply', mark: 'liked' })))?.mark).toBe('liked')
    expect(mapOpinion(withOpinion(wire({ kind: 'reply', mark: 'nothing' })))?.mark).toBe('nothing')
    expect(mapOpinion(withOpinion({ ...wire({ kind: 'reply' }), mark: 'amei' }))?.mark).toBeUndefined()
  })

  it('a consolidação traz a versão com o antes e o depois (texto e imagem)', () => {
    const mapped = mapOpinion(withOpinion(wire({ kind: 'consolidated', version: { k: 2, before: { text: 'velho' }, after: { text: 'novo', attachmentIds: ['att-2'] } } })))
    expect(mapped?.version).toEqual({ k: 2, before: { text: 'velho', imageIds: [] }, after: { text: 'novo', imageIds: ['att-2'] } })
  })

  it('defaults honestos: rodada 1 de 2, público "team", sem estimativa inventada', () => {
    const mapped = mapOpinion(withOpinion({ kind: 'request', requestId: 'r' }))
    expect(mapped).toMatchObject({ round: 1, maxRounds: 2, audience: 'team', imageIds: [], noVision: [] })
    expect(mapped?.estimate).toBeUndefined()
  })

  it('lixo do host vira "não é opinião" (a mensagem segue comum)', () => {
    expect(mapOpinion(withOpinion(undefined))).toBeUndefined()
    expect(mapOpinion(withOpinion({ kind: 'palpite', requestId: 'r' }))).toBeUndefined()
    expect(mapOpinion(withOpinion({ kind: 'request' }))).toBeUndefined()
    expect(mapOpinion(withOpinion({ kind: 'request', requestId: '' }))).toBeUndefined()
    expect(mapOpinion(withOpinion({ kind: 'request', requestId: 'r', estimate: { responses: 0 } }))?.estimate).toBeUndefined()
  })
})

describe('o orçamento do Tally (opinion-budget.md): vale sobre os campos soltos', () => {
  it('o rodapé vem PRONTO em budget.rodape e é mostrado como veio', () => {
    expect(mapOpinion(withOpinion(wire({ budget: { rodape: '≈ 3 respostas' } })))?.footer).toBe('≈ 3 respostas')
    expect(mapOpinion(withOpinion(wire({ budget: { rodape: '   ' } })))?.footer).toBeUndefined()
  })

  it('"Rodada {i} de {n}" sai de budget.round e budget.roundsCap', () => {
    const mapped = mapOpinion(withOpinion(wire({ round: 1, maxRounds: 2, budget: { round: 2, roundsCap: 3 } })))
    expect(mapped).toMatchObject({ round: 2, maxRounds: 3 })
  })

  it('teto atingido: budget.stop === "rounds-cap"; outro valor não conta', () => {
    expect(mapOpinion(withOpinion(wire({ budget: { stop: 'rounds-cap' } })))?.capReached).toBe(true)
    expect(mapOpinion(withOpinion(wire({ budget: { stop: 'daily-cap' } })))?.capReached).toBeUndefined()
  })

  it('quem foi pulado por motor sem visão (skipped why "no-vision") soma ao noVision, sem repetir; os outros motivos não entram', () => {
    const mapped = mapOpinion(withOpinion(wire({ noVision: ['persona-bento'], budget: { skipped: [{ id: 'persona-bento', why: 'no-vision' }, { id: 'persona-nina', why: 'no-vision' }, { id: 'persona-sol', why: 'paused' }] } })))
    expect(mapped?.noVision).toEqual(['persona-bento', 'persona-nina'])
  })

  it('o cartão mostra o rodapé pronto do Tally (nunca recompõe por cima dele)', () => {
    render(<OpinionBlock t={t as never} block={block([request({ footer: '≈ 3 respostas', estimate: { responses: 9, cost: 'outro texto' } })])} team={TEAM} />)
    expect(card().textContent).toContain('≈ 3 respostas')
    expect(card().textContent).not.toContain('outro texto')
  })

  it('o sinal do Tally mostra a frase do teto mesmo sem consolidação', () => {
    render(<OpinionBlock t={t as never} block={block([request({ capReached: true, round: 2, maxRounds: 2 })])} team={TEAM} />)
    expect(within(card()).getByText('Nina já usou as 2 rodadas de opinião desta tarefa e segue com o que tem.')).toBeTruthy()
  })
})

describe('buildOpinionBlocks', () => {
  it('junta pergunta, respostas e consolidação de UM pedido; o cartão fica no lugar da pergunta', () => {
    const rows = [
      msg('m0', 'user', 'Ana', 'oi'),
      request(),
      reply('r1', 'bento', 'Bento', 'Gostei da azul', 'liked'),
      reply('r2', 'sol', 'Sol', 'Troque a fonte', 'suggestion'),
      msg('m-fin', 'nina', 'Nina', 'ficou assim', ui({ kind: 'consolidated' })),
    ]
    const block = buildOpinionBlocks(rows).get('req-1')
    expect(block?.firstIndex).toBe(1)
    expect(block?.replies.map(row => row.id)).toEqual(['r1', 'r2'])
    expect(block?.consolidated?.id).toBe('m-fin')
  })

  it('a resposta da PESSOA vem primeiro; a cópia mais recente de cada autor vence', () => {
    const block = buildOpinionBlocks([
      request(),
      reply('r1', 'bento', 'Bento', 'primeira', 'liked'),
      reply('r2', 'user', 'Você', 'minha', 'suggestion'),
      reply('r1b', 'bento', 'Bento', 'segunda', 'liked'),
    ]).get('req-1')
    expect(block?.replies.map(row => `${row.authorId}:${row.body}`)).toEqual(['user:minha', 'bento:segunda'])
  })

  it('pedidos diferentes não se misturam', () => {
    const blocks = buildOpinionBlocks([request(), msg('m-req2', 'nina', 'Nina', 'outra?', ui({ requestId: 'req-2' })), reply('rx', 'bento', 'Bento', 'ok', 'liked')])
    expect([...blocks.keys()].sort()).toEqual(['req-1', 'req-2'])
  })

  it('respostas sem a pergunta não viram bloco (aparecem como mensagens comuns)', () => {
    expect(buildOpinionBlocks([reply('r1', 'bento', 'Bento', 'ok', 'liked')]).size).toBe(0)
  })

  it('fio sem opinião: nenhum bloco', () => {
    expect(buildOpinionBlocks([msg('m', 'user', 'Ana', 'oi')]).size).toBe(0)
  })

  it('splitReplies separa quem não tem nada a acrescentar; roundsCapReached olha a consolidação da última rodada', () => {
    const { said, nothing } = splitReplies([reply('a', 'bento', 'Bento', 'bom', 'liked'), reply('b', 'sol', 'Sol', '', 'nothing')])
    expect(said.map(row => row.id)).toEqual(['a'])
    expect(nothing.map(row => row.id)).toEqual(['b'])
    const fin = (round: number) => msg('f', 'nina', 'Nina', 'x', ui({ kind: 'consolidated', round, maxRounds: 2 }))
    expect(roundsCapReached({ requestId: 'r', firstIndex: 0, request: request(), replies: [], consolidated: fin(2) })).toBe(true)
    expect(roundsCapReached({ requestId: 'r', firstIndex: 0, request: request(), replies: [], consolidated: fin(1) })).toBe(false)
    expect(roundsCapReached({ requestId: 'r', firstIndex: 0, request: request(), replies: [] })).toBe(false)
  })

  it('"Ler tudo" por linhas e por tamanho', () => {
    expect(needsReadAll('curto', 6)).toBe(false)
    expect(needsReadAll('1\n2\n3\n4\n5\n6\n7', 6)).toBe(true)
    expect(needsReadAll('x'.repeat(400), 6)).toBe(true)
    expect(needsReadAll('x'.repeat(150), 3)).toBe(false)
    expect(needsReadAll('x'.repeat(200), 3)).toBe(true)
  })
})

function block(rows: readonly ChannelMessageUi[]) {
  const model = buildOpinionBlocks(rows).get('req-1')
  if (model === undefined) throw new Error('sem bloco')
  return model
}
const card = (): HTMLElement => document.querySelector('[data-persona-opinion]') as HTMLElement
/** DESIGN-01: depois de consolidado o cartão é uma pílula; o clique a reabre (a versão Antes · Depois e as respostas moram atrás dele). */
const openPill = (): void => { const pill = document.querySelector('[data-persona-opinion-pill]'); if (pill !== null) fireEvent.click(pill) }

describe('o cartão', () => {
  it('eyebrow "{A} quer a opinião da equipe", rodada, e a pergunta como texto', () => {
    render(<OpinionBlock t={t as never} block={block([request()])} team={TEAM} />)
    expect(within(card()).getByText('Nina quer a opinião da equipe')).toBeTruthy()
    expect(within(card()).getByText('Rodada 1 de 2')).toBeTruthy()
    expect(within(card()).getByText('Qual destas capas funciona melhor?')).toBeTruthy()
  })

  it('com uma rodada só não mostra "Rodada"', () => {
    render(<OpinionBlock t={t as never} block={block([request({ maxRounds: 1 })])} team={TEAM} />)
    expect(card().textContent).not.toContain('Rodada')
  })

  it('pergunta e rascunho são TEXTO: HTML/script da persona nunca vira marcação', () => {
    const evil = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>'
    render(<OpinionBlock t={t as never} block={block([msg('m-req', 'nina', 'Nina', evil, ui({ draftText: evil }))])} team={TEAM} />)
    expect(card().querySelector('script')).toBeNull()
    expect(card().querySelector('img[src="x"], [onerror]')).toBeNull()
    expect(card().textContent).toContain('<script>')
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined()
  })

  it('rascunho em texto: até 6 linhas e "Ler tudo" que abre o resto', () => {
    const long = Array.from({ length: 9 }, (_, i) => `linha ${String(i + 1)}`).join('\n')
    render(<OpinionBlock t={t as never} block={block([msg('m-req', 'nina', 'Nina', 'Que tal?', ui({ draftText: long }))])} team={TEAM} />)
    expect(card().querySelector('[data-clamped="6"]')).not.toBeNull()
    fireEvent.click(within(card()).getByRole('button', { name: 'Ler tudo' }))
    expect(card().querySelector('[data-clamped]')).toBeNull()
    expect(within(card()).queryByRole('button', { name: 'Ler tudo' })).toBeNull()
  })

  it('o rodapé "≈ n respostas · custo" sai só quando o Tally mediu', () => {
    const { unmount } = render(<OpinionBlock t={t as never} block={block([request()])} team={TEAM} />)
    expect(card().textContent).not.toContain('≈')
    unmount()
    render(<OpinionBlock t={t as never} block={block([request({ estimate: { responses: 4, cost: '≈ 4 chamadas da sua IA' } })])} team={TEAM} />)
    expect(card().textContent).toContain('≈ 4 respostas · ≈ 4 chamadas da sua IA')
  })
})

describe('a imagem do rascunho', () => {
  const resolve = (url: string | null) => vi.fn(() => Promise.resolve(url))

  it('miniatura com o alt que a persona escreveu; o clique abre em tamanho real', async () => {
    render(<OpinionBlock t={t as never} block={block([request({ imageIds: ['att-1'], alt: 'Capa azul com um gato' })])} team={TEAM} resolveImage={resolve('data:image/png;base64,AAAA')} />)
    const button = await screen.findByRole('button', { name: 'Capa azul com um gato' })
    expect(within(button).getByRole('img', { name: 'Capa azul com um gato' }).getAttribute('src')).toBe('data:image/png;base64,AAAA')
    fireEvent.click(button)
    expect(screen.getAllByRole('img', { name: 'Capa azul com um gato' })).toHaveLength(2)
  })

  it('sem alt da persona: "Imagem enviada por {A}"', async () => {
    render(<OpinionBlock t={t as never} block={block([request({ imageIds: ['att-1'] })])} team={TEAM} resolveImage={resolve('data:image/png;base64,AAAA')} />)
    expect(await screen.findByRole('img', { name: 'Imagem enviada por Nina' })).toBeTruthy()
  })

  it('imagem que não carrega (ou sem host): o alt no lugar, nunca um quadro quebrado', async () => {
    const { unmount } = render(<OpinionBlock t={t as never} block={block([request({ imageIds: ['att-1'], alt: 'Capa azul' })])} team={TEAM} resolveImage={resolve(null)} />)
    expect(await screen.findByText('Capa azul')).toBeTruthy()
    expect(card().querySelector('img[class*="thumb"]')).toBeNull()
    unmount()
    render(<OpinionBlock t={t as never} block={block([request({ imageIds: ['att-1'], alt: 'Capa azul' })])} team={TEAM} />)
    expect(await screen.findByText('Capa azul')).toBeTruthy()
  })
})

describe('as respostas', () => {
  const rows = [
    request(),
    reply('r1', 'bento', 'Bento', 'Gostei da azul', 'liked'),
    reply('r2', 'sol', 'Sol', 'Troque a fonte', 'suggestion'),
    reply('r3', 'luna', 'Luna', 'O contraste está baixo', 'attention'),
    reply('r4', 'atlas', 'Atlas', '', 'nothing'),
    reply('r5', 'bia', 'Bia', '', 'nothing'),
  ]

  it('uma linha por persona com a marca: Gostei, Sugestão, Ponto de atenção', () => {
    render(<OpinionBlock t={t as never} block={block(rows)} team={TEAM} />)
    const lines = [...card().querySelectorAll('li')].map(node => node.textContent ?? '')
    expect(lines.some(text => text.includes('Bento') && text.includes('Gostei'))).toBe(true)
    expect(lines.some(text => text.includes('Sol') && text.includes('Sugestão'))).toBe(true)
    expect(lines.some(text => text.includes('Luna') && text.includes('Ponto de atenção'))).toBe(true)
  })

  it('quem não tem nada a acrescentar recolhe em "e mais 2 sem nada a acrescentar"', () => {
    render(<OpinionBlock t={t as never} block={block(rows)} team={TEAM} />)
    expect(within(card()).getByText('e mais 2 sem nada a acrescentar')).toBeTruthy()
    expect(card().textContent).not.toContain('Atlas')
  })

  it('a resposta da pessoa aparece primeiro, como "Você"', () => {
    render(<OpinionBlock t={t as never} block={block([request(), reply('r1', 'bento', 'Bento', 'bom', 'liked'), reply('rme', 'user', 'Você', 'Eu prefiro a verde', 'suggestion')])} team={TEAM} />)
    const names = [...card().querySelectorAll('[class*="replyName"]')].map(node => node.textContent)
    expect(names).toEqual(['Você', 'Bento'])
  })

  it('resposta de persona é texto (nunca marcação)', () => {
    render(<OpinionBlock t={t as never} block={block([request(), reply('r1', 'bento', 'Bento', '<b>negrito</b>', 'liked')])} team={TEAM} />)
    expect(card().querySelector('b')).toBeNull()
    expect(card().textContent).toContain('<b>negrito</b>')
  })

  it('"Dar minha opinião" só existe com o que ele faz, e some depois de consolidado', () => {
    const onGiveOpinion = vi.fn()
    const { unmount } = render(<OpinionBlock t={t as never} block={block([request()])} team={TEAM} />)
    expect(within(card()).queryByRole('button', { name: 'Dar minha opinião' })).toBeNull()
    unmount()
    render(<OpinionBlock t={t as never} block={block([request()])} team={TEAM} onGiveOpinion={onGiveOpinion} />)
    fireEvent.click(within(card()).getByRole('button', { name: 'Dar minha opinião' }))
    expect(onGiveOpinion).toHaveBeenCalledWith({ requestId: 'req-1', question: 'Qual destas capas funciona melhor?' })
  })
})

describe('motor sem visão', () => {
  it('"e mais n que não veem imagens neste motor" recolhido; ao abrir, uma linha por persona com "Trocar o motor"', () => {
    const onChangeEngine = vi.fn()
    render(<OpinionBlock t={t as never} block={block([request({ imageIds: ['a'], noVision: ['persona-bento', 'persona-nina'] })])} team={TEAM} onChangeEngine={onChangeEngine} resolveImage={() => Promise.resolve(null)} />)
    expect(card().textContent).not.toContain('não consegue ver imagens')
    fireEvent.click(within(card()).getByRole('button', { name: 'e mais 2 que não veem imagens neste motor' }))
    expect(within(card()).getByText('Bento não consegue ver imagens neste motor.')).toBeTruthy()
    fireEvent.click(within(card()).getAllByRole('button', { name: 'Trocar o motor' })[0] as HTMLElement)
    expect(onChangeEngine).toHaveBeenCalledWith('persona-bento')
  })

  it('sem como trocar o motor não há botão morto', () => {
    render(<OpinionBlock t={t as never} block={block([request({ noVision: ['persona-bento'] })])} team={TEAM} />)
    fireEvent.click(within(card()).getByRole('button', { name: 'e mais 1 que não veem imagens neste motor' }))
    expect(within(card()).queryByRole('button', { name: 'Trocar o motor' })).toBeNull()
  })
})

describe('a consolidação', () => {
  const fin = (extra: Partial<OpinionUi> = {}) => msg('m-fin', 'nina', 'Nina', 'Troquei a fonte e escureci a capa', ui({ kind: 'consolidated', ...extra }))

  it('DESIGN-01: depois de consolidado o cartão recolhe numa pílula; a pergunta, as respostas e a frase ficam a 1 clique, e as respostas voltam a recolher', () => {
    render(<OpinionBlock t={t as never} block={block([request(), reply('r1', 'bento', 'Bento', 'bom demais', 'liked'), fin()])} team={TEAM} />)
    expect(card().getAttribute('data-collapsed')).toBe('')
    expect(card().textContent).toContain('Nina ouviu Bento')
    expect(card().textContent).not.toContain('Qual destas capas funciona melhor?')
    expect(card().textContent).not.toContain('bom demais')
    const pill = document.querySelector('[data-persona-opinion-pill]') as HTMLElement
    expect(pill.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(pill)
    expect(card().textContent).toContain('Qual destas capas funciona melhor?')
    expect(card().textContent).toContain('Nina juntou as opiniões: Troquei a fonte e escureci a capa')
    expect(card().textContent).toContain('bom demais')
    expect(card().getAttribute('data-collapsed')).toBeNull()
    const hide = within(card()).getByRole('button', { name: 'Ocultar respostas' })
    expect(hide.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(hide)
    expect(card().textContent).not.toContain('bom demais')
    expect(document.querySelector('[data-persona-opinion-pill]')).not.toBeNull()
  })

  it('DESIGN-01: os chips das marcas ficam NA pílula e contam cada uma ("2 Gostei", "1 Sugestão"), na ordem Gostei · Sugestão · Ponto de atenção, sem chip para marca que ninguém usou', () => {
    render(<OpinionBlock t={t as never} block={block([
      request(),
      reply('r1', 'bento', 'Bento', 'a', 'liked'), reply('r2', 'sol', 'Sol', 'b', 'liked'), reply('r3', 'luna', 'Luna', 'c', 'suggestion'),
      reply('r4', 'atlas', 'Atlas', '', 'nothing'),
      fin(),
    ])} team={TEAM} />)
    expect([...card().querySelectorAll('[class*="pillMarks"] > *')].map(node => node.textContent)).toEqual(['2 Gostei', '1 Sugestão'])
  })

  it('só "nada a acrescentar": a pílula não tem chips e diz que juntou as opiniões; as respostas seguem a 1 clique; sem resposta nenhuma o cartão abre com "Recolher"', () => {
    const { unmount } = render(<OpinionBlock t={t as never} block={block([request(), reply('r4', 'atlas', 'Atlas', '', 'nothing'), fin()])} team={TEAM} />)
    expect(card().querySelector('[class*="pillMarks"]')).toBeNull()
    expect(document.querySelector('[data-persona-opinion-pill]')?.textContent).toContain('Nina juntou as opiniões')
    fireEvent.click(document.querySelector('[data-persona-opinion-pill]') as HTMLElement)
    expect(within(card()).getByRole('button', { name: 'Ocultar respostas' })).toBeTruthy()
    unmount()
    render(<OpinionBlock t={t as never} block={block([request(), fin()])} team={TEAM} />)
    fireEvent.click(document.querySelector('[data-persona-opinion-pill]') as HTMLElement)
    expect(within(card()).queryByRole('button', { name: 'Ocultar respostas' })).toBeNull()
    expect(within(card()).getByRole('button', { name: 'Recolher' })).toBeTruthy()
  })

  it('DESIGN-01: sem arte da persona, a imagem que a pessoa anexou fica a 1 clique da pílula e abre inline em tamanho normal (nada some)', async () => {
    render(<OpinionBlock
      t={t as never}
      block={block([request({ imageIds: ['att-1'], alt: 'Capa azul' }), reply('r1', 'bento', 'Bento', 'bom', 'liked'), fin()])}
      team={TEAM}
      resolveImage={() => Promise.resolve('data:image/png;base64,AAAA')}
    />)
    expect(card().querySelector('img[class*="thumb"]')).toBeNull()
    fireEvent.click(document.querySelector('[data-persona-opinion-pill]') as HTMLElement)
    await waitFor(() => { expect(card().querySelector('img[class*="thumb"]')).not.toBeNull() })
    const img = card().querySelector('img[class*="thumb"]') as HTMLImageElement
    expect(img.alt).toBe('Capa azul')
    expect(img.className).not.toContain('thumbSmall')
    fireEvent.click(img.closest('button') as HTMLElement)
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('antes de consolidar nada muda: o cartão segue aberto, sem "Ver respostas", e a imagem em tamanho normal', async () => {
    render(<OpinionBlock
      t={t as never}
      block={block([request({ imageIds: ['att-1'], alt: 'Capa azul' }), reply('r1', 'bento', 'Bento', 'bom', 'liked')])}
      team={TEAM}
      resolveImage={() => Promise.resolve('data:image/png;base64,AAAA')}
    />)
    expect(card().getAttribute('data-collapsed')).toBeNull()
    expect(within(card()).queryByRole('button', { name: 'Ver respostas' })).toBeNull()
    await waitFor(() => { expect(card().querySelector('img[class*="thumb"]')).not.toBeNull() })
    expect((card().querySelector('img[class*="thumb"]') as HTMLImageElement).className).not.toContain('thumbSmall')
  })

  it('versão de TEXTO: "Versão 2" com o alternador Antes · Depois', () => {
    render(<OpinionBlock t={t as never} block={block([request(), fin({ version: { k: 2, before: { text: 'texto velho', imageIds: [] }, after: { text: 'texto novo', imageIds: [] } } })])} team={TEAM} />)
    openPill()
    expect(within(card()).getByText('Versão 2')).toBeTruthy()
    expect(within(card()).getByText('texto novo')).toBeTruthy()
    fireEvent.click(within(card()).getByRole('button', { name: 'Antes' }))
    expect(within(card()).getByText('texto velho')).toBeTruthy()
    expect(within(card()).getByRole('button', { name: 'Antes' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('versão de IMAGEM: as duas miniaturas, cada uma com o nome do lado', async () => {
    render(<OpinionBlock
      t={t as never}
      block={block([request({ alt: 'Capa' }), fin({ version: { k: 2, before: { imageIds: ['a'] }, after: { imageIds: ['b'] } } })])}
      team={TEAM}
      resolveImage={() => Promise.resolve('data:image/png;base64,AAAA')}
    />)
    openPill()
    expect(await screen.findByRole('img', { name: 'Antes: Capa' })).toBeTruthy()
    expect(await screen.findByRole('img', { name: 'Depois: Capa' })).toBeTruthy()
  })

  it('GAUGE 07/11: a consolidação SEM nova versão (só promete) mostra apenas a frase: nada de "Versão k", de coluna "Depois" sem conteúdo nem de alternador', () => {
    // modo IMAGEM: o "Antes" tem imagem e o "Depois" não tem nada
    const { unmount } = render(<OpinionBlock
      t={t as never}
      block={block([request({ alt: 'Capa' }), fin({ version: { k: 2, before: { imageIds: ['a'] }, after: { imageIds: [] } } })])}
      team={TEAM}
      resolveImage={() => Promise.resolve('data:image/png;base64,AAAA')}
    />)
    openPill()
    expect(card().textContent).toContain('Nina juntou as opiniões: Troquei a fonte e escureci a capa')
    expect(within(card()).queryByText('Versão 2')).toBeNull()
    expect(card().querySelector('figure')).toBeNull()
    expect(within(card()).queryByText('Depois')).toBeNull()
    expect(within(card()).queryByText('Antes')).toBeNull()
    unmount()
    // modo TEXTO: o "Antes" tem texto e o "Depois" não tem nada (o alternador mostraria um parágrafo vazio)
    render(<OpinionBlock t={t as never} block={block([request(), fin({ version: { k: 2, before: { text: 'texto velho', imageIds: [] }, after: { imageIds: [] } } })])} team={TEAM} />)
    openPill()
    expect(card().textContent).toContain('Nina juntou as opiniões')
    expect(within(card()).queryByText('Versão 2')).toBeNull()
    expect(within(card()).queryByRole('button', { name: 'Depois' })).toBeNull()
    expect(within(card()).queryByRole('button', { name: 'Antes' })).toBeNull()
  })

  it('o "Depois" só com espaços também é "sem nova versão"', () => {
    render(<OpinionBlock t={t as never} block={block([request(), fin({ version: { k: 2, before: { text: 'velho', imageIds: [] }, after: { text: '   ', imageIds: [] } } })])} team={TEAM} />)
    openPill()
    expect(within(card()).queryByText('Versão 2')).toBeNull()
    expect(within(card()).queryByRole('button', { name: 'Depois' })).toBeNull()
  })

  it('com nova versão nada mudou: a imagem do "Depois" traz as duas colunas, e o texto novo traz o alternador', async () => {
    const { unmount } = render(<OpinionBlock
      t={t as never}
      block={block([request({ alt: 'Capa' }), fin({ version: { k: 3, before: { imageIds: ['a'] }, after: { imageIds: ['b'] } } })])}
      team={TEAM}
      resolveImage={() => Promise.resolve('data:image/png;base64,AAAA')}
    />)
    openPill()
    expect(within(card()).getByText('Versão 3')).toBeTruthy()
    expect(await screen.findByRole('img', { name: 'Depois: Capa' })).toBeTruthy()
    unmount()
    render(<OpinionBlock t={t as never} block={block([request(), fin({ version: { k: 2, before: { text: 'velho', imageIds: [] }, after: { text: 'novo', imageIds: [] } } })])} team={TEAM} />)
    openPill()
    expect(within(card()).getByRole('button', { name: 'Depois' })).toBeTruthy()
    expect(within(card()).getByText('novo')).toBeTruthy()
  })

  it('no teto de rodadas a última linha é a frase do teto (sem cor de alerta)', () => {
    render(<OpinionBlock t={t as never} block={block([request({ round: 2 }), fin({ round: 2, maxRounds: 2 })])} team={TEAM} />)
    expect(within(card()).getByText('Nina já usou as 2 rodadas de opinião desta tarefa e segue com o que tem.')).toBeTruthy()
  })

  it('antes do teto não aparece a frase', () => {
    render(<OpinionBlock t={t as never} block={block([request(), fin({ round: 1, maxRounds: 2 })])} team={TEAM} />)
    expect(card().textContent).not.toContain('já usou as')
  })

  it('MUSE 07/11: com UMA rodada o teto fala no singular ("a rodada"), nunca "as 1 rodadas"; com 2 ou mais segue o plural', () => {
    const { unmount } = render(<OpinionBlock t={t as never} block={block([request({ round: 1, maxRounds: 1 }), fin({ round: 1, maxRounds: 1 })])} team={TEAM} />)
    expect(within(card()).getByText('Nina já usou a rodada de opinião desta tarefa e segue com o que tem.')).toBeTruthy()
    expect(card().textContent).not.toContain('1 rodadas')
    unmount()
    render(<OpinionBlock t={t as never} block={block([request({ round: 3, maxRounds: 3 }), fin({ round: 3, maxRounds: 3 })])} team={TEAM} />)
    expect(within(card()).getByText('Nina já usou as 3 rodadas de opinião desta tarefa e segue com o que tem.')).toBeTruthy()
  })
})

describe('no fio (MessageList)', () => {
  const view = (messages: readonly ChannelMessageUi[]) => (
    <GeneralChannelView t={t as never} shellT={key => shellPt[key as keyof typeof shellPt] ?? key} members={[]} messages={messages} team={TEAM} />
  )
  const thread = [msg('m0', 'user', 'Ana', 'Preciso de uma capa'), request(), reply('r1', 'bento', 'Bento', 'Gostei da azul', 'liked')]

  it('sem a flag teamwork o pedido aparece como mensagem comum (nada de cartão)', () => {
    render(view(thread))
    expect(document.querySelector('[data-persona-opinion]')).toBeNull()
    expect(screen.getByText('Qual destas capas funciona melhor?')).toBeTruthy()
  })

  it('com a flag: UM cartão; as respostas moram dentro dele e não repetem como mensagens', () => {
    localStorage.setItem('persona.flag.teamwork', '1')
    render(view(thread))
    expect(document.querySelectorAll('[data-persona-opinion]')).toHaveLength(1)
    expect(screen.getAllByText('Gostei da azul')).toHaveLength(1)
    expect(card().textContent).toContain('Bento')
  })

  it('a resposta que chega depois entra no MESMO cartão (o cartão não duplica)', () => {
    localStorage.setItem('persona.flag.teamwork', '1')
    const { rerender } = render(view(thread))
    rerender(view([...thread, reply('r2', 'sol', 'Sol', 'Troque a fonte', 'suggestion')]))
    expect(document.querySelectorAll('[data-persona-opinion]')).toHaveLength(1)
    expect(card().textContent).toContain('Troque a fonte')
  })

  it('resposta sem a pergunta no fio continua como mensagem comum (nada some)', () => {
    localStorage.setItem('persona.flag.teamwork', '1')
    render(view([msg('m0', 'user', 'Ana', 'oi'), reply('r1', 'bento', 'Bento', 'Solta no ar', 'liked')]))
    expect(document.querySelector('[data-persona-opinion]')).toBeNull()
    expect(screen.getByText('Solta no ar')).toBeTruthy()
  })
})

describe('"Dar minha opinião" (TEAM-8c): o chip do composer e a resposta da pessoa', () => {
  const thread = [request(), reply('r1', 'bento', 'Bento', 'Gostei da azul', 'liked')]
  const mountWithSend = () => {
    const onSendMessage = vi.fn()
    render(<GeneralChannelView t={t as never} shellT={key => shellPt[key as keyof typeof shellPt] ?? key} members={[]} messages={thread} team={TEAM} onSendMessage={onSendMessage} />)
    return { onSendMessage }
  }
  const field = (): HTMLTextAreaElement => screen.getByPlaceholderText(/Mensagem|Escreva/u) as HTMLTextAreaElement

  it('o botão aparece no cartão aberto (com a flag) e põe o chip "Opinando sobre: {pergunta}" no composer, com o foco no campo', () => {
    localStorage.setItem('persona.flag.teamwork', '1')
    mountWithSend()
    fireEvent.click(within(card()).getByRole('button', { name: 'Dar minha opinião' }))
    expect(document.querySelector('[data-persona-opinion-context]')?.textContent).toContain('Opinando sobre: Qual destas capas funciona melhor?')
    expect(document.activeElement).toBe(field())
  })

  it('enviar leva options.opinionFor = o requestId e o chip some', () => {
    localStorage.setItem('persona.flag.teamwork', '1')
    const { onSendMessage } = mountWithSend()
    fireEvent.click(within(card()).getByRole('button', { name: 'Dar minha opinião' }))
    fireEvent.change(field(), { target: { value: 'Prefiro a verde' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onSendMessage).toHaveBeenCalledWith('Prefiro a verde', [], { opinionFor: 'req-1' })
    expect(document.querySelector('[data-persona-opinion-context]')).toBeNull()
  })

  it('cancelar (✕) tira o chip e a mensagem seguinte sai comum', () => {
    localStorage.setItem('persona.flag.teamwork', '1')
    const { onSendMessage } = mountWithSend()
    fireEvent.click(within(card()).getByRole('button', { name: 'Dar minha opinião' }))
    fireEvent.click(within(document.querySelector('[data-persona-opinion-context]') as HTMLElement).getByRole('button', { name: 'Cancelar' }))
    expect(document.querySelector('[data-persona-opinion-context]')).toBeNull()
    fireEvent.change(field(), { target: { value: 'Outra coisa' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onSendMessage).toHaveBeenCalledWith('Outra coisa', [])
  })

  it('sem a flag teamwork não há cartão nem botão', () => {
    mountWithSend()
    expect(screen.queryByRole('button', { name: 'Dar minha opinião' })).toBeNull()
  })
})

describe('attachment-image (bytes do host -> data URL)', () => {
  const scope = { workspaceId: 'ws', projectId: 'pr' }

  it('PNG/JPEG/WebP/GIF viram data URL; o pedido leva o escopo e o id', async () => {
    const getAttachmentBytes = vi.fn(() => ({ id: 'a', name: 'capa.png', mime: 'image/png', bytesBase64: 'AAAA', credentialWarning: false }))
    expect(await resolveAttachmentImage({ getAttachmentBytes }, scope, 'att-1')).toBe('data:image/png;base64,AAAA')
    expect(getAttachmentBytes).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'pr', attachmentId: 'att-1' })
  })

  it('o resultado fica guardado por anexo (uma ida ao host)', async () => {
    const getAttachmentBytes = vi.fn(() => ({ mime: 'image/webp', bytesBase64: 'BBBB' }))
    await resolveAttachmentImage({ getAttachmentBytes }, scope, 'att-2')
    await resolveAttachmentImage({ getAttachmentBytes }, scope, 'att-2')
    expect(getAttachmentBytes).toHaveBeenCalledTimes(1)
  })

  it('desembrulha { ok, value } e recusa tudo que não é imagem (SVG, HTML, texto)', async () => {
    expect(await resolveAttachmentImage({ getAttachmentBytes: () => ({ ok: true, value: { mime: 'image/jpeg', bytesBase64: 'CCCC' } }) }, scope, 'att-3')).toBe('data:image/jpeg;base64,CCCC')
    for (const [index, mime] of ['image/svg+xml', 'text/html', 'application/pdf', 'image/png; charset=x'].entries()) {
      expect(await resolveAttachmentImage({ getAttachmentBytes: () => ({ mime, bytesBase64: 'DDDD' }) }, scope, `att-bad-${String(index)}`)).toBeNull()
    }
  })

  it('erro do host, bytes vazios ou host sem o método: null (e a falha não fica guardada)', async () => {
    const flaky = vi.fn().mockReturnValueOnce({ ok: false, error: { code: 'forbidden' } }).mockReturnValueOnce({ mime: 'image/png', bytesBase64: 'EEEE' })
    expect(await resolveAttachmentImage({ getAttachmentBytes: flaky }, scope, 'att-4')).toBeNull()
    expect(await resolveAttachmentImage({ getAttachmentBytes: flaky }, scope, 'att-4')).toBe('data:image/png;base64,EEEE')
    expect(await resolveAttachmentImage({ getAttachmentBytes: () => { throw new Error('x') } }, scope, 'att-5')).toBeNull()
    expect(await resolveAttachmentImage({ getAttachmentBytes: () => ({ mime: 'image/png', bytesBase64: '' }) }, scope, 'att-6')).toBeNull()
    expect(attachmentBytesRemoteFrom({ other: 1 })).toBeUndefined()
    expect(attachmentBytesRemoteFrom(undefined)).toBeUndefined()
  })
})

describe('sem visão: "Incluir só pelo texto" (team-real.md §12, Muse 04:07)', () => {
  const blindRequest = (extra: Partial<OpinionUi> = {}) => request({ imageIds: ['att-1'], alt: 'Capa azul', noVision: ['persona-bento', 'persona-nina'], ...extra })
  const open = (count: number) => fireEvent.click(within(card()).getByRole('button', { name: `e mais ${String(count)} que não veem imagens neste motor` }))

  it('mapOpinion: o pedido traz textOnlyPersonaIds; só a RESPOSTA traz textOnly (e só com true)', () => {
    expect(mapOpinion(withOpinion(wire({ noVision: ['persona-bento'], textOnlyPersonaIds: ['persona-bento'] })))?.textOnlyPersonaIds).toEqual(['persona-bento'])
    expect(mapOpinion(withOpinion(wire({ noVision: ['persona-bento'] })))?.textOnlyPersonaIds).toBeUndefined()
    expect(mapOpinion(withOpinion(wire({ kind: 'reply', mark: 'liked', textOnly: true })))?.textOnly).toBe(true)
    expect(mapOpinion(withOpinion(wire({ kind: 'reply', mark: 'liked', textOnly: false })))?.textOnly).toBeUndefined()
    expect(mapOpinion(withOpinion(wire({ kind: 'reply', mark: 'liked' })))?.textOnly).toBeUndefined()
    expect(mapOpinion(withOpinion(wire({ kind: 'request', textOnly: true })))?.textOnly).toBeUndefined()
  })

  it('o recolhido é noVision − textOnlyPersonaIds: "e mais 1 que não veem imagens neste motor"; todos incluídos = sem recolhido', () => {
    const { unmount } = render(<OpinionBlock t={t as never} block={block([blindRequest({ textOnlyPersonaIds: ['persona-bento'] })])} team={TEAM} />)
    expect(within(card()).getByRole('button', { name: 'e mais 1 que não veem imagens neste motor' })).toBeTruthy()
    unmount()
    render(<OpinionBlock t={t as never} block={block([blindRequest({ textOnlyPersonaIds: ['persona-bento', 'persona-nina'] })])} team={TEAM} />)
    expect(card().textContent).not.toContain('não veem imagens')
  })

  it('ao expandir: "{nome} não consegue ver imagens neste motor." + Incluir só pelo texto + Trocar o motor, por persona', () => {
    render(<OpinionBlock t={t as never} block={block([blindRequest()])} team={TEAM} onIncludeTextOnly={() => Promise.resolve()} onChangeEngine={vi.fn()} />)
    open(2)
    const rowsOfBlind = [...card().querySelectorAll('li[class*="blindRow"]')]
    expect(rowsOfBlind).toHaveLength(2)
    expect(rowsOfBlind[0]?.textContent).toContain('Bento não consegue ver imagens neste motor.')
    expect(within(rowsOfBlind[0] as HTMLElement).getByRole('button', { name: 'Incluir só pelo texto' })).toBeTruthy()
    expect(within(rowsOfBlind[0] as HTMLElement).getByRole('button', { name: 'Trocar o motor' })).toBeTruthy()
  })

  it('sem a função do host não há botão morto: só Trocar o motor (e sem ele, só a frase)', () => {
    render(<OpinionBlock t={t as never} block={block([blindRequest()])} team={TEAM} onChangeEngine={vi.fn()} />)
    open(2)
    expect(within(card()).queryByRole('button', { name: 'Incluir só pelo texto' })).toBeNull()
    expect(within(card()).getAllByRole('button', { name: 'Trocar o motor' })).toHaveLength(2)
  })

  it('Trocar o motor abre o seletor daquela persona (o id da persona no host)', () => {
    const onChangeEngine = vi.fn()
    render(<OpinionBlock t={t as never} block={block([blindRequest()])} team={TEAM} onChangeEngine={onChangeEngine} />)
    open(2)
    fireEvent.click(within(card()).getAllByRole('button', { name: 'Trocar o motor' })[1] as HTMLElement)
    expect(onChangeEngine).toHaveBeenCalledWith('persona-nina')
  })

  it('clicar chama o host com o requestId e a persona; carrega e desliga o botão; depois a persona sai do recolhido', async () => {
    let resolve: () => void = () => undefined
    const onIncludeTextOnly = vi.fn(() => new Promise<void>((done) => { resolve = done }))
    render(<OpinionBlock t={t as never} block={block([blindRequest()])} team={TEAM} onIncludeTextOnly={onIncludeTextOnly} />)
    open(2)
    const first = within(card()).getAllByRole('button', { name: 'Incluir só pelo texto' })[0] as HTMLButtonElement
    fireEvent.click(first)
    expect(onIncludeTextOnly).toHaveBeenCalledWith({ requestId: 'req-1', personaId: 'persona-bento' })
    expect(first.disabled).toBe(true)
    await act(async () => { resolve(); await Promise.resolve() })
    await waitFor(() => { expect(card().textContent).not.toContain('Bento não consegue') })
    expect(card().textContent).toContain('Nina não consegue ver imagens neste motor.')
  })

  it('o host recusa: a frase dele aparece (nunca uma inventada) e o botão volta', async () => {
    const onIncludeTextOnly = vi.fn(() => Promise.reject(new Error('Bento está em pausa agora.')))
    render(<OpinionBlock t={t as never} block={block([blindRequest()])} team={TEAM} onIncludeTextOnly={onIncludeTextOnly} />)
    open(2)
    fireEvent.click(within(card()).getAllByRole('button', { name: 'Incluir só pelo texto' })[0] as HTMLElement)
    expect((await screen.findByRole('alert')).textContent).toBe('Bento está em pausa agora.')
    expect((within(card()).getAllByRole('button', { name: 'Incluir só pelo texto' })[0] as HTMLButtonElement).disabled).toBe(false)
    expect(card().textContent).toContain('Bento não consegue ver imagens neste motor.')
  })

  it('a resposta de quem opinou só pelo texto leva SEMPRE o chip neutro "Opinou só pelo texto" ao lado do nome (também sem marca)', () => {
    render(<OpinionBlock t={t as never} block={block([
      blindRequest({ textOnlyPersonaIds: ['persona-bento', 'persona-nina'] }),
      msg('r1', 'bento', 'Bento', 'Não vi a imagem, mas o texto está bom.', ui({ kind: 'reply', mark: 'liked', textOnly: true })),
      msg('r2', 'nina', 'Nina', '', ui({ kind: 'reply', mark: 'nothing', textOnly: true })),
      reply('r3', 'sol', 'Sol', 'Gostei da azul', 'liked'),
    ])} team={TEAM} />)
    const badges = [...card().querySelectorAll('[data-persona-text-only]')]
    expect(badges.map(node => node.textContent)).toEqual(['Opinou só pelo texto', 'Opinou só pelo texto'])
    const names = badges.map(node => node.closest('li')?.querySelector('[class*="replyName"]')?.textContent)
    expect(names).toEqual(['Bento', 'Nina'])
    // quem viu a imagem não leva o chip, e o "nada a acrescentar" de quem opinou só pelo texto NÃO some no recolhido
    expect(card().textContent).not.toContain('e mais 1 sem nada a acrescentar')
    expect(card().querySelectorAll('[data-persona-text-only]')).toHaveLength(2)
  })
})
