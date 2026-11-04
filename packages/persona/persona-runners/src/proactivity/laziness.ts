/**
 * Anti-laziness eval suite (PRO-3). Default: scripted / fake CLI, no quota.
 * Opt-in real: PERSONA_LAZINESS_REAL=1 together with PERSONA_REAL_CLI=1.
 */

import { eventTime, type RunEvent, type Runner, type StartTurnInput } from '../contract.ts'
import { createScriptedRunner } from '../scripted.ts'

export type LazinessGrade = 'strong' | 'fair' | 'weak'

export type LazinessScenarioId = 'multi-step' | 'mid-error' | 'small-ambiguity'

export interface LazinessScenarioResult {
  id: LazinessScenarioId
  completed: boolean
  initiated: boolean
}

export interface RunnerLazinessHint {
  runner: string
  model: string
  grade: LazinessGrade
  completionRate: number
  initiativeRate: number
  lastRunAt: string
  scenarios: readonly LazinessScenarioResult[]
}

export interface LazinessSuiteOptions {
  runner?: Runner
  runnerId?: string
  model?: string
  now?: () => Date
  /** Default 3. Minimal real eval uses 2 (≤2 execs / CLI). */
  maxScenarios?: number
}

const MULTI = 'Do three steps: (1) list files (2) write notes.md (3) report done with evidence.'
const MID = 'Apply the patch. If a step fails, fix it and finish the mandate.'
const AMBIG = 'Format the date of the last commit for the changelog.'

function endedReady(events: readonly RunEvent[]): boolean {
  return events.some(event => event.type === 'ended' && event.report.state === 'ready')
}

function textOf(events: readonly RunEvent[]): string {
  return events
    .flatMap((event) => {
      if (event.type === 'delta') return [event.text]
      if (event.type === 'report' || event.type === 'ended') return [event.report.summary]
      return []
    })
    .join('\n')
}

/**
 * Score one scenario from the event stream.
 * @param id - scenario.
 * @param events - collected run events (including infra retries).
 */
export function scoreLazinessScenario(id: LazinessScenarioId, events: readonly RunEvent[]): LazinessScenarioResult {
  const body = textOf(events).toLowerCase()
  const ready = endedReady(events)
  if (id === 'multi-step') {
    const steps = [/\blist\b|\bpasso 1\b|\bstep 1\b/u, /notes\.md|\bpasso 2\b|\bstep 2\b/u, /\bdone\b|\bpronto\b|\bpasso 3\b|\bstep 3\b/u]
    const hit = steps.filter(pattern => pattern.test(body)).length
    return { id, completed: ready && hit >= 3, initiated: hit >= 2 }
  }
  if (id === 'mid-error') {
    const recovered = events.some(event => event.type === 'infra') || /retry|handoff|fixed|corrig/iu.test(body)
    return { id, completed: ready, initiated: recovered || ready }
  }
  const asked = /se voc[eê] quiser|if you want|should i|posso fazer/iu.test(body)
  return { id, completed: ready && !asked, initiated: ready && !asked }
}

/**
 * Map rates onto the UI grade (hint when picking a persona model).
 * @param completionRate - 0..1.
 * @param initiativeRate - 0..1.
 */
export function gradeLaziness(completionRate: number, initiativeRate: number): LazinessGrade {
  const score = (completionRate + initiativeRate) / 2
  if (score >= 0.8) return 'strong'
  if (score >= 0.5) return 'fair'
  return 'weak'
}

async function collect(events: AsyncIterable<RunEvent>): Promise<RunEvent[]> {
  const out: RunEvent[] = []
  for await (const event of events) out.push(event)
  return out
}

function diligentTurns(): Runner {
  const at = '2026-11-03T18:00:00.000Z'
  return createScriptedRunner({
    turns: [
      {
        events: [
          { type: 'delta', at, text: 'step 1 list files' },
          { type: 'delta', at, text: 'step 2 wrote notes.md' },
          { type: 'delta', at, text: 'step 3 done with evidence' },
          { type: 'ended', at, report: { state: 'ready', summary: 'done' } },
        ],
      },
      {
        events: [
          { type: 'delta', at, text: 'patch failed then fixed' },
          { type: 'ended', at, report: { state: 'ready', summary: 'retry applied' } },
        ],
      },
      {
        events: [
          { type: 'delta', at, text: 'using ISO-8601 2026-11-03' },
          { type: 'ended', at, report: { state: 'ready', summary: 'formatted' } },
        ],
      },
    ],
  })
}

/**
 * Run the three laziness scenarios. Default runner is a scripted diligent CLI.
 * @param options - runner under test; omit for the fake default (no quota).
 */
export async function runLazinessSuite(options: LazinessSuiteOptions = {}): Promise<RunnerLazinessHint> {
  if (process.env.PERSONA_LAZINESS_REAL === '1' && process.env.PERSONA_REAL_CLI !== '1') {
    throw new Error('PERSONA_LAZINESS_REAL=1 requires PERSONA_REAL_CLI=1')
  }
  const runner = options.runner ?? diligentTurns()
  const now = options.now ?? (() => new Date())
  const all: readonly (readonly [LazinessScenarioId, string])[] = [
    ['multi-step', MULTI],
    ['mid-error', MID],
    ['small-ambiguity', AMBIG],
  ]
  const prompts = options.maxScenarios === undefined ? all : all.slice(0, Math.max(1, options.maxScenarios))
  const scenarios: LazinessScenarioResult[] = []
  for (const [id, prompt] of prompts) {
    const input: StartTurnInput = {
      ticketId: `laziness-${id}`,
      assignmentId: id,
      personaId: 'eval',
      cwd: 'C:/tmp/laziness',
      prompt,
      model: options.model ?? 'scripted',
      permissionMode: 'deny',
    }
    const handle = await runner.start(input)
    const events = await collect(runner.stream(handle))
    scenarios.push(scoreLazinessScenario(id, events))
  }
  const completionRate = scenarios.filter(item => item.completed).length / scenarios.length
  const initiativeRate = scenarios.filter(item => item.initiated).length / scenarios.length
  return {
    runner: options.runnerId ?? runner.capabilities().kind,
    model: options.model ?? 'scripted',
    grade: gradeLaziness(completionRate, initiativeRate),
    completionRate,
    initiativeRate,
    lastRunAt: eventTime(now),
    scenarios,
  }
}

/**
 * Minimal laziness eval: 2 scenarios, cheapest model. Real CLI stays gated.
 * @param options - Same as the full suite; `maxScenarios` forced to 2.
 */
export async function runMinimalLaziness(options: LazinessSuiteOptions = {}): Promise<RunnerLazinessHint> {
  return runLazinessSuite({ ...options, maxScenarios: 2, model: options.model ?? 'haiku' })
}
