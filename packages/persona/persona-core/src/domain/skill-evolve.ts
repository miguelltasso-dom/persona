/**
 * Skill evolution (E2): propose → score on held-out examples → activate
 * per policy → observe → automatic rollback if worse.
 * Evaluation never uses the recipe text as the example.
 */

import {
  applySkillEval,
  nextSkillVersion,
  rollbackSkill,
  type SkillRecord,
} from './skills.ts'

export type SkillPolicy = 'approval' | 'auto'

/** Held-out task. Must not be a copy of the skill body. */
export interface SkillExample {
  id: string
  prompt: string
  expected: readonly string[]
  forbidden?: readonly string[]
}

export interface SkillScore {
  passed: number
  failed: number
  total: number
  ratio: number
}

export interface SkillEvalPort {
  /**
   * @param skillBody - Candidate recipe.
   * @param example - Held-out task.
   */
  run(skillBody: string, example: SkillExample): { output: string }
}

export interface SkillEvolveResult {
  skill: SkillRecord
  candidate: SkillRecord
  before: SkillScore
  after: SkillScore
  activated: boolean
  rolledBack: boolean
  trail: string[]
}

const AUTO_FLOOR = 0.6

/**
 * Deterministic fake runner. Applies the recipe as cues on a *different* prompt.
 * Opt-in real runner is a port the host injects when `PERSONA_REAL_SKILL_EVAL=1`.
 */
export function fakeSkillEvalPort(): SkillEvalPort {
  return {
    run(skillBody, example) {
      const body = skillBody.toLowerCase()
      const prompt = example.prompt.toLowerCase()
      const hints: string[] = []
      if (/teste/.test(body) && /pr|diff|pull/.test(prompt)) hints.push('pedir testes')
      if (/segredo|cofre|não vaz|nao vaz/.test(body) && /dm|senha|token/.test(prompt)) hints.push('recusar vazamento')
      if (/mandato|escopo/.test(body) && /ampliar|empresa|company/.test(prompt)) hints.push('manter mandato')
      if (/readme|document/.test(body) && /readme|docs/.test(prompt)) hints.push('escrever readme')
      return { output: hints.join('\n') }
    },
  }
}

/**
 * Score a body against held-out examples. Repeating the recipe as the prompt fails
 * `assertHeldOut` in the evolve step.
 * @param body - Skill text.
 * @param examples - Tasks that are not the recipe.
 * @param port - Fake or injected real runner.
 */
export function scoreSkillExamples(
  body: string,
  examples: readonly SkillExample[],
  port: SkillEvalPort,
): SkillScore {
  let passed = 0
  for (const example of examples) {
    const output = port.run(body, example).output.toLowerCase()
    const okExpected = example.expected.every(item => output.includes(item.toLowerCase()))
    const okForbidden = (example.forbidden ?? []).every(item => !output.includes(item.toLowerCase()))
    if (okExpected && okForbidden) passed += 1
  }
  const total = examples.length
  const failed = total - passed
  return { passed, failed, total, ratio: total === 0 ? 0 : passed / total }
}

function assertHeldOut(body: string, examples: readonly SkillExample[]): void {
  const recipe = body.trim().toLowerCase()
  if (recipe === '') return
  for (const example of examples) {
    if (example.prompt.trim().toLowerCase() === recipe) {
      throw new Error('skill-example-is-recipe')
    }
  }
}

/**
 * Propose a candidate version, evaluate, activate per policy, roll back if worse.
 * @param input - Current skill, proposal, examples, policy, optional human accept.
 */
export function evolveSkill(input: {
  current: SkillRecord
  proposalBody: string
  examples: readonly SkillExample[]
  policy: SkillPolicy
  accepted?: boolean
  port?: SkillEvalPort
}): SkillEvolveResult {
  const port = input.port ?? fakeSkillEvalPort()
  assertHeldOut(input.proposalBody, input.examples)
  const before = scoreSkillExamples(input.current.body, input.examples, port)
  const candidate = nextSkillVersion(input.current, input.proposalBody)
  const after = scoreSkillExamples(candidate.body, input.examples, port)
  const trail = [
    `propose v${String(candidate.version)}`,
    `score ${String(before.passed)}/${String(before.total)} → ${String(after.passed)}/${String(after.total)}`,
  ]
  const approved = input.policy === 'auto' || input.accepted === true
  if (!approved) {
    return {
      skill: input.current,
      candidate,
      before,
      after,
      activated: false,
      rolledBack: false,
      trail: [...trail, 'awaiting-approval'],
    }
  }
  const worse = after.ratio < before.ratio || after.ratio < AUTO_FLOOR
  if (worse) {
    const rolled = applySkillEval(rollbackSkill(candidate, input.current.body), 'fail')
    return {
      skill: { ...rolled, enabled: input.current.enabled },
      candidate,
      before,
      after,
      activated: false,
      rolledBack: true,
      trail: [...trail, 'rollback-worse'],
    }
  }
  const live = { ...candidate, enabled: true }
  return {
    skill: applySkillEval(live, 'pass'),
    candidate: live,
    before,
    after,
    activated: true,
    rolledBack: false,
    trail: [...trail, 'activated'],
  }
}

/**
 * Observe live outcomes after activation. Rollback when the live ratio drops.
 * @param current - Active skill.
 * @param previousBody - Body to restore.
 * @param live - Outcomes collected after activation (held-out, not the recipe).
 */
export function observeSkillAndMaybeRollback(
  current: SkillRecord,
  previousBody: string,
  live: SkillScore,
  baseline: SkillScore,
): { skill: SkillRecord; rolledBack: boolean } {
  if (live.ratio >= baseline.ratio) return { skill: current, rolledBack: false }
  return {
    skill: { ...rollbackSkill(current, previousBody), enabled: true },
    rolledBack: true,
  }
}
