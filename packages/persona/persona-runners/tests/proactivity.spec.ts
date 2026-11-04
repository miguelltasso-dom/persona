import { describe, expect, it } from 'vitest'
import {
  INFRA_BACKOFF_MS,
  OWNER_NORMS,
  buildHandoffPrompt,
  classifyInfraFailure,
  continueDshGoal,
  createGoalContinueDriver,
  createScriptedRunner,
  executorPrompt,
  gradeLaziness,
  renderPersonaGoalRound,
  runLazinessSuite,
  runMinimalLaziness,
  scoreLazinessScenario,
  withInfraRecovery,
  withObserveGate,
  type DshBoundSession,
  type RunEvent,
  type StartTurnInput,
} from '../src/index.ts'

const base: StartTurnInput = {
  ticketId: 't-pro',
  assignmentId: 'a-pro',
  personaId: 'nina',
  cwd: 'C:/tmp/pro',
  prompt: 'Finish the mandate',
  model: 'scripted',
  permissionMode: 'deny',
}

async function collect(events: AsyncIterable<RunEvent>): Promise<RunEvent[]> {
  const out: RunEvent[] = []
  for await (const event of events) out.push(event)
  return out
}

describe('PRO-3 infra recovery', () => {
  it('classifies context/connection/process/trust failures', () => {
    expect(classifyInfraFailure('maximum context length exceeded')).toBe('context_full')
    expect(classifyInfraFailure('ECONNRESET from provider')).toBe('connection_error')
    expect(classifyInfraFailure('runtime_exited code 1')).toBe('process_dead')
    expect(classifyInfraFailure('Do you trust this folder?')).toBe('trust_prompt')
    expect(classifyInfraFailure('tests failed')).toBeUndefined()
  })

  it('retries on a new session with handoff and backoff, without waiting in tests', async () => {
    const waits: number[] = []
    const inner = createScriptedRunner({
      turns: [
        { events: [{ type: 'ended', at: 't', report: { state: 'failed', summary: 'context window overflow' } }] },
        { events: [{ type: 'delta', at: 't', text: 'recovered' }, { type: 'ended', at: 't', report: { state: 'ready', summary: 'done' } }] },
      ],
    })
    const runner = withInfraRecovery(inner, {
      wait: async (ms) => { waits.push(ms) },
      recallIds: ['evt-1'],
    })
    const handle = await runner.start(base)
    const events = await collect(runner.stream(handle))
    expect(events.some(event => event.type === 'infra' && event.kind === 'context_full' && event.attempt === 1)).toBe(true)
    expect(events.some(event => event.type === 'ended' && event.report.state === 'ready')).toBe(true)
    expect(waits).toEqual([INFRA_BACKOFF_MS[0]])
    expect(buildHandoffPrompt({
      kind: 'context_full',
      attempt: 1,
      lastSummary: 'context window overflow',
      originalPrompt: base.prompt,
      recallIds: ['evt-1'],
    })).toContain('persona_recall(evt-1)')
  })
})

describe('PRO-3 goal continuation', () => {
  it('rests when the goal is complete or the budget is empty', async () => {
    const runner = createScriptedRunner()
    const driver = createGoalContinueDriver({
      runner,
      goal: { id: 'g1', criterion: 'tests green', armed: true, remainingRounds: 0, complete: false },
    })
    expect(await driver.continueTurn(base)).toBeUndefined()
  })

  it('resumes the CLI session for the next goal round', async () => {
    const runner = createScriptedRunner({
      turns: [{ events: [{ type: 'ended', at: 't', report: { state: 'ready', summary: 'round' } }] }],
    })
    const driver = createGoalContinueDriver({
      runner,
      goal: { id: 'g1', criterion: 'notes.md exists', armed: true, remainingRounds: 2, complete: false },
    })
    const first = await runner.start(base)
    await collect(runner.stream(first))
    const next = await driver.continueTurn(base, first)
    expect(next?.sessionId).toBe(first.sessionId)
    expect(driver.remaining()).toBe(1)
    expect(renderPersonaGoalRound(driver.goal, 1)).toContain('notes.md exists')
  })

  it('steers an idle DSH session and rests an idle team without a goal', async () => {
    const steered: string[] = []
    const session: DshBoundSession = {
      id: 'dsh-1',
      status: () => 'idle',
      followup: () => undefined,
      steer: (_id, text) => { steered.push(text) },
      inject: () => undefined,
      cancel: async () => undefined,
      whenIdle: async () => undefined,
      onEvent: () => () => undefined,
      usage: () => ({ inputTokens: 0, outputTokens: 0 }),
      runningJobs: () => [],
      untilQuiet: async () => undefined,
      killJob: async () => undefined,
      stopSubagents: async () => undefined,
    }
    const armed = { id: 'g1', criterion: 'done', armed: true, remainingRounds: 1, complete: false }
    expect(await continueDshGoal(session, armed, 'r1')).toBe('continued')
    expect(steered[0]).toContain('<goal_round')
    const rest = { id: 'g1', criterion: 'done', armed: false, remainingRounds: 3, complete: false }
    expect(await continueDshGoal(session, rest, 'r2')).toBe('rest')
  })
})

