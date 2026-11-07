/**
 * The budget of a round of opinions (TEAM-4, D-090 #4): a persona shares a draft (text and/or images) with the team and asks what they
 * think. This module decides WHETHER the round may happen and WHAT it costs, before anything is called. Pure and offline, like `estimateAsk`.
 *
 * Rules (EQUIPE-REAL-SPEC (c), Atlas "só quando vale", D-068/D-080 honesty):
 *  - at most `roundsCap` rounds per Task (default 2, the person sets 1..3); the round after the cap is `stop: rounds-cap` with the honest
 *    line; nothing loops, because the caller passes how many rounds were ALREADY used and a round never raises the cap;
 *  - an opinion request counts ONCE against the asker's daily cap of requests to colleagues (default 6, 1..20);
 *  - who is NOT asked is said, not hidden: paused, at the quota limit, engine not connected, an engine that does not see images when the
 *    draft has one; a round with nobody left to ask is `stop: nobody`, never a call;
 *  - calls are EXACT (one per colleague asked + one consolidation by the asker); tokens and cost are ranges and `estimate` until the
 *    person's own measured turns back them (`calibrated`); `measured` is never used;
 *  - an image is counted in the input of each colleague's call (`imageTokens`); a colleague whose session already holds an earlier image
 *    pays it again in later requests, which this module does not hide: it is one of the reasons for the cap.
 */

import { estimateTokens } from '@deepseek-ai/dsh-persona-core'
import { TIER_PRICE, talkPromptTokens, workerPromptText, type ModelTier } from '../bench/token-faithful.ts'
import { USER_TEXT_LIMIT_TOKENS } from '../prompts/talk-output.ts'
import { shapeForAccount, usdLine, type AccountInput, type Billing, type QuotaImpact } from './billing.ts'
import { MIN_HISTORY_SAMPLES, type AskCalibration, type AskLevel, type AskSource, type Range } from './estimate-ask.ts'
import { IMAGE_CACHE_WRITE_FACTOR, IMAGE_COST_MEASURED, imageTokens, type ImageSize } from './image-tokens.ts'

/** Rounds per Task: the default and the bounds the person may choose within (Configurações › Personas). */
export const DEFAULT_OPINION_ROUNDS = 2
export const MIN_OPINION_ROUNDS = 1
export const MAX_OPINION_ROUNDS = 3
/** Requests to colleagues one persona may make per day (an opinion request counts once). */
export const DEFAULT_DAILY_ASKS = 6
export const MIN_DAILY_ASKS = 1
export const MAX_DAILY_ASKS = 20
/** Most colleagues one round asks (a bigger audience is cut, the cut is said). */
export const DEFAULT_MAX_REPLIES = 6
/** Images per draft (the runner refuses more: `MAX_TURN_IMAGES`). */
export const MAX_OPINION_IMAGES = 4

/** A colleague who would be asked. The host resolves the audience (the team minus the asker); this module only sorts who can answer. */
export interface OpinionReader {
  readonly id: string
  readonly name?: string
  readonly title?: string
  readonly personality?: string
  readonly instructions?: string
  readonly motor: { readonly cli: string; readonly connected: boolean; readonly readsImages: boolean }
  readonly paused?: boolean
  /** The colleague is at the quota limit of their engine right now. */
  readonly atLimit?: boolean
  /** The level their short reply runs at. Default `barato` (the short talk turn). */
  readonly level?: AskLevel
}

export interface OpinionDraft {
  readonly text?: string
  readonly images?: readonly { readonly size?: ImageSize }[]
}

export interface OpinionBudgetInput {
  readonly question: string
  readonly draft: OpinionDraft
  readonly asker: {
    readonly id: string
    readonly name?: string
    readonly title?: string
    readonly personality?: string
    readonly instructions?: string
    /** `suggest` = "Sugere e espera": the persona proposes to the person first. `act` = asks directly, within the caps. */
    readonly autonomy: 'suggest' | 'act'
    /** Opinion requests (and other asks to colleagues) the asker already made today. */
    readonly asksToday?: number
  }
  readonly readers: readonly OpinionReader[]
  /** Rounds ALREADY used on this Task (0 on the first). Counted by the host; a retry of the same round does not add one. */
  readonly roundsUsed: number
  readonly policy?: { readonly roundsCap?: number; readonly dailyCap?: number; readonly maxReplies?: number }
  /** The person's own measured turns, as for `estimateAsk` (`conversa` backs the replies, `execucao` backs the consolidation). */
  readonly calibracao?: AskCalibration
  /** USD-1 / D-092: the account that runs the round (the asker's). Absent = `unknown`: no money. */
  readonly conta?: AccountInput
}

