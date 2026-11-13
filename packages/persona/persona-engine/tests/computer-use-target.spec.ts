import { describe, expect, it } from 'vitest'
import {
  assertComputerUseTarget,
  createMemorySharedControl,
  fakeObservePort,
  fakePermissionPort,
  runComputerUse,
  type ComputerAction,
  type ComputerUsePlan,
  type ComputerUseStep,
  type ComputerUseTarget,
  type DesktopActPort,
  type DesktopObservePort,
  type DesktopPortContext,
  type ScreenObservation,
} from '../src/computer-use.ts'

const FIXTURE_TARGET: ComputerUseTarget = {
  windowHandle: '197382',
  processId: 9000,
  title: 'Persona Fixture W3-5',
}

const OTHER_TARGET: ComputerUseTarget = {
  windowHandle: '999999',
  processId: 7777,
  title: 'Another App',
}

function makeObs(atMs: number, name = 'Salvo!', target?: ComputerUseTarget): ScreenObservation {
  return {
    atMs,
    captureRef: `file://local/obs-${String(atMs)}.png`,
    ...(target === undefined ? {} : { target }),
    tree: {
      id: 'root',
      role: 'window',
      name: 'Persona Fixture W3-5',
      children: [{ id: 'status', role: 'status', name }],
    },
  }
}

function makeStep(id = 's1'): ComputerUseStep {
  return {
    id,
    intent: 'Click Salvar button',
    action: { kind: 'click', target: 'Salvar', x: 100, y: 120 },
    expectation: {
      after: 'aparece Salvo!',
      nameIncludes: 'Salvo!',
      role: 'status',
    },
  }
}

function makePlan(steps: readonly ComputerUseStep[], target?: ComputerUseTarget): ComputerUsePlan {
  return {
    goal: 'Save fixture state',
    personaId: 'nina',
    steps,
    ...(target === undefined ? {} : { target }),
  }
}

