/**
 * Watchdog (Vigia): deterministic rules first, then a cheap model (host).
 * Reads facts; returns actions + audit. Does not write tickets here.
 */

export type WatchdogSignalKind =
  | 'ticket_stalled'
  | 'effect_failing'
  | 'eval_unavailable'
  | 'idle_with_queue'
  | 'no_progress'
  | 'loop'
  | 'waiting_on_peer'
  | 'runner_fail'

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

export type VigiaActionKind = 'assign' | 'plan' | 'request_status' | 'recover' | 'nudge' | 'escalate' | 'retry_backoff'

export interface VigiaAction {
  kind: VigiaActionKind
  subjectId: string
  detail: string
}

export interface VigiaAudit {
  at: number
  kind: WatchdogSignalKind
  subjectId: string
  action: VigiaActionKind
  detail: string
}

export interface VigiaPersonaState {
  personaId: string
  idle: boolean
  queueLength: number
  lastProgressAt: number
  sameReportCount: number
  waitingOnPersonaId?: string
  runnerFailed?: boolean
}

export interface VigiaRules {
  noProgressMs: number
  loopCount: number
}

export interface VigiaSnapshot extends WatchdogSnapshot {
  now: number
  openGoal: boolean
  personas: readonly VigiaPersonaState[]
  /** When false, rules stay silent — no model, no assign/recover. */
  budgetLeft?: boolean
}

const DEFAULT_RULES: VigiaRules = { noProgressMs: 10 * 60_000, loopCount: 3 }

/**
 * One Vigia cycle. Idle+queue+open goal assigns within this tick (aceitação Probe).
 * @param snapshot - Clock and persona facts.
 * @param rules - Thresholds.
 */
export function vigiaTick(snapshot: VigiaSnapshot, rules: VigiaRules = DEFAULT_RULES): {
  actions: VigiaAction[]
  audit: VigiaAudit[]
  signals: WatchdogSignal[]
  needsModel: false
} {
  const actions: VigiaAction[] = []
  const audit: VigiaAudit[] = []
  const extra: WatchdogSignal[] = []
  if (snapshot.budgetLeft === false) {
    return { actions, audit, signals: watchdogSignals(snapshot), needsModel: false }
  }

  const push = (kind: WatchdogSignalKind, subjectId: string, action: VigiaActionKind, detail: string): void => {
    extra.push({ kind, subjectId, detail })
    actions.push({ kind: action, subjectId, detail })
    audit.push({ at: snapshot.now, kind, subjectId, action, detail })
  }

  for (const persona of snapshot.personas) {
    if (persona.idle && persona.queueLength > 0 && snapshot.openGoal) {
      push('idle_with_queue', persona.personaId, 'assign', 'Ociosa com fila e objetivo aberto')
    }
    else if (persona.idle && persona.queueLength === 0 && snapshot.openGoal) {
      push('idle_with_queue', persona.personaId, 'plan', 'Fila vazia com objetivo aberto')
    }
    if (!persona.idle && snapshot.now - persona.lastProgressAt >= rules.noProgressMs) {
      push('no_progress', persona.personaId, 'request_status', 'Sem progresso no intervalo')
      if (snapshot.now - persona.lastProgressAt >= rules.noProgressMs * 2) {
        push('no_progress', persona.personaId, 'recover', 'Reinício com nota de recuperação')
      }
    }
    if (persona.sameReportCount >= rules.loopCount) {
      push('loop', persona.personaId, 'recover', 'Loop de report repetido')
    }
    if (persona.waitingOnPersonaId !== undefined) {
      push('waiting_on_peer', persona.waitingOnPersonaId, 'nudge', `Esperando ${persona.waitingOnPersonaId}`)
      push('waiting_on_peer', persona.personaId, 'escalate', 'Escalar à Coordenação')
    }
    if (persona.runnerFailed === true) {
      push('runner_fail', persona.personaId, 'retry_backoff', 'Falha de runner/conexão')
      push('runner_fail', persona.personaId, 'recover', 'Nova sessão com handoff')
    }
  }

  const signals = [...watchdogSignals(snapshot), ...extra]
  return { actions, audit, signals, needsModel: false }
}