export type OpinionStop = 'draft-empty' | 'rounds-cap' | 'daily-cap' | 'nobody' | 'no-vision'
export type OpinionSkip = 'paused' | 'at-limit' | 'unavailable' | 'no-vision' | 'over-limit'

export interface OpinionCost {
  /** Exact: one reply per colleague asked, plus one consolidation by the asker. */
  readonly chamadas: Range
  readonly respostas: number
  readonly tokens: Range
  /** List-price micro-USD, ONLY for an API account; `null` for a subscription or an unknown one (D-092). */
  readonly microUsd: Range | null
  /** List-price micro-USD of the round for every account: INTERNAL (the host's "ask before a big round" threshold, technical reports). Never put it in a view. */
  readonly referenciaMicroUsd: Range
  /** USD-1: the account type and, for a subscription, the impact on the vendor's window (same shape as `estimateAsk`). */
  readonly billing: Billing
  readonly quota: QuotaImpact | null
  /** Ready-to-show line (pt-BR): a share of the window, "cota não medida", the replies, or (API) "≈ US$ x–y (estimativa)". */
  readonly impacto: string
  /** The part of `tokens` that is images. */
  /**
   * The images of the draft. `calibrated` when every size is known: the rule is the vendor's scaled by ONE real measurement (`basis`, reports/image-cost-real.md);
   * `estimate` (wide range) when a size is not known.
   */
  readonly imagens: { readonly count: number; readonly tokens: Range; readonly origin: 'estimate' | 'calibrated'; readonly basis?: string }
  readonly origin: 'estimate' | 'calibrated'
  readonly fonte?: AskSource
  /** True when every call of the round carries the vendor base (measured by the person's own history). */
  readonly baseDoVendorIncluida: boolean
}

export interface OpinionBudget {
  /** `ask` = the persona may ask now · `propose` = it must propose to the person first · `stop` = no round. */
  readonly decision: 'ask' | 'propose' | 'stop'
  /** Why the round stops (only with `decision: 'stop'`). */
  readonly stop?: OpinionStop
  /** The round being asked (1-based) and the cap in force; the screen writes "Rodada {round} de {roundsCap}" when the cap is above 1. */
  readonly round: number
  readonly roundsCap: number
  /** Rounds left AFTER this one. */
  readonly roundsLeft: number
  readonly dailyCap: number
  /** Who is asked, in the order given. */
  readonly asked: readonly string[]
  /** Who is not asked and why: the screen says it (never a silent skip). */
  readonly skipped: readonly { readonly id: string; readonly why: OpinionSkip }[]
  /** Present when a round would happen (`ask` / `propose`). */
  readonly cost?: OpinionCost
  /** Footer of the card: "≈ 4 respostas" always; the cost only when the person's own measured turns back it. */
  readonly rodape: string
  /** The sentence the asker proposes to the person ("Posso pedir a opinião da equipe sobre {x}? ≈ {n} respostas"): `propose` only. */
  readonly proposta?: string
  /** One short reason for a tooltip / the Task detail. */
  readonly motivo: string
}

const GENERIC = { id: 'persona', name: 'Persona', title: 'Equipe', personality: 'Atenciosa.', instructions: 'Ajude a pessoa com clareza.' }
/** A short opinion reply: "1 a 3 linhas" (EQUIPE-REAL-SPEC). */
const REPLY_OUT: Range = { min: 30, max: 150 }
/** The consolidation: the asker joins the replies in 1–2 lines and decides what to change. */
const CONSOLIDATION_OUT: Range = { min: 80, max: 400 }
/** Recall and subject rows a talk prompt may add on top of persona + message. */
const TALK_EXTRA_IN = 600
const CACHE_READ_FACTOR = 0.1
const CACHE_WRITE_FACTOR = 1.25

