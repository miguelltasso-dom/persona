/**
 * OPT-8b — the 2nd paired REAL round, as PRE-REGISTERED (persona-spec/reports/opt8b-prereg.md, Atlas-authorised 04/11) — the plan and the
 * verdict, pure and written BEFORE any call so the rule cannot bend to the data.
 *
 * The question: does running a task through the Persona path cost the same as sending the same text straight to the CLI?
 *  - plan: Claude haiku in both arms, n = 3 per cell: `direct` (cold, warm) and the Persona `execution` (cold, warm) = 12 calls, plus the warm
 *    `triage` x 3 (the call `skipTriage` saves) = 15 planned; hard ceiling {@link PAIR_REAL_B_CALL_CAP} (40) counting every repeat; no `persona_lean` arm;
 *  - metric: the TOTAL `inputTokens` the adapter reports (it already includes cache read and write), the median of the 3 of each cell;
 *  - parity ratio = median(Persona execution) / median(direct), separately COLD and WARM;
 *  - the verdict follows the pre-registered rule to the letter, plus the interpretation recorded in Addendum 2 (cases the original text left open);
 *  - validity (Addendum 1): all 15 calls must have the same EFFECTIVE mode `answer-only`; otherwise the round is `invalid` for the verdict.
 *
 * Nothing here imports a CLI. The entry script (when the real lock is free) runs the plan and hands the rows to {@link evaluatePairRealB}.
 */

import { PAIR_REAL_TASK } from './pair-real.ts'
import { LEVERS_AS_WIRED, runFaithfulScenario, type FaithfulReport, type LeverSet } from './token-faithful.ts'

/** The hard ceiling Atlas allowed for this round (every call counts, a replaced one too). */
export const PAIR_REAL_B_CALL_CAP = 40
/** Calls the plan has. */
export const PAIR_REAL_B_PLAN_CALLS = 15
/** Repeats per cell. */
export const PAIR_REAL_B_REPEATS = 3
/** Parity band of the ratio and the largest allowed dispersion of a cell, (max - min) / median. */
export const PARITY_BAND = { low: 0.9, high: 1.1 } as const
export const MAX_DISPERSION = 0.5

export type PairBCell = 'direct-cold' | 'direct-warm' | 'persona-cold' | 'persona-warm' | 'triage-warm'
export const PAIR_B_CELLS: readonly PairBCell[] = ['direct-cold', 'direct-warm', 'persona-cold', 'persona-warm', 'triage-warm']

export interface PairBCall {
  readonly cell: PairBCell
  /** 1..3: which repeat of the cell. */
  readonly repeat: number
  readonly prompt: string
}

export interface PairBPlan {
  readonly task: string
  readonly cli: 'claude'
  readonly model: 'haiku'
  readonly calls: readonly PairBCall[]
  /** The ceiling, never more. */
  readonly cap: number
  /** The ready criterion: words a good answer must contain (lower case). */
  readonly needles: readonly string[]
}

function firstPrompt(report: FaithfulReport, kind: 'triage' | 'execution'): string {
  return report.turns.find(turn => turn.entry.kind === kind)?.prompt ?? ''
}

/**
 * The 15 planned calls: for each of 3 repeats, the cold pair (direct, Persona execution), then the warm trio (direct, Persona execution, triage).
 * The Persona arm is the host as wired (same model on both arms, no cheap routing: only the prompt design differs).
 * @param levers - How Persona is wired at the time of the run.
 */
export function buildPairRealBPlan(levers: LeverSet = LEVERS_AS_WIRED): PairBPlan {
  const base: LeverSet = { ...levers, talkOnCheap: false, supportOnCheap: false, skipTriage: false }
  // The round runs answer-only (permission deny, no tools offered): the Persona arm's worker prompt is the toolless one.
  const cold = runFaithfulScenario('multi-review', base, { workerToolless: true })
  const warm = runFaithfulScenario('multi-review', base, { warm: true, workerToolless: true })
  const direct = `${PAIR_REAL_TASK.prompt}\n${PAIR_REAL_TASK.evidence}`
  const calls: PairBCall[] = []
  for (let repeat = 1; repeat <= PAIR_REAL_B_REPEATS; repeat += 1) {
    calls.push({ cell: 'direct-cold', repeat, prompt: direct })
    calls.push({ cell: 'persona-cold', repeat, prompt: firstPrompt(cold, 'execution') })
    calls.push({ cell: 'direct-warm', repeat, prompt: direct })
    calls.push({ cell: 'persona-warm', repeat, prompt: firstPrompt(warm, 'execution') })
    calls.push({ cell: 'triage-warm', repeat, prompt: firstPrompt(warm, 'triage') })
  }
  if (calls.length !== PAIR_REAL_B_PLAN_CALLS) throw new Error(`PAIR_REAL_B_PLAN_SIZE ${String(calls.length)}`)
  return { task: PAIR_REAL_TASK.prompt, cli: 'claude', model: 'haiku', calls, cap: PAIR_REAL_B_CALL_CAP, needles: PAIR_REAL_TASK.needles }
}

