/**
 * Marco Dogfood M2 — o RESUMO DO DIA da responsável (contrato: persona-spec/contracts/marco-dogfood-resumo.md §6). Compositor PURO: os fatos do quadro (montados pelo Flint pela visão do leitor
 * MENOS privilegiado, só deste projeto) entram, o texto do post (ou `undefined` = dia vazio, silêncio) sai. Sem modelo, sem relógio, sem host.
 *
 * Divisão dos 9 testes do §6:
 *   AQUI (compositor): 2 (segredo/técnico nos títulos), 3 (dia vazio), 4 (id e dia local), 6 (tom), 7 (repetição), 8 (só dados do post), 9 (teto) + 1 (um resumo só tem os fatos que recebe).
 *   NO GANCHO DO FLINT (project-lead.ts, precisa do quadro de verdade): 1 (cerca de projeto: marca do projeto B nunca no resumo do A), 2 (cartão nascido de DM, memória de DM, id de registro),
 *     5 (Janela de silêncio 22h–8h em UTC-3: o post sai às 11:00Z; responsável/equipe pausada não posta), 8 (o Cofre de memória não ganha registro).
 * Ao entrar na árvore: packages/persona/persona-host/src/day-summary.ts + tests/day-summary.spec.ts (os imports '../src/day-summary.ts' já são os certos).
 */
import { describe, expect, it } from 'vitest'
import { composeDaySummary, daySummaryId, localDayOf, type DaySummaryFacts, type DaySummaryText } from '../src/day-summary.ts'

const BIA = { id: 'bia', name: 'Bia' }
const facts = (over: Partial<DaySummaryFacts> = {}): DaySummaryFacts => ({ projectId: 'loja', dayLocal: '2026-11-10', responsible: BIA, done: [], doing: [], waiting: [], stuck: [], teamMemory: [], tomorrow: [], ...over })
const posted = (summary: DaySummaryText | undefined): DaySummaryText => {
  if (summary === undefined) throw new Error('dia vazio: não postou')
  return summary
}
const everything = (summary: DaySummaryText | undefined): string => JSON.stringify(summary ?? null)
const words = (text: string): number => text.split(/\s+/u).filter(part => part !== '').length
/** The visible part of the post: everything before the fold. */
const visibleOf = (summary: DaySummaryText): string => summary.text.split('<details')[0] ?? ''

