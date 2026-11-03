/**
 * Rule-driven proactivity (E4). Observe = record only; speculative is opt-in.
 */

export type ProactivityMode = 'off' | 'observe' | 'auto'

export interface ProactivityRule {
  id: string
  enabled: boolean
  mode: ProactivityMode
}

export interface ObservedAction {
  ruleId: string
  would: string
}

/**
 * Decide what a rule may do. Observe never produces side effects.
 * @param rule - Admission rule.
 * @param would - What the engine would do if auto.
 */
export function applyProactivity(rule: ProactivityRule, would: string):
  | { kind: 'skip' }
  | { kind: 'observe'; action: ObservedAction }
  | { kind: 'run'; action: string } {
  if (!rule.enabled || rule.mode === 'off') return { kind: 'skip' }
  if (rule.mode === 'observe') return { kind: 'observe', action: { ruleId: rule.id, would } }
  return { kind: 'run', action: would }
}
