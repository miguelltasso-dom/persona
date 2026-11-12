/**
 * Enforce persona/project spend limits on a live runner. Hard stop only —
 * never silently switch to another paid connection.
 */

import { eventTime, type RunEvent, type RunHandle, type Runner, type StartTurnInput } from '../contract.ts'
import { PRECISA_DE_VOCE } from './cli-policy.ts'

export interface SpendLimits {
  tokensPerMonth?: number
  tokensPerResponse?: number
  executionsPerDay?: number
}

export type SpendKind = 'tokens_month' | 'tokens_response' | 'executions_day'

export interface SpendDecision {
  allow: boolean
  warn80: boolean
  kind?: SpendKind
  scope?: 'persona' | 'project'
  used: number
  limit: number
  question?: string
  warning?: string
}

export interface SpendLedger {
  totals(filter: {
    from: string
    to: string
    personaId?: string
    projectId?: string
  }): { inputTokens: number; outputTokens: number; runs: number }
}

export interface SpendBudgetOptions {
  personaId: string
  projectId: string
  persona: SpendLimits
  project: SpendLimits
  ledger: SpendLedger
  now?: () => Date
}

const OPTIONS = 'Aumente o limite, troque o modelo ou pause. Não há troca automática para outra conexão paga.'

const KIND_LABEL: Readonly<Record<SpendKind, string>> = {
  tokens_month: 'tokens/mês',
  tokens_response: 'tokens por resposta',
  executions_day: 'execuções/dia',
}

function utcMonth(now: Date): { from: string; to: string } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { from: from.toISOString(), to: new Date(to.getTime() - 1).toISOString() }
}

function utcDay(now: Date): { from: string; to: string } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  return { from: from.toISOString(), to: new Date(from.getTime() + 86_400_000 - 1).toISOString() }
}

function blocked(kind: SpendKind, scope: 'persona' | 'project', used: number, limit: number): SpendDecision {
  return {
    allow: false,
    warn80: false,
    kind,
    scope,
    used,
    limit,
    question: `Precisa de você: o limite de ${KIND_LABEL[kind]} ${scope === 'persona' ? 'desta persona' : 'deste projeto'} foi atingido (${String(used)}/${String(limit)}). ${OPTIONS}`,
  }
}

function warn(kind: SpendKind, scope: 'persona' | 'project', used: number, limit: number): SpendDecision {
  return {
    allow: true,
    warn80: true,
    kind,
    scope,
    used,
    limit,
    warning: `Uso em 80% do limite de ${KIND_LABEL[kind]} ${scope === 'persona' ? 'desta persona' : 'deste projeto'} (${String(used)}/${String(limit)}).`,
  }
}

function checkCap(
  used: number,
  limit: number | undefined,
  kind: SpendKind,
  scope: 'persona' | 'project',
): SpendDecision | undefined {
  if (limit === undefined || limit <= 0) return undefined
  if (used >= limit) return blocked(kind, scope, used, limit)
  if (used / limit >= 0.8) return warn(kind, scope, used, limit)
  return undefined
}

/**
 * Project and persona caps; first hard stop wins. `pendingTokens` is this response.
 * @param input - Caps and current totals.
 */
export function evaluateSpend(input: {
  persona: SpendLimits
  project: SpendLimits
  personaMonthTokens: number
  projectMonthTokens: number
  personaDayRuns: number
  projectDayRuns: number
  pendingTokens?: number
}): SpendDecision {
  const stops: SpendDecision[] = []
  const warnings: SpendDecision[] = []
  const push = (item: SpendDecision | undefined): void => {
    if (item === undefined) return
    if (item.allow) warnings.push(item)
    else stops.push(item)
  }
  push(checkCap(input.personaDayRuns, input.persona.executionsPerDay, 'executions_day', 'persona'))
  push(checkCap(input.projectDayRuns, input.project.executionsPerDay, 'executions_day', 'project'))
  push(checkCap(input.personaMonthTokens, input.persona.tokensPerMonth, 'tokens_month', 'persona'))
  push(checkCap(input.projectMonthTokens, input.project.tokensPerMonth, 'tokens_month', 'project'))
  if (input.pendingTokens !== undefined) {
    push(checkCap(input.pendingTokens, input.persona.tokensPerResponse, 'tokens_response', 'persona'))
    push(checkCap(input.pendingTokens, input.project.tokensPerResponse, 'tokens_response', 'project'))
  }
  if (stops[0] !== undefined) return stops[0]
  if (warnings[0] !== undefined) return warnings[0]
  return { allow: true, warn80: false, used: 0, limit: 0 }
}

