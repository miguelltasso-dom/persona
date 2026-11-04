/**
 * v1 close gate (PRO-6 + GES-6 + GES-2 + GES-3 + OPT-8). Probe / host call this;
 * they do not reassemble the scores.
 */

import type { TurnLedgerEntry } from '@deepseek-ai/dsh-persona-core'
import {
  measureGestorAcceptance,
  measureGestorMultiAcceptance,
  measureGestorToolsAcceptance,
  type GestorAcceptance,
  type GestorMultiAcceptance,
  type GestorToolsAcceptance,
} from './gestor-accept.ts'
import { measureProactivityAcceptance, type ProactivityMeasure } from './proactivity-measure.ts'
import { measureFirstDeliveryAcceptance, type FirstDeliveryAcceptance } from './first-delivery-accept.ts'
import { measureOpt8Acceptance, measureOpt8View, type Opt8Acceptance, type Opt8MeasureView } from './token-measure.ts'

export interface V1CloseMeasure {
  readonly passed: boolean
  readonly proactivity: ProactivityMeasure
  readonly gestor: GestorAcceptance
  readonly gestorTools: GestorToolsAcceptance
  readonly gestorMulti: GestorMultiAcceptance
  readonly firstDelivery: FirstDeliveryAcceptance
  readonly opt8: Opt8Acceptance
  /** D-068, top level (mirrors `opt8.origin` / `opt8.baseline`). */
  readonly origin: 'estimate'
  readonly baseline: 'levers-before-wiring'
}

/**
 * One fake-clock pass over PRO-6, GES-6, GES-2, GES-3 and OPT-8.
 * `opt8.blocked` (pair-parity, cut-40 — D-068) does not fail the gate.
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
  const gestorTools = measureGestorToolsAcceptance()
  const gestorMulti = measureGestorMultiAcceptance()
  const firstDelivery = measureFirstDeliveryAcceptance()
  const opt8 = measureOpt8Acceptance(input)
  return {
    passed: proactivity.failed.length === 0
      && gestor.failed.length === 0
      && gestorTools.failed.length === 0
      && gestorMulti.failed.length === 0
      && firstDelivery.failed.length === 0
      && opt8.failed.length === 0,
    proactivity,
    gestor,
    gestorTools,
    gestorMulti,
    firstDelivery,
    opt8,
    origin: opt8.origin,
    baseline: opt8.baseline,
  }
}

/** Host `@Remote measureV1Close` wire. One call; Anvil does not remount flags. */
export interface V1CloseMeasureView {
  readonly passed: boolean
  readonly proactivity: { readonly passed: number; readonly total: 6; readonly failed: readonly string[] }
  readonly gestor: { readonly passed: number; readonly total: 3; readonly failed: readonly string[] }
  readonly gestorTools: { readonly passed: number; readonly total: 4; readonly failed: readonly string[] }
  readonly gestorMulti: { readonly passed: number; readonly total: 3; readonly failed: readonly string[] }
  readonly firstDelivery: { readonly passed: number; readonly total: 4; readonly failed: readonly string[] }
  readonly opt8: Opt8MeasureView
  /** D-068, top level (mirrors `opt8.origin` / `opt8.baseline`). */
  readonly origin: 'estimate'
  readonly baseline: 'levers-before-wiring'
}

/**
 * v1 close plus live OPT-8 book size. Host `measureV1Close` returns this.
 * The live book is reported (count and origin) but does not move the OPT-8 goal (D-068).
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
    gestorTools: {
      passed: scored.gestorTools.passed,
      total: scored.gestorTools.total,
      failed: scored.gestorTools.failed,
    },
    gestorMulti: {
      passed: scored.gestorMulti.passed,
      total: scored.gestorMulti.total,
      failed: scored.gestorMulti.failed,
    },
    firstDelivery: {
      passed: scored.firstDelivery.passed,
      total: scored.firstDelivery.total,
      failed: scored.firstDelivery.failed,
    },
    opt8: measureOpt8View(entries),
    origin: scored.opt8.origin,
    baseline: scored.opt8.baseline,
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
    ...scored.gestorTools.failed.map(id => `GES2:${id}`),
    ...scored.gestorMulti.failed.map(id => `GES3:${id}`),
    ...scored.firstDelivery.failed.map(id => `P0:${id}`),
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
      : `Gate **vermelho**. Falhou: PRO ${scored.proactivity.failed.join(', ') || '—'} · GES ${scored.gestor.failed.join(', ') || '—'} · GES-2 ${scored.gestorTools.failed.join(', ') || '—'} · GES-3 ${scored.gestorMulti.failed.join(', ') || '—'} · P0 ${scored.firstDelivery.failed.join(', ') || '—'} · OPT ${scored.opt8.failed.join(', ') || '—'}.`,
    '',
    '| frente | score | failed | blocked |',
    '|---|---|---|---|',
    `| PRO-6 | ${String(scored.proactivity.passed)}/${String(scored.proactivity.total)} | ${scored.proactivity.failed.join(', ') || '—'} | — |`,
    `| GES-6 | ${String(scored.gestor.passed)}/${String(scored.gestor.total)} | ${scored.gestor.failed.join(', ') || '—'} | — |`,
    `| GES-2 | ${String(scored.gestorTools.passed)}/${String(scored.gestorTools.total)} | ${scored.gestorTools.failed.join(', ') || '—'} | — |`,
    `| GES-3 | ${String(scored.gestorMulti.passed)}/${String(scored.gestorMulti.total)} | ${scored.gestorMulti.failed.join(', ') || '—'} | — |`,
    `| V1-P0-1 | ${String(scored.firstDelivery.passed)}/${String(scored.firstDelivery.total)} | ${scored.firstDelivery.failed.join(', ') || '—'} | — |`,
    `| OPT-8 | ${String(scored.opt8.passed)}/${String(scored.opt8.total)} | ${scored.opt8.failed.join(', ') || '—'} | ${scored.opt8.blocked.join(', ') || '—'} |`,
    '',
    'OPT-8 (D-068): `pair-parity` fica `blocked` até a rodada pareada real e `cut-40` fica `blocked` enquanto o conjunto completo de alavancas não estiver ligado (hoje falta a W3, relato curto do worker, desligada até a rodada real); só fica verde com ≥ 40% de custo estimado no pipeline fiel. Não falha o gate, mas também não conta como passou.',
    '',
    '```',
    'pnpm exec tsx packages/persona/persona-engine/scripts/write-opt8-acceptance.ts',
    '```',
    '',
  ].join('\n')
}
