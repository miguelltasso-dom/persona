/**
 * COLHEITA item 14 — the three readers of the Padaria Lua eval (`src/eval-padaria-rules.ts`) as PURE rules. RED side: the REAL sentences of attempts 3, 4 and 5 (`artifacts/team10/homes/real-attempt-*`),
 * word for word. GREEN side: the honest sentences of the same rounds and of the fake, which must never be marked (a guard that cries wolf burns a paid attempt: attempts 2 and 3 were spoiled that way).
 */
import { describe, expect, it } from 'vitest'
import { ASK_MAX_CHARS, falseDoneFindings, jargonFindingsIn, sillyAskFindings, threadJargon, visibleText } from '../src/eval-padaria-rules.ts'
import type { TeamTranscript, TranscriptAsk, TranscriptDraft, TranscriptLine, TranscriptNote } from '../src/team-transcript.ts'

// ── the request of the real rounds 3–5 and the vague one of attempt 2 ────────────────────────────────────────────────────────────────────────
const REQUEST = 'Faz o cartaz da promoção do pão de queijo da Padaria Lua para o Instagram: 2 por R$ 9 de sexta a domingo, pedidos pelo WhatsApp (11) 91234-5678. Preciso do texto e da arte; a foto é o rascunho atual. Quero a opinião do time sobre a arte antes de eu aprovar.'
const VAGUE_REQUEST = 'Faz o cartaz da promoção da Padaria Lua para o Instagram. A foto é o rascunho atual.'

// ── verbatim, attempt 5 (21:12–21:15) ────────────────────────────────────────────────────────────────────────────────────────────────────────
const A5_TEO_OPINION = 'Opinião sobre a arte do cartaz de Instagram (pão de queijo, Padaria Lua) antes da aprovação da pessoa: a composição funciona? Ajustes de cor, hierarquia ou legibilidade?'
const A5_TEO_DELIVERY = 'A arte do cartaz está pronta em `cartaz-pao-de-queijo.svg`, no formato 4:5 do Instagram (1080×1350). Ainda não aprovei nada: a aprovação é da pessoa. **O que a arte traz:** - Fundo azul e paleta do rascunho.'
const A5_BIA_ENTREGA = '**Entrega:** o texto foi enviado ao Téo junto com a foto do rascunho (`inputs/foto.png`). Pedi a arte em SVG no formato 1080x1350 (retrato).'
const A5_NOVA_VERSAO = 'A composição funciona e as duas revisões concordam. NOVA VERSÃO: Texto do rascunho não muda nesta rodada; a alteração'
const A5_TEO_FIZ = '**O que fiz nesta rodada:** - No SVG, "2 por" agora está separado de "R$ 9". **O que não fiz e por quê:** - **PNG antigo:** a pasta ainda tem o rascunho 640×400.'
const A5_DECISOES = '**Decisões que tomei:** - Usei a paleta e os elementos do rascunho `inputs/foto.png`: fundo azul, círculo vermelho.'
const A5_ASK_WHATSAPP = 'O WhatsApp (11) 91234-5678, que está na arte do cartaz da Padaria Lua, é o número real de contato? Parece número de teste.'
const A5_ASK_PNG = 'O rascunho antigo cartaz-pao-de-queijo.png (640×400, sem textos) está na pasta e pode ser postado por engano. O que fazer?'
const A5_PRONTO = 'Pronto: Cartaz da promoção do pão de queijo da Padaria…. Arte do cartaz da promoção do pão de queijo da… (Téo); Texto do cartaz da promoção do pão de queijo da… (Bia).'
const A5_CAP = 'Precisa de você: o limite de execuções reais desta rodada foi atingido (12 de 12). Nada foi iniciado.'
// ── verbatim, attempt 4 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const A4_NARRATION = 'Vou começar conferindo se o `foto.png` existe no projeto e o que ele contém.Nenhum arquivo de imagem no diretório de trabalho. Vou verificar o diretório e procurar `foto.png` mais amplamente.'
const A4_SHELL = 'A arte 4:5 está pronta como SVG, mas o PNG 1080x1350 ainda não foi gerado. Não tenho ferramenta de shell nesta sessão, então não consigo rodar um conversor. Pedi à Lia que exporte o PNG.'
const A4_PATH = 'Bia entregou o texto: o arquivo `artes/padaria-lua-pao-de-queijo/cartaz-instagram-4x5.svg` não existe no diretório de trabalho atual.'
const A4_FEITO = '**Cartaz do pão de queijo (Padaria Lua): rascunho entregue; falta a foto correta.** **Feito** - Recriei o rascunho em `cartaz-pao-de-queijo-rascunho.svg`.'
// ── verbatim, attempt 3 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const A3_TOOL_NAME = 'Chamei ask_colleague para pedir ajuda à Lia com o arquivo.'

