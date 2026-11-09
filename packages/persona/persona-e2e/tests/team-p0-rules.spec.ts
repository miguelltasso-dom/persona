/**
 * TEAM-10 — the three P0 of the real round of 07/11 as PURE rules (`src/team-p0-rules.ts`). RED side: the REAL sentences of attempt 4 (the transcript Atlas read). GREEN side: the
 * honest sentences of the same round and of the fake that must never be marked (a guard that cries wolf burns a paid attempt: attempts 2 and 3 were spoiled that way).
 */
import { describe, expect, it } from 'vitest'
import { jargonIn, missingFileIn, narrationIn, p0TextFindings, p0TextProblems } from '../src/team-p0-rules.ts'
import type { TeamTranscript, TranscriptLine, TranscriptNote } from '../src/team-transcript.ts'

// ── verbatim from `artifacts/team10/real-attempt-4-2026-11-07T20-30-18-046Z/transcript.md` ──────────────────────────────────────────────────
const NARRATION_REAL = 'Vou começar conferindo se o `foto.png` existe no projeto e o que ele contém.Nenhum arquivo de imagem no diretório de trabalho. Vou verificar o diretório e procurar `foto.png` mais amplamente.A pasta tem só um `LEIAME.txt` sem conteúdo útil: não há `foto.png` nem foto de pão de queijo no projeto. Sem a foto-base, não dá para montar a arte final. Vou fazer um rascunho de layout com o texto aprovado e um espaço reservado para a foto, para o time já ver a composição.O rascunho está pronto.'
const SHELL_REAL = 'A arte 4:5 está pronta como SVG, mas o PNG 1080x1350 ainda não foi gerado. Não tenho ferramenta de shell nesta sessão, então não consigo rodar um conversor. Pedi à Lia que exporte o PNG.'
const SHELL_NOTE_REAL = 'Nesta sessão não tenho ferramenta de shell (Bash indisponível), então não consigo rodar o conversor de SVG para PNG.'
const EXPORT_TITLE_REAL = 'Téo pediu ajuda a Lia: Exportar o cartaz 4:5 para PNG (1080x1350)'
const EXPORT_NEEDED_REAL = 'Exportar o SVG para PNG em 1080x1350 e salvar como artes/padaria-lua-pao-de-queijo/cartaz-instagram-4x5.png (ex.: rsvg-convert -w 1080 -h 1350, Inkscape ou ImageMagick, se houver).'
const BIA_MISSING_REAL = 'Bia entregou o texto, mas não consegui confirmar o encaixe na arte: o arquivo `artes/padaria-lua-pao-de-queijo/cartaz-instagram-4x5.svg` não existe no diretório de trabalho atual, então não pude ler os tamanhos de fonte nem as alturas das faixas.'
const LIA_RECREATED_REAL = 'Recriei o rascunho em `cartaz-pao-de-queijo-rascunho.svg`, 1080x1350 (retrato), na pasta do projeto. O arquivo citado no bilhete da Lia não existia: a pasta só tinha `LEIAME.txt`, então refiz a partir do que o bilhete descreve.'
const TEO_NO_FOTO_REAL = 'No projeto não há nenhum arquivo de imagem; a pasta só tem LEIAME.txt.'

// ── honest sentences (attempt 4, the fake, the synthetic verdict spec) that must stay clean ──────────────────────────────────────────────────
const CLEAN = [
  'Dividi assim: Téo — Arte; Bia — Texto.',
  'Téo passou para Bia: Texto do cartaz da promoção do pão de queijo (Padaria Lua)',
  'Téo salvou cartaz-instagram-4x5.svg no rascunho',
  'Lia aprovou o trabalho de Bia',
  'Pronto: Faz o cartaz da promoção do pão de queijo da…. Arte (Téo); Texto (Bia).',
  'Faz o cartaz da promoção do pão de queijo da Padaria Lua para o Instagram: 2 por R$ 9 de sexta a domingo, pedidos pelo WhatsApp (11) 91234-5678. Preciso do texto e da arte; a foto é o rascunho atual.',
  'A versão de 1080x1350 (segunda imagem) bate com o rascunho: círculo r=200 em y=470, faixas brancas em y=800 e y=870 e faixa amarela de 270px. Sugiro aprovar só o SVG 4:5.',
  'Muda: aprove só o SVG 4:5 (1080x1350), que confere com o rascunho. Nada disso altera o rascunho, então não há NOVA VERSÃO.',
  'O PNG do cartaz ficou em cartaz-instagram-4x5.png e o SVG em cartaz-instagram-4x5.svg.',
  'Peça pelo WhatsApp (11) 91234-5678.Pão de queijo quentinho', // a digit before the dot is a phone number, not two sentences
  'Nenhum arquivo foi alterado nesta entrega.',
  'Texto proposto: 2 por R$ 9 · Sexta a domingo.',
  'Aqui está a minha parte, pronta para a revisão. Item 1: o cartaz mostra a oferta "2 por R$ 9", de sexta a domingo, com o contato do WhatsApp no rodapé e o destaque em vermelho sobre o fundo azul. FIM-DA-ENTREGA-COMPLETA',
  'Aprovado. O texto e a arte estão coerentes com o pedido.',
]