function snapshot(options: SpendBudgetOptions, pendingTokens?: number): SpendDecision {
  const now = (options.now ?? (() => new Date()))()
  const month = utcMonth(now)
  const day = utcDay(now)
  const personaMonth = options.ledger.totals({ ...month, personaId: options.personaId })
  const projectMonth = options.ledger.totals({ ...month, projectId: options.projectId })
  const personaDay = options.ledger.totals({ ...day, personaId: options.personaId })
  const projectDay = options.ledger.totals({ ...day, projectId: options.projectId })
  return evaluateSpend({
    persona: options.persona,
    project: options.project,
    personaMonthTokens: personaMonth.inputTokens + personaMonth.outputTokens,
    projectMonthTokens: projectMonth.inputTokens + projectMonth.outputTokens,
    personaDayRuns: personaDay.runs,
    projectDayRuns: projectDay.runs,
    ...(pendingTokens === undefined ? {} : { pendingTokens }),
  })
}

function blockedHandle(input: StartTurnInput): RunHandle {
  return {
    runId: `spend-${input.assignmentId}`,
    sessionId: `spend-${input.assignmentId}`,
    ticketId: input.ticketId,
    assignmentId: input.assignmentId,
    personaId: input.personaId,
    cwd: input.cwd,
    model: input.model,
  }
}

/**
 * Refuse a turn that would exceed the ledger. 80% emits a progress report.
 * @param inner - Resolved runner.
 * @param options - Caps + ledger.
 */
export function withSpendBudget(inner: Runner, options: SpendBudgetOptions): Runner {
  const blockedRuns = new Map<string, SpendDecision>()
  const warnings = new Map<string, string>()

  const begin = async (input: StartTurnInput): Promise<RunHandle> => {
    const decision = snapshot(options)
    if (!decision.allow) {
      const handle = blockedHandle(input)
      blockedRuns.set(handle.runId, decision)
      return handle
    }
    const handle = await inner.start(input)
    if (decision.warn80 && decision.warning !== undefined) warnings.set(handle.runId, decision.warning)
    return handle
  }

  const play = async function *(handle: RunHandle): AsyncIterable<RunEvent> {
    const stop = blockedRuns.get(handle.runId)
    if (stop !== undefined) {
      yield {
        type: 'ended',
        at: eventTime(),
        report: {
          state: 'blocked',
          summary: stop.question ?? PRECISA_DE_VOCE,
          question: stop.question ?? PRECISA_DE_VOCE,
        },
      }
      return
    }
    const warning = warnings.get(handle.runId)
    if (warning !== undefined) {
      yield { type: 'report', at: eventTime(), report: { state: 'progress', summary: warning } }
    }
    for await (const event of inner.stream(handle)) {
      if (event.type === 'ended') {
        const usage = await inner.usage(handle)
        const after = snapshot(options, usage.inputTokens + usage.outputTokens)
        if (!after.allow) {
          yield {
            type: 'ended',
            at: event.at,
            report: {
              state: 'blocked',
              summary: after.question ?? PRECISA_DE_VOCE,
              question: after.question ?? PRECISA_DE_VOCE,
            },
          }
          return
        }
      }
      yield event
    }
  }

  return {
    capabilities: () => inner.capabilities(),
    health: () => inner.health(),
    authenticate: () => inner.authenticate(),
    start: begin,
    startTurn: begin,
    stream: play,
    events: play,
    cancel: handle => inner.cancel(handle),
    resume: input => inner.resume(input),
    usage: handle => inner.usage(handle),
    ...(inner.prime === undefined ? {} : { prime: (input: StartTurnInput) => inner.prime!(input) }),
    ...(inner.dispose === undefined ? {} : { dispose: () => inner.dispose!() }),
    ...(inner.steer === undefined ? {} : { steer: (...args: Parameters<NonNullable<Runner['steer']>>) => inner.steer!(...args) }),
  }
}