// ── honest sentences that must stay clean ────────────────────────────────────────────────────────────────────────────────────────────────────
const CLEAN = [
  'Dividi assim: Téo — Arte; Bia — Texto.',
  'Téo salvou cartaz-arte.svg no rascunho',
  'Lia aprovou o trabalho de Bia',
  'Téo passou para Bia: Texto do cartaz',
  'Aqui está a minha parte, pronta para a revisão. Item 1: o cartaz do pão de queijo da Padaria Lua mostra a oferta "2 por R$ 9", de sexta a domingo, com o contato do WhatsApp no rodapé. FIM-DA-ENTREGA-COMPLETA',
  '**Título:** Pão de queijo em dobro! **Destaque:** 2 por R$ 9 **Chamada:** Peça pelo WhatsApp: (11) 91234-5678', // copy labels are the text of the poster, not a case file
  'Uma pessoa da equipe confere o texto e outras pessoas aprovam depois.',
  'Pedidos de sexta/domingo pelo WhatsApp (11) 91234-5678 ou em https://padarialua.example/promo/pao-de-queijo.html',
  'O cartaz ficou em cartaz-instagram-4x5.svg e o PNG sai sozinho na entrega.',
  'Nenhum arquivo foi alterado nesta entrega.',
  'Precisa de você: 3 coisas esperam você.',
  'Resumo do dia. Precisa de você: 3 coisas esperam você.',
  'Sugiro dar mais respiro entre "2 por" e "R$ 9", porque o "p" quase encosta no "$".',
  'A versão de 1080x1350 bate com o rascunho; confirme só o horário. Nada disso gera nova versão.',
]

function line(id: string, who: string, text: string, type = 'runner', attachments: string[] = []): TranscriptLine {
  return { at: `2026-11-11T21:12:${id.padStart(2, '0')}.000Z`, stream: 'channel:geral', id, type, who, text, attachments, leaks: [] }
}
function note(from: string, to: string, overrides: Partial<TranscriptNote> = {}): TranscriptNote {
  return { id: `${from}-${to}`, from, to, title: 'Arte do cartaz', kind: 'pass', status: 'delivered', askedAt: '', done: [], needed: [], files: [], decisions: [], colleagueReceived: true, colleagueTicketId: null, via: 'model', ...overrides }
}
function draft(ticketId: string, ...paths: string[]): TranscriptDraft {
  return { ticketId, directory: `C:\\home\\worktrees\\p\\${ticketId}`, files: paths.map(path => ({ path, size: 10, sha: `sha-${path}` })) }
}
function ask(id: string, who: string, question: string): TranscriptAsk {
  return { id, askId: `a-${id}`, ticketId: 't', who, question, options: [], step: undefined }
}
function transcript(overrides: Partial<TeamTranscript> = {}): TeamTranscript {
  return {
    lines: [], tickets: [], ledger: undefined, names: {}, personas: ['Lia', 'Bia', 'Téo'], leaks: [], ignoredTypes: {}, notes: [], reviews: [], asks: [], splitTasks: 0, splitAssignments: [], reviewAssignments: [], draftDirectories: [],
    ...overrides,
  }
}
const rulesOf = (where: string, text: string): string[] => jargonFindingsIn(where, text).map(finding => finding.rule)