const add = (a: Range, b: Range): Range => ({ min: a.min + b.min, max: a.max + b.max })
const ZERO: Range = { min: 0, max: 0 }

function bounded(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.floor(value)))
}

function personaOf(source: { readonly id?: string; readonly name?: string; readonly title?: string; readonly personality?: string; readonly instructions?: string }) {
  return {
    id: source.id ?? GENERIC.id,
    name: source.name ?? GENERIC.name,
    title: source.title ?? GENERIC.title,
    personality: source.personality ?? GENERIC.personality,
    instructions: source.instructions ?? GENERIC.instructions,
  }
}

function clip(text: string): string {
  const limit = USER_TEXT_LIMIT_TOKENS * 4
  return text.length > limit ? text.slice(0, limit) : text
}

function tierOf(level: AskLevel): ModelTier {
  return level === 'seu-modelo' ? 'persona' : 'cheap'
}

function tokensText(value: number): string {
  return value < 1000 ? String(Math.round(value)) : `${(Math.round(value / 100) / 10).toLocaleString('pt-BR')} mil`
}

function repliesText(count: number): string {
  return count === 1 ? '≈ 1 resposta' : `≈ ${String(count)} respostas`
}

/** The topic in the proposal sentence: the question without its closing punctuation, cut at a word. */
function topicOf(question: string): string {
  const text = question.trim().replace(/[s?!.…]+$/u, '')
  if (text === '') return 'este rascunho'
  if (text.length <= 80) return text
  const cut = text.slice(0, 80)
  return `${cut.slice(0, Math.max(1, cut.lastIndexOf(' ')))}…`
}

function colleagues(count: number): string {
  return count === 1 ? '1 colega responde' : `${String(count)} colegas respondem`
}

const STOP_MOTIVO: Record<OpinionStop, string> = {
  'draft-empty': 'não há rascunho (texto ou imagem) para a equipe opinar',
  'rounds-cap': 'a persona já usou todas as rodadas de opinião desta tarefa e segue com o que tem',
  'daily-cap': 'a persona chegou ao limite de pedidos a colegas de hoje',
  nobody: 'ninguém da equipe pode responder agora',
  'no-vision': 'ninguém da equipe vê imagens neste motor',
}

function stopped(why: OpinionStop, base: Pick<OpinionBudget, 'round' | 'roundsCap' | 'roundsLeft' | 'dailyCap' | 'skipped'>): OpinionBudget {
  return { decision: 'stop', stop: why, ...base, asked: [], rodape: '', motivo: STOP_MOTIVO[why] }
}

/**
 * Decide one round of opinions and price it.
 * @param input - The question and draft, the asker, who could answer, how many rounds were already used, the caps and an optional calibration.
 * @returns `ask`/`propose` with the exact number of calls and a range of tokens and cost, or `stop` with the reason. Never throws.
 */
