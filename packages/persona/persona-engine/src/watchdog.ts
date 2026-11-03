/**
 * Watchdog (Vigia) pure signals (P13). Assignable function (D-043 / D-032).
 * Reads only; never writes tickets.
 */

export type WatchdogSignalKind = 'ticket_stalled' | 'effect_failing' | 'eval_unavailable'

export interface WatchdogSignal {
  kind: WatchdogSignalKind
  subjectId: string
  detail: string
}

export interface WatchdogWarning {
  id: string
  kind: WatchdogSignalKind
  subjectId: string
  detail: string
}

/**
 * Deduplicate signals into warnings. Same kind+subject collapses.
 * @param signals - Observed facts (no writes).
 */
export function watchdogWarnings(signals: readonly WatchdogSignal[]): WatchdogWarning[] {
  const seen = new Set<string>()
  const warnings: WatchdogWarning[] = []
  for (const signal of signals) {
    const id = `${signal.kind}:${signal.subjectId}`
    if (seen.has(id)) continue
    seen.add(id)
    warnings.push({ id, kind: signal.kind, subjectId: signal.subjectId, detail: signal.detail })
  }
  return warnings
}

export interface WatchdogSnapshot {
  stalledTicketIds: readonly string[]
  failingEffectKeys: readonly string[]
  unavailableEvalIds: readonly string[]
}

/**
 * Derive signals from a read-only snapshot.
 * @param snapshot - Host-supplied facts.
 */
export function watchdogSignals(snapshot: WatchdogSnapshot): WatchdogSignal[] {
  return [
    ...snapshot.stalledTicketIds.map(id => ({
      kind: 'ticket_stalled' as const,
      subjectId: id,
      detail: 'Tarefa parada sem relato recente',
    })),
    ...snapshot.failingEffectKeys.map(id => ({
      kind: 'effect_failing' as const,
      subjectId: id,
      detail: 'Efeito falhando após tentativas',
    })),
    ...snapshot.unavailableEvalIds.map(id => ({
      kind: 'eval_unavailable' as const,
      subjectId: id,
      detail: 'Triagem unavailable repetida',
    })),
  ]
}