describe('visibleText — what sits inside <details> is technical detail on purpose', () => {
  it('drops a closed block and a block that was never closed, keeps the opening', () => {
    expect(visibleText('Feito: o cartaz está pronto. <details><summary>Detalhes</summary>inputs/foto.png HTTP 404</details> Falta só a sua aprovação.').replace(/\s+/gu, ' ')).toBe('Feito: o cartaz está pronto. Falta só a sua aprovação.')
    expect(visibleText('Tudo certo. <details>caminho: C:\\x\\y.svg').trim()).toBe('Tudo certo.')
  })
})

describe('jargon in the thread', () => {
  it('flags the REAL sentences of attempts 3–5, each by its own rule', () => {
    expect(rulesOf('opinion', A5_TEO_OPINION)).toEqual(['a pessoa'])
    expect(rulesOf('téo', A5_TEO_DELIVERY)).toContain('a pessoa')
    expect(rulesOf('bia', A5_BIA_ENTREGA)).toEqual(expect.arrayContaining(['prontuário', 'caminho']))
    expect(rulesOf('opinion', A5_NOVA_VERSAO)).toContain('NOVA VERSÃO: cru')
    expect(rulesOf('téo', A5_TEO_FIZ)).toContain('prontuário')
    expect(rulesOf('téo', A5_DECISOES)).toEqual(expect.arrayContaining(['prontuário', 'caminho']))
    expect(rulesOf('lia', A5_CAP)).toContain('RealTurnCapError')
    expect(rulesOf('téo', A4_NARRATION)).toContain('narração')
    expect(rulesOf('téo', A4_SHELL)).toEqual(expect.arrayContaining(['máquina', 'pedido de PNG']))
    expect(rulesOf('bia', A4_PATH)).toContain('caminho')
    expect(rulesOf('lia', A4_FEITO)).toContain('prontuário')
    expect(rulesOf('téo', A3_TOOL_NAME)).toContain('nome de ferramenta')
  })

  it.each([
    ['um id de Tarefa', 'A Tarefa 7ececab3636d3fdbad0b09faff3e3193 já tem o rascunho.', 'id/hash'],
    ['um commit', 'Conferi o commit 3213b015e3a1f e está igual.', 'id/hash'],
    ['um código HTTP', 'O envio falhou com HTTP 404 na hora de salvar.', 'código HTTP'],
    ['uma chave JSON', 'O arquivo tem {"preco": 9, "dias": "sex-dom"} dentro.', 'JSON'],
    ['um caminho de unidade', 'Salvei em C:\\Users\\migue\\cartaz.svg para você.', 'caminho'],
    ['a pasta worktrees', 'O rascunho está em worktrees do projeto.', 'caminho'],
  ] as const)('flags %s', (_name, text, rule) => {
    expect(rulesOf('x', text)).toContain(rule)
  })

  it('does not mark the honest sentences (the fake, the copy labels, a URL, "uma pessoa", "sexta/domingo", a bare file name)', () => {
    for (const text of CLEAN) expect(jargonFindingsIn('x', text), text).toEqual([])
  })

  it('reads the thread as the person does: skips her own words, the morning card and everything inside <details>', () => {
    const found = threadJargon(transcript({
      lines: [
        line('1', 'Pessoa', 'Pode usar a pessoa que quiser, não tenho ferramenta de shell.', 'message'),
        line('2', 'Lia', 'Cartaz pronto para a sua aprovação. <details><summary>Como foi feito</summary>**O que fiz:** salvei inputs/foto.png, HTTP 200.</details>'),
        line('3', 'Lia', '[cartão Bom dia] Vou verificar', 'dailyBrief'),
        line('4', 'Téo', A5_TEO_DELIVERY),
      ],
    }))
    expect(found.map(item => item.where)).toEqual(expect.arrayContaining([expect.stringContaining('line 4')]))
    expect(found.some(item => item.where.includes('line 1') || item.where.includes('line 2') || item.where.includes('line 3'))).toBe(false)
  })
})

