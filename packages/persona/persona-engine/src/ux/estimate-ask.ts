/**
 * `estimateAsk`: what a message the person is about to send will cost, before it is sent (UX-BEYOND-T3 A-6 / P1-12).
 *
 * Pure and offline. It asks the SAME pre-router and the SAME `wantsWork` the host runs, so the number of calls it gives is
 * the number of calls the host makes (`persona-host/tests/estimate-ask-host.spec.ts` checks it against real deliveries).
 *
 * Honesty rules (D-068, D-080 c, Atlas):
 *  - calls are exact (the host's routing is deterministic); tokens and cost are RANGES;
 *  - the vendor base context every CLI call carries is NOT included unless a calibration brings it: either the person's OWN
 *    measured turns (`source: 'history'`, OPT-9: the measured input already carries the base) or, only for development, a
 *    reference taken on one machine (`vendorBaseTokens`/`tokenizerRatio`, labelled as such and never read from the host);
 *  - time is `null` unless a measured calibration brings it (A-6: "só com número medido"); never an invented "1 min";
 *  - a statement from the history needs `samples` of at least {@link MIN_HISTORY_SAMPLES} measured turns of that kind, or it is
 *    ignored and the ask falls back to the estimate (a host that forgets to count its rows cannot make us claim a history);
 *  - `origin` is `estimate` or `calibrated`, never `measured`: that word is only for fields a vendor reported;
 *  - when it cannot know (no engine, empty text) it says so ("não sei"), it does not guess.
 */

import { estimateTokens } from '@deepseek-ai/dsh-persona-core'
import { TIER_PRICE, talkPromptTokens, workerPromptText, type ModelTier } from '../bench/token-faithful.ts'
import { preRoute } from '../preroute/rules.ts'
import { USER_TEXT_LIMIT_TOKENS } from '../prompts/talk-output.ts'
import { wantsWork } from '../wants-work.ts'

export interface Range {
  readonly min: number
  readonly max: number
}

export type AskRole = 'conversa' | 'execucao' | 'triagem'
export type AskLevel = 'barato' | 'seu-modelo'

export interface AskCall {
  readonly papel: AskRole
  readonly nivel: AskLevel
}

export type AskKind = 'sem-chamada' | 'conversa' | 'trabalho' | 'nao-sei'

/** Measured tokens of ONE call (P25..P75 of the person's own turns). The measured input already carries the vendor base. */
export interface CallTokens {
  readonly input: Range
  readonly output: Range
}

/** How many measured rows stand behind a statement: `tokens` = rows with measured tokens, `tempo` = rows WITH a measured duration. */
export interface Samples {
  readonly tokens: number
  readonly tempo: number
}

/** Fewest measured turns of one kind before a statement from the history is accepted (the host applies the same floor). */
export const MIN_HISTORY_SAMPLES = 5

/**
 * Numbers measured on a REAL run. Absent fields stay absent: nothing is invented.
 * `source: 'history'` = the person's own turns (the host sends only this); `'dev-reference'` (or no source) = a reference from
 * the development machine, kept for scripts and tests and never produced by the host (contracts/estimate-calibration.md).
 */
export interface AskCalibration {
  /** DEV ONLY. Input tokens a trivial CLI call carries before any Persona prompt (vendor system prompt + tool schema). Ignored when `source` is `history`. */
  readonly vendorBaseTokens?: number
  /** DEV ONLY. Vendor input tokens ÷ our 4-chars-per-token estimate of the same prompt. Ignored when `source` is `history`. */
  readonly tokenizerRatio?: number
  /** Wall time per call, in seconds, as measured (P25..P75 for the history, min..max for a dev run). */
  readonly secondsPerCall?: { readonly conversa?: Range; readonly execucao?: Range; readonly triagem?: Range }
  /** Median seconds per call (history). Centers the label; the range still bounds it. */
  readonly mediana?: { readonly conversa?: number; readonly execucao?: number; readonly triagem?: number }
  /** Measured tokens per call (history). Replaces "our estimate + the vendor base" for that kind. */
  readonly tokensPerCall?: { readonly conversa?: CallTokens; readonly execucao?: CallTokens; readonly triagem?: CallTokens }
  /** Rows behind each statement, so the answer can say "pelas suas últimas {n} conversas". */
  readonly samples?: { readonly conversa?: Samples; readonly execucao?: Samples; readonly triagem?: Samples }
  readonly source?: 'history' | 'dev-reference'
}