export function budgetOpinionRound(input: OpinionBudgetInput): OpinionBudget {
  const roundsCap = bounded(input.policy?.roundsCap, DEFAULT_OPINION_ROUNDS, MIN_OPINION_ROUNDS, MAX_OPINION_ROUNDS)
  const dailyCap = bounded(input.policy?.dailyCap, DEFAULT_DAILY_ASKS, MIN_DAILY_ASKS, MAX_DAILY_ASKS)
  const maxReplies = bounded(input.policy?.maxReplies, DEFAULT_MAX_REPLIES, 1, 50)
  const used = bounded(input.roundsUsed, 0, 0, 1_000_000)
  const round = used + 1
  const roundsLeft = Math.max(0, roundsCap - round)
  const images = (input.draft.images ?? []).slice(0, MAX_OPINION_IMAGES)
  const hasImage = images.length > 0
  const draftText = (input.draft.text ?? '').trim()

  // Who can answer. The asker never answers their own request, whatever the host passed.
  const skipped: { id: string; why: OpinionSkip }[] = []
  const eligible: OpinionReader[] = []
  for (const reader of input.readers) {
    if (reader.id === input.asker.id) continue
    if (!reader.motor.connected || reader.motor.cli === '' || reader.motor.cli === 'none') skipped.push({ id: reader.id, why: 'unavailable' })
    else if (reader.paused === true) skipped.push({ id: reader.id, why: 'paused' })
    else if (reader.atLimit === true) skipped.push({ id: reader.id, why: 'at-limit' })
    else if (hasImage && !reader.motor.readsImages) skipped.push({ id: reader.id, why: 'no-vision' })
    else eligible.push(reader)
  }
  const asked = eligible.slice(0, maxReplies)
  for (const reader of eligible.slice(maxReplies)) skipped.push({ id: reader.id, why: 'over-limit' })
  const base = { round, roundsCap, roundsLeft, dailyCap, skipped }

  if (draftText === '' && !hasImage) return stopped('draft-empty', base)
  if (used >= roundsCap) return stopped('rounds-cap', { ...base, round: roundsCap, roundsLeft: 0 })
  if (bounded(input.asker.asksToday, 0, 0, 1_000_000) >= dailyCap) return stopped('daily-cap', base)
  if (asked.length === 0) {
    const onlyVision = hasImage && skipped.length > 0 && skipped.every(row => row.why === 'no-vision')
    return stopped(onlyVision ? 'no-vision' : 'nobody', base)
  }

  // ---- the price -------------------------------------------------------------------------------------------------------
  const calibration = input.calibracao
  const fromHistory = calibration?.source === 'history'
  const rowsOf = (role: 'conversa' | 'execucao'): number => {
    const n = calibration?.samples?.[role]?.tokens
    return fromHistory && n !== undefined && Number.isFinite(n) && n >= MIN_HISTORY_SAMPLES ? n : 0
  }
  const ratio = fromHistory ? 1 : calibration?.tokenizerRatio ?? 1
  const vendorBase = fromHistory ? 0 : calibration?.vendorBaseTokens ?? 0
  const imageEach = images.map(image => imageTokens(image.size))
  const imageTotal = imageEach.reduce<Range>(add, ZERO)
  const shared = clip(`${input.question.trim()}\n${draftText}`)

  interface Priced { input: Range; output: Range; cost: Range; history: boolean; withBase: boolean }
  const price = (level: AskLevel, inputRange: Range, outputRange: Range, measured: boolean, withImages: boolean): Priced => {
    const tier = TIER_PRICE[tierOf(level)]
    const imageIn = withImages ? imageTotal : ZERO
    const inRange = add(inputRange, imageIn)
    // The image is written to the prompt cache on the call that sends it: MEASURED at the cache-WRITE price (reports/image-cost-real.md).
    const imageCost = (pick: 'min' | 'max'): number => Math.round(imageIn[pick] * tier.input * IMAGE_CACHE_WRITE_FACTOR)
    if (measured) {
      // The person's own measured input already carries the vendor base and mixes fresh, cache-read and cache-write tokens: floor at the
      // cache-read price, ceiling at the cache-write price (as `estimateAsk` does).
      return {
        input: inRange, output: outputRange, history: true, withBase: true,
        cost: {
          min: Math.round(inputRange.min * tier.input * CACHE_READ_FACTOR + outputRange.min * tier.output) + imageCost('min'),
          max: Math.round(inputRange.max * tier.input * CACHE_WRITE_FACTOR + outputRange.max * tier.output) + imageCost('max'),
        },
      }
    }
    const cost = (pick: 'min' | 'max'): number => Math.round(inputRange[pick] * tier.input + vendorBase * tier.input * CACHE_READ_FACTOR + outputRange[pick] * tier.output) + imageCost(pick)
    return { input: inRange, output: outputRange, history: false, withBase: vendorBase > 0, cost: { min: cost('min'), max: cost('max') } }
  }

  const replies: Priced[] = asked.map((reader) => {
    const persona = personaOf(reader)
    const talkIn = Math.round(talkPromptTokens(persona, shared) * ratio)
    const measured = rowsOf('conversa') > 0 ? calibration?.tokensPerCall?.conversa : undefined
    return measured === undefined
      ? price(reader.level ?? 'barato', { min: talkIn, max: Math.round(talkIn + TALK_EXTRA_IN * ratio) }, REPLY_OUT, false, true)
      : price(reader.level ?? 'barato', measured.input, measured.output, true, true)
  })

  // The asker joins the replies and decides what to change: a turn at their own model, reading the draft, the replies and their task.
  const asker = personaOf(input.asker)
  const repliesIn: Range = { min: asked.length * REPLY_OUT.min, max: asked.length * REPLY_OUT.max }
  const workIn = Math.round((estimateTokens(workerPromptText(asker, true)) + estimateTokens(shared)) * ratio)
  const measuredJoin = rowsOf('execucao') > 0 ? calibration?.tokensPerCall?.execucao : undefined
  const consolidation = measuredJoin === undefined
    ? price('seu-modelo', add({ min: workIn, max: workIn }, repliesIn), CONSOLIDATION_OUT, false, true)
    : price('seu-modelo', add(measuredJoin.input, repliesIn), measuredJoin.output, true, true)

  const calls = [...replies, consolidation]
  const tokens = calls.reduce<Range>((total, row) => add(total, { min: row.input.min + row.output.min + (row.history ? 0 : vendorBase), max: row.input.max + row.output.max + (row.history ? 0 : vendorBase) }), ZERO)
  const microUsd = calls.reduce<Range>((total, row) => add(total, row.cost), ZERO)
  const imageTokensAll: Range = { min: imageTotal.min * calls.length, max: imageTotal.max * calls.length }
  const imagesSized = images.length > 0 && images.every(image => image.size !== undefined)
  const history = calls.some(row => row.history)
  const usedDev = !fromHistory && calibration !== undefined && (vendorBase > 0 || ratio !== 1)
  const fonte: AskSource | undefined = history ? 'historico' : usedDev ? 'referencia-dev' : undefined
  const everyMeasured = calls.every(row => row.history)
  const shape = shapeForAccount({ conta: input.conta, tokens, calls: { min: calls.length, max: calls.length }, microUsd })
  const cost: OpinionCost = {
    chamadas: { min: calls.length, max: calls.length },
    respostas: asked.length,
    tokens,
    microUsd: shape.microUsd,
    referenciaMicroUsd: microUsd,
    billing: shape.billing,
    quota: shape.quota,
    impacto: shape.impacto,
    imagens: { count: images.length, tokens: imageTokensAll, origin: imagesSized ? 'calibrated' : 'estimate', ...(imagesSized ? { basis: IMAGE_COST_MEASURED.basis } : {}) },
    origin: fonte === undefined ? 'estimate' : 'calibrated',
    ...(fonte === undefined ? {} : { fonte }),
    baseDoVendorIncluida: calls.every(row => row.withBase),
  }
  // The footer says tokens only when the person's own measured turns back them (as before); the share of the window or (API) the US$ are added on the same
  // honesty gate, and never money for a subscription (D-092).
  const footerUsage = shape.billing === 'api'
    ? (shape.microUsd === null ? undefined : usdLine(shape.microUsd))
    : (shape.quota?.pct != null ? shape.impacto : undefined)
  const rodape = everyMeasured
    ? [repliesText(asked.length), `de ${tokensText(tokens.min)} a ${tokensText(tokens.max)} tokens`, ...(footerUsage === undefined ? [] : [footerUsage])].join(' · ')
    : repliesText(asked.length)
  const propose = input.asker.autonomy === 'suggest'
  return {
    decision: propose ? 'propose' : 'ask',
    ...base,
    asked: asked.map(reader => reader.id),
    cost,
    rodape,
    ...(propose ? { proposta: `Posso pedir a opinião da equipe sobre ${topicOf(input.question)}? ${repliesText(asked.length)}` } : {}),
    motivo: skipped.length === 0
      ? `${colleagues(asked.length)}, e a persona junta as opiniões`
      : `${colleagues(asked.length)}; ${String(skipped.length)} não ${skipped.length === 1 ? 'será chamado' : 'serão chamados'}`,
  }
}
