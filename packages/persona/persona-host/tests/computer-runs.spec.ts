import { describe, expect, it } from 'vitest'
import { ComputerRuns, type AccessDecision, type ComputerRun, type RunOrigin, type RunVia } from '../src/computer-runs.ts'

/** Marco M9: the life of a computer run (contract L1..L9). Fake ports and a fake clock; nothing here touches the mouse. */
interface Rig {
  readonly runs: ComputerRuns
  readonly clock: { ms: number }
  readonly world: { access: AccessDecision; home: string | undefined; load: 'open' | 'reserve' | 'full' }
  readonly aborted: ComputerRun[]
  readonly granted: ComputerRun[]
  readonly stored: Map<string, ComputerRun>
}

function rig(stored = new Map<string, ComputerRun>()): Rig {
  const clock = { ms: 1_000_000 }
  const world: Rig['world'] = { access: { allow: true }, home: 'pc-1', load: 'open' }
  const aborted: ComputerRun[] = []
  const granted: ComputerRun[] = []
  const runs = new ComputerRuns({
    now: () => clock.ms,
    thisComputerId: () => 'pc-1',
    homeOf: () => world.home,
    access: () => world.access,
    projectState: () => world.load,
    abort: (run) => { aborted.push(run) },
    store: { put: (run) => { stored.set(run.runId, run) }, list: () => [...stored.values()] },
    onGranted: (run) => { granted.push(run) },
  })
  return { runs, clock, world, aborted, granted, stored }
}

const ask: { projectId: string; personaId: string; ticketId: string; requestEventId: string; requestedBy: string; via: RunVia; origin: RunOrigin } = {
  projectId: 'p', personaId: 'bia', ticketId: 't1', requestEventId: 'm1', requestedBy: 'ana', via: 'pc', origin: 'person',
}

function started(r: Rig, over: Partial<typeof ask> = {}): ComputerRun {
  const opened = r.runs.open({ ...ask, ...over })
  if (!opened.ok) throw new Error(opened.reason)
  return opened.run
}

describe('ComputerRuns.open: only a person, only here, only if the rule allows it now', () => {
  it('the board, a routine, an initiative and a hand-off never start a run; the person does', () => {
    const r = rig()
    for (const origin of ['quadro', 'routine', 'initiative', 'handoff'] as const) {
      expect(r.runs.open({ ...ask, origin }), origin).toEqual({ ok: false, reason: 'computer-needs-person' })
    }
    expect(r.runs.active()).toEqual([])
    expect(started(r).state).toBe('preparando')
  })

  it('a persona that does not live on THIS computer is refused (a remote request is run here, never elsewhere), and the rule\'s reasons come through as they are', () => {
    const r = rig()
    r.world.home = 'pc-2'
    expect(r.runs.open(ask)).toEqual({ ok: false, reason: 'computer-not-here' })
    r.world.home = 'pc-1'
    r.world.access = { allow: false, reason: 'team-persona-on-personal-pc' }
    expect(r.runs.open(ask)).toEqual({ ok: false, reason: 'team-persona-on-personal-pc' })
    r.world.access = { allow: false, reason: 'unreadable' }
    expect(r.runs.open(ask)).toEqual({ ok: false, reason: 'unreadable' })
    expect(r.runs.active()).toEqual([])
  })
})

describe('ComputerRuns.beforeStep: the rule is asked again BEFORE EVERY STEP', () => {
  it('the persona moves to another computer in the middle: the next step is refused, the run ends, nothing acts after', () => {
    const r = rig()
    const run = started(r)
    expect(r.runs.beforeStep(run.runId)).toMatchObject({ allow: true, run: { state: 'rodando', step: 1 } })
    expect(r.runs.beforeStep(run.runId)).toMatchObject({ allow: true, run: { step: 2 } })
    r.world.home = 'pc-2'
    const refused = r.runs.beforeStep(run.runId)
    expect(refused).toMatchObject({ allow: false, reason: 'computer-not-here', run: { state: 'falhou', line: 'O computador mudou; parei.' } })
    expect(r.runs.beforeStep(run.runId)).toMatchObject({ allow: false, reason: 'run-stopped' })
  })

  it('the rule changing its mind (the owner took the permission away) ends the run with the rule\'s own reason', () => {
    const r = rig()
    const run = started(r)
    r.runs.beforeStep(run.runId)
    r.world.access = { allow: false, reason: 'computer-use-off' }
    expect(r.runs.beforeStep(run.runId)).toMatchObject({ allow: false, reason: 'computer-use-off', run: { state: 'falhou', line: 'A permissão mudou; parei.' } })
  })

  it('the project reaching 100% in the middle ends the run at the next step (it never counts a turn, it only reads the load)', () => {
    const r = rig()
    const run = started(r)
    r.runs.beforeStep(run.runId)
    r.world.load = 'full'
    expect(r.runs.beforeStep(run.runId)).toMatchObject({ allow: false, reason: 'project-full', run: { state: 'limite' } })
  })

  it('a step that types a credential never goes by the phone (the PC may)', () => {
    const phone = rig()
    const byPhone = started(phone, { via: 'phone' })
    expect(phone.runs.beforeStep(byPhone.runId, 'credentials')).toMatchObject({ allow: false, reason: 'pc-only' })
    const pc = rig()
    const atPc = started(pc)
    expect(pc.runs.beforeStep(atPc.runId, 'credentials')).toMatchObject({ allow: true })
  })
})