export interface EstimateAskInput {
  /** What the person typed (or the suggestion about to be sent). */
  readonly texto: string
  /** Who will answer: the persona of the DM / the coordination of the channel. Absent = a generic persona. */
  readonly persona?: {
    readonly id?: string
    readonly name?: string
    readonly title?: string
    readonly personality?: string
    readonly instructions?: string
  }
  /** The engine the person connected. `none` (or not connected) = no estimate. */
  readonly motor: { readonly cli: string; readonly connected: boolean }
  readonly contexto?: {
    /** Step 5 of onboarding: the host routes straight to the executor, with no triage. */
    readonly primeiraEntrega?: boolean
    /** The persona has something open for the person in this thread (an Attention question or a last line that asks). */
    readonly pendenteDaPersona?: boolean
  }
  /** Host switches that change the number of calls. Default: the host as it is now (D-073, D-075). */
  readonly host?: { readonly skipTriage?: boolean; readonly courtesyNoModel?: boolean }
  readonly calibracao?: AskCalibration
}

/** Where the calibrated numbers came from. Absent = a plain estimate. */
export type AskSource = 'historico' | 'referencia-dev'

export interface EstimateAskResult {
  readonly tipo: AskKind
  /** Exact number of model calls (min = max): the host's routing is deterministic. `null` when not known. */
  readonly chamadas: Range | null
  readonly detalhe: readonly AskCall[]
  /** Tokens of the Persona prompts and answers. Vendor base included only when `baseDoVendorIncluida`. */
  readonly tokens: Range | null
  /** True only when EVERY call of the ask carries the vendor base (measured by the history, or a dev reference). */
  readonly baseDoVendorIncluida: boolean
  /**
   * List-price-equivalent cost in micro-USD (a subscription user may not see money: the UI decides). On the history path the
   * ledger's input is cache read + write + fresh in one number, so the range is bounded by the cache-read price (floor) and the
   * cache-write price (ceiling): wide on purpose, never a single invented figure.
   */
  readonly custo: { readonly microUsd: Range } | null
  /** Seconds. `null` until a measured calibration exists for EVERY call. `mediana` only from the history. */
  readonly tempo: { readonly segundos: Range; readonly mediana?: number } | null
  readonly origin: 'estimate' | 'calibrated' | 'unknown'
  /** `historico` = the person's own measured turns; `referencia-dev` = a one-machine development reference. Absent for a plain estimate. */
  readonly fonte?: AskSource
  /** Measured turns behind the statement in `motivo`. Only with `fonte: 'historico'`. */
  readonly amostras?: number
  /** Ready-to-show line (pt-BR): "~1 min · 1 chamada da sua IA", "Sem chamada da sua IA", "Não sei estimar". */
  readonly rotulo: string
  /** One short reason for a tooltip. */
  readonly motivo: string
}

const GENERIC = { id: 'persona', name: 'Persona', title: 'Equipe', personality: 'Atenciosa.', instructions: 'Ajude a pessoa com clareza.' }
/** Output of a talk answer ("1 a 3 frases") and of a worker report (unknown while the short report W3 is off). */
const TALK_OUT: Range = { min: 20, max: 150 }
const WORK_OUT: Range = { min: 150, max: 1500 }
/** Recall and subject rows the talk prompt may add on top of persona + message. */
const TALK_EXTRA_IN = 600
const CACHE_READ_FACTOR = 0.1
const CACHE_WRITE_FACTOR = 1.25

function tierOf(level: AskLevel): ModelTier {
  return level === 'seu-modelo' ? 'persona' : 'cheap'
}

function unknown(motivo: string, rotulo: string): EstimateAskResult {
  return { tipo: 'nao-sei', chamadas: null, detalhe: [], tokens: null, baseDoVendorIncluida: false, custo: null, tempo: null, origin: 'unknown', rotulo, motivo }
}

