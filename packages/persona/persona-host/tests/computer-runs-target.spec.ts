import { describe, expect, it } from 'vitest'
import { ComputerRuns, type ComputerRun, type ComputerRunsDeps } from '../src/computer-runs.ts'
import type { ComputerUseTarget } from '@deepseek-ai/dsh-persona-engine'

const TARGET: ComputerUseTarget = { windowHandle: '197382', processId: 9000, title: 'Persona Fixture W3-5' }
const OTHER_TARGET: ComputerUseTarget = { windowHandle: '888888', processId: 4444, title: 'Other Window' }

function makeDeps(overrides: Partial<ComputerRunsDeps> = {}) {
  const saved = new Map<string, ComputerRun>()
  let now = 1_000
  const aborted: string[] = []
  let observeSignalInAbort = false
  const runsBox: { value: ComputerRuns | undefined } = { value: undefined }

  const deps: ComputerRunsDeps = {
    now: () => now,
    thisComputerId: () => 'pc-1',
    homeOf: () => 'pc-1',
    access: () => ({ allow: true }),
    projectState: () => 'open',
    abort: (run) => {
      aborted.push(run.runId)
      if (runsBox.value?.signalOf(run.runId)?.aborted === true) observeSignalInAbort = true
    },
    store: {
      put: run => saved.set(run.runId, run),
      list: () => [...saved.values()],
    },
    ...overrides,
  }
  const runs = new ComputerRuns(deps)
  runsBox.value = runs
  return {
    runs,
    saved,
    aborted,
    sawAbortedSignalInAbort: () => observeSignalInAbort,
    advance: (ms: number) => { now += ms },
  }
}

const baseOpen = {
  projectId: 'proj-1',
  personaId: 'nina',
  ticketId: 't-1',
  requestEventId: 'ev-1',
  requestedBy: 'miguel',
  via: 'pc' as const,
  origin: 'person' as const,
}

