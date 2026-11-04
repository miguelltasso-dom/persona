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