function none(motivo: string): EstimateAskResult {
  return {
    tipo: 'sem-chamada', chamadas: { min: 0, max: 0 }, detalhe: [], tokens: { min: 0, max: 0 }, baseDoVendorIncluida: false,
    custo: { microUsd: { min: 0, max: 0 } }, tempo: null, origin: 'estimate', rotulo: 'Sem chamada da sua IA', motivo,
  }
}

type Lane = { readonly kind: 'none'; readonly why: string } | { readonly kind: 'conversa' | 'trabalho'; readonly why: string }

function laneOf(input: EstimateAskInput, host: { skipTriage: boolean; courtesyNoModel: boolean }): Lane {
  const persona = input.persona ?? GENERIC
  const first = input.contexto?.primeiraEntrega === true
  const routed = preRoute({
    text: input.texto,
    senderId: 'person',
    threadKey: 'estimate',
    at: 0,
    personas: [{ id: persona.id ?? GENERIC.id, name: persona.name ?? GENERIC.name }],
    budgetLeft: true,
    silenceUntil: 0,
    canCommand: () => true,
    window: [],
    ...(first ? { firstDelivery: { executorId: persona.id ?? GENERIC.id, title: input.texto.trim() } } : {}),
  })
  if (routed.action === 'assign' && routed.rule !== 'mention') return { kind: 'trabalho', why: routed.why }
  if (routed.action === 'command') return routed.command === 'tarefa' ? { kind: 'trabalho', why: routed.why } : { kind: 'none', why: routed.why }
  if (routed.action === 'ignore' || routed.action === 'silent') return { kind: 'none', why: routed.why }
  if (routed.action === 'react') {
    if (input.contexto?.pendenteDaPersona === true || !host.courtesyNoModel) return { kind: 'conversa', why: 'a persona responde a sua mensagem' }
    return { kind: 'none', why: 'uma cortesia: a persona só reage, sem chamar a IA' }
  }
  return wantsWork(input.texto)
    ? { kind: 'trabalho', why: 'um pedido de trabalho: vira uma tarefa para a equipe' }
    : { kind: 'conversa', why: 'uma conversa: a persona responde direto' }
}

function personaOf(input: EstimateAskInput) {
  const persona = input.persona ?? GENERIC
  return {
    id: persona.id ?? GENERIC.id,
    name: persona.name ?? GENERIC.name,
    title: persona.title ?? GENERIC.title,
    personality: persona.personality ?? GENERIC.personality,
    instructions: persona.instructions ?? GENERIC.instructions,
  }
}

function clip(text: string): string {
  const limit = USER_TEXT_LIMIT_TOKENS * 4
  return text.length > limit ? text.slice(0, limit) : text
}

function minutes(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60))
}

function timeLabel(range: Range, center?: number): string {
  if (range.max < 45) return 'menos de 1 min'
  const low = minutes(range.min)
  const high = minutes(range.max)
  return high >= low * 2 && high - low >= 2 ? `de ${String(low)} a ${String(high)} min` : `~${String(minutes(center ?? (range.min + range.max) / 2))} min`
}

function callsLabel(range: Range): string {
  if (range.min === range.max) return range.max === 1 ? '1 chamada da sua IA' : `${String(range.max)} chamadas da sua IA`
  return `${String(range.min)} a ${String(range.max)} chamadas da sua IA`
}

/** "de 60 a 80 s" / "de 1 a 2 min" / "~2 min": both ends in ONE unit, chosen by the upper end. */
function secondsRangeText(range: Range): string {
  if (range.max < 90) return `de ${String(Math.round(range.min))} a ${String(Math.round(range.max))} s`
  const low = minutes(range.min)
  const high = minutes(range.max)
  return low === high ? `~${String(high)} min` : `de ${String(low)} a ${String(high)} min`
}

function tokensText(value: number): string {
  return value < 1000 ? String(Math.round(value)) : `${(Math.round(value / 100) / 10).toLocaleString('pt-BR')} mil`
}

const NOUN: Record<AskRole, string> = { conversa: 'conversas', execucao: 'tarefas', triagem: 'triagens' }
const SUBJECT: Record<AskRole, string> = { conversa: 'a resposta', execucao: 'a tarefa', triagem: 'a triagem' }