describe('M9 ComputerRuns target window & AbortSignal by runId', () => {
  it('binds a valid target (HWND/PID) onto the ComputerRun and rejects invalid targets', () => {
    const { runs, saved } = makeDeps()
    const badHandle = runs.open({ ...baseOpen, target: { windowHandle: '   ', processId: 9000 } })
    expect(badHandle).toEqual({ ok: false, reason: 'no-target' })
    const badPid = runs.open({ ...baseOpen, target: { windowHandle: '197382', processId: 0 } })
    expect(badPid).toEqual({ ok: false, reason: 'no-target' })

    const opened = runs.open({ ...baseOpen, target: TARGET })
    expect(opened.ok).toBe(true)
    if (!opened.ok) throw new Error('expected ok')
    expect(opened.run.target).toEqual(TARGET)
    expect(saved.get(opened.run.runId)?.target).toEqual(TARGET)
  })

  it('refuses open() without target when requireTarget is enabled', () => {
    const { runs } = makeDeps({ requireTarget: true })
    expect(runs.open(baseOpen)).toEqual({ ok: false, reason: 'no-target' })
  })

  it('provides a live AbortSignal per runId and aborts it synchronously inside stop(runId)', () => {
    const { runs, aborted, sawAbortedSignalInAbort } = makeDeps()
    const opened = runs.open({ ...baseOpen, target: TARGET })
    if (!opened.ok) throw new Error('expected ok')
    const { runId } = opened.run

    const signal = runs.signalOf(runId)
    expect(signal).toBeDefined()
    expect(signal?.aborted).toBe(false)

    const stepped = runs.beforeStep(runId, 'computer_act', TARGET)
    expect(stepped.allow).toBe(true)
    expect(signal?.aborted).toBe(false)

    const stopped = runs.stop(runId)
    expect(stopped?.state).toBe('parando')
    expect(signal?.aborted).toBe(true)
    expect(aborted).toEqual([runId])
    expect(sawAbortedSignalInAbort()).toBe(true)

    expect(runs.beforeStep(runId)).toMatchObject({ allow: false, reason: 'run-stopped' })
  })

  it('aborts queued runs synchronously on stop(runId) and aborts live signals on interruptOnBoot', () => {
    const { runs } = makeDeps()
    const first = runs.open({ ...baseOpen, target: TARGET })
    const second = runs.open({ ...baseOpen, requestEventId: 'ev-2', target: TARGET })
    if (!first.ok || !second.ok) throw new Error('expected two runs')

    const s1 = runs.signalOf(first.run.runId)
    const s2 = runs.signalOf(second.run.runId)
    expect(s1?.aborted).toBe(false)
    expect(s2?.aborted).toBe(false)

    const cancelled = runs.stop(second.run.runId)
    expect(cancelled?.state).toBe('parada')
    expect(s2?.aborted).toBe(true)
    expect(s1?.aborted).toBe(false)

    runs.interruptOnBoot()
    expect(s1?.aborted).toBe(true)
  })

  it('fails closed and aborts the run signal when beforeStep sees a drifted window target', () => {
    const { runs } = makeDeps()
    const opened = runs.open({ ...baseOpen, target: TARGET })
    if (!opened.ok) throw new Error('expected ok')
    const signal = runs.signalOf(opened.run.runId)

    const verdict = runs.beforeStep(opened.run.runId, 'computer_act', OTHER_TARGET)
    expect(verdict.allow).toBe(false)
    if (verdict.allow) throw new Error('expected denied verdict')
    expect(verdict.reason).toBe('outside-window')
    expect(verdict.run?.state).toBe('falhou')
    expect(signal?.aborted).toBe(true)
  })

  it('refuses open() when targetVerdict denies (persona-app / forbidden-target / outside-window) or is missing with requireTarget', () => {
    const { runs, saved } = makeDeps({
      requireTarget: true,
      targetVerdict: target => (target.processId === 4100
        ? { ok: false, why: 'persona-app' }
        : target.processId === 5555
          ? { ok: false, why: 'forbidden-target' }
          : { ok: false, why: 'outside-window' }),
    })

    expect(runs.open({ ...baseOpen, target: { windowHandle: '100', processId: 4100 } })).toEqual({ ok: false, reason: 'persona-app' })
    expect(runs.open({ ...baseOpen, target: { windowHandle: '101', processId: 5555 } })).toEqual({ ok: false, reason: 'forbidden-target' })
    expect(runs.open({ ...baseOpen, target: OTHER_TARGET })).toEqual({ ok: false, reason: 'outside-window' })
    expect(saved.size).toBe(0)
    expect(runs.active()).toHaveLength(0)

    const noJudge = makeDeps({ requireTarget: true })
    expect(noJudge.runs.open({ ...baseOpen, target: TARGET })).toEqual({ ok: false, reason: 'no-target-judge' })
    expect(noJudge.saved.size).toBe(0)
  })

  it('closes run fail-closed and aborts signal when targetVerdict flips to deny before step 3', () => {
    let deny = false
    const { runs } = makeDeps({
      requireTarget: true,
      targetVerdict: () => (deny ? { ok: false, why: 'forbidden-target' } : { ok: true }),
    })
    const opened = runs.open({ ...baseOpen, target: TARGET })
    if (!opened.ok) throw new Error('expected ok')
    const signal = runs.signalOf(opened.run.runId)

    expect(runs.beforeStep(opened.run.runId, 'computer_act', TARGET).allow).toBe(true)
    expect(runs.beforeStep(opened.run.runId, 'computer_act', TARGET).allow).toBe(true)
    deny = true

    const step3 = runs.beforeStep(opened.run.runId, 'computer_act', TARGET)
    expect(step3.allow).toBe(false)
    if (step3.allow) throw new Error('expected denied verdict')
    expect(step3.reason).toBe('forbidden-target')
    expect(step3.run?.state).toBe('falhou')
    expect(signal?.aborted).toBe(true)
  })

  it('closes run as target-unverified when requireTarget is true and beforeStep receives no observedTarget', () => {
    const { runs } = makeDeps({
      requireTarget: true,
      targetVerdict: () => ({ ok: true }),
    })
    const opened = runs.open({ ...baseOpen, target: TARGET })
    if (!opened.ok) throw new Error('expected ok')
    const signal = runs.signalOf(opened.run.runId)

    const verdict = runs.beforeStep(opened.run.runId, 'computer_act')
    expect(verdict.allow).toBe(false)
    if (verdict.allow) throw new Error('expected denied verdict')
    expect(verdict.reason).toBe('target-unverified')
    expect(verdict.run?.state).toBe('falhou')
    expect(verdict.run?.line).toBe('Não consegui confirmar a janela; parei.')
    expect(signal?.aborted).toBe(true)
  })
})