describe('resumo do dia (compositor puro)', () => {
  it('1. um resumo só diz o que recebeu: dois projetos, duas mensagens com as marcas de cada um e ids diferentes', () => {
    const a = posted(composeDaySummary(facts({ done: [{ title: 'Cartaz MARCA-LOJA-A', by: 'Teo' }] })))
    const b = posted(composeDaySummary(facts({ projectId: 'cafe', done: [{ title: 'Cardápio MARCA-LOJA-B', by: 'Nina' }] })))
    expect(everything(a)).toContain('MARCA-LOJA-A')
    expect(everything(a)).not.toContain('MARCA-LOJA-B')
    expect(everything(b)).toContain('MARCA-LOJA-B')
    expect(everything(b)).not.toContain('MARCA-LOJA-A')
  })

  it('2. segredo nunca aparece (texto nem dobra): título, pergunta, motivo, memória do time e "amanhã" com segredo viram a frase neutra; o resto passa', () => {
    const summary = posted(composeDaySummary(facts({
      done: [{ title: 'Trocar a senha do wifi para padaria123', by: 'Teo' }, { title: 'Cartaz da promoção', by: 'Teo' }],
      waiting: [{ question: 'Posso usar o token sk-ant-api03-ABCDEF1234567890 no site?', kind: 'question', sinceDay: '2026-11-10' }],
      stuck: [{ title: 'Pagamento', reason: 'o cartão 4111 1111 1111 1111 foi recusado', chasedBy: 'Nina' }],
      teamMemory: ['A senha do instagram é loja2026', 'A padaria abre às 7h.'],
      tomorrow: ['Configurar a chave de API do correio'],
    })))
    for (const never of ['padaria123', 'sk-ant-api03', '4111 1111', 'loja2026']) expect(everything(summary), never).not.toContain(never)
    expect(everything(summary)).toContain('um cartão com dado protegido')
    expect(everything(summary)).toContain('Cartaz da promoção')
    expect(everything(summary)).toContain('A padaria abre às 7h')
  })

  it('2b. título técnico (caminho, nome de arquivo, hash) não vai no texto visível: o texto diz "um cartão técnico" e o título inteiro fica na dobra', () => {
    const summary = posted(composeDaySummary(facts({ done: [{ title: 'Corrigir C:\\Users\\ana\\site\\index.html e src/app.ts', by: 'Teo' }, { title: 'Cartaz', by: 'Teo' }] })))
    expect(visibleOf(summary)).not.toMatch(/index\.html|src\/app\.ts|C:\\/u)
    expect(visibleOf(summary)).toContain('um cartão técnico')
    expect(summary.details).toContain('index.html')
  })

  it('3. dia sem movimento: nada (undefined = o gancho grava quiet-day); só "amanhã" ou só memória do time não faz um post; com 1 cartão pronto sai', () => {
    expect(composeDaySummary(facts())).toBeUndefined()
    expect(composeDaySummary(facts({ tomorrow: ['Cartaz de Natal'], teamMemory: ['A padaria abre às 7h.'] }))).toBeUndefined()
    expect(composeDaySummary(facts({ done: [{ title: 'Cartaz', by: 'Teo' }] }))).toBeDefined()
    expect(composeDaySummary(facts({ waiting: [{ question: 'Posso mandar?', kind: 'approval', sinceDay: '2026-11-10' }] }))).toBeDefined()
    expect(composeDaySummary(facts({ stuck: [{ title: 'Foto', reason: 'esperando a foto nova' }] }))).toBeDefined()
  })

  it('4. dia LOCAL: 02:30Z do dia 11 em UTC-3 ainda é o dia 10; o id do resumo é estável por projeto e dia', () => {
    expect(localDayOf('2026-11-11T02:30:00.000Z', -180)).toBe('2026-11-10')
    expect(localDayOf('2026-11-11T12:00:00.000Z', -180)).toBe('2026-11-11')
    expect(localDayOf('2026-11-11T02:30:00.000Z', 0)).toBe('2026-11-11')
    expect(daySummaryId('loja', '2026-11-10')).toBe('day-summary-loja-2026-11-10')
    expect(daySummaryId('loja', '2026-11-10')).not.toBe(daySummaryId('cafe', '2026-11-10'))
  })

  it('6. tom: ≤ 100 palavras visíveis, nenhuma palavra proibida, nenhum caminho/id/hash, sem artigo antes do nome, sem concordância de gênero; a dobra guarda a lista cheia', () => {
    const done = ['Cartaz', 'Cardápio', 'Legenda', 'Banner', 'Etiqueta', 'Convite', 'Panfleto', 'Fachada'].map(title => ({ title: `${title} da promoção de sábado`, by: 'Teo' }))
    const summary = posted(composeDaySummary(facts({
      done,
      doing: ['Resposta ao cliente', 'Pedido do fornecedor', 'Folha de preços'].map(title => ({ title, by: 'Nina' })),
      waiting: [{ question: 'Posso mandar o orçamento ao cliente?', kind: 'approval', sinceDay: '2026-11-10' }],
      stuck: [{ title: 'Foto da vitrine', reason: 'esperando a foto nova', chasedBy: 'Nina' }],
      teamMemory: ['A padaria abre às 7h.'],
      ceiling: 'quota',
      tomorrow: ['Cartaz de Natal', 'Cartaz de Páscoa'],
    })))
    const visible = visibleOf(summary)
    expect(words(visible)).toBeLessThanOrEqual(100)
    expect(summary.details).toContain('Fachada da promoção de sábado') // the full list is in the fold
    expect(summary.text).toContain('<details') // the same native fold the speech layer uses
    for (const jargon of [/\bticket/iu, /\btask/iu, /\brun\b/iu, /\bturno/iu, /\brunner/iu, /\bgate\b/iu, /\btoken/iu, /\bdeploy/iu, /\bbranch/iu, /\bcommit/iu, /\bhook/iu, /\bpayload/iu, /\bSLA\b/u, /\bbacklog/iu, /\bpipeline/iu]) {
      expect(visible, String(jargon)).not.toMatch(jargon)
    }
    expect(visible).not.toMatch(/[A-Za-z]:\\|\/[a-z]+\/[a-z]+|\b[0-9a-f]{7,}\b|\.(?:ts|tsx|json|md)\b/u) // no path, no hash, no file name
    expect(visible).not.toMatch(/\b(?:a|o) (?:Bia|Teo|Nina)\b/u) // no article before a persona's name
    expect(visible).not.toMatch(/\b(?:satisfeit|cansad|orgulhos|feliz|contente)[ao]?s?\b/iu) // nothing that agrees with a gender
    expect(visible).not.toMatch(/[\u{1F300}-\u{1FAFF}]|bom trabalho|parabéns/iu) // no emoji, no theatre
    expect(visible).not.toMatch(/\.\./u) // a fact that already ends with a full stop does not get a second one
  })

  it('7. "espera você": o que é de hoje vem na pergunta em palavras simples; o que já esperava desde ontem vira só a contagem', () => {
    const waiting = [
      { question: 'Posso mandar o orçamento A ao cliente?', kind: 'approval' as const, sinceDay: '2026-11-08' },
      { question: 'Posso mandar o orçamento B ao cliente?', kind: 'approval' as const, sinceDay: '2026-11-09' },
      { question: 'Prefere fundo azul ou verde?', kind: 'question' as const, sinceDay: '2026-11-10' },
    ]
    const summary = posted(composeDaySummary(facts({ waiting })))
    expect(visibleOf(summary)).toContain('Prefere fundo azul ou verde?')
    expect(visibleOf(summary)).toContain('Continuam esperando você: 2')
    expect(visibleOf(summary)).not.toContain('orçamento A ao cliente')
    const firstDay = posted(composeDaySummary(facts({ waiting: waiting.map(item => ({ ...item, sinceDay: '2026-11-10' })) })))
    expect(visibleOf(firstDay)).toContain('Posso mandar o orçamento A ao cliente?')
    expect(visibleOf(firstDay)).not.toContain('Continuam esperando você')
  })

  it('8. só dados do post: o compositor não devolve registro de memória nem nada além do texto e da dobra', () => {
    const summary = posted(composeDaySummary(facts({ done: [{ title: 'Cartaz', by: 'Teo' }], teamMemory: ['A padaria abre às 7h.'] })))
    expect(Object.keys(summary).every(key => key === 'text' || key === 'details')).toBe(true)
  })

  it('9. teto de cota: a frase do aviso aparece e o resumo sai mesmo num dia sem cartões; o teto de trabalho diz o mesmo em palavras do dono (sem "turno")', () => {
    const quota = posted(composeDaySummary(facts({ ceiling: 'quota' })))
    expect(visibleOf(quota)).toContain('A cota de hoje está quase no fim; segurei cartões novos até amanhã.')
    const turns = posted(composeDaySummary(facts({ ceiling: 'turns' })))
    expect(visibleOf(turns)).toContain('O limite de trabalho de hoje foi atingido; segurei cartões novos até amanhã.')
    expect(visibleOf(turns)).not.toMatch(/turno/iu)
  })
})
