/**
 * COLHEITA item 14 — the eval of the Padaria Lua round as a whole (`src/eval-padaria.ts` + `src/eval-padaria-run.ts`), with no host and no model:
 *   1. one transcript → one report: a GOOD round passes every check; each defect flips ONLY its own check;
 *   2. N reports → one summary (`--repeat`): all must pass, a split vote is "unstable", spreads, an unmeasured repeat is "not measured" and never smaller;
 *   3. the runner with an injected round driver: N rounds, one summary on disk, a round that throws or leaves no transcript FAILS CLOSED, the real engine is refused by name;
 *   4. the replay of the kept homes of the real attempts (skipped when the folder is not there): attempt 5 is RED on exactly what Atlas read in it, attempt 2 is clean on the three readers.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { aggregatePadariaEval, evaluatePadariaRound, renderPadariaEvalMarkdown, unreadableRoundReport, type EvalCheckId } from '../src/eval-padaria.ts'
import { replayPadariaEval, requestOfHome, runPadariaEval, runPadariaScenarios } from '../src/eval-padaria-run.ts'
import { visibleThreadText } from '../src/eval-padaria-rules.ts'
import { PADARIA_SCENARIOS, PADARIA_SCENARIO_IDS, renderScenariosMarkdown, scenarioVerdict, type PadariaScenarioId } from '../src/eval-padaria-scenarios.ts'
import { ARTIFACTS_DIR } from '../src/paths.ts'
import type { LedgerEvidence, LedgerRow } from '../src/ledger-evidence.ts'
import type { TeamRoundResult } from '../src/team-round-driver.ts'
import type { TeamTranscript, TranscriptDraft, TranscriptLine, TranscriptNote } from '../src/team-transcript.ts'

const REQUEST = 'Faz o cartaz da promoção do pão de queijo da Padaria Lua para o Instagram: 2 por R$ 9 de sexta a domingo, pedidos pelo WhatsApp (11) 91234-5678. Preciso do texto e da arte; a foto é o rascunho atual. Quero a opinião do time sobre a arte antes de eu aprovar.'

// ── a GOOD round, built by hand: 5 turns, one art that shows Bia's exact text, Lia reviews that art and seals it, no question, no jargon ──────────
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><text>Pão de queijo em dobro!</text><text>2 por R$ 9</text><text>Peça pelo WhatsApp (11) 91234-5678</text></svg>'
const row = (kind: string, input: number, read: number, write: number, output: number): LedgerRow => ({ kind, engine: 'claude', origin: 'measured', inputTokens: input, outputTokens: output, cacheReadTokens: read, cacheWriteTokens: write, ticketId: null, at: '2026-11-11T21:12:00.000Z', envMode: 'needed' })
function ledgerOf(rows: LedgerRow[]): LedgerEvidence {
  const sum = (pick: (item: LedgerRow) => number): number => rows.reduce((total, item) => total + pick(item), 0)
  return { dbPath: 'x', rows, rawRows: [], turns: rows.length, inputTokens: sum(item => item.inputTokens), outputTokens: sum(item => item.outputTokens), cacheReadTokens: sum(item => item.cacheReadTokens), cacheWriteTokens: sum(item => item.cacheWriteTokens), allMeasured: true }
}
const GOOD_ROWS = [row('execution', 20_000, 10_000, 8_000, 900), row('execution', 22_000, 12_000, 8_000, 1_100), row('execution', 18_000, 9_000, 7_000, 800), row('reply', 12_000, 9_000, 2_000, 400), row('execution', 15_000, 10_000, 4_000, 600)]
const line = (id: string, who: string, text: string, type = 'runner'): TranscriptLine => ({ at: `2026-11-11T21:12:${id.padStart(2, '0')}.000Z`, stream: 'channel:geral', id, type, who, text, attachments: [], leaks: [] })
const note = (from: string, to: string, overrides: Partial<TranscriptNote>): TranscriptNote => ({ id: `${from}-${to}`, from, to, title: 'Arte do cartaz', kind: 'pass', status: 'delivered', askedAt: '', done: [], needed: [], files: [], decisions: [], colleagueReceived: true, colleagueTicketId: null, via: 'model', ...overrides })
const draftOf = (ticketId: string, path: string, text: string, sha: string): TranscriptDraft => ({ ticketId, directory: `C:\\home\\worktrees\\p\\${ticketId}`, files: [{ path, size: text.length, sha, text }] })

function goodTranscript(overrides: Partial<TeamTranscript> = {}): TeamTranscript {
  return {
    lines: [
      line('1', 'Pessoa', REQUEST, 'message'),
      line('2', 'Lia', 'Dividi assim: Téo — Arte; Bia — Texto.', 'message'),
      line('3', 'Bia', 'Já escrevi o texto e passei ao Téo para a arte.'),
      line('4', 'Téo', 'A arte está pronta e já foi para a revisão da Lia.'),
      line('5', 'Linha da equipe', 'Lia aprovou o trabalho de Téo', 'review'),
      line('6', 'Lia', 'Pronto: Cartaz da promoção do pão de queijo da Padaria…. Arte (Téo); Texto (Bia).', 'message'),
    ],
    tickets: [], ledger: ledgerOf(GOOD_ROWS), names: {}, personas: ['Lia', 'Bia', 'Téo'], leaks: [], ignoredTypes: {},
    notes: [
      note('Bia', 'Téo', { done: ['Título: "Pão de queijo em dobro!"', 'Destaque: "2 por R$ 9"'], fromTicketId: 'tBia', colleagueTicketId: 'tTeo' }),
      note('Téo', 'Lia', { kind: 'review', fromTicketId: 'tTeo', colleagueTicketId: 'tLia' }),
    ],
    reviews: [{ taskId: 'tTeo', status: 'closed', reviewer: 'Lia', author: 'Téo', returns: 0, sealed: true, summary: 'Aprovado.', failure: null }],
    asks: [], splitTasks: 2, splitAssignments: [], reviewAssignments: [], draftDirectories: [],
    drafts: [draftOf('tTeo', 'cartaz-arte.svg', SVG, 'sha-final'), draftOf('tLia', 'cartaz-arte.svg', SVG, 'sha-final'), draftOf('tBia', 'inputs/foto.png', '', 'sha-foto')],
    ...overrides,
  }
}

const failedIds = (transcript: TeamTranscript): EvalCheckId[] => evaluatePadariaRound(transcript, { request: REQUEST }).checks.filter(check => !check.ok).map(check => check.id)

describe('one round → one report', () => {
  it('a good round passes every check and reports its measures', () => {
    const report = evaluatePadariaRound(goodTranscript(), { request: REQUEST })
    expect(report.problems).toEqual([])
    expect(report.ok).toBe(true)
    expect(report.checks.map(check => check.id)).toEqual(['turns', 'input', 'deliverables', 'false-done', 'silly-asks', 'jargon', 'one-art', 'bia-text', 'review', 'seal', 'leak'])
    expect(report.metrics).toMatchObject({ turns: 5, rawInputTokens: 87_000, textDelivered: true, artDelivered: true, totalAsks: 0, sillyAsks: 0, falseDone: 0, jargon: 0, leaks: 0 })
    expect(report.metrics.priceWeightedInputTokens).toBeGreaterThan(0)
    expect(report.metrics.priceWeightedInputTokens).toBeLessThan(report.metrics.rawInputTokens!) // the cache parts are cheaper than the raw sum
  })

  it('7 turns flips only "turns"; 130 mil raw input flips only "input" (and both numbers are reported)', () => {
    expect(failedIds(goodTranscript({ ledger: ledgerOf([...GOOD_ROWS, row('execution', 1_000, 0, 0, 10), row('execution', 1_000, 0, 0, 10)]) }))).toEqual(['turns'])
    const heavy = goodTranscript({ ledger: ledgerOf([row('execution', 130_000, 100_000, 20_000, 3_000)]) })
    expect(failedIds(heavy)).toEqual(['input'])
    expect(evaluatePadariaRound(heavy, { request: REQUEST }).problems[0]).toMatch(/130000 raw input tokens \(\d+ price-weighted/u)
  })

  it('a false "Pronto!", a silly question and jargon each flip only their own check', () => {
    expect(failedIds(goodTranscript({ lines: [...goodTranscript().lines, line('7', 'Téo', 'Pronto! 👍')] }))).toEqual(['false-done'])
    expect(failedIds(goodTranscript({ asks: [{ id: 'q', askId: 'a', ticketId: 't', who: 'Lia', question: 'O WhatsApp (11) 91234-5678 é o número real de contato?', options: [], step: undefined }] }))).toEqual(['silly-asks'])
    expect(failedIds(goodTranscript({ lines: [...goodTranscript().lines, line('7', 'Téo', 'A aprovação é da pessoa.')] }))).toEqual(['jargon'])
  })

  it('jargon that sits inside <details> is not jargon; the same words in the opening are', () => {
    const inside = line('7', 'Téo', 'A arte está pronta. <details><summary>Como foi</summary>**O que fiz:** abri inputs/foto.png (HTTP 200).</details>')
    expect(failedIds(goodTranscript({ lines: [...goodTranscript().lines, inside] }))).toEqual([])
    expect(failedIds(goodTranscript({ lines: [...goodTranscript().lines, line('7', 'Téo', '**O que fiz:** abri inputs/foto.png.')] }))).toEqual(['jargon'])
  })

  it('no art saved flips the art checks and "deliverables"; two arts flip "one-art"', () => {
    expect(failedIds(goodTranscript({ drafts: [draftOf('tBia', 'inputs/foto.png', '', 'sha-foto')] }))).toEqual(expect.arrayContaining(['deliverables', 'one-art']))
    const second = [...goodTranscript().drafts!, draftOf('tOther', 'arte-outra.svg', SVG, 'sha-outra')]
    expect(failedIds(goodTranscript({ drafts: second }))).toContain('one-art')
  })

  it('a leak flips "leak"; an unsealed review flips "seal"', () => {
    expect(failedIds(goodTranscript({ leaks: ['line 3: bilhete text in the thread: "inputs/foto.png"'] }))).toEqual(['leak'])
    expect(failedIds(goodTranscript({ reviews: [{ taskId: 'tTeo', status: 'closed', reviewer: 'Lia', author: 'Téo', returns: 1, sealed: false, summary: 'ajustes', failure: null }] }))).toEqual(expect.arrayContaining(['seal']))
  })

  it('a round with no ledger fails closed (turns and input are unproven, never zero)', () => {
    expect(failedIds(goodTranscript({ ledger: undefined }))).toEqual(expect.arrayContaining(['turns', 'input']))
  })

  it('a round that left no transcript fails every check, each with the reason', () => {
    const report = unreadableRoundReport('the transcript could not be read')
    expect(report.ok).toBe(false)
    expect(report.checks.every(check => !check.ok && check.detail === 'the transcript could not be read')).toBe(true)
    expect(report.checks).toHaveLength(11)
  })
})

describe('N reports → one summary (--repeat)', () => {
  const good = (): ReturnType<typeof evaluatePadariaRound> => evaluatePadariaRound(goodTranscript(), { request: REQUEST })
  const sevenTurns = (): ReturnType<typeof evaluatePadariaRound> => evaluatePadariaRound(goodTranscript({ ledger: ledgerOf([...GOOD_ROWS, row('execution', 1_000, 0, 0, 10), row('execution', 1_000, 0, 0, 10)]) }), { request: REQUEST })

  it('three good rounds: ok, stable, 3/3 on every check, a spread of one value', () => {
    const summary = aggregatePadariaEval([good(), good(), good()])
    expect(summary).toMatchObject({ repeats: 3, passed: 3, ok: true, stable: true, totals: { sillyAsks: 0, falseDone: 0, jargon: 0, leaks: 0 } })
    expect(summary.perCheck.every(check => check.passed === 3 && check.of === 3)).toBe(true)
    expect(summary.spread.turns).toEqual({ min: 5, median: 5, max: 5 })
  })

  it('2 of 3 is NOT a pass: it is unstable, and the check that split says so', () => {
    const summary = aggregatePadariaEval([good(), sevenTurns(), good()])
    expect(summary).toMatchObject({ repeats: 3, passed: 2, ok: false, stable: false })
    expect(summary.perCheck.find(check => check.id === 'turns')).toMatchObject({ passed: 2, of: 3 })
    expect(summary.spread.turns).toEqual({ min: 5, median: 5, max: 7 })
  })

  it('three equal failures are stable (it fails the same way every time) but not ok', () => {
    const summary = aggregatePadariaEval([sevenTurns(), sevenTurns(), sevenTurns()])
    expect(summary).toMatchObject({ ok: false, stable: true, passed: 0 })
  })

  it('a repeat that could not be measured makes the spread unknown, not smaller; no repeat at all is never ok', () => {
    const summary = aggregatePadariaEval([good(), unreadableRoundReport('no transcript')])
    expect(summary.spread.turns).toBeNull()
    expect(summary.ok).toBe(false)
    expect(aggregatePadariaEval([])).toMatchObject({ ok: false, repeats: 0 })
  })

  it('the page names the verdict, the measures against their targets, every check and each repeat\'s problems', () => {
    const reports = [good(), sevenTurns()]
    const page = renderPadariaEvalMarkdown(aggregatePadariaEval(reports), reports, { engine: 'fake', stamp: 'S', sources: ['r1', 'r2'], notes: { 2: 'watchdog: x' } })
    expect(page).toMatch(/^# Eval Padaria Lua — fake × 2 — FALHOU \(1\/2\)/u)
    expect(page).toMatch(/resultado INSTÁVEL/u)
    expect(page).toMatch(/\| turnos pagos \| 5 \/ 6 \/ 7 \| ≤ 6 \|/u)
    expect(page).toMatch(/\| entrada bruta \(cache incluso\) \|[^|]+\| ≤ 120000 \|/u)
    expect(page).toMatch(/## Repetição 1 — PASSOU — r1\s+Sem problemas\./u)
    expect(page).toMatch(/## Repetição 2 — FALHOU — r2\s+Aviso: watchdog: x/u)
    expect(page).toMatch(/- EVAL turns: até 6 turnos pagos — 7 paid turn/u)
    expect(page).toMatch(/Fake \(0 IA\)/u)
    const replay = renderPadariaEvalMarkdown(aggregatePadariaEval(reports), reports, { engine: 'replay', stamp: 'S', sources: ['a', 'b'] })
    expect(replay).not.toMatch(/INSTÁVEL|ESTÁVEL/u)
  })
})

describe('the runner (round driver injected)', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'eval-padaria-spec-'))
  afterAll(() => { rmSync(scratch, { recursive: true, force: true }) })
  const asResult = (transcript: TeamTranscript | undefined, extra: Partial<TeamRoundResult> = {}): TeamRoundResult => ({ transcript, aborted: undefined, timedOut: false, ...extra }) as unknown as TeamRoundResult

  it('runs N rounds, each in its own home, and writes one summary (md + json)', async () => {
    const homes: string[] = []
    const outcome = await runPadariaEval({ engine: 'fake', repeat: 3, outRoot: scratch }, {
      request: REQUEST,
      runRound: async (options) => { homes.push(options.home); expect(options.engine).toBe('fake'); return asResult(goodTranscript()) },
    })
    expect(new Set(homes).size).toBe(3)
    expect(outcome.summary).toMatchObject({ repeats: 3, passed: 3, ok: true })
    expect(existsSync(join(outcome.outDir, 'summary.md'))).toBe(true)
    const json = JSON.parse(readFileSync(join(outcome.outDir, 'summary.json'), 'utf8')) as { meta: { engine: string; sources: string[] }; summary: { ok: boolean }; reports: unknown[] }
    expect(json).toMatchObject({ meta: { engine: 'fake', sources: ['r1', 'r2', 'r3'] }, summary: { ok: true } })
    expect(json.reports).toHaveLength(3)
  })

  it('a round that throws, one with no transcript and one the watchdog killed all FAIL, with the reason in the page', async () => {
    let call = 0
    const outcome = await runPadariaEval({ engine: 'fake', repeat: 3, outRoot: scratch }, {
      request: REQUEST,
      runRound: async () => {
        call += 1
        if (call === 1) throw new Error('preflight: the host boot line does not show the four switches ON')
        if (call === 2) return asResult(undefined)
        return asResult(goodTranscript(), { aborted: 'the ledger could not be read for 60 s' })
      },
    })
    expect(outcome.summary).toMatchObject({ repeats: 3, ok: false })
    expect(outcome.reports[0]!.problems.join('\n')).toMatch(/four switches ON/u)
    expect(outcome.reports[1]!.problems.join('\n')).toMatch(/transcript could not be read/u)
    expect(outcome.meta.notes).toMatchObject({ 1: expect.stringMatching(/failed before it could be read/u), 3: expect.stringMatching(/watchdog: the ledger/u) })
    expect(outcome.markdown).toMatch(/Aviso: watchdog: the ledger/u)
  })

  it('hands the driver the choreography only when asked (the default stays the legacy rehearsal)', async () => {
    const seen: Array<string | undefined> = []
    const runRound = async (options: { choreography?: string }): Promise<TeamRoundResult> => { seen.push(options.choreography); return asResult(goodTranscript()) }
    await runPadariaEval({ engine: 'fake', repeat: 1, outRoot: scratch }, { request: REQUEST, runRound })
    await runPadariaEval({ engine: 'fake', repeat: 1, outRoot: scratch, choreography: 'd100' }, { request: REQUEST, runRound })
    expect(seen).toEqual([undefined, 'd100'])
  })

  it('refuses the real engine by name and a --repeat outside 1..10, before any round starts', async () => {
    let started = 0
    const runRound = async (): Promise<TeamRoundResult> => { started += 1; return asResult(goodTranscript()) }
    await expect(runPadariaEval({ engine: 'real', outRoot: scratch }, { request: REQUEST, runRound })).rejects.toThrow(/Atlas's written OK/u)
    await expect(runPadariaEval({ engine: 'fake', repeat: 0, outRoot: scratch }, { request: REQUEST, runRound })).rejects.toThrow(/--repeat/u)
    await expect(runPadariaEval({ engine: 'fake', repeat: 11, outRoot: scratch }, { request: REQUEST, runRound })).rejects.toThrow(/--repeat/u)
    expect(started).toBe(0)
    expect(readdirSync(scratch).filter(name => name.startsWith('eval-real'))).toEqual([])
  })
})

describe('the RED scenarios (the stub does ONE thing wrong; the eval must flag exactly that)', () => {
  // What each scenario puts in the real thread, built by hand on the good round: the same words the driver gives the stub.
  const withDefect = (id: PadariaScenarioId): TeamTranscript => {
    const scenario = PADARIA_SCENARIOS[id]
    const base = goodTranscript()
    if (scenario.textPartAppend !== undefined) return goodTranscript({ lines: [...base.lines, line('7', 'Bia', `Aqui está a minha parte, pronta para a revisão. ${scenario.textPartAppend}`)] })
    if (scenario.textPartAsks !== undefined) return goodTranscript({ asks: [{ id: 'q', askId: 'a', ticketId: 't', who: 'Bia', question: scenario.textPartAsks, options: [], step: undefined }] })
    if (scenario.inputTokens !== undefined) return goodTranscript({ ledger: ledgerOf(GOOD_ROWS.map(item => row(item.kind, scenario.inputTokens!, 0, 0, 100))) })
    return base
  }
  // What the person reads of the round is computed the way the runner does.
  const verdictOf = (id: PadariaScenarioId, transcript: TeamTranscript): ReturnType<typeof scenarioVerdict> => scenarioVerdict(PADARIA_SCENARIOS[id], evaluatePadariaRound(transcript, { request: REQUEST }), visibleThreadText(transcript))

  it('every scenario is well formed: it names what it must flip, and the stub gets exactly one thing to do wrong', () => {
    expect(PADARIA_SCENARIO_IDS).toEqual(['pronto-falso', 'pergunta-boba', 'jargao', 'jargao-tecnico', 'pesado'])
    for (const id of PADARIA_SCENARIO_IDS) {
      const scenario = PADARIA_SCENARIOS[id]
      expect(scenario.id).toBe(id)
      expect(scenario.mustFail.length).toBeGreaterThan(0)
      expect([scenario.textPartAppend, scenario.textPartAsks, scenario.inputTokens].filter(item => item !== undefined)).toHaveLength(1)
      expect(scenario.mustFail.some(check => scenario.mayFail.includes(check))).toBe(false)
      // a defect made of words can be stopped by the product, so it must say which words; one made of weight (tokens) cannot
      expect(scenario.reach.length > 0).toBe(scenario.inputTokens === undefined)
    }
  })

  it.each(PADARIA_SCENARIO_IDS)('%s: when the defect reaches the person, it is caught by its own check and nothing else flips', (id) => {
    const verdict = verdictOf(id, withDefect(id))
    expect(verdict.missed, `missed ${verdict.missed.join(',')}`).toEqual([])
    expect(verdict.extra, `extra ${verdict.extra.join(',')}`).toEqual([])
    expect(verdict.outcome).toBe('pego')
    expect(verdict.ok).toBe(true)
    expect(verdict.failed.length).toBeGreaterThan(0)
  })

  it('a defect the PRODUCT stopped before the person could read it is "barrado": the eval stays quiet and that is right', () => {
    // the good round plays no defect: its thread holds none of the defect's words
    for (const id of ['pronto-falso', 'jargao', 'jargao-tecnico', 'pergunta-boba'] as const) {
      expect(verdictOf(id, goodTranscript()), id).toMatchObject({ outcome: 'barrado', ok: true, failed: [] })
    }
    // words held back from the thread but present INSIDE <details> are not read: still stopped
    const folded = goodTranscript({ lines: [...goodTranscript().lines, line('7', 'Bia', 'Aqui está a minha parte, pronta. <details><summary>Detalhes</summary>**O que fiz:** conferi tudo. É da pessoa.</details>')] })
    expect(verdictOf('jargao', folded)).toMatchObject({ outcome: 'barrado', ok: true })
  })

  it('a reader that is BLIND says so: the defect\'s words are in what the person reads and no check flipped; a defect made of weight cannot be "barrado"', () => {
    const report = evaluatePadariaRound(goodTranscript(), { request: REQUEST })
    expect(scenarioVerdict(PADARIA_SCENARIOS['jargao'], report, 'Bia: a aprovação final é da pessoa.')).toMatchObject({ outcome: 'cego', ok: false, missed: ['jargon'] })
    expect(scenarioVerdict(PADARIA_SCENARIOS['jargao'], report)).toMatchObject({ outcome: 'cego', ok: false }) // no text to read = the strict reading
    expect(verdictOf('pesado', goodTranscript())).toMatchObject({ outcome: 'cego', ok: false, missed: ['input'] })
  })

  it('a reader that cries WOLF says so: the defect is caught but something the defect does not explain flips too', () => {
    const wolf = verdictOf('jargao', goodTranscript({ lines: [...goodTranscript().lines, line('7', 'Bia', '**O que fiz:** tudo. É da pessoa.')], drafts: [draftOf('tBia', 'inputs/foto.png', '', 'sha-foto')] }))
    expect(wolf.missed).toEqual([])
    expect(wolf.outcome).toBe('pego')
    expect(wolf.extra).toEqual(expect.arrayContaining(['deliverables', 'one-art']))
    expect(wolf.ok).toBe(false)
  })

  it('the page names each scenario, what it had to flip and the result; a broken round is INVÁLIDO, never "pego"', () => {
    const scenario = PADARIA_SCENARIOS['pesado']
    const report = evaluatePadariaRound(withDefect('pesado'), { request: REQUEST })
    const page = renderScenariosMarkdown([
      { scenario, verdict: scenarioVerdict(scenario, report), report, invalid: undefined, ok: true },
      { scenario: PADARIA_SCENARIOS['jargao'], verdict: scenarioVerdict(PADARIA_SCENARIOS['jargao'], unreadableRoundReport('x')), report: unreadableRoundReport('x'), invalid: 'watchdog: x', ok: false },
    ], { stamp: 'S' })
    expect(page).toMatch(/FALHOU \(1\/2\)/u)
    expect(page).toMatch(/\| pesado \|[^|]+\| input \| input \| — \| PEGO \|/u)
    expect(page).toMatch(/\| jargao \|[^|]+\| jargon \|[^|]+\|[^|]+\| INVÁLIDO \|/u)
    expect(page).toMatch(/Rodada inválida \(não conta\): watchdog: x/u)
    // the three honest endings read differently on the page
    const good = evaluatePadariaRound(goodTranscript(), { request: REQUEST })
    const stopped = renderScenariosMarkdown([{ scenario: PADARIA_SCENARIOS['jargao'], verdict: scenarioVerdict(PADARIA_SCENARIOS['jargao'], good, 'nada'), report: good, invalid: undefined, ok: true }], { stamp: 'S' })
    expect(stopped).toMatch(/\| jargao \|[^|]+\| jargon \| — \| — \| BARRADO PELO PRODUTO \|/u)
    expect(stopped).toMatch(/TODOS OK \(1\/1\)/u)
    const blind = renderScenariosMarkdown([{ scenario: PADARIA_SCENARIOS['jargao'], verdict: scenarioVerdict(PADARIA_SCENARIOS['jargao'], good, 'é da pessoa'), report: good, invalid: undefined, ok: false }], { stamp: 'S' })
    expect(blind).toMatch(/NÃO PEGO \(leitor cego\)/u)
  })

  describe('the runner (round driver injected)', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'eval-padaria-scenarios-'))
    afterAll(() => { rmSync(scratch, { recursive: true, force: true }) })
    const asResult = (transcript: TeamTranscript | undefined, extra: Partial<TeamRoundResult> = {}): TeamRoundResult => ({ transcript, aborted: undefined, timedOut: false, ...extra }) as unknown as TeamRoundResult

    it('plays each scenario once, hands the driver its id, and writes one page: all caught', async () => {
      const seen: Array<string | undefined> = []
      const outcome = await runPadariaScenarios({ outRoot: scratch }, { request: REQUEST, runRound: async (options) => { seen.push(options.scenario); expect(options.engine).toBe('fake'); return asResult(withDefect(options.scenario!)) } })
      expect(seen).toEqual(['pronto-falso', 'pergunta-boba', 'jargao', 'jargao-tecnico', 'pesado'])
      expect(outcome.ok).toBe(true)
      expect(outcome.markdown).toMatch(/TODOS OK \(5\/5\)/u)
      expect(JSON.parse(readFileSync(join(outcome.outDir, 'summary.json'), 'utf8'))).toMatchObject({ ok: true })
    })

    it('a round that threw, one the watchdog killed and one that did not settle are INVALID even when the eval flagged the defect', async () => {
      let call = 0
      const outcome = await runPadariaScenarios({ outRoot: scratch, scenarios: ['jargao', 'pesado', 'pronto-falso'] }, {
        request: REQUEST,
        runRound: async (options) => {
          call += 1
          if (call === 1) throw new Error('preflight: boom')
          if (call === 2) return asResult(withDefect(options.scenario!), { aborted: 'the ledger could not be read' })
          return asResult(withDefect(options.scenario!), { timedOut: true })
        },
      })
      expect(outcome.ok).toBe(false)
      expect(outcome.runs.map(run => run.invalid !== undefined)).toEqual([true, true, true])
      expect(outcome.runs.every(run => !run.ok)).toBe(true)
      expect(outcome.runs[0]!.invalid).toMatch(/preflight: boom/u)
    })

    it('refuses an unknown scenario and an empty list before any round starts', async () => {
      let started = 0
      const runRound = async (): Promise<TeamRoundResult> => { started += 1; return asResult(goodTranscript()) }
      await expect(runPadariaScenarios({ outRoot: scratch, scenarios: ['nao-existe' as PadariaScenarioId] }, { request: REQUEST, runRound })).rejects.toThrow(/unknown scenario/u)
      await expect(runPadariaScenarios({ outRoot: scratch, scenarios: [] }, { request: REQUEST, runRound })).rejects.toThrow(/no scenario/u)
      expect(started).toBe(0)
    })
  })
})

describe('replay of the kept homes of the real attempts (0 AI, 0 cost)', () => {
  const homesDir = join(ARTIFACTS_DIR, 'team10', 'homes')
  const home = (prefix: string): string | undefined => (existsSync(homesDir) ? readdirSync(homesDir).filter(name => name.startsWith(prefix)).sort().map(name => join(homesDir, name)).pop() : undefined)
  const attempt2 = home('real-attempt-2-')
  const attempt5 = home('real-attempt-5-')
  const scratch = mkdtempSync(join(tmpdir(), 'eval-padaria-replay-'))
  afterAll(() => { rmSync(scratch, { recursive: true, force: true }) })

  it.skipIf(attempt5 === undefined)('attempt 5 (12 turns, 469 mil raw input): RED on what Atlas read in it — turns, input, a "Pronto:" over stopped work, the two silly questions, the jargon, two arts', () => {
    expect(requestOfHome(attempt5!)).toMatch(/Padaria Lua/u)
    const { reports, summary } = replayPadariaEval([attempt5!], { outRoot: scratch })
    const report = reports[0]!
    const failed = report.checks.filter(check => !check.ok).map(check => check.id)
    expect(failed).toEqual(expect.arrayContaining(['turns', 'input', 'false-done', 'silly-asks', 'jargon', 'one-art']))
    expect(report.metrics).toMatchObject({ turns: 12, rawInputTokens: 469_479, totalAsks: 2, sillyAsks: 2, falseDone: 1, leaks: 0 })
    expect(report.findings.sillyAsks.map(item => item.rule).sort()).toEqual(['bancada do time', 'dado do pedido'])
    expect(new Set(report.findings.jargon.map(item => item.rule))).toEqual(new Set(['prontuário', 'caminho', 'a pessoa', 'NOVA VERSÃO: cru', 'RealTurnCapError']))
    expect(summary.ok).toBe(false)
  })

  it.skipIf(attempt2 === undefined)('attempt 2 (1 turn, the team ASKED because the request had no facts): clean on the three readers — asking was right', () => {
    const { reports } = replayPadariaEval([attempt2!], { outRoot: scratch })
    const report = reports[0]!
    expect(report.checks.filter(check => ['false-done', 'silly-asks', 'jargon'].includes(check.id) && !check.ok)).toEqual([])
    expect(report.metrics).toMatchObject({ turns: 1, totalAsks: 1, sillyAsks: 0 })
  })

  it('a home that cannot be read fails closed instead of passing', () => {
    const { reports } = replayPadariaEval([join(scratch, 'no-such-home')], { outRoot: scratch })
    expect(reports[0]!.ok).toBe(false)
    expect(reports[0]!.checks.every(check => !check.ok)).toBe(true)
  })
})