/**
 * The guard of this round: the cap is 40 (not the 20 of round 1), and only for this round. Everything else is the real-run guard.
 * @param env - The process environment.
 * @returns The cap and the ledger in force.
 */
export function assertPairRealBGuards(env: Readonly<Record<string, string | undefined>>): { readonly cap: number; readonly ledger: string } {
  if (env.PERSONA_PAIR_REAL_B !== '1') throw new Error('this round needs PERSONA_PAIR_REAL_B=1')
  if (env.PERSONA_REAL_E2E !== '1') throw new Error('real mode needs PERSONA_REAL_E2E=1')
  if (env.PERSONA_LOCK !== 'real') throw new Error('real mode must run inside the real lock')
  if (env.PERSONA_CLI_ENV !== 'answer-only') throw new Error('this round runs in PERSONA_CLI_ENV=answer-only (Addendum 1)')
  const raw = env.PERSONA_REAL_TURN_CAP
  if (raw === undefined || !/^[1-9][0-9]{0,2}$/u.test(raw)) throw new Error('real mode needs PERSONA_REAL_TURN_CAP set to an integer (the limiter is the second guard)')
  const cap = Number(raw)
  if (cap > PAIR_REAL_B_CALL_CAP) throw new Error(`PERSONA_REAL_TURN_CAP ${raw} is over the ${String(PAIR_REAL_B_CALL_CAP)}-call ceiling Atlas allowed`)
  const ledger = env.PERSONA_REAL_TURN_LEDGER
  if (ledger === undefined || ledger === '' || !/^(?:[A-Za-z]:[\\/]|\/)/u.test(ledger)) throw new Error('real mode needs PERSONA_REAL_TURN_LEDGER as an absolute path')
  return { cap, ledger }
}

// ---- the evidence ---------------------------------------------------------------------------------------------------------

/** One call as it came back, with the counters the pre-registration names. */
export interface PairBRow {
  readonly cell: PairBCell
  readonly repeat: number
  /** 1 = the call; 2 = the single replacement after a CLI failure (both stay in the raw). */
  readonly attempt: 1 | 2
  /** The call failed for a reason of the CLI (limit, network): it is replaced once and still counts against the ceiling. */
  readonly failed?: boolean
  /** TOTAL input as the adapter reports it. */
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly cacheReadTokens?: number
  readonly cacheWriteTokens?: number
  /** Main-loop input (ISO-4), secondary. */
  readonly mainLoopInputTokens?: number
  /** The EFFECTIVE isolation mode of the call. */
  readonly envMode?: string
  readonly envModeRequested?: string
  /** The ready criterion, for the cells that answer the task. */
  readonly ready?: boolean
}

export interface PairBCellStats {
  readonly cell: PairBCell
  /** How many usable calls (of 3). */
  readonly n: number
  readonly median: number | null
  readonly min: number | null
  readonly max: number | null
  /** (max - min) / median. */
  readonly dispersion: number | null
  /** The ready criterion held in every usable call of the cell; null for a cell that does not answer the task. */
  readonly readyAll: boolean | null
  readonly medianOutput: number | null
  readonly medianMainLoop: number | null
}

export type PairBVerdict = 'parity' | 'no-parity' | 'not-measurable' | 'invalid'