describe('M9 computer-use target window & AbortSignal contract', () => {
  it('propagates target (HWND/PID) and AbortSignal to every observe() and act() call', async () => {
    const controller = new AbortController()
    const seenObserveContexts: Array<DesktopPortContext | undefined> = []
    const seenActContexts: Array<DesktopPortContext | undefined> = []
    let obsIndex = 0
    const observe: DesktopObservePort = {
      observe(context) {
        seenObserveContexts.push(context)
        obsIndex += 1
        return Promise.resolve(obsIndex === 1 ? makeObs(10, 'Inicial') : makeObs(20, 'Salvo!'))
      },
    }
    const act: DesktopActPort = {
      act(_action: ComputerAction, context) {
        seenActContexts.push(context)
        return Promise.resolve({ ok: true, detail: 'clicked' })
      },
    }

    const report = await runComputerUse({
      plan: makePlan([makeStep()]),
      target: FIXTURE_TARGET,
      signal: controller.signal,
      observe,
      act,
      permission: fakePermissionPort('allow'),
      control: createMemorySharedControl(),
      now: () => 100,
    })

    expect(report.status).toBe('done')
    expect(report.target).toEqual(FIXTURE_TARGET)
    expect(seenObserveContexts).toHaveLength(2)
    expect(seenActContexts).toHaveLength(1)
    for (const ctx of [...seenObserveContexts, ...seenActContexts]) {
      expect(ctx?.target).toEqual(FIXTURE_TARGET)
      expect(ctx?.signal).toBe(controller.signal)
    }
  })

  it('reads target from plan.target when input.target is omitted', async () => {
    const seenTargets: Array<ComputerUseTarget | undefined> = []
    const report = await runComputerUse({
      plan: makePlan([makeStep()], FIXTURE_TARGET),
      observe: fakeObservePort([makeObs(10, 'Inicial'), makeObs(20, 'Salvo!')]),
      act: {
        act(_action, context) {
          seenTargets.push(context?.target)
          return Promise.resolve({ ok: true, detail: 'ok' })
        },
      },
      permission: fakePermissionPort('allow'),
      control: createMemorySharedControl(),
      now: () => 10,
    })

    expect(report.status).toBe('done')
    expect(report.target).toEqual(FIXTURE_TARGET)
    expect(seenTargets).toEqual([FIXTURE_TARGET])
  })

  it('refuses fail-closed (no-target) before cards/observe/act when requireTarget is true and no target is bound', async () => {
    let permissionCalls = 0
    let observeCalls = 0
    let actCalls = 0

    const report = await runComputerUse({
      plan: makePlan([makeStep()]),
      requireTarget: true,
      observe: {
        observe() {
          observeCalls += 1
          return Promise.resolve(makeObs(1))
        },
      },
      act: {
        act() {
          actCalls += 1
          return Promise.resolve({ ok: true, detail: 'ok' })
        },
      },
      permission: {
        request() {
          permissionCalls += 1
          return Promise.resolve({ decision: 'allow' })
        },
      },
      control: createMemorySharedControl(),
      now: () => 50,
    })

    expect(report.status).toBe('denied')
    expect(report.message).toBe('target:no-target')
    expect(report.replay.at(-1)).toMatchObject({ result: 'denied', detail: 'target:no-target', did: { kind: 'none' } })
    expect(permissionCalls).toBe(0)
    expect(observeCalls).toBe(0)
    expect(actCalls).toBe(0)
  })

  it('refuses invalid explicit targets (blank HWND or non-positive PID)', async () => {
    expect(() => assertComputerUseTarget({ windowHandle: '   ', processId: 9000 })).toThrow(/INVALID_COMPUTER_USE/)
    expect(() => assertComputerUseTarget({ windowHandle: '197382', processId: 0 })).toThrow(/INVALID_COMPUTER_USE/)

    let actCalls = 0
    const badBlank = await runComputerUse({
      plan: makePlan([makeStep()]),
      target: { windowHandle: '  ', processId: 9000 },
      observe: fakeObservePort([makeObs(1)]),
      act: {
        act() {
          actCalls += 1
          return Promise.resolve({ ok: true, detail: 'ok' })
        },
      },
      permission: fakePermissionPort('allow'),
      control: createMemorySharedControl(),
      now: () => 1,
    })
    expect(badBlank.status).toBe('denied')
    expect(badBlank.message).toBe('target:no-target')

    const badPid = await runComputerUse({
      plan: makePlan([makeStep()]),
      target: { windowHandle: '197382', processId: -5 },
      observe: fakeObservePort([makeObs(1)]),
      act: {
        act() {
          actCalls += 1
          return Promise.resolve({ ok: true, detail: 'ok' })
        },
      },
      permission: fakePermissionPort('allow'),
      control: createMemorySharedControl(),
      now: () => 1,
    })
    expect(badPid.status).toBe('denied')
    expect(badPid.message).toBe('target:no-target')
    expect(actCalls).toBe(0)
  })

  it('refuses before acting when input.target disagrees with plan.target', async () => {
    let actCalls = 0
    const report = await runComputerUse({
      plan: makePlan([makeStep()], FIXTURE_TARGET),
      target: OTHER_TARGET,
      observe: fakeObservePort([makeObs(1)]),
      act: {
        act() {
          actCalls += 1
          return Promise.resolve({ ok: true, detail: 'ok' })
        },
      },
      permission: fakePermissionPort('allow'),
      control: createMemorySharedControl(),
      now: () => 1,
    })

    expect(report.status).toBe('denied')
    expect(report.message).toBe('target:mismatch')
    expect(actCalls).toBe(0)
  })

  it('refuses before act when observation reports a different window than the bound target', async () => {
    let actCalls = 0
    const report = await runComputerUse({
      plan: makePlan([makeStep()]),
      target: FIXTURE_TARGET,
      observe: fakeObservePort([makeObs(10, 'Inicial', OTHER_TARGET)]),
      act: {
        act() {
          actCalls += 1
          return Promise.resolve({ ok: true, detail: 'ok' })
        },
      },
      permission: fakePermissionPort('allow'),
      control: createMemorySharedControl(),
      now: () => 10,
    })

    expect(report.status).toBe('denied')
    expect(report.message).toBe('target:outside-window')
    expect(actCalls).toBe(0)
  })

  it('does not retry when act() reports an executor scope refusal (persona-app / forbidden-target / outside-window / no-target)', async () => {
    let actCalls = 0
    const report = await runComputerUse({
      plan: makePlan([makeStep('s1'), makeStep('s2')]),
      target: FIXTURE_TARGET,
      observe: fakeObservePort([makeObs(1, 'Inicial')]),
      act: {
        act() {
          actCalls += 1
          return Promise.resolve({ ok: false, detail: 'scope:forbidden-target' })
        },
      },
      permission: fakePermissionPort('allow'),
      control: createMemorySharedControl(),
      now: () => 1,
      limits: { maxSteps: 4, maxAttemptsPerStep: 3, maxMs: 10_000, maxBudgetTokens: 100 },
    })

    expect(actCalls).toBe(1)
    expect(report.status).toBe('denied')
    expect(report.message).toBe('scope:forbidden-target')
    expect(report.replay.at(-1)).toMatchObject({ stepId: 's1', attempt: 1, result: 'denied', detail: 'scope:forbidden-target' })
  })

  it('stops cleanly without observe/act when signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    let permissionCalls = 0
    let observeCalls = 0
    let actCalls = 0

    const report = await runComputerUse({
      plan: makePlan([makeStep()]),
      target: FIXTURE_TARGET,
      signal: controller.signal,
      observe: {
        observe() {
          observeCalls += 1
          return Promise.resolve(makeObs(1))
        },
      },
      act: {
        act() {
          actCalls += 1
          return Promise.resolve({ ok: true, detail: 'ok' })
        },
      },
      permission: {
        request() {
          permissionCalls += 1
          return Promise.resolve({ decision: 'allow' })
        },
      },
      control: createMemorySharedControl(),
      now: () => 5,
    })

    expect(report.status).toBe('stopped')
    expect(report.replay.at(-1)).toMatchObject({ result: 'stopped', did: { kind: 'none' } })
    expect(permissionCalls).toBe(0)
    expect(observeCalls).toBe(0)
    expect(actCalls).toBe(0)
  })

  it('stops without observe/act when signal aborts while waiting for permission approval', async () => {
    const controller = new AbortController()
    let observeCalls = 0
    let actCalls = 0

    const report = await runComputerUse({
      plan: makePlan([makeStep()]),
      target: FIXTURE_TARGET,
      signal: controller.signal,
      observe: {
        observe() {
          observeCalls += 1
          return Promise.resolve(makeObs(1))
        },
      },
      act: {
        act() {
          actCalls += 1
          return Promise.resolve({ ok: true, detail: 'ok' })
        },
      },
      permission: {
        request() {
          controller.abort()
          return Promise.resolve({ decision: 'allow' })
        },
      },
      control: createMemorySharedControl(),
      now: () => 5,
    })

    expect(report.status).toBe('stopped')
    expect(observeCalls).toBe(0)
    expect(actCalls).toBe(0)
  })

  it('stops right after in-flight act when signal aborts mid-action (no verify observe or step 2)', async () => {
    const controller = new AbortController()
    let observeCalls = 0
    let actCalls = 0

    const report = await runComputerUse({
      plan: makePlan([makeStep('s1'), makeStep('s2')]),
      target: FIXTURE_TARGET,
      signal: controller.signal,
      observe: {
        observe() {
          observeCalls += 1
          return Promise.resolve(makeObs(1, 'Inicial'))
        },
      },
      act: {
        act(_action, context) {
          actCalls += 1
          controller.abort()
          expect(context?.signal?.aborted).toBe(true)
          return Promise.resolve({ ok: false, detail: 'aborted' })
        },
      },
      permission: fakePermissionPort('allow'),
      control: createMemorySharedControl(),
      now: () => 10,
    })

    expect(actCalls).toBe(1)
    expect(observeCalls).toBe(1)
    expect(report.status).toBe('stopped')
    expect(report.stepsVerified).toBe(0)
    expect(report.replay.at(-1)).toMatchObject({ stepId: 's1', result: 'stopped', did: makeStep('s1').action })
  })

  it('refuses fail-closed (target:unverified) before acting when requireTarget is true and observe omits target', async () => {
    let actCalls = 0
    const report = await runComputerUse({
      plan: makePlan([makeStep()]),
      target: FIXTURE_TARGET,
      requireTarget: true,
      observe: fakeObservePort([makeObs(10, 'Inicial')]),
      act: {
        act() {
          actCalls += 1
          return Promise.resolve({ ok: true, detail: 'ok' })
        },
      },
      permission: fakePermissionPort('allow'),
      control: createMemorySharedControl(),
      now: () => 10,
    })

    expect(report.status).toBe('denied')
    expect(report.message).toBe('target:unverified')
    expect(report.replay.at(-1)).toMatchObject({ result: 'denied', detail: 'target:unverified', did: { kind: 'none' } })
    expect(actCalls).toBe(0)
  })
})