/** One numbers-per-call row of the ask, whichever way its numbers were obtained. */
interface CallNumbers {
  readonly input: Range
  readonly output: Range
  readonly cost: Range
  /** The vendor's own base prompt is inside `input`. */
  readonly withBase: boolean
  /** `input`/`output` are the person's own measured turns. */
  readonly history: boolean
}

/**
 * Estimate one ask.
 * @param input - Text, persona, engine, context, host switches and an optional calibration.
 * @returns Calls (exact), tokens and cost (ranges), time (only when measured), a ready label and a reason.
 */
export function estimateAsk(input: EstimateAskInput): EstimateAskResult {
  if (input.texto.trim() === '') return unknown('escreva o pedido para ver a estimativa', 'Escreva o pedido para estimar')
  if (!input.motor.connected || input.motor.cli === 'none' || input.motor.cli === '') {
    return unknown('nenhuma IA conectada', 'Conecte uma IA para estimar')
  }
  const host = { skipTriage: input.host?.skipTriage ?? true, courtesyNoModel: input.host?.courtesyNoModel ?? true }
  const lane = laneOf(input, host)
  if (lane.kind === 'none') return none(lane.why)

  const first = input.contexto?.primeiraEntrega === true
  const detalhe: AskCall[] = lane.kind === 'conversa'
    ? [{ papel: 'conversa', nivel: 'barato' }]
    : [
      ...(host.skipTriage || first ? [] : [{ papel: 'triagem', nivel: 'barato' } as const]),
      { papel: 'execucao', nivel: 'seu-modelo' },
    ]
  const persona = personaOf(input)
  const text = clip(input.texto)
  const messageIn = estimateTokens(text)
  const talkIn = talkPromptTokens(persona, text)
  const workIn = estimateTokens(workerPromptText(persona, true)) + messageIn
  const triageIn = Math.round(talkIn * 0.8)

  const calibration = input.calibracao
  const fromHistory = calibration?.source === 'history'
  // The development reference never mixes with the person's own history: with `source: 'history'` it is simply not read.
  const ratio = fromHistory ? 1 : calibration?.tokenizerRatio ?? 1
  const base = fromHistory ? 0 : calibration?.vendorBaseTokens ?? 0
  /** A statement from the history counts only with enough measured rows behind it. */
  const rows = (role: AskRole, what: 'tokens' | 'tempo'): number => {
    const n = calibration?.samples?.[role]?.[what]
    return fromHistory && n !== undefined && Number.isFinite(n) && n >= MIN_HISTORY_SAMPLES ? n : 0
  }

  const inRange = (role: AskRole): Range => {
    const raw = role === 'execucao' ? { min: workIn, max: workIn } : role === 'triagem' ? { min: triageIn, max: triageIn + TALK_EXTRA_IN } : { min: talkIn, max: talkIn + TALK_EXTRA_IN }
    return { min: Math.round(raw.min * ratio), max: Math.round(raw.max * ratio) }
  }
  const outRange = (role: AskRole): Range => (role === 'execucao' ? WORK_OUT : role === 'triagem' ? { min: 20, max: 60 } : TALK_OUT)

  const numbers: CallNumbers[] = detalhe.map((call) => {
    const price = TIER_PRICE[tierOf(call.nivel)]
    const measured = rows(call.papel, 'tokens') > 0 ? calibration?.tokensPerCall?.[call.papel] : undefined
    if (measured !== undefined) {
      return {
        input: measured.input,
        output: measured.output,
        // Fresh, cache-read and cache-write input arrive as one number: floor at the cache-read price, ceiling at the cache-write price.
        cost: {
          min: Math.round(measured.input.min * price.input * CACHE_READ_FACTOR + measured.output.min * price.output),
          max: Math.round(measured.input.max * price.input * CACHE_WRITE_FACTOR + measured.output.max * price.output),
        },
        withBase: true,
        history: true,
      }
    }
    const inputRange = inRange(call.papel)
    const outputRange = outRange(call.papel)
    // The dev reference base is a cache read in steady state (10%); the Persona prompt is read at full price (the cold side of the range).
    const cost = (pick: 'min' | 'max'): number => Math.round(inputRange[pick] * price.input + base * price.input * CACHE_READ_FACTOR + outputRange[pick] * price.output)
    return {
      input: inputRange,
      output: outputRange,
      cost: { min: cost('min'), max: cost('max') },
      withBase: base > 0,
      history: false,
    }
  })

  const tokens = numbers.reduce<Range>((total, row) => ({
    min: total.min + row.input.min + row.output.min + (row.history ? 0 : base),
    max: total.max + row.input.max + row.output.max + (row.history ? 0 : base),
  }), { min: 0, max: 0 })
  const costRange = numbers.reduce<Range>((total, row) => ({ min: total.min + row.cost.min, max: total.max + row.cost.max }), { min: 0, max: 0 })

  const seconds = calibration?.secondsPerCall
  const secondsOf = (role: AskRole): Range | undefined => (fromHistory && rows(role, 'tempo') === 0 ? undefined : seconds?.[role])
  const times = detalhe.map(call => secondsOf(call.papel))
  const medians = detalhe.map(call => (fromHistory && rows(call.papel, 'tempo') > 0 ? calibration?.mediana?.[call.papel] : undefined))
  const timed = times.every(row => row !== undefined)
  const tempo = timed
    ? {
      segundos: times.reduce<Range>((total, row) => ({ min: total.min + (row?.min ?? 0), max: total.max + (row?.max ?? 0) }), { min: 0, max: 0 }),
      ...(medians.every(row => row !== undefined) ? { mediana: medians.reduce<number>((total, row) => total + (row ?? 0), 0) } : {}),
    }
    : null

  const chamadas: Range = { min: detalhe.length, max: detalhe.length }
  const usedHistory = numbers.some(row => row.history) || (timed && fromHistory)
  const usedDev = !fromHistory && calibration !== undefined && (timed || base > 0 || ratio !== 1)
  const fonte: AskSource | undefined = usedHistory ? 'historico' : usedDev ? 'referencia-dev' : undefined

  // The sentence that cites the person's own rows is about the call that ANSWERS (the last one).
  const answering = detalhe[detalhe.length - 1]
  const answeringRole = answering?.papel ?? 'conversa'
  const answeringTokens = answering === undefined ? undefined : numbers[numbers.length - 1]
  const timeRows = rows(answeringRole, 'tempo')
  const tokenRows = rows(answeringRole, 'tokens')
  const range = calibration?.secondsPerCall?.[answeringRole]
  let amostras: number | undefined
  let note = ''
  if (fonte === 'historico') {
    if (tempo !== null && range !== undefined && timeRows > 0) {
      amostras = timeRows
      note = `pelas suas últimas ${String(timeRows)} ${NOUN[answeringRole]}, ${SUBJECT[answeringRole]} levou ${secondsRangeText(range)}`
    } else if (answeringTokens?.history === true && tokenRows > 0) {
      amostras = tokenRows
      note = `pelas suas últimas ${String(tokenRows)} ${NOUN[answeringRole]}, cada chamada usou de ${tokensText(answeringTokens.input.min + answeringTokens.output.min)} a ${tokensText(answeringTokens.input.max + answeringTokens.output.max)} tokens`
    } else {
      // History backs another call of the ask, not the one that answers: say so without citing a count that is not behind it.
      note = 'parte dos números vem do seu histórico medido'
    }
  } else if (fonte === 'referencia-dev') {
    note = 'números de referência de desenvolvimento (uma máquina), não do seu histórico'
  }

  return {
    tipo: lane.kind,
    chamadas,
    detalhe,
    tokens,
    baseDoVendorIncluida: numbers.length > 0 && numbers.every(row => row.withBase),
    custo: { microUsd: costRange },
    tempo,
    origin: fonte === undefined ? 'estimate' : 'calibrated',
    ...(fonte === undefined ? {} : { fonte }),
    ...(amostras === undefined ? {} : { amostras }),
    rotulo: tempo === null ? callsLabel(chamadas) : `${timeLabel(tempo.segundos, tempo.mediana)} · ${callsLabel(chamadas)}`,
    motivo: note === '' ? lane.why : `${lane.why} — ${note}`,
  }
}