describe('P0-2 narration between tool calls', () => {
  it('flags the REAL monologue of attempt 4 (intent, a tool result said aloud, sentences glued with no space)', () => {
    const matches = narrationIn(NARRATION_REAL).map(finding => finding.match)
    expect(matches.some(match => /^Vou começar/u.test(match))).toBe(true)
    expect(matches.some(match => /Nenhum arquivo de imagem no diretório/u.test(match))).toBe(true)
    expect(matches.some(match => /[.!?]\p{Lu}/u.test(match))).toBe(true) // "contém.Nenhum"
  })
  it.each([
    ['Vou verificar o diretório', /Vou verificar/u],
    ['Agora vou conferir o arquivo.', /vou conferir/u],
    ['Deixa eu ver se a imagem existe', /Deixa eu ver/u],
    ['Let me check the folder', /Let me check/u],
    ['Nenhum arquivo no projeto.', /Nenhum arquivo no projeto/u],
    ['A pasta existe.A imagem não', /\.A /u],
    ['pronto.Nenhum', /\.N/u],
  ])('flags "%s"', (text, expected) => {
    expect(narrationIn(text).some(finding => expected.test(finding.match))).toBe(true)
  })
  it('keeps a plain final answer clean', () => {
    for (const text of CLEAN) expect(narrationIn(text), text).toEqual([])
  })
})

describe('P0-3 jargon and the PNG nobody has to ask for', () => {
  it('flags the REAL sentences of attempt 4: no shell tool, a PNG asked of a colleague, a converter to install', () => {
    expect(jargonIn(SHELL_REAL).map(finding => finding.rule).sort()).toEqual(['P0-3 jargon', 'P0-3 jargon', 'P0-3 png-request'])
    expect(jargonIn(SHELL_NOTE_REAL).some(finding => finding.rule === 'P0-3 jargon')).toBe(true)
    expect(jargonIn(EXPORT_TITLE_REAL).some(finding => finding.rule === 'P0-3 png-request')).toBe(true)
    expect(jargonIn(EXPORT_NEEDED_REAL).map(finding => finding.rule)).toContain('P0-3 png-request')
    expect(jargonIn(EXPORT_NEEDED_REAL).map(finding => finding.rule)).toContain('P0-3 jargon') // rsvg-convert / Inkscape / ImageMagick
  })
  it.each([
    'Não tenho ferramenta de imagem nesta sessão.',
    'Sem ferramenta de conversão não dá para entregar o PNG.',
    'Pedi à Lia que converta o SVG em PNG.',
    'Preciso do PNG para postar.',
    'Me manda o PNG do cartaz.',
  ])('flags "%s"', (text) => {
    expect(jargonIn(text).length).toBeGreaterThan(0)
  })
  it('keeps a file name that ends in .png and the honest sentences clean', () => {
    for (const text of CLEAN) expect(jargonIn(text), text).toEqual([])
    expect(jargonIn('Salvei como cartaz-instagram-4x5.png e como foto.png.')).toEqual([])
  })
})

