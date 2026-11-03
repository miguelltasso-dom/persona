/**
 * "Preguiça" eval (PRO-3 / PROACTIVITY.md §8). Rivet runs it per runner/model;
 * this scores the outcomes. Hint is for the model picker, not the channel.
 */

export type LazinessScenario = 'multi_step' | 'mid_error' | 'small_ambiguity'

export interface LazinessRun {
  scenario: LazinessScenario
  completed: boolean
  initiated: boolean
  stoppedEarly: boolean
}

export interface LazinessScore {
  scenario: LazinessScenario
  lazy: boolean
  hint: string
}

const HINT: Record<LazinessScenario, string> = {
  multi_step: 'Este modelo parou no meio de uma tarefa em etapas. Prefira um que conclua e proponha o próximo passo.',
  mid_error: 'Este modelo desistiu após um erro intermediário. Prefira um que recupere e relate evidência.',
  small_ambiguity: 'Este modelo devolveu a pergunta em vez de decidir no mandato. Prefira um mais decisivo no escopo.',
}

/**
 * Lazy = stopped early, or did not complete, or did not take the next step.
 * @param run - Observed scripted run.
 */
export function scoreLaziness(run: LazinessRun): LazinessScore {
  const lazy = run.stoppedEarly || !run.completed || !run.initiated
  return { scenario: run.scenario, lazy, hint: lazy ? HINT[run.scenario] : '' }
}

/**
 * @param scores - One run per scenario.
 */
export function lazinessHint(scores: readonly LazinessScore[]): string {
  const lazy = scores.filter(item => item.lazy)
  if (lazy.length === 0) return ''
  return lazy.map(item => item.hint).join(' ')
}
