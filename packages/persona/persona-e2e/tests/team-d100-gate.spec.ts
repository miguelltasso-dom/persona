/**
 * D-100 / PLAN D100-3 — the gate of the Carbon's REVISÃO-01 for the poster round (`src/team-d100-gate.ts`), one check at a time. A GOOD round passes all eight; each defect flips only its own check.
 * RED side: the REAL sentences and the REAL shape of attempt 5 (two arts that collided, the seal on Bia's text and not on the art, "a pessoa", a raw "NOVA VERSÃO:", the test limiter's sentence as a
 * persona's words). GREEN side: the honest sentences of the same rounds ("uma pessoa", "pessoas", a lowercase "nova versão: …" in prose).
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ARTIFACTS_DIR } from '../src/paths.ts'
import { D100_MAX_RAW_INPUT_TOKENS, D100_MAX_TURNS, copyOf, evaluateD100Gate, squash, svgTextOf, voiceFindingsIn } from '../src/team-d100-gate.ts'
import { readTeamTranscript } from '../src/team-transcript.ts'
import type { LedgerEvidence, LedgerRow } from '../src/ledger-evidence.ts'
import type { TeamTranscript, TranscriptDraft, TranscriptLine, TranscriptNote, TranscriptReview } from '../src/team-transcript.ts'

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><text>PÃO DE QUEIJO EM DOBRO!</text><text><tspan>2 por</tspan> <tspan>R$ 9</tspan></text><text>Pe&#231;a pelo WhatsApp (11) 91234-5678</text></svg>'
const row = (input: number, read = 0, write = 0): LedgerRow => ({ kind: 'execution', engine: 'claude', origin: 'measured', inputTokens: input, outputTokens: 500, cacheReadTokens: read, cacheWriteTokens: write, ticketId: null, at: '2026-11-11T21:12:00.000Z', envMode: 'needed' })
function ledgerOf(rows: LedgerRow[]): LedgerEvidence {
  const sum = (pick: (item: LedgerRow) => number): number => rows.reduce((total, item) => total + pick(item), 0)
  return { dbPath: 'x', rows, rawRows: [], turns: rows.length, inputTokens: sum(item => item.inputTokens), outputTokens: sum(item => item.outputTokens), cacheReadTokens: sum(item => item.cacheReadTokens), cacheWriteTokens: sum(item => item.cacheWriteTokens), allMeasured: true }
}
const line = (id: string, who: string, text: string, type = 'runner'): TranscriptLine => ({ at: `2026-11-11T21:12:${id.padStart(2, '0')}.000Z`, stream: 'channel:geral', id, type, who, text, attachments: [], leaks: [] })
const note = (from: string, to: string, overrides: Partial<TranscriptNote> = {}): TranscriptNote => ({ id: `${from}-${to}`, from, to, title: 'Arte do cartaz', kind: 'pass', status: 'delivered', askedAt: '', done: [], needed: [], files: [], decisions: [], colleagueReceived: true, colleagueTicketId: null, via: 'model', ...overrides })
const draft = (ticketId: string, path: string, text: string, sha: string): TranscriptDraft => ({ ticketId, directory: `C:\\home\\worktrees\\p\\${ticketId}`, files: [{ path, size: text.length, sha, text }] })
const sealedReview = (overrides: Partial<TranscriptReview> = {}): TranscriptReview => ({ taskId: 'tTeo', status: 'closed', reviewer: 'Lia', author: 'Téo', returns: 0, sealed: true, summary: 'Aprovado.', failure: null, ...overrides })

function good(overrides: Partial<TeamTranscript> = {}): TeamTranscript {
  return {
    lines: [line('1', 'Bia', 'Texto pronto e passado ao Téo.'), line('2', 'Téo', 'A arte está pronta e foi para a revisão da Lia.')],
    tickets: [], ledger: ledgerOf([row(20_000, 10_000, 6_000), row(18_000, 9_000, 5_000), row(15_000, 8_000, 4_000), row(12_000, 6_000, 3_000)]),
    names: {}, personas: ['Lia', 'Bia', 'Téo'], leaks: [], ignoredTypes: {},
    notes: [
      note('Bia', 'Téo', { done: ['Título: "Pão de queijo em dobro!"', 'Destaque: "2 por R$ 9"'], colleagueTicketId: 'tTeo' }),
      note('Téo', 'Lia', { kind: 'review', fromTicketId: 'tTeo', colleagueTicketId: 'tLia' }),
    ],
    reviews: [sealedReview()], asks: [], splitTasks: 2, splitAssignments: [], reviewAssignments: [], draftDirectories: [],
    drafts: [draft('tTeo', 'cartaz.svg', SVG, 'sha-final'), draft('tLia', 'cartaz.svg', SVG, 'sha-final')],
    ...overrides,
  }
}
const failedOf = (transcript: TeamTranscript, options?: Parameters<typeof evaluateD100Gate>[1]): string[] => evaluateD100Gate(transcript, options).checks.filter(check => !check.ok).map(check => check.id)

describe('the gate on a good round', () => {
  it('passes the eight checks and reports its measures (raw input asserted, price-weighted reported next to it)', () => {
    const report = evaluateD100Gate(good())
    expect(report.problems).toEqual([])
    expect(report.ok).toBe(true)
    expect(report.checks.map(check => check.id)).toEqual(['turns', 'input', 'one-art', 'bia-text', 'lia-reviews-art', 'seal', 'leak', 'voice'])
    expect(report.measures).toMatchObject({ turns: 4, rawInputTokens: 65_000, arts: ['cartaz'] })
    expect(report.measures.priceWeightedInputTokens).toBeLessThan(65_000)
    expect(report.measures.biaCopy).toEqual(['Pão de queijo em dobro!', '2 por R$ 9'])
    expect(report.measures.biaCopyMissingInArt).toEqual([])
  })
  it('the ceilings are the Carbon\'s: 6 paid turns, 120 mil RAW input', () => {
    expect([D100_MAX_TURNS, D100_MAX_RAW_INPUT_TOKENS]).toEqual([6, 120_000])
  })
})

describe('turns and input', () => {
  it('7 turns fail "turns" only; exactly 6 pass', () => {
    expect(failedOf(good({ ledger: ledgerOf(Array.from({ length: 7 }, () => row(1_000))) }))).toEqual(['turns'])
    expect(failedOf(good({ ledger: ledgerOf(Array.from({ length: 6 }, () => row(1_000))) }))).toEqual([])
  })
  it('the RAW input is what is asserted: 130 mil raw fails even when its price-weighted weight is far lower; 120 mil passes', () => {
    const heavyCache = good({ ledger: ledgerOf([row(130_000, 110_000, 10_000)]) })
    const report = evaluateD100Gate(heavyCache)
    expect(report.checks.find(check => check.id === 'input')!.ok).toBe(false)
    expect(report.measures.priceWeightedInputTokens!).toBeLessThan(60_000)
    expect(failedOf(good({ ledger: ledgerOf([row(120_000, 100_000, 10_000)]) }))).toEqual([])
  })
  it('no ledger fails both closed', () => {
    expect(failedOf(good({ ledger: undefined }))).toEqual(['turns', 'input'])
  })
})

describe('ONE final art with Bia\'s exact text', () => {
  it('two arts that collided (attempt 5: cartaz-pao-de-queijo.svg and arte-cartaz-padaria-lua.svg) fail "one-art" and leave the rest "not checked"', () => {
    const two = good({ drafts: [draft('tTeo', 'cartaz-pao-de-queijo.svg', SVG, 'a'), draft('tX', 'arte-cartaz-padaria-lua.svg', SVG, 'b')] })
    expect(failedOf(two)).toEqual(['one-art', 'bia-text', 'lia-reviews-art', 'seal'])
    expect(evaluateD100Gate(two).checks.find(check => check.id === 'one-art')!.detail).toMatch(/2 different arts/u)
  })
  it('no art, no draft on disk, and an art that exists only as a PNG all fail closed', () => {
    expect(evaluateD100Gate(good({ drafts: [draft('tTeo', 'inputs/foto.png', '', 'f')] })).checks.find(check => check.id === 'one-art')!.detail).toMatch(/saved nothing/u)
    expect(evaluateD100Gate(good({ drafts: [] })).checks.find(check => check.id === 'one-art')!.detail).toMatch(/no draft could be read/u)
    expect(evaluateD100Gate(good({ drafts: [draft('tTeo', 'cartaz.png', '', 'p')] })).checks.find(check => check.id === 'one-art')!.detail).toMatch(/only as a raster/u)
  })
  it('the same art with different bytes in the author\'s drafts is no single final art', () => {
    // both Tasks are Téo's (each received a bilhete): his split part and the chained one each saved "cartaz.svg", with different bytes
    const versions = good({
      drafts: [draft('tTeo', 'cartaz.svg', SVG, 'v1'), draft('tTeo2', 'cartaz.svg', SVG, 'v2'), draft('tLia', 'cartaz.svg', SVG, 'v1')],
      notes: [
        note('Bia', 'Téo', { done: ['Título: "Pão de queijo em dobro!"'], colleagueTicketId: 'tTeo' }),
        { ...note('Bia', 'Téo', { done: ['Título: "Pão de queijo em dobro!"'], colleagueTicketId: 'tTeo2' }), id: 'second' },
        note('Téo', 'Lia', { kind: 'review', fromTicketId: 'tTeo', colleagueTicketId: 'tLia' }),
      ],
    })
    expect(failedOf(versions)).toContain('one-art')
    expect(evaluateD100Gate(versions).checks.find(check => check.id === 'one-art')!.detail).toMatch(/2 different versions/u)
    // a copy in a Task nobody owns (no bilhete ties it to Téo) is not "his" version: it does not make a second art
    expect(failedOf(good({ drafts: [draft('tTeo', 'cartaz.svg', SVG, 'sha-final'), draft('tLia', 'cartaz.svg', SVG, 'sha-final'), draft('tStray', 'cartaz.svg', SVG, 'stray')] }))).toEqual([])
  })
  it('the art must show Bia\'s words: a rewritten line is named; case, line breaks and entities do not matter', () => {
    const rewritten = good({ drafts: [draft('tTeo', 'cartaz.svg', SVG.replace('2 por', 'Leve 2'), 'sha-final'), draft('tLia', 'cartaz.svg', SVG.replace('2 por', 'Leve 2'), 'sha-final')] })
    expect(failedOf(rewritten)).toEqual(['bia-text'])
    expect(evaluateD100Gate(rewritten).measures.biaCopyMissingInArt).toEqual(['2 por R$ 9'])
    expect(failedOf(good())).toEqual([]) // "PÃO DE QUEIJO EM DOBRO!" in capitals, "2 por" + "R$ 9" in two tspans, "Pe&#231;a"
  })
  it('Bia\'s text unreadable (no labeled or quoted copy anywhere) fails closed instead of passing', () => {
    expect(failedOf(good({ notes: [note('Bia', 'Téo', { done: ['Texto pronto'], colleagueTicketId: 'tTeo' }), note('Téo', 'Lia', { kind: 'review', fromTicketId: 'tTeo', colleagueTicketId: 'tLia' })] }))).toEqual(['bia-text'])
  })
})

describe('Lia reviews THAT art, and the seal belongs to it', () => {
  it('no review request to Lia: neither "lia-reviews-art" nor "seal"', () => {
    expect(failedOf(good({ notes: good().notes.filter(item => item.kind !== 'review') }))).toEqual(['lia-reviews-art', 'seal'])
  })
  it('Lia\'s draft holding ANOTHER version of the art (or none) is a review without the final art', () => {
    expect(failedOf(good({ drafts: [draft('tTeo', 'cartaz.svg', SVG, 'sha-final'), draft('tLia', 'cartaz.svg', SVG, 'other')] }))).toEqual(['lia-reviews-art', 'seal'])
  })
  it('attempt 5: Lia sealed BIA\'s text, the art\'s review came back unsealed — "seal" fails', () => {
    expect(failedOf(good({ reviews: [sealedReview({ sealed: false, returns: 1, status: 'closed' })] }))).toEqual(['seal'])
    expect(failedOf(good({ reviews: [sealedReview({ failure: 'unreadable' })] }))).toEqual(['seal'])
  })
  it('a delivery card that shows "Revisado por" someone else, or nobody, fails "seal"; one that names Lia passes', () => {
    expect(failedOf(good(), { deliverySeal: { read: true, name: 'Bia' } })).toEqual(['seal'])
    expect(failedOf(good(), { deliverySeal: { read: true } })).toEqual(['seal'])
    expect(failedOf(good(), { deliverySeal: { read: true, name: 'Lia' } })).toEqual([])
  })
})

describe('leak and voice', () => {
  it('a leak fails "leak" only', () => {
    expect(failedOf(good({ leaks: ['line 3: bilhete text in the thread: "inputs/foto.png"'] }))).toEqual(['leak'])
  })
  it('flags the REAL voice defects of attempt 5, and only a persona or the team can say them', () => {
    expect(voiceFindingsIn('x', 'a aprovação é da pessoa', true).map(item => item.rule)).toEqual(['a pessoa'])
    expect(voiceFindingsIn('x', 'Revisão antes da aprovação da pessoa: a composição funciona?', true).map(item => item.rule)).toEqual(['a pessoa'])
    expect(voiceFindingsIn('x', 'A composição funciona. NOVA VERSÃO: Texto do rascunho não muda', true).map(item => item.rule)).toEqual(['NOVA VERSÃO: cru'])
    expect(voiceFindingsIn('x', 'Precisa de você: o limite de execuções reais desta rodada foi atingido (12 de 12). Nada foi iniciado.', true).map(item => item.rule)).toEqual(['RealTurnCapError'])
    expect(voiceFindingsIn('x', 'Falhou com RealTurnCapError', false).map(item => item.rule)).toEqual(['RealTurnCapError'])
    expect(voiceFindingsIn('x', 'o limite de execuções reais', false)).toEqual([]) // not spoken: the harness's own card
  })
  it('does not mark honest prose: "uma pessoa", "pessoas", "essa pessoa", a lowercase "nova versão:"', () => {
    for (const text of ['Uma pessoa da equipe confere.', 'Pessoas que pedem pelo WhatsApp.', 'Fale com essa pessoa.', 'A nova versão: ficou melhor.', 'Nada disso gera nova versão.']) expect(voiceFindingsIn('x', text, true), text).toEqual([])
  })
  it('reads the thread, the bilhetes, the reviews, the questions and the Task titles — not the person\'s own words', () => {
    const lines = [line('1', 'Pessoa', 'Pode ser a pessoa que quiser.', 'message'), line('2', 'Téo', 'Sigo com a aprovação da pessoa.')]
    expect(failedOf(good({ lines }))).toEqual(['voice'])
    expect(failedOf(good({ lines: [lines[0]!] }))).toEqual([])
    expect(failedOf(good({ reviews: [sealedReview({ summary: 'Fica a critério da pessoa.' })] }))).toEqual(['voice'])
    expect(failedOf(good({ asks: [{ id: 'q', askId: 'a', ticketId: 't', who: 'Lia', question: 'A pessoa confirma?', options: [], step: undefined }] }))).toEqual(['voice'])
  })
})

describe('the helpers', () => {
  it('copyOf takes the labeled lines first, then the quoted ones that are not files; squash ignores case, spaces and quote style', () => {
    expect(copyOf('**Título:** Pão de queijo em dobro!\n**Formato:** 1080x1350\n**Destaque:** 2 por R$ 9')).toEqual(['Pão de queijo em dobro!', '2 por R$ 9'])
    expect(copyOf('Salvei em "cartaz.svg" e em "artes/x.png"')).toEqual([]) // a quoted file or path is not copy
    expect(copyOf('Usei “Peça pelo WhatsApp” e "cartaz.svg"')).toEqual(['Peça pelo WhatsApp'])
    expect(squash('Pão  de\nQueijo “em” dobro')).toBe(squash('PÃO DE QUEIJO "EM" DOBRO'))
  })
  it('svgTextOf reads only what the art SHOWS: every <text> (tspans joined), entities decoded, comments and attributes ignored', () => {
    expect(svgTextOf('<!-- Título: escondido --><svg><text x="1">Peça</text><text><tspan>2 por</tspan><tspan>R$ 9</tspan></text></svg>')).toBe('Peça 2 por R$ 9')
    expect(svgTextOf('<svg><title>nada</title><text>a &amp; b &#233;</text></svg>')).toBe('a & b é')
  })
})

describe('replay of the kept homes (0 AI): the real attempt 5 is RED on what the Carbon wanted gone, a good fake is green', () => {
  const team10 = join(ARTIFACTS_DIR, 'team10', 'homes')
  const attempt5 = existsSync(team10) ? readdirSync(team10).filter(name => name.startsWith('real-attempt-5-')).sort().map(name => join(team10, name)).pop() : undefined
  const evalRoot = join(ARTIFACTS_DIR, 'eval-padaria')
  const fakeRun = existsSync(evalRoot) ? readdirSync(evalRoot).filter(name => name.startsWith('eval-fake-')).sort().map(name => join(evalRoot, name, 'homes', 'r1')).filter(path => existsSync(path)).pop() : undefined
  it.skipIf(attempt5 === undefined)('attempt 5: 12 turns, 469 mil raw, two arts, "a pessoa", a raw NOVA VERSÃO:, the limiter\'s sentence', () => {
    const report = evaluateD100Gate(readTeamTranscript(attempt5!)!)
    const failed = report.checks.filter(check => !check.ok).map(check => check.id)
    expect(failed).toEqual(expect.arrayContaining(['turns', 'input', 'one-art', 'voice']))
    expect(report.measures).toMatchObject({ turns: 12, rawInputTokens: 469_479 })
    expect(report.measures.arts).toHaveLength(2)
    expect(report.checks.find(check => check.id === 'voice')!.detail).toMatch(/a pessoa ×\d+.*NOVA VERSÃO: cru ×1.*RealTurnCapError ×\d+/u)
  })
  it.skipIf(fakeRun === undefined)('a good fake round (the last one kept) passes the eight checks', () => {
    const report = evaluateD100Gate(readTeamTranscript(fakeRun!)!)
    expect(report.problems).toEqual([])
  })
})