describe('P0-1 the symptom in the persona\'s own words', () => {
  it('flags the REAL "o arquivo não existe" of Bia, the "recriei … não existia" of Lia and the "não há nenhum arquivo" of Téo', () => {
    expect(missingFileIn(BIA_MISSING_REAL)).not.toEqual([])
    expect(missingFileIn(LIA_RECREATED_REAL)).not.toEqual([])
    expect(missingFileIn(TEO_NO_FOTO_REAL)).not.toEqual([])
    expect(missingFileIn('Não há `foto.png` nem foto de pão de queijo no projeto.')).not.toEqual([])
  })
  it('keeps "o foto.png não é foto de pão de queijo" (an opinion about the image) and the honest sentences clean', () => {
    for (const text of CLEAN) expect(missingFileIn(text), text).toEqual([])
    expect(missingFileIn('A imagem recebida aqui é uma composição azul/vermelha/amarela com faixas brancas, não uma foto de pão de queijo.')).toEqual([])
  })
})

describe('p0TextFindings: everything at once', () => {
  it('the whole real monologue of Téo names all three P0', () => {
    const rules = new Set(p0TextFindings(`${NARRATION_REAL} ${SHELL_REAL}`).map(finding => finding.rule))
    expect([...rules].sort()).toEqual(['P0-1 missing-file', 'P0-2 narration', 'P0-3 jargon', 'P0-3 png-request'])
  })
})

// ── over a transcript ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function line(id: string, who: string, text: string, type = 'message'): TranscriptLine {
  return { at: `2026-11-07T20:30:${id.padStart(2, '0')}.000Z`, stream: 'channel:geral', id, type, who, text, attachments: [], leaks: [] }
}
const NOTE: TranscriptNote = {
  id: 'h1', from: 'Téo', to: 'Lia', title: 'Exportar o cartaz 4:5 para PNG (1080x1350)', kind: 'help', status: 'blocked', askedAt: '',
  done: [SHELL_NOTE_REAL], needed: [EXPORT_NEEDED_REAL], files: ['artes/padaria-lua-pao-de-queijo/cartaz-instagram-4x5.svg'], decisions: [], colleagueReceived: true, colleagueTicketId: 't9', via: 'model',
}
function transcript(overrides: Partial<TeamTranscript> = {}): TeamTranscript {
  return {
    lines: [], tickets: [], ledger: undefined, names: {}, personas: ['Lia', 'Bia', 'Téo'], leaks: [], ignoredTypes: {}, notes: [], reviews: [], asks: [], splitTasks: 0, splitAssignments: [], reviewAssignments: [], draftDirectories: [],
    ...overrides,
  }
}

describe('p0TextProblems over a transcript', () => {
  it('reads thread lines, bilhetes, reviews, questions and Task titles; skips the person and the morning card', () => {
    const problems = p0TextProblems(transcript({
      lines: [
        line('1', 'Pessoa', 'Vou verificar isso depois. Não tenho ferramenta de shell.'), // the person talking: never the team's text
        line('2', 'Téo', NARRATION_REAL),
        line('3', 'Linha da equipe', EXPORT_TITLE_REAL, 'handoff'),
        line('4', 'Lia', '[cartão Bom dia] Vou verificar', 'dailyBrief'),
        line('5', 'Bia', 'Aprovado.'),
      ],
      notes: [NOTE],
      reviews: [{ taskId: 't', status: 'returned', reviewer: 'Lia', author: 'Téo', returns: 1, sealed: false, summary: BIA_MISSING_REAL, failure: null }],
      tickets: [{ id: 't9', title: 'Exportar o cartaz 4:5 para PNG (1080x1350)', stage: 'person', assignmentState: 'running', ended: false }],
    }))
    const joined = problems.join('\n')
    expect(joined).toMatch(/P0-2 narration: line 2 \(Téo\)/u)
    expect(joined).toMatch(/P0-3 png-request: line 3 \(Linha da equipe\)/u)
    expect(joined).toMatch(/P0-3 jargon: bilhete Téo → Lia/u)
    expect(joined).toMatch(/P0-3 png-request: bilhete Téo → Lia \(title\)/u)
    expect(joined).toMatch(/P0-1 missing-file: review Téo → Lia/u)
    expect(joined).toMatch(/P0-3 png-request: Task title/u)
    expect(joined).not.toMatch(/line 1 /u)
    expect(joined).not.toMatch(/line 4 /u)
    expect(joined).not.toMatch(/line 5 /u)
  })
  it('a clean round reads clean', () => {
    const lines = CLEAN.map((text, index) => line(String(index + 1), index % 2 === 0 ? 'Lia' : 'Bia', text))
    expect(p0TextProblems(transcript({ lines }))).toEqual([])
  })
})
