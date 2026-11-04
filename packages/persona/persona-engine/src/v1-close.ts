/**
 * v1 close gate (PRO-6 + GES-6 + OPT-8). Probe / host call this;
 * they do not reassemble the three scores.
 */

import type { TurnLedgerEntry } from '@deepseek-ai/dsh-persona-core'
import { measureGestorAcceptance, type GestorAcceptance } from './gestor-accept.ts'
import { measureProactivityAcceptance, type ProactivityMeasure } from './proactivity-measure.ts'
import { measureOpt8Acceptance, type Opt8Acceptance } from './token-measure.ts'

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
      ? 'Gate **verde**. Probe / `@Remote measureV1Close` chamam `measureV1Close`; não remontam flags.'
      : `Gate **vermelho**. Falhou: PRO ${scored.proactivity.failed.join(', ') || '—'} · GES ${scored.gestor.failed.join(', ') || '—'} · OPT ${scored.opt8.failed.join(', ') || '—'}.`,
    '',
    '| frente | score | failed | blocked |',
    '|---|---|---|---|',
    `| PRO-6 | ${String(scored.proactivity.passed)}/${String(scored.proactivity.total)} | ${scored.proactivity.failed.join(', ') || '—'} | — |`,
    `| GES-6 | ${String(scored.gestor.passed)}/${String(scored.gestor.total)} | ${scored.gestor.failed.join(', ') || '—'} | — |`,
    `| OPT-8 | ${String(scored.opt8.passed)}/${String(scored.opt8.total)} | ${scored.opt8.failed.join(', ') || '—'} | ${scored.opt8.blocked.join(', ') || '—'} |`,
    '',
    'OPT-8 `cut-40` fica `blocked` até o livro live (Anvil passa `liveEntries`). Não falha o gate.',
    '',
    '```',
    'pnpm exec tsx packages/persona/persona-engine/scripts/write-opt8-acceptance.ts',
    '```',
    '',
  ].join('\n')
}
