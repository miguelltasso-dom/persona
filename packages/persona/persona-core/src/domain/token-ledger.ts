/**
 * Per-turn token ledger (TOKEN-OPTIMIZATION §1): layers, cache read/write,
 * and calls per finished task. Scripted count is faithful; real CLI is opt-in.
 */

import { DomainError } from './schemas.ts'

/** Work that spent model tokens this turn. Canonical for Anvil OPT-7. */
export type TurnKind =
  | 'triage'
  | 'reply'
  | 'execution'
  | 'initiative'
  | 'librarian'
  | 'watchdog'
  | 'evaluation'

/** Short tags on the Rivet usage port. Persist {@link TurnKind}; map only at that port. */
export type UsagePortKind =
  | 'triage'
  | 'reply'
  | 'exec'
  | 'initiative'
  | 'librarian'
  | 'watchdog'
  | 'eval'

/** How the counters were produced. Absence is never 0%. */
export type LedgerOrigin = 'measured' | 'estimate'

/** Prompt prefix and variable slices, in cache-stable order. */
export interface TurnLayerSizes {
  readonly system: number
  readonly tools: number
  readonly required: number
  readonly subject: number
  readonly recall: number
  readonly message: number
}

/** One model call. Optional ticket and account stay omitted when unknown. */
export interface TurnLedgerEntry {
  readonly id: string
  readonly personaId: string
  readonly engine: string
  readonly kind: TurnKind
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
  readonly layers: TurnLayerSizes
  readonly at: string
  readonly ticketId?: string
  readonly accountId?: string
  readonly origin?: LedgerOrigin
  /** Wall-clock length of the call in whole milliseconds (OPT-9: the per-person median calibrates `estimateAsk`). Omitted when unknown. */
  readonly durationMs?: number
  /**
   * D-085: how the call's environment was set up — `native` (the runtime's own tools and connectors), `answer-only` (no tools:
   * text in, text out) or `needed` (only the connectors the task asked for). Omitted when the runner does not say.
   */
  readonly envMode?: LedgerEnvMode
  /** D-096: WHY the call ran in `envMode` (a code such as `connector-unreached` or `failed-version`); omitted when the runner does not say. */
  readonly envModeReason?: string
  /**
   * EFF-1: the model the call was started with (`default` = the engine's own). Recorded only together with a choice or a drop below;
   * a persona left on "Padrão do motor" sends nothing and the row says nothing.
   */
  readonly model?: string
  /** EFF-1: the model the person chose for the persona (absent = "Padrão do motor"). */
  readonly modelRequested?: string
  /** EFF-1: the effort level the person chose (absent = none). */
  readonly effortRequested?: string
  /** EFF-1: the chosen model the engine does not offer: the call ran on the engine's default instead (the Task was not lost). */
  readonly modelDropped?: string
  /** EFF-1: the chosen effort the model refused: the call ran at the engine's default effort. */
  readonly effortDropped?: string
}

/** EFF-1: the per-turn engine choice fields of a {@link TurnLedgerEntry}, in a fixed order. */
export const LEDGER_CHOICE_FIELDS = ['model', 'modelRequested', 'effortRequested', 'modelDropped', 'effortDropped'] as const

/** One of {@link LEDGER_CHOICE_FIELDS}. */
export type LedgerChoiceField = (typeof LEDGER_CHOICE_FIELDS)[number]

/** A model id or an effort level as the CLIs name them (`claude-opus-5-5`, `opus`, `gpt-5.1-codex`, `opus[1m]`, `xhigh`). Never free text. */
const CHOICE_VALUE = /^[A-Za-z0-9][\w.:[\]/-]{0,79}$/u

/**
 * @param value - Candidate model id / effort level.
 * @returns Whether it is a short identifier (no spaces, no prose).
 */
export function isLedgerChoiceValue(value: unknown): value is string {
  return typeof value === 'string' && CHOICE_VALUE.test(value)
}

/**
 * EFF-1: what a row says about the engine choice, or `undefined` when it says nothing (no choice and no drop: the engine's
 * default ran, and `model` alone is not kept).
 * @param entry - Ledger row.
 * @returns The choice fields that are present.
 */
export function ledgerChoiceOf(entry: TurnLedgerEntry): Partial<Record<LedgerChoiceField, string>> | undefined {
  if (entry.modelRequested === undefined && entry.effortRequested === undefined
    && entry.modelDropped === undefined && entry.effortDropped === undefined) return undefined
  const choice: Partial<Record<LedgerChoiceField, string>> = {}
  for (const field of LEDGER_CHOICE_FIELDS) {
    const value = entry[field]
    if (value !== undefined) choice[field] = value
  }
  return choice
}

