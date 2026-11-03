/**
 * Rule-driven proactivity (E4) and autonomy levels (PROACTIVITY.md).
 * Speculative work always starts as record-only.
 */

export type ProactivityMode = 'off' | 'observe' | 'auto'

/** Só quando pedido · Propor · Agir dentro de limites. */
export type AutonomyLevel = 'on_request' | 'propose' | 'act'

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

export type AutonomyDecision =
  | { kind: 'skip' }
  | { kind: 'observe'; would: string }
  | { kind: 'propose'; would: string }
  | { kind: 'run'; would: string }

/**
 * @param level - Persona/project autonomy.
 * @param would - What the engine would do.
 * @param speculative - Speculative work is observe-only until accepted.
 */
export function applyAutonomy(level: AutonomyLevel, would: string, speculative = false): AutonomyDecision {
  if (speculative) return { kind: 'observe', would }
  if (level === 'on_request') return { kind: 'skip' }
  if (level === 'propose') return { kind: 'propose', would }
  return { kind: 'run', would }
}

/**
 * Map autonomy onto the E4 rule mode. Speculative stays `observe`.
 * @param level - Persona/project autonomy.
 * @param speculative - Speculative work.
 */
export function autonomyMode(level: AutonomyLevel, speculative = false): ProactivityMode {
  if (speculative) return 'observe'
  if (level === 'on_request') return 'off'
  if (level === 'propose') return 'observe'
  return 'auto'
}