describe('PRO-3 owner norms and laziness suite', () => {
  it('embeds owner norms in the worker prompt', () => {
    const text = executorPrompt({ id: 'nina', name: 'Nina', title: 'Engenharia' })
    expect(text).toContain('Nina')
    expect(text).toContain(OWNER_NORMS)
    expect(text).toMatch(/Não devolva trabalho/u)
  })

  it('scores diligent scripted turns as strong completion and initiative', async () => {
    const hint = await runLazinessSuite({ runnerId: 'scripted', model: 'scripted-1' })
    expect(hint.grade).toBe('strong')
    expect(hint.completionRate).toBe(1)
    expect(hint.initiativeRate).toBe(1)
    expect(hint.scenarios).toHaveLength(3)
  })

  it('runs a 2-scenario cheapest-model hint for the UI', async () => {
    const hint = await runMinimalLaziness({ runnerId: 'scripted' })
    expect(hint.scenarios).toHaveLength(2)
    expect(hint.model).toBe('haiku')
    expect(hint.grade).toBe('strong')
  })

  it('marks a lazy stop as weak', () => {
    const lazy = scoreLazinessScenario('multi-step', [
      { type: 'delta', at: 't', text: 'step 1 list' },
      { type: 'ended', at: 't', report: { state: 'ready', summary: 'posso fazer o resto se você quiser' } },
    ])
    expect(lazy.completed).toBe(false)
    expect(gradeLaziness(0, 0.3)).toBe('weak')
    expect(gradeLaziness(0.6, 0.5)).toBe('fair')
  })

  it('refuses real laziness mode without PERSONA_REAL_CLI', async () => {
    const previous = process.env.PERSONA_LAZINESS_REAL
    process.env.PERSONA_LAZINESS_REAL = '1'
    delete process.env.PERSONA_REAL_CLI
    await expect(runLazinessSuite()).rejects.toThrow(/PERSONA_REAL_CLI/u)
    if (previous === undefined) delete process.env.PERSONA_LAZINESS_REAL
    else process.env.PERSONA_LAZINESS_REAL = previous
  })
})

describe('E4 observe gate', () => {
  it('records would-do and never starts the inner runner in observe mode', async () => {
    const inner = createScriptedRunner({
      turns: [{ events: [{ type: 'delta', at: 't', text: 'should not run' }] }],
    })
    const gate = withObserveGate(inner, {
      rule: { id: 'r-obs', enabled: true, mode: 'observe' },
      now: () => new Date('2026-11-03T17:00:00.000Z'),
    })
    const handle = await gate.runner.start(base)
    const events = await collect(gate.runner.stream(handle))
    expect(gate.observed).toEqual([{ ruleId: 'r-obs', would: 'start:a-pro Finish the mandate' }])
    expect(events.map(item => item.type)).toEqual(['started', 'report', 'ended'])
    expect(events.some(item => item.type === 'delta')).toBe(false)
    expect(events.at(-1)).toMatchObject({ type: 'ended', report: { state: 'waiting' } })
  })

  it('keeps speculative work observe-only even when the rule is auto', async () => {
    const inner = createScriptedRunner({
      turns: [{ events: [{ type: 'delta', at: 't', text: 'ran' }] }],
    })
    const gate = withObserveGate(inner, {
      rule: { id: 'r-auto', enabled: true, mode: 'auto' },
      autonomy: 'act',
      speculative: true,
    })
    await gate.runner.start(base)
    expect(gate.observed).toHaveLength(1)
  })

  it('forwards to the inner runner when the rule is auto and not speculative', async () => {
    const inner = createScriptedRunner({
      turns: [{ events: [{ type: 'delta', at: 't', text: 'ran' }] }],
    })
    const gate = withObserveGate(inner, {
      rule: { id: 'r-run', enabled: true, mode: 'auto' },
    })
    const handle = await gate.runner.start(base)
    const events = await collect(gate.runner.stream(handle))
    expect(gate.observed).toEqual([])
    expect(events.some(item => item.type === 'delta' && item.text === 'ran')).toBe(true)
  })
})