/** The three ways a call's environment is set up (D-085). */
export type LedgerEnvMode = 'native' | 'answer-only' | 'needed'

/** @param value - Candidate mode. @returns Whether it is one of the three. */
export function isLedgerEnvMode(value: unknown): value is LedgerEnvMode {
  return value === 'native' || value === 'answer-only' || value === 'needed'
}

/** Empty layer row. */
export const EMPTY_LAYERS: TurnLayerSizes = {
  system: 0,
  tools: 0,
  required: 0,
  subject: 0,
  recall: 0,
  message: 0,
}

/**
 * Integrator-free estimator: 4 characters ≈ 1 token. Empty text is 0.
 * @param text - Prompt or completion slice.
 * @returns Non-negative integer.
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0
  return Math.ceil(text.length / 4)
}

/**
 * @param layers - Six slices.
 * @returns Sum, never negative.
 */
export function sumLayers(layers: TurnLayerSizes): number {
  return layers.system + layers.tools + layers.required + layers.subject + layers.recall + layers.message
}

/**
 * @param text - One slice per layer. Missing keys count as empty.
 * @returns Estimated sizes.
 */
export function measureLayers(text: {
  readonly system?: string
  readonly tools?: string
  readonly required?: string
  readonly subject?: string
  readonly recall?: string
  readonly message?: string
}): TurnLayerSizes {
  return {
    system: estimateTokens(text.system ?? ''),
    tools: estimateTokens(text.tools ?? ''),
    required: estimateTokens(text.required ?? ''),
    subject: estimateTokens(text.subject ?? ''),
    recall: estimateTokens(text.recall ?? ''),
    message: estimateTokens(text.message ?? ''),
  }
}

/**
 * Rejects negative counters and a layer sum above input.
 * @param entry - Candidate row.
 */
export function assertTurnEntry(entry: TurnLedgerEntry): void {
  if (entry.id === '' || entry.personaId === '' || entry.engine === '') {
    throw new DomainError('INVALID_TOKEN_LEDGER', 'IDENTITY')
  }
  if (entry.inputTokens < 0 || entry.outputTokens < 0) {
    throw new DomainError('INVALID_TOKEN_LEDGER', 'TOKENS')
  }
  if (entry.cacheReadTokens < 0 || entry.cacheWriteTokens < 0) {
    throw new DomainError('INVALID_TOKEN_LEDGER', 'CACHE')
  }
  const layers = sumLayers(entry.layers)
  if (layers < 0 || layers > entry.inputTokens) {
    throw new DomainError('INVALID_TOKEN_LEDGER', 'LAYERS')
  }
  if (entry.durationMs !== undefined && (!Number.isInteger(entry.durationMs) || entry.durationMs < 0)) {
    throw new DomainError('INVALID_TOKEN_LEDGER', 'DURATION')
  }
  if (entry.envMode !== undefined && !isLedgerEnvMode(entry.envMode)) {
    throw new DomainError('INVALID_TOKEN_LEDGER', 'ENV_MODE')
  }
  if (entry.envModeReason !== undefined && !/^[a-z][a-z0-9-]{0,39}$/u.test(entry.envModeReason)) {
    throw new DomainError('INVALID_TOKEN_LEDGER', 'ENV_MODE_REASON')
  }
  for (const field of LEDGER_CHOICE_FIELDS) {
    const value = entry[field]
    if (value !== undefined && !isLedgerChoiceValue(value)) throw new DomainError('INVALID_TOKEN_LEDGER', 'ENGINE_CHOICE')
  }
}

/**
 * @param entries - Existing book.
 * @param entry - New row.
 * @returns Copy with the row appended.
 */
export function appendTurn(
  entries: readonly TurnLedgerEntry[],
  entry: TurnLedgerEntry,
): TurnLedgerEntry[] {
  assertTurnEntry(entry)
  return [...entries, entry]
}

/**
 * @param entries - Book.
 * @returns Input + output across all rows.
 */
export function totalTokens(entries: readonly TurnLedgerEntry[]): number {
  let sum = 0
  for (const row of entries) sum += row.inputTokens + row.outputTokens
  return sum
}

