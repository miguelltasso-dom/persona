/**
 * Goal continuation (PRO-3): DSH mounts `dsh-goal-round-driver`; CLI runners
 * continue the same mandate via OAR resume/steer while the goal is armed.
 */

import type { RunHandle, Runner, StartTurnInput } from '../contract.ts'
import type { DshBoundSession } from '../dsh/session-runner.ts'

/** Cordis plugin id the host must mount on DSH agent contexts. */
export const GOAL_ROUND_DRIVER_NAME = 'goal-round-driver'

/** Workspace package that implements same-session DSH continuation. */
export const GOAL_ROUND_DRIVER_PACKAGE = '@deepseek-ai/dsh-goal-round-driver'

export interface GoalBudget {
  id: string
  criterion: string
  armed: boolean
  remainingRounds: number
  complete: boolean
}

export interface GoalContinueDriver {
  goal: GoalBudget
  remaining(): number
  /**
   * Start the next goal round on the turn runner (DSH resume or OAR resume).
   * @param base - last turn identity (cwd/model/permission).
   * @param lastHandle - native session to resume when the runner supports it.
   */
  continueTurn(base: StartTurnInput, lastHandle?: RunHandle): Promise<RunHandle | undefined>
}

export interface GoalContinueOptions {
  runner: Runner
  goal: GoalBudget
}

/**
 * Prompt for one unattended goal round (mirrors `renderGoalRoundPrompt` intent).
 * @param goal - armed goal.
 * @param round - 1-based round about to start.
 */
export function renderPersonaGoalRound(goal: GoalBudget, round: number): string {
  return [
    `<goal_round goal="${goal.id}" round="${String(round)}">`,
    `Continue the goal. Definition of done: ${goal.criterion}`,
    'Do not wait for a person. Finish, verify, report with evidence, propose the next step.',
    '</goal_round>',
  ].join('\n')
}

/**
 * Turn-level continuation used by DSH-direct and OAR CLI runners.
 * @param options - runner and mutable goal budget.
 */
export function createGoalContinueDriver(options: GoalContinueOptions): GoalContinueDriver {
  const goal = options.goal
  let started = 0
  return {
    goal,
    remaining: () => goal.remainingRounds,
    continueTurn: async (base, lastHandle) => {
      if (!goal.armed || goal.complete || goal.remainingRounds <= 0) return undefined
      started += 1
      const round = started
      goal.remainingRounds -= 1
      const input: StartTurnInput = {
        ticketId: base.ticketId,
        assignmentId: base.assignmentId,
        personaId: base.personaId,
        cwd: base.cwd,
        model: base.model,
        prompt: renderPersonaGoalRound(goal, round),
      }
      if (base.permissionMode !== undefined) input.permissionMode = base.permissionMode
      if (base.history !== undefined) input.history = base.history
      if (lastHandle !== undefined) input.resumeSessionId = lastHandle.sessionId
      return lastHandle === undefined ? options.runner.start(input) : options.runner.resume(input)
    },
  }
}

/**
 * Same-session DSH steer while the Cordis goal-round-driver is mounted.
 * @param session - bound `ctx.agents` session.
 * @param goal - armed goal.
 * @param requestId - idempotent deliver id.
 */
export async function continueDshGoal(
  session: DshBoundSession,
  goal: GoalBudget,
  requestId: string,
): Promise<'continued' | 'rest'> {
  if (!goal.armed || goal.complete || goal.remainingRounds <= 0) return 'rest'
  if (session.status() !== 'idle') return 'rest'
  const round = goal.remainingRounds
  goal.remainingRounds -= 1
  session.steer(requestId, renderPersonaGoalRound(goal, round))
  return 'continued'
}
