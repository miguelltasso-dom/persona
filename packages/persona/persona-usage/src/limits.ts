/**
 * Persona / project spend limits. Hard stop — never fall through to another
 * paid connection. 80% is a contextual warning, not a modal.
 */

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

const OPTIONS = 'Aumente o limite, troque o modelo ou pause. Não há troca automática para outra conexão paga.'

const KIND_LABEL: Readonly<Record<SpendKind, string>> = {
  tokens_month: 'tokens/mês',
  tokens_response: 'tokens por resposta',
  executions_day: 'execuções/dia',
}

function monthWindow(now: Date): { from: string; to: string } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { from: from.toISOString(), to: new Date(to.getTime() - 1).toISOString() }
}

function dayWindow(now: Date): { from: string; to: string } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const to = new Date(from.getTime() + 86_400_000)
  return { from: from.toISOString(), to: new Date(to.getTime() - 1).toISOString() }
}

/**
 * UTC month [from, to] for token/month totals.
 * @param now - Clock.
 */
export function spendMonthWindow(now: Date): { from: string; to: string } {
  return monthWindow(now)
}

/**
 * UTC day [from, to] for executions/day totals.
 * @param now - Clock.
 */
export function spendDayWindow(now: Date): { from: string; to: string } {
  return dayWindow(now)
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
 * Decide whether a turn may start (or a just-finished response may stand).
 * Project and persona are both enforced; the first hard stop wins.
 * @param input - Caps and current totals. `pendingTokens` is this response.
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