/**
 * @param entries - Book.
 * @param ticketId - Finished task.
 * @returns Call count for that ticket.
 */
export function callsForTicket(entries: readonly TurnLedgerEntry[], ticketId: string): number {
  return entries.filter(row => row.ticketId === ticketId).length
}

/**
 * cache read / (cache read + cache write). Empty book is 0.
 * @param entries - Book.
 * @returns 0–1.
 */
export function cacheHitRate(entries: readonly TurnLedgerEntry[]): number {
  let read = 0
  let write = 0
  for (const row of entries) {
    read += row.cacheReadTokens
    write += row.cacheWriteTokens
  }
  const denom = read + write
  return denom === 0 ? 0 : read / denom
}

/**
 * Keep the cache-stable prefix; drop variable layers from the tail
 * (message → recall → subject) until the row fits `budget`.
 * @param layers - Measured sizes.
 * @param budget - Token ceiling for the compiled turn.
 * @returns Fitted sizes. Throws when the prefix alone overflows.
 */
export function fitLayersToBudget(layers: TurnLayerSizes, budget: number): TurnLayerSizes {
  if (budget < 1) throw new DomainError('INVALID_TOKEN_LEDGER', 'BUDGET')
  const prefix = layers.system + layers.tools + layers.required
  if (prefix > budget) throw new DomainError('INVALID_TOKEN_LEDGER', 'PREFIX_OVERFLOW')
  const next = { ...layers }
  let used = prefix + next.subject + next.recall + next.message
  const drop = (key: 'message' | 'recall' | 'subject'): void => {
    if (used <= budget) return
    const excess = used - budget
    const cut = Math.min(next[key], excess)
    next[key] -= cut
    used -= cut
  }
  drop('message')
  drop('recall')
  drop('subject')
  return next
}

/**
 * Incremental subject note: keep the previous digest and append the newest
 * line, then trim to `budget` from the front (oldest first).
 * @param previous - Last digest (may be empty).
 * @param added - New turn text.
 * @param budget - Token ceiling.
 * @returns Digest that fits.
 */
export function incrementalSubjectSummary(previous: string, added: string, budget: number): string {
  const joined = [previous.trim(), added.trim()].filter(part => part !== '').join('\n')
  if (estimateTokens(joined) <= budget) return joined
  const words = joined.split(/\s+/).filter(word => word !== '')
  while (words.length > 1 && estimateTokens(words.join(' ')) > budget) words.shift()
  return words.join(' ')
}

/**
 * First sentence, max 80 characters — tool descriptions stay short.
 * @param description - Vendor or local tool text.
 * @returns Compact line.
 */
export function minifyToolDescription(description: string): string {
  const first = description.split(/(?<=[.!?])\s/)[0] ?? description
  const trimmed = first.trim()
  return trimmed.length <= 80 ? trimmed : `${trimmed.slice(0, 77).trimEnd()}...`
}

/**
 * @param entries - Book.
 * @param successfulTicketIds - Tickets that met the ready criterion.
 * @returns Mean input+output per id, or 0.
 */
export function tokensPerSuccessfulTask(
  entries: readonly TurnLedgerEntry[],
  successfulTicketIds: readonly string[],
): number {
  if (successfulTicketIds.length === 0) return 0
  let sum = 0
  for (const ticketId of successfulTicketIds) {
    for (const row of entries) {
      if (row.ticketId === ticketId) sum += row.inputTokens + row.outputTokens
    }
  }
  return sum / successfulTicketIds.length
}

/**
 * Distinct ticket ids that appear on the book. Host passes this into
 * {@link foldUsagePanel} / OPT-8 when it has no separate ready list.
 * @param entries - Book.
 * @returns Unique ids, order of first appearance. Rows without a ticket stay out.
 */
export function ticketIdsFromLedger(entries: readonly TurnLedgerEntry[]): string[] {
  const seen = new Set<string>()
  const ids: string[] = []
  for (const row of entries) {
    if (row.ticketId === undefined || seen.has(row.ticketId)) continue
    seen.add(row.ticketId)
    ids.push(row.ticketId)
  }
  return ids
}

/**
 * Map a domain kind onto Rivet's usage-port tags (`exec` / `eval`).
 * @param kind - Canonical ledger kind.
 * @returns Port tag. Anvil persists {@link TurnKind}.
 */
export function usagePortKind(kind: TurnKind): UsagePortKind {
  if (kind === 'execution') return 'exec'
  if (kind === 'evaluation') return 'eval'
  return kind
}