describe('silly questions', () => {
  it('flags the two REAL questions of attempt 5: the WhatsApp the person had just written, and the team\'s own old PNG', () => {
    const found = sillyAskFindings(transcript({ asks: [ask('1', 'Lia', A5_ASK_WHATSAPP), ask('2', 'Lia', A5_ASK_PNG)] }), REQUEST)
    expect(found.map(item => `${item.askId}:${item.rule}`)).toEqual(['1:dado do pedido', '2:bancada do time'])
  })

  it('asking for a fact the request does NOT hold is the right behavior (attempt 2: "Qual é a promoção?" in front of a request with no facts)', () => {
    const question = 'Qual é a promoção da Padaria Lua? (produto, desconto ou preço, e se há brinde ou combo)'
    expect(sillyAskFindings(transcript({ asks: [ask('1', 'Téo', question)] }), VAGUE_REQUEST)).toEqual([])
    expect(sillyAskFindings(transcript({ asks: [ask('1', 'Téo', question)] }), REQUEST).map(item => item.rule)).toEqual(['dado do pedido'])
    expect(sillyAskFindings(transcript({ asks: [ask('1', 'Téo', question)] })).length).toBe(0) // no request = nothing is "already answered"
  })

  it('asks each fact the request already gives, one rule per topic', () => {
    const rules = (question: string): string[] => sillyAskFindings(transcript({ asks: [ask('1', 'Bia', question)] }), REQUEST).map(item => item.rule)
    expect(rules('Qual é o WhatsApp da padaria?')).toEqual(['dado do pedido'])
    expect(rules('Quanto custa o combo de pão de queijo?')).toEqual(['dado do pedido'])
    expect(rules('Em quais dias vale a promoção?')).toEqual(['dado do pedido'])
    expect(rules('Qual rede social vamos usar?')).toEqual(['dado do pedido'])
  })

  it('does not mark a real choice, an approval or a creative question', () => {
    for (const question of [
      'Quer o texto em tom mais divertido ou mais direto?',
      'Posso publicar agora ou prefere ver a arte antes?',
      'Quer em feed ou em stories?',
      'Qual foto de fundo você prefere para o cartaz?',
      'Pode aprovar a arte com o fundo azul?',
    ]) expect(sillyAskFindings(transcript({ asks: [ask('1', 'Téo', question)] }), REQUEST), question).toEqual([])
  })

  it('flags a question above 300 characters and a secret asked in clear text', () => {
    const long = `Antes de seguir preciso entender ${'o contexto da campanha '.repeat(15)}?`
    expect(long.length).toBeGreaterThan(ASK_MAX_CHARS)
    expect(sillyAskFindings(transcript({ asks: [ask('1', 'Lia', long)] }), REQUEST).map(item => item.rule)).toEqual(['pergunta longa'])
    expect(sillyAskFindings(transcript({ asks: [ask('2', 'Lia', 'Me passa a senha do Instagram para eu postar?')] }), REQUEST).map(item => item.rule)).toEqual(['segredo em texto aberto'])
  })
})