describe('ComputerRuns.stop: one synchronous door, honest about when it is stopped', () => {
  it('stop is `parando` AT ONCE, the next step is refused, the runner is aborted once, and only the host\'s confirmation makes it `parada`', () => {
    const r = rig()
    const run = started(r)
    r.runs.beforeStep(run.runId)
    expect(r.runs.stop(run.runId)).toMatchObject({ state: 'parando' })
    expect(r.aborted).toHaveLength(1)
    expect(r.runs.beforeStep(run.runId)).toMatchObject({ allow: false, reason: 'run-stopped' })
    expect(r.runs.get(run.runId)?.state, 'not stopped by guess').toBe('parando')
    expect(r.runs.actReturned(run.runId)).toMatchObject({ state: 'parada', line: 'Parada.' })
    expect(r.runs.stop(run.runId), 'idempotent').toMatchObject({ state: 'parada' })
    expect(r.aborted).toHaveLength(1)
  })

  it('a runner killed after the grace says the last step may already have gone out', () => {
    const r = rig()
    const run = started(r)
    r.runs.beforeStep(run.runId)
    r.runs.stop(run.runId)
    expect(r.runs.actReturned(run.runId, true)).toMatchObject({ state: 'parada', line: 'Parada; o último passo já tinha saído.' })
  })

  it('stop does not ask the load, the rule or the queue: it works with the project at 100% and with the rule refusing', () => {
    const r = rig()
    const run = started(r)
    r.runs.beforeStep(run.runId)
    r.world.load = 'full'
    r.world.access = { allow: false, reason: 'unreadable' }
    expect(r.runs.stop(run.runId)).toMatchObject({ state: 'parando' })
  })

  it('stopping a run that only waited cancels it without noise and gives nobody the computer', () => {
    const r = rig()
    const first = started(r)
    const second = started(r, { requestEventId: 'm2', ticketId: 't2' })
    expect(second.state).toBe('na-fila')
    expect(r.runs.stop(second.runId)).toMatchObject({ state: 'parada', line: 'Cancelada antes de começar.' })
    expect(r.granted).toEqual([])
    expect(r.runs.get(first.runId)?.state).toBe('preparando')
  })
})

describe('ComputerRuns: one computer, one persona at a time', () => {
  it('the second persona waits (`na-fila`) holding nothing, and gets the computer by itself when the first one ends', () => {
    const r = rig()
    const first = started(r)
    const second = started(r, { personaId: 'cai', requestEventId: 'm2', ticketId: 't2' })
    const third = started(r, { personaId: 'duda', requestEventId: 'm3', ticketId: 't3' })
    expect([second.state, third.state]).toEqual(['na-fila', 'na-fila'])
    expect(r.runs.beforeStep(second.runId)).toMatchObject({ allow: false, reason: 'run-not-running' })
    r.runs.finish(first.runId, 'concluida', 'Terminei.')
    expect(r.granted.map(run => run.runId)).toEqual([second.runId])
    expect(r.runs.get(second.runId)?.state).toBe('preparando')
    expect(r.runs.get(third.runId)?.state, 'FIFO: the third still waits').toBe('na-fila')
    r.runs.finish(second.runId, 'concluida', 'Terminei.')
    expect(r.granted.map(run => run.runId)).toEqual([second.runId, third.runId])
  })

  it('an approval card and a human takeover keep the computer for a while, then the run expires and lets go', () => {
    const r = rig()
    const first = started(r)
    const second = started(r, { personaId: 'cai', requestEventId: 'm2', ticketId: 't2' })
    r.runs.beforeStep(first.runId)
    r.runs.needsApproval(first.runId)
    expect(r.runs.get(first.runId)?.state).toBe('precisa-de-voce')
    expect(r.granted, 'the card holds the computer').toEqual([])
    r.clock.ms += 9 * 60_000
    expect(r.runs.sweep()).toEqual([])
    r.clock.ms += 2 * 60_000
    expect(r.runs.sweep().map(run => run.state)).toEqual(['expirou'])
    expect(r.granted.map(run => run.runId)).toEqual([second.runId])
  })
})