/**
 * Build a valid row. `inputTokens` defaults to the layer sum.
 * @param input - Identity, layers, and counters.
 * @returns Append-ready entry.
 */
export function turnFromLayers(input: {
  readonly id: string
  readonly personaId: string
  readonly engine: string
  readonly kind: TurnKind
  readonly layers: TurnLayerSizes
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
  readonly at: string
  readonly inputTokens?: number
  readonly ticketId?: string
  readonly accountId?: string
  readonly origin?: LedgerOrigin
}): TurnLedgerEntry {
  const layered = sumLayers(input.layers)
  const entry: TurnLedgerEntry = {
    id: input.id,
    personaId: input.personaId,
    engine: input.engine,
    kind: input.kind,
    inputTokens: input.inputTokens ?? layered,
    outputTokens: input.outputTokens,
    cacheReadTokens: input.cacheReadTokens,
    cacheWriteTokens: input.cacheWriteTokens,
    layers: input.layers,
    at: input.at,
    ...(input.ticketId === undefined ? {} : { ticketId: input.ticketId }),
    ...(input.accountId === undefined ? {} : { accountId: input.accountId }),
    ...(input.origin === undefined ? {} : { origin: input.origin }),
  }
  assertTurnEntry(entry)
  return entry
}

/** One Uso-panel slice (persona or kind). */
export interface UsagePanelSlice {
  readonly key: string
  readonly tokens: number
  readonly calls: number
  readonly cacheHitRate: number
}

/** Folds Anvil/Lumen read for OPT-7. Empty book is estimate, not 0% quota. */
export interface UsagePanelFold {
  readonly origin: LedgerOrigin
  readonly tokensPerSuccessfulTask: number
  readonly byPersona: readonly UsagePanelSlice[]
  readonly byKind: readonly UsagePanelSlice[]
  readonly cacheHitRate: number
}

function sliceOf(
  key: string,
  rows: readonly TurnLedgerEntry[],
): UsagePanelSlice {
  return {
    key,
    tokens: totalTokens(rows),
    calls: rows.length,
    cacheHitRate: cacheHitRate(rows),
  }
}

/**
 * @param entries - Book.
 * @returns One slice per persona id, stable order of first appearance.
 */
export function foldByPersona(entries: readonly TurnLedgerEntry[]): UsagePanelSlice[] {
  const order: string[] = []
  const groups = new Map<string, TurnLedgerEntry[]>()
  for (const row of entries) {
    const hit = groups.get(row.personaId)
    if (hit === undefined) {
      order.push(row.personaId)
      groups.set(row.personaId, [row])
      continue
    }
    hit.push(row)
  }
  return order.map(key => sliceOf(key, groups.get(key) ?? []))
}

/**
 * @param entries - Book.
 * @returns One slice per {@link TurnKind}, stable order of first appearance.
 */
export function foldByKind(entries: readonly TurnLedgerEntry[]): UsagePanelSlice[] {
  const order: string[] = []
  const groups = new Map<string, TurnLedgerEntry[]>()
  for (const row of entries) {
    const hit = groups.get(row.kind)
    if (hit === undefined) {
      order.push(row.kind)
      groups.set(row.kind, [row])
      continue
    }
    hit.push(row)
  }
  return order.map(key => sliceOf(key, groups.get(key) ?? []))
}

/**
 * @param entries - Book.
 * @returns Weakest published origin. Empty book is `estimate`.
 */
export function ledgerOriginOf(entries: readonly TurnLedgerEntry[]): LedgerOrigin {
  if (entries.length === 0) return 'estimate'
  for (const row of entries) {
    if (row.origin !== 'measured') return 'estimate'
  }
  return 'measured'
}

/**
 * Panel fold for Uso e limites: per task, persona, kind, cache, origin.
 * @param entries - Book.
 * @param successfulTicketIds - Tickets that met ready.
 * @returns OPT-7 row. Empty book stays `estimate`.
 */
export function foldUsagePanel(
  entries: readonly TurnLedgerEntry[],
  successfulTicketIds: readonly string[] = [],
): UsagePanelFold {
  return {
    origin: ledgerOriginOf(entries),
    tokensPerSuccessfulTask: tokensPerSuccessfulTask(entries, successfulTicketIds),
    byPersona: foldByPersona(entries),
    byKind: foldByKind(entries),
    cacheHitRate: cacheHitRate(entries),
  }
}
