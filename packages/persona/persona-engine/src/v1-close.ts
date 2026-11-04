/**
 * v1 close gate (PRO-6 + GES-6 + OPT-8). Probe / host call this;
 * they do not reassemble the three scores.
 */

import type { TurnLedgerEntry } from '@deepseek-ai/dsh-persona-core'
import { measureGestorAcceptance, type GestorAcceptance } from './gestor-accept.ts'
import { measureProactivityAcceptance, type ProactivityMeasure } from './proactivity-measure.ts'
import { measureOpt8Acceptance, measureOpt8View, type Opt8Acceptance, type Opt8MeasureView } from './token-measure.ts'

export interface V1CloseMeasure {
  readonly passed: boolean
  readonly proactivity: ProactivityMeasure
  readonly gestor: GestorAcceptance
  readonly opt8: Opt8Acceptance
}

/**
 * One fake-clock pass over the three v1 acceptance functions.
 * `opt8.blocked` (cut-40 without a live book) does not fail the gate.
 * @param input - Optional live ledger for OPT-8 −40%.
 * @returns Combined score. `passed` is true when no function reports `failed`.
 */
export function measureV1Close(input?: {
  readonly liveEntries?: readonly TurnLedgerEntry[]
  readonly successfulTicketIds?: readonly string[]
  readonly baselineTokensPerTask?: number
}): V1CloseMeasure {
  const proactivity = measureProactivityAcceptance()
  const gestor = measureGestorAcceptance()
  const opt8 = measureOpt8Acceptance(input)
  return {
    passed: proactivity.failed.length === 0 && gestor.failed.length === 0 && opt8.failed.length === 0,
    proactivity,
    gestor,
    opt8,
  }
}

/** Host `@Remote measureV1Close` wire. One call; Anvil does not remount flags. */
export interface V1CloseMeasureView {
  readonly passed: boolean
  readonly proactivity: { readonly passed: number; readonly total: 6; readonly failed: readonly string[] }
  readonly gestor: { readonly passed: number; readonly total: 3; readonly failed: readonly string[] }
  readonly opt8: Opt8MeasureView
}

/**
 * v1 close plus live OPT-8 book size. Host `measureV1Close` returns this.
 * Empty book keeps `cut-40` blocked; a live book scores −40%.
 * @param entries - Host ledger rows (`TurnLedgerView` ≡ `TurnLedgerEntry`).
 * @returns Wire fields. `opt8.liveEntries` is `entries.length`.
 */
export function measureV1CloseView(entries: readonly TurnLedgerEntry[] = []): V1CloseMeasureView {
  const scored = measureV1Close({ liveEntries: entries })
  return {
    passed: scored.passed,
    proactivity: {
      passed: scored.proactivity.passed,
      total: scored.proactivity.total,
      failed: scored.proactivity.failed,
    },
    gestor: {
      passed: scored.gestor.passed,
      total: scored.gestor.total,
      failed: scored.gestor.failed,
    },
    opt8: measureOpt8View(entries),
  }
}

/**
 * Throws when any of the three v1 scores reports `failed`.
 * Probe / CI call this; they do not remount flags.
 * @param input - Same live compare as {@link measureV1Close}.
 * @returns The passing score.
 */
export function assertV1Close(input?: {
  readonly liveEntries?: readonly TurnLedgerEntry[]
  readonly successfulTicketIds?: readonly string[]
  readonly baselineTokensPerTask?: number
}): V1CloseMeasure {
  const scored = measureV1Close(input)
  if (scored.passed) return scored
  const failed = [
    ...scored.proactivity.failed.map(id => `PRO:${id}`),
    ...scored.gestor.failed.map(id => `GES:${id}`),
    ...scored.opt8.failed.map(id => `OPT:${id}`),
  ]
  throw new Error(`V1_CLOSE ${failed.join(',')}`)
}

/**
 * Markdown for `persona-spec/reports/v1-close.md`.
 * @param input - Same live compare as {@link measureV1Close}.
 * @returns Full report.
 */
export function formatV1CloseMarkdown(input?: {
  readonly liveEntries?: readonly TurnLedgerEntry[]
  readonly successfulTicketIds?: readonly string[]
  readonly baselineTokensPerTask?: number
}): string {
  const scored = measureV1Close(input)
  return [
    '# Fechamento v1 — domínio (Forge, 04/11)',
    '',
    scored.passed
      ? 'Gate **verde**. Probe / `@Remote measureV1Close` chamam `measureV1CloseView(entries)`; não remontam flags.'
      : `Gate **vermelho**. Falhou: PRO ${scored.proactivity.failed.join(', ') || '—'} · GES ${scored.gestor.failed.join(', ') || '—'} · OPT ${scored.opt8.failed.join(', ') || '—'}.`,
    '',
    '| frente | score | failed | blocked |',
    '|---|---|---|---|',
    `| PRO-6 | ${String(scored.proactivity.passed)}/${String(scored.proactivity.total)} | ${scored.proactivity.failed.join(', ') || '—'} | — |`,
    `| GES-6 | ${String(scored.gestor.passed)}/${String(scored.gestor.total)} | ${scored.gestor.failed.join(', ') || '—'} | — |`,
    `| OPT-8 | ${String(scored.opt8.passed)}/${String(scored.opt8.total)} | ${scored.opt8.failed.join(', ') || '—'} | ${scored.opt8.blocked.join(', ') || '—'} |`,
    '',
    'OPT-8 `cut-40` fica `blocked` até o livro live (`measureV1CloseView(entries)` / `measureOpt8View`). Não falha o gate.',
    '',
    '```',
    'pnpm exec tsx packages/persona/persona-engine/scripts/write-opt8-acceptance.ts',
    '```',
    '',
  ].join('\n')
}