describe('false "Pronto!"', () => {
  it('flags the REAL "Pronto:" summary of attempt 5 posted over a thread that says the work could not go on, and over an unsealed review', () => {
    const stalled = falseDoneFindings(transcript({ lines: [line('1', 'Lia', A5_CAP, 'message'), line('2', 'Lia', A5_PRONTO, 'message')] }))
    expect(stalled.map(item => item.rule)).toEqual(['resumo Pronto sobre trabalho parado'])
    expect(stalled[0]!.why).toMatch(/limite de execuções/u)
    const unsealed = falseDoneFindings(transcript({
      lines: [line('1', 'Lia', A5_PRONTO, 'message')],
      reviews: [{ taskId: 't', status: 'closed', reviewer: 'Lia', author: 'Téo', returns: 1, sealed: false, summary: 'ajustes', failure: null }],
    }))
    expect(unsealed.map(item => item.rule)).toEqual(['resumo Pronto sobre trabalho parado'])
    expect(unsealed[0]!.why).toMatch(/Téo → Lia/u)
  })

  it('the same summary over work that is done and sealed is TRUE (the fake, a good round)', () => {
    expect(falseDoneFindings(transcript({
      lines: [line('1', 'Lia', A5_PRONTO, 'message')],
      reviews: [{ taskId: 't', status: 'closed', reviewer: 'Lia', author: 'Téo', returns: 0, sealed: true, summary: 'ok', failure: null }],
    }))).toEqual([])
  })

  it('flags a bare "Pronto!" (nothing behind it) but not a "Pronto" that carries the delivery', () => {
    const bare = falseDoneFindings(transcript({ lines: [line('1', 'Téo', 'Pronto! 👍'), line('2', 'Bia', 'Feito.'), line('3', 'Lia', 'Tudo certo, Lia!')] }))
    expect(bare.map(item => item.rule)).toEqual(['pronto sem entrega', 'pronto sem entrega', 'pronto sem entrega'])
    expect(falseDoneFindings(transcript({
      lines: [line('1', 'Bia', 'Pronto! Título: Pão de queijo em dobro. Destaque: 2 por R$ 9. Chamada: peça pelo WhatsApp (11) 91234-5678.')],
    }))).toEqual([])
  })

  it('flags a file said to be saved that no draft holds, and leaves alone a file that exists, a denial and an input', () => {
    const drafts = [draft('t1', 'cartaz-arte.svg', 'inputs/foto.png')]
    const claim = (text: string): string[] => falseDoneFindings(transcript({ lines: [line('1', 'Téo', text)], drafts })).map(item => `${item.rule}:${item.match}`)
    expect(claim('Salvei o arquivo cartaz-final.svg no rascunho com todos os ajustes.')).toEqual(['arquivo que não existe:cartaz-final.svg'])
    expect(claim('A arte está pronta em `cartaz-arte.svg`, no formato 4:5.')).toEqual([])
    expect(claim('Não gerei o cartaz-final.png: o app converte o SVG sozinho.')).toEqual([])
    expect(claim('Salvei os ajustes olhando a foto.png que veio no pedido.')).toEqual([])
    // a transcript with no drafts read has nothing to compare: no claim is called false
    expect(falseDoneFindings(transcript({ lines: [line('1', 'Téo', 'Salvei o arquivo cartaz-final.svg no rascunho.')] }))).toEqual([])
  })

  it('flags "passei ao Téo" with no bilhete to Téo, and accepts it when the bilhete exists', () => {
    const text = 'Minha parte é o texto. Ele está pronto e foi passado ao Téo, que faz a arte.'
    expect(falseDoneFindings(transcript({ lines: [line('1', 'Bia', text)] })).map(item => item.rule)).toEqual(['passagem sem bilhete'])
    expect(falseDoneFindings(transcript({ lines: [line('1', 'Bia', text)], notes: [note('Bia', 'Téo')] }))).toEqual([])
    expect(falseDoneFindings(transcript({ lines: [line('1', 'Téo', 'Pedi à Lia que confira o contraste.')] })).map(item => item.rule)).toEqual(['passagem sem bilhete'])
    expect(falseDoneFindings(transcript({ lines: [line('1', 'Téo', 'Pedi à Lia que confira o contraste.')], notes: [note('Téo', 'Lia', { kind: 'help' })] }))).toEqual([])
  })

  it('does not mark the honest sentences of the rounds, nor the person\'s own words', () => {
    const lines = [
      ...CLEAN.map((text, index) => line(String(index + 10), 'Lia', text)),
      line('90', 'Pessoa', 'Pronto! Pode seguir.', 'message'),
    ]
    expect(falseDoneFindings(transcript({ lines, drafts: [draft('t1', 'cartaz-arte.svg', 'cartaz-instagram-4x5.svg', 'inputs/foto.png')] }))).toEqual([])
  })
})