describe('ComputerRuns: pauses and who may give the run back', () => {
  it('the human took the mouse: paused at once, nothing acts, and ONLY the PC gives it back', () => {
    const r = rig()
    const run = started(r, { via: 'phone' })
    r.runs.beforeStep(run.runId)
    expect(r.runs.humanTookOver(run.runId)).toMatchObject({ state: 'pausada', paused: 'humano' })
    expect(r.runs.beforeStep(run.runId)).toMatchObject({ allow: false, reason: 'run-not-running' })
    expect(r.runs.resume(run.runId, 'phone', true)).toEqual({ ok: false, reason: 'pc-only' })
    expect(r.runs.resume(run.runId, 'pc')).toMatchObject({ ok: true, run: { state: 'rodando' } })
    expect(r.runs.get(run.runId)?.paused).toBeUndefined()
  })

  it('the leash: a run asked from the phone pauses itself when the device is gone; the phone may give it back ONLY with the device back, the PC always', () => {
    const r = rig()
    const run = started(r, { via: 'phone' })
    r.runs.beforeStep(run.runId)
    expect(r.runs.leashLost(run.runId)).toMatchObject({ state: 'pausada', paused: 'celular' })
    expect(r.runs.resume(run.runId, 'phone', false)).toEqual({ ok: false, reason: 'pc-only' })
    expect(r.runs.resume(run.runId, 'phone', true)).toMatchObject({ ok: true })
    const pcRig = rig()
    const atPc = started(pcRig)
    expect(pcRig.runs.leashLost(atPc.runId), 'a run asked at the PC has no leash').toMatchObject({ state: 'preparando' })
  })
})

describe('ComputerRuns: a restart never goes on by itself', () => {
  it('every live run becomes `interrompida` with the honest line; nothing is granted; the computer is free for a new request', () => {
    const stored = new Map<string, ComputerRun>()
    const r = rig(stored)
    const run = started(r)
    started(r, { personaId: 'cai', requestEventId: 'm2', ticketId: 't2' })
    r.runs.beforeStep(run.runId)
    const after = rig(stored) // the host opened again on the same file
    const interrupted = after.runs.interruptOnBoot()
    expect(interrupted.map(item => item.state)).toEqual(['interrompida', 'interrompida'])
    expect(interrupted[0]?.line).toBe('O app fechou no meio; não continuei sozinha. Peça de novo.')
    expect(after.granted).toEqual([])
    expect(after.runs.active()).toEqual([])
    expect(after.runs.beforeStep(run.runId)).toMatchObject({ allow: false, reason: 'run-stopped' })
    expect(after.runs.open({ ...ask, requestEventId: 'm9', ticketId: 't9' })).toMatchObject({ ok: true, run: { state: 'preparando' } })
  })

  it('byTicket returns active run first, else most recent terminal run for that ticket', () => {
    const r = rig()
    expect(r.runs.byTicket('t1')).toBeUndefined()
    const first = started(r, { ticketId: 't1', requestEventId: 'm1' })
    expect(r.runs.byTicket('t1')?.runId).toBe(first.runId)
    r.runs.finish(first.runId, 'concluida', 'Feito')
    expect(r.runs.byTicket('t1')).toMatchObject({ runId: first.runId, state: 'concluida' })
    const second = started(r, { ticketId: 't1', requestEventId: 'm2' })
    expect(r.runs.byTicket('t1')).toMatchObject({ runId: second.runId, state: 'preparando' })
    r.runs.stop(second.runId)
    expect(r.runs.byTicket('t1')).toMatchObject({ runId: second.runId, state: 'parando' })
    r.runs.actReturned(second.runId)
    expect(r.runs.byTicket('t1')).toMatchObject({ runId: second.runId, state: 'parada' })
  })
})