export interface PairBEvaluation {
  readonly verdict: PairBVerdict
  /** Why, in the words of the rule (Portuguese, for the report). */
  readonly reasons: readonly string[]
  readonly cells: Readonly<Record<PairBCell, PairBCellStats>>
  /** median(Persona execution) / median(direct). */
  readonly ratios: { readonly cold: number | null; readonly warm: number | null }
  /** Calls made (every attempt) and whether the ceiling held. */
  readonly callsMade: number
  readonly withinCeiling: boolean
  /** Distinct effective modes seen. */
  readonly modes: readonly string[]
  /** `pair-parity` of the D-068 scoreboard stops being `blocked` only with parity. */
  readonly unblocksPairParity: boolean
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? (sorted[mid] ?? null) : (((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2)
}

/** For each (cell, repeat) the replacement if it succeeded, else the original if it succeeded, else nothing. */
function usable(rows: readonly PairBRow[], cell: PairBCell): PairBRow[] {
  const out: PairBRow[] = []
  for (let repeat = 1; repeat <= PAIR_REAL_B_REPEATS; repeat += 1) {
    const mine = rows.filter(row => row.cell === cell && row.repeat === repeat)
    const pick = mine.filter(row => row.failed !== true && row.inputTokens !== undefined).sort((a, b) => b.attempt - a.attempt)[0]
    if (pick !== undefined) out.push(pick)
  }
  return out
}

function statsOf(rows: readonly PairBRow[], cell: PairBCell): PairBCellStats {
  const used = usable(rows, cell)
  const inputs = used.map(row => row.inputTokens ?? 0)
  const mid = median(inputs)
  const min = inputs.length === 0 ? null : Math.min(...inputs)
  const max = inputs.length === 0 ? null : Math.max(...inputs)
  const answers = cell !== 'triage-warm'
  return {
    cell, n: used.length, median: mid, min, max,
    dispersion: mid === null || mid === 0 || min === null || max === null ? null : (max - min) / mid,
    readyAll: answers && used.length > 0 ? used.every(row => row.ready === true) : null,
    medianOutput: median(used.flatMap(row => (row.outputTokens === undefined ? [] : [row.outputTokens]))),
    medianMainLoop: median(used.flatMap(row => (row.mainLoopInputTokens === undefined ? [] : [row.mainLoopInputTokens]))),
  }
}

const inBand = (ratio: number): boolean => ratio >= PARITY_BAND.low && ratio <= PARITY_BAND.high

/**
 * The verdict, by the pre-registered rule (opt8b-prereg.md, Addenda 1 and 2). It never declares parity or difference when the rule says
 * "not measurable", and never throws on incomplete evidence.
 * @param rows - Every call that was made (a failed call and its single replacement are both here).
 */
export function evaluatePairRealB(rows: readonly PairBRow[]): PairBEvaluation {
  const cells = Object.fromEntries(PAIR_B_CELLS.map(cell => [cell, statsOf(rows, cell)])) as Record<PairBCell, PairBCellStats>
  const ratio = (persona: PairBCell, direct: PairBCell): number | null => {
    const a = cells[persona].median
    const b = cells[direct].median
    return a === null || b === null || b === 0 ? null : a / b
  }
  const ratios = { cold: ratio('persona-cold', 'direct-cold'), warm: ratio('persona-warm', 'direct-warm') }
  const modes = [...new Set(rows.filter(row => row.failed !== true).map(row => row.envMode ?? 'unreported'))].sort()
  const callsMade = rows.length
  const withinCeiling = callsMade <= PAIR_REAL_B_CALL_CAP
  const base = { cells, ratios, callsMade, withinCeiling, modes }
  const done = (verdict: PairBVerdict, reasons: string[]): PairBEvaluation => ({ ...base, verdict, reasons, unblocksPairParity: verdict === 'parity' })

  // Addendum 1: the round only counts if EVERY call ran in the same effective mode, answer-only.
  if (!withinCeiling) return done('invalid', [`passou do teto de ${String(PAIR_REAL_B_CALL_CAP)} chamadas (${String(callsMade)}): rodada inválida`])
  if (modes.length !== 1 || modes[0] !== 'answer-only') {
    return done('invalid', [`o modo efetivo não foi answer-only em todas as chamadas (visto: ${modes.join(', ') || 'nenhum'}): rodada inválida para o veredito, vira observação`])
  }
  const primary: PairBCell[] = ['direct-cold', 'persona-cold', 'direct-warm', 'persona-warm']
  const short = primary.filter(cell => cells[cell].n < PAIR_REAL_B_REPEATS)
  if (short.length > 0 || ratios.cold === null || ratios.warm === null) {
    return done('not-measurable', [`faltam chamadas válidas nas células ${short.join(', ') || 'primárias'}: não declaro paridade nem diferença`])
  }
  const wide = primary.filter(cell => (cells[cell].dispersion ?? Number.POSITIVE_INFINITY) > MAX_DISPERSION)
  if (wide.length > 0) {
    return done('not-measurable', [`dispersão acima de ${String(MAX_DISPERSION)} em ${wide.join(', ')}: não mensurável com a CLI exploratória; medir pelo histórico real de turnos da pessoa em vez de A/B`])
  }
  const coldIn = inBand(ratios.cold)
  const warmIn = inBand(ratios.warm)
  if (coldIn && warmIn) {
    const quality = primary.every(cell => cells[cell].readyAll === true)
    return quality
      ? done('parity', ['as duas razões (fria e quente) estão em [0,90; 1,10], a dispersão de cada célula é ≤ 0,50 e o critério de pronto passou nas 3 de cada célula'])
      // Addendum 2 (i): the ratios say "same", but the cells are not like for like if the quality failed.
      : done('not-measurable', ['as razões estão na faixa, mas o critério de pronto falhou em alguma chamada das células primárias: a comparação não é entre trabalhos equivalentes (Adendo 2)'])
  }
  const sameWay = (ratios.cold > PARITY_BAND.high && ratios.warm > PARITY_BAND.high) || (ratios.cold < PARITY_BAND.low && ratios.warm < PARITY_BAND.low)
  if (!coldIn && !warmIn && sameWay) {
    return done('no-parity', [`as duas razões estão fora de [0,90; 1,10] no mesmo sentido (${ratios.cold > PARITY_BAND.high ? 'a Persona gasta MAIS' : 'a Persona gasta MENOS'}), com dispersão ≤ 0,50`])
  }
  if (coldIn !== warmIn) {
    return done('not-measurable', ['as razões ficam em lados diferentes de [0,90; 1,10] (uma dentro, outra fora): não declaro paridade nem diferença'])
  }
  // Addendum 2 (ii): both outside, in OPPOSITE directions.
  return done('not-measurable', ['as razões estão fora da faixa em sentidos opostos: não declaro paridade nem diferença (Adendo 2)'])
}

const pct = (value: number | null): string => (value === null ? 'n/d' : `${(Math.round(value * 1000) / 10).toLocaleString('pt-BR')}%`)
const num = (value: number | null): string => (value === null ? 'n/d' : Math.round(value).toLocaleString('pt-BR'))
const ratioText = (value: number | null): string => (value === null ? 'n/d' : (Math.round(value * 1000) / 1000).toLocaleString('pt-BR'))

const VERDICT_TEXT: Record<PairBVerdict, string> = {
  parity: 'HÁ PARIDADE',
  'no-parity': 'NÃO HÁ PARIDADE',
  'not-measurable': 'NÃO MENSURÁVEL com a CLI exploratória',
  invalid: 'RODADA INVÁLIDA para o veredito',
}

/**
 * The report (`reports/pair-real-b.md`): the raw counters live in the JSON; this is the table, the two ratios and the verdict, in the words
 * of the pre-registered rule.
 * @param evaluation - From {@link evaluatePairRealB}.
 */
export function renderPairRealBReport(evaluation: PairBEvaluation): string {
  return [
    '# OPT-8b — 2ª rodada pareada REAL: veredito pela regra pré-registrada',
    '',
    `**Veredito: ${VERDICT_TEXT[evaluation.verdict]}.**`,
    ...evaluation.reasons.map(reason => `- ${reason}`),
    '',
    `Chamadas feitas: ${String(evaluation.callsMade)} (teto ${String(PAIR_REAL_B_CALL_CAP)}${evaluation.withinCeiling ? '' : ', ESTOURADO'}). Modos efetivos vistos: ${evaluation.modes.join(', ') || 'nenhum'}.`,
    '',
    '| célula | n | mediana (entrada total) | mín | máx | dispersão | pronto nas 3 | mediana saída |',
    '|---|---|---|---|---|---|---|---|',
    ...PAIR_B_CELLS.map((cell) => {
      const s = evaluation.cells[cell]
      return `| ${cell} | ${String(s.n)} | ${num(s.median)} | ${num(s.min)} | ${num(s.max)} | ${s.dispersion === null ? 'n/d' : ratioText(s.dispersion)} | ${s.readyAll === null ? '—' : s.readyAll ? 'sim' : 'NÃO'} | ${num(s.medianOutput)} |`
    }),
    '',
    `Razão de paridade = mediana(execução da Persona) ÷ mediana(direta): **fria ${ratioText(evaluation.ratios.cold)}** (${pct(evaluation.ratios.cold)}) · **quente ${ratioText(evaluation.ratios.warm)}** (${pct(evaluation.ratios.warm)}); faixa [${String(PARITY_BAND.low).replace('.', ',')}; ${String(PARITY_BAND.high).replace('.', ',')}].`,
    `Triagem quente (o que o \`skipTriage\` economiza): mediana ${num(evaluation.cells['triage-warm'].median)} tokens de entrada por chamada.`,
    '',
    `Placar D-068: \`pair-parity\` ${evaluation.unblocksPairParity ? 'sai de `blocked` (há paridade pela regra)' : 'continua `blocked`'}.`,
  ].join('\n')
}
