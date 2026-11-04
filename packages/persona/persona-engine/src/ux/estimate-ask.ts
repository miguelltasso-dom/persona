/**
 * `estimateAsk`: what a message the person is about to send will cost, before it is sent (UX-BEYOND-T3 A-6 / P1-12).
 *
 * Pure and offline. It asks the SAME pre-router and the SAME `wantsWork` the host runs, so the number of calls it gives is
 * the number of calls the host makes (`persona-host/tests/estimate-ask-host.spec.ts` checks it against real deliveries).
 *
 * Honesty rules (D-068, Atlas):
 *  - calls are exact (the host's routing is deterministic); tokens and cost are RANGES, the vendor base context every CLI
 *    call carries is NOT included unless a measured calibration brings it;
 *  - time is `null` unless a measured calibration brings it (A-6: "só com número medido"); never an invented "1 min";
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

/** Numbers measured on a REAL run (the paired run, D-070). Absent fields stay absent: nothing is invented. */
export interface AskCalibration {
  /** Input tokens a trivial CLI call carries before any Persona prompt (vendor system prompt + tool schema). */
  readonly vendorBaseTokens?: number
  /** Vendor input tokens ÷ our 4-chars-per-token estimate of the same prompt. */
  readonly tokenizerRatio?: number
  /** Wall time per call, in seconds, as measured (min and max over the run). */
  readonly secondsPerCall?: { readonly conversa?: Range; readonly execucao?: Range; readonly triagem?: Range }
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

export interface EstimateAskResult {
  readonly tipo: AskKind
  /** Exact number of model calls (min = max): the host's routing is deterministic. `null` when not known. */
  readonly chamadas: Range | null
  readonly detalhe: readonly AskCall[]
  /** Tokens of the Persona prompts and answers. Vendor base included only when `baseDoVendorIncluida`. */
  readonly tokens: Range | null
  readonly baseDoVendorIncluida: boolean
  /** List-price-equivalent cost in micro-USD (a subscription user may not see money: the UI decides). */
  readonly custo: { readonly microUsd: Range } | null
  /** Seconds. `null` until a measured calibration exists. */
  readonly tempo: { readonly segundos: Range } | null
  readonly origin: 'estimate' | 'calibrated' | 'unknown'
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

function costOf(calls: readonly AskCall[], inRange: (role: AskRole) => Range, outRange: (role: AskRole) => Range, base: number): Range {
  const sum = (pick: 'min' | 'max'): number => calls.reduce((total, call) => {
    const price = TIER_PRICE[tierOf(call.nivel)]
    const input = inRange(call.papel)[pick]
    const output = outRange(call.papel)[pick]
    // The vendor base is a cache read in steady state (10%); the Persona prompt is read at full price (the cold side of the range).
    return total + input * price.input + base * price.input * CACHE_READ_FACTOR + output * price.output
  }, 0)
  return { min: Math.round(sum('min')), max: Math.round(sum('max')) }
}

function minutes(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60))
}

function timeLabel(range: Range): string {
  if (range.max < 45) return 'menos de 1 min'
  const low = minutes(range.min)
  const high = minutes(range.max)
  return high >= low * 2 && high - low >= 2 ? `de ${String(low)} a ${String(high)} min` : `~${String(minutes((range.min + range.max) / 2))} min`
}

function callsLabel(range: Range): string {
  if (range.min === range.max) return range.max === 1 ? '1 chamada da sua IA' : `${String(range.max)} chamadas da sua IA`
  return `${String(range.min)} a ${String(range.max)} chamadas da sua IA`
}

/**
 * Estimate one ask.
 * @param input - Text, persona, engine, context, host switches and an optional measured calibration.
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
  const ratio = input.calibracao?.tokenizerRatio ?? 1
  const base = input.calibracao?.vendorBaseTokens ?? 0
  const inRange = (role: AskRole): Range => {
    const raw = role === 'execucao' ? { min: workIn, max: workIn } : role === 'triagem' ? { min: triageIn, max: triageIn + TALK_EXTRA_IN } : { min: talkIn, max: talkIn + TALK_EXTRA_IN }
    return { min: Math.round(raw.min * ratio), max: Math.round(raw.max * ratio) }
  }
  const outRange = (role: AskRole): Range => (role === 'execucao' ? WORK_OUT : role === 'triagem' ? { min: 20, max: 60 } : TALK_OUT)
  const tokens = detalhe.reduce<Range>((total, call) => ({
    min: total.min + inRange(call.papel).min + outRange(call.papel).min + base,
    max: total.max + inRange(call.papel).max + outRange(call.papel).max + base,
  }), { min: 0, max: 0 })
  const seconds = input.calibracao?.secondsPerCall
  const perCall = (role: AskRole): Range | undefined => seconds?.[role === 'triagem' ? 'triagem' : role === 'execucao' ? 'execucao' : 'conversa']
  const times = detalhe.map(call => perCall(call.papel))
  const tempo = times.every(row => row !== undefined)
    ? { segundos: times.reduce<Range>((total, row) => ({ min: total.min + (row?.min ?? 0), max: total.max + (row?.max ?? 0) }), { min: 0, max: 0 }) }
    : null
  const chamadas: Range = { min: detalhe.length, max: detalhe.length }
  const calibrated = input.calibracao !== undefined && (tempo !== null || base > 0 || ratio !== 1)
  return {
    tipo: lane.kind,
    chamadas,
    detalhe,
    tokens,
    baseDoVendorIncluida: base > 0,
    custo: { microUsd: costOf(detalhe, inRange, outRange, base) },
    tempo,
    origin: calibrated ? 'calibrated' : 'estimate',
    rotulo: tempo === null ? callsLabel(chamadas) : `${timeLabel(tempo.segundos)} · ${callsLabel(chamadas)}`,
    motivo: lane.why,
  }
}
