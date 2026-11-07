import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { ProactivityRepos, RoutineRepos } from '@deepseek-ai/dsh-persona-store'
import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { ProactivityHost } from '../src/proactivity.ts'
import { createProactivityScheduler } from '../src/proactivity-wire.ts'
import { ROUTINE_SPEC_KIND } from '../src/proactivity-scheduler.ts'
import { RemoteFault } from '../src/remote-guard.ts'
import { TeamStateBook } from '../src/team-state.ts'
import { bindHostFile, it } from './host-harness.ts'

/** IV-9: create / edit / delete a Routine without a cron string (contracts/routine-remotes.md). */
const { host } = bindHostFile()
const scope = { workspaceId: 'ws', projectId: 'pp' }
const BASE = {
  ...scope, name: 'Resumo do dia', rrule: 'FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0', timeZone: 'America/Sao_Paulo',
  catchUp: 'run_once' as const, silenceStart: '', silenceEnd: '',
}

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createMember({ id: 'gus', workspaceId: 'ws', projectId: 'pp', displayName: 'Gus', handle: 'gus', role: 'guest' })
  h.createProject({ id: 'team', workspaceId: 'ws', name: 'Time', description: '' })
  for (const [id, project] of [['p1', 'pp'], ['p2', 'pp'], ['px', 'team']] as const) {
    h.createPersona({
      id, workspaceId: 'ws', projectId: project, name: id === 'p1' ? 'Bento' : id === 'p2' ? 'Iris' : 'Zeca', title: 'Engenharia',
      description: 'Implementa.', personality: 'Direto.', instructions: 'Prove.',
      avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
    })
  }
  h.sessionMemberId = 'ana'
  // creating a persona also creates the routine the team keeps for it (`initiative:<id>`); these tests start from none
  h.store.db.exec('DELETE FROM routine_run')
  h.store.db.exec('DELETE FROM routine')
}

function fault(run: () => unknown): RemoteFault {
  try {
    run()
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(RemoteFault)
    return error as RemoteFault
  }
  throw new Error('expected a RemoteFault')
}

it('the three routine writes are Remotes', () => {
  const names = new Set(remoteMethods(host()).map(item => item.method))
  for (const name of ['createRoutine', 'updateRoutine', 'deleteRoutine', 'pauseRoutine', 'listRoutines']) expect(names.has(name), name).toBe(true)
})

it('createRoutine keeps “O que fazer” and “Quem faz” and the views say them back in plain words', () => {
  const h = host()
  seed(h)
  const created = h.createRoutine({ ...BASE, id: 'r1', prompt: '  Resuma o que a equipe entregou ontem.  ', ownerPersonaId: 'p2' })
  expect(created).toMatchObject({
    id: 'r1', projectId: 'pp', name: 'Resumo do dia', prompt: 'Resuma o que a equipe entregou ontem.', ownerPersonaId: 'p2',
    paused: false, humanSchedule: 'De segunda a sexta, às 9h',
  })
  expect(Number.isNaN(Date.parse(created.nextRunAt))).toBe(false)
  // the scheduler reads exactly this document
  expect(h.screens.screens.get('pp', ROUTINE_SPEC_KIND, 'r1')).toEqual({ personaId: 'p2', prompt: 'Resuma o que a equipe entregou ontem.' })
  expect(h.listRoutines(scope)[0]).toEqual(created)
  expect(h.listRoutineSchedule(scope)[0]).toMatchObject({ id: 'r1', prompt: created.prompt, ownerPersonaId: 'p2', humanSchedule: created.humanSchedule, silenceStart: '', runs: [] })
  // Coordenação decides: no owner ⇒ no ownerPersonaId on the view
  const open = h.createRoutine({ ...BASE, id: 'r2', name: 'Sem dono', prompt: 'Veja os pedidos parados.' })
  expect(open.ownerPersonaId).toBeUndefined()
  expect(h.screens.screens.get('pp', ROUTINE_SPEC_KIND, 'r2')).toEqual({ prompt: 'Veja os pedidos parados.' })
  // legacy callers (no prompt) keep working: no spec document, the scheduler uses its default sentence
  const legacy = h.createRoutine({ ...BASE, id: 'r3', name: 'Antiga' })
  expect(legacy.prompt).toBe('')
  expect(h.screens.screens.get('pp', ROUTINE_SPEC_KIND, 'r3')).toBeUndefined()
})

it('createRoutine refuses bad input with a clear pt-BR line and writes nothing', () => {
  const h = host()
  seed(h)
  const cases: Array<[string, Record<string, unknown>, RegExp]> = [
    ['blank name', { name: '   ' }, /nome/i],
    ['name too long', { name: 'n'.repeat(121) }, /nome/i],
    ['cron the engine cannot read', { rrule: 'FREQ=YEARLY' }, /horário/i],
    ['gibberish rule', { rrule: 'amanhã cedo' }, /horário/i],
    ['unknown time zone', { timeZone: 'Marte/Olimpo' }, /fuso/i],
    ['half a quiet window', { silenceStart: '22:00', silenceEnd: '' }, /silêncio/i],
    ['quiet window not HH:MM', { silenceStart: '10pm', silenceEnd: '07:00' }, /silêncio/i],
    ['catch-up out of the list', { catchUp: 'always' }, /perdidas/i],
    ['blank request', { prompt: '   ' }, /o que a rotina/i],
    ['request too long', { prompt: 'x'.repeat(2001) }, /pedido/i],
    ['owner from another project', { prompt: 'Faça.', ownerPersonaId: 'px' }, /equipe/i],
    ['owner that does not exist', { prompt: 'Faça.', ownerPersonaId: 'ninguem' }, /equipe/i],
  ]
  for (const [label, patch, message] of cases) {
    const failure = fault(() => h.createRoutine({ ...BASE, id: 'rx', prompt: 'Faça.', ...patch } as never))
    expect(failure.code, label).toBe('invalid-payload')
    expect(failure.message, label).toMatch(message)
  }
  expect(h.listRoutines(scope)).toEqual([])
  expect(h.screens.screens.get('pp', ROUTINE_SPEC_KIND, 'rx')).toBeUndefined()
  // the same id twice is a conflict, and the first routine is untouched
  h.createRoutine({ ...BASE, id: 'dup', prompt: 'Primeira.' })
  expect(fault(() => h.createRoutine({ ...BASE, id: 'dup', prompt: 'Segunda.' })).code).toBe('conflict')
  expect(h.listRoutines(scope).find(item => item.id === 'dup')?.prompt).toBe('Primeira.')
})

it('updateRoutine changes only what was sent; a new schedule cancels the queued runs; an invalid change changes nothing', () => {
  const h = host()
  seed(h)
  h.createRoutine({ ...BASE, id: 'r1', prompt: 'Resuma o dia.', ownerPersonaId: 'p1', silenceStart: '22:00', silenceEnd: '07:00' })
  h.scheduleRoutine({ ...scope, id: 'r1', runId: 'run-a', scheduledFor: '2030-01-01T12:00:00.000Z' })

  const renamed = h.updateRoutine({ ...scope, id: 'r1', name: '  Resumo   semanal ' })
  expect(renamed).toMatchObject({ name: 'Resumo semanal', prompt: 'Resuma o dia.', ownerPersonaId: 'p1', rrule: BASE.rrule })
  expect(h.routines.listRuns('r1')[0]?.status).toBe('pending') // name only: the queue is kept

  const retimed = h.updateRoutine({ ...scope, id: 'r1', rrule: 'FREQ=WEEKLY;BYDAY=MO,WE;BYHOUR=18;BYMINUTE=30', prompt: 'Resuma a semana.', ownerPersonaId: 'p2' })
  expect(retimed).toMatchObject({ humanSchedule: 'Seg e qua, às 18h30', prompt: 'Resuma a semana.', ownerPersonaId: 'p2' })
  expect(h.routines.listRuns('r1')[0]?.status).toBe('cancelled')
  expect(h.screens.screens.get('pp', ROUTINE_SPEC_KIND, 'r1')).toEqual({ personaId: 'p2', prompt: 'Resuma a semana.' })

  const before = h.listRoutineSchedule(scope)
  for (const patch of [{ rrule: 'FREQ=YEARLY' }, { timeZone: 'Marte/Olimpo' }, { prompt: ' ' }, { ownerPersonaId: 'px' }, { name: ' ' }, { silenceStart: '' }]) {
    expect(fault(() => h.updateRoutine({ ...scope, id: 'r1', ...patch })).code, JSON.stringify(patch)).toBe('invalid-payload')
  }
  expect(h.listRoutineSchedule(scope)).toEqual(before)

  // clearing: '' hands the routine back to the Coordenação and drops the quiet window (both ends together)
  const cleared = h.updateRoutine({ ...scope, id: 'r1', ownerPersonaId: '', silenceStart: '', silenceEnd: '', timeZone: 'UTC', catchUp: 'skip' })
  expect(cleared.ownerPersonaId).toBeUndefined()
  expect(cleared).toMatchObject({ timeZone: 'UTC', catchUp: 'skip' })
  expect(h.listRoutineSchedule(scope)[0]).toMatchObject({ silenceStart: '', silenceEnd: '' })
  expect(h.screens.screens.get('pp', ROUTINE_SPEC_KIND, 'r1')).toEqual({ prompt: 'Resuma a semana.' })
})

it('a routine of another project is not found, never edited, paused or deleted through the wrong project', () => {
  const h = host()
  seed(h)
  h.createRoutine({ ...BASE, id: 'r1', prompt: 'Faça.' })
  const wrong = { workspaceId: 'ws', projectId: 'team' }
  expect(fault(() => h.updateRoutine({ ...wrong, id: 'r1', name: 'Invadida' })).code).toBe('not-found')
  expect(fault(() => h.deleteRoutine({ ...wrong, id: 'r1' })).code).toBe('not-found')
  expect(fault(() => h.pauseRoutine({ ...wrong, id: 'r1', paused: true })).code).toBe('not-found')
  expect(fault(() => h.updateRoutine({ ...scope, id: 'nao-existe', name: 'x' })).code).toBe('not-found')
  expect(h.listRoutines(scope)[0]).toMatchObject({ name: 'Resumo do dia', paused: false })
})

it('deleteRoutine removes the routine, its spec, its runs and its governance charge; the same id can come back (Desfazer)', () => {
  const h = host()
  seed(h)
  const original = h.createRoutine({ ...BASE, id: 'r1', prompt: 'Resuma.', ownerPersonaId: 'p1', silenceStart: '22:00', silenceEnd: '07:00' })
  h.scheduleRoutine({ ...scope, id: 'r1', runId: 'run-a', scheduledFor: '2030-01-01T12:00:00.000Z' })
  h.governance.gov.putRoutineCharge({ routineId: 'r1', workspaceId: 'ws', title: 'Resumo', requiresApproval: false })
  h.governance.gov.addDelegate('ws', 'r1')

  expect(h.deleteRoutine({ ...scope, id: 'r1' })).toBe(true)
  expect(h.listRoutines(scope)).toEqual([])
  expect(h.routines.listRuns('r1')).toEqual([])
  expect(h.screens.screens.get('pp', ROUTINE_SPEC_KIND, 'r1')).toBeUndefined()
  expect(h.governance.gov.listRoutineCharges('ws').some(row => row.routineId === 'r1')).toBe(false)
  expect(h.governance.gov.listDelegates('ws')).not.toContain('r1')
  expect(fault(() => h.deleteRoutine({ ...scope, id: 'r1' })).code).toBe('not-found')

  const restored = h.createRoutine({
    ...BASE, id: 'r1', name: original.name, prompt: original.prompt, ownerPersonaId: 'p1', rrule: original.rrule,
    timeZone: original.timeZone, catchUp: original.catchUp, silenceStart: '22:00', silenceEnd: '07:00',
  })
  expect(restored).toMatchObject({ id: 'r1', name: original.name, prompt: original.prompt, ownerPersonaId: 'p1', rrule: original.rrule })
})

it('the routines the team keeps for each persona are paused, never deleted', () => {
  const h = host()
  seed(h)
  h.routines.create({ id: 'initiative:p1', workspaceId: 'ws', projectId: 'pp', name: 'Iniciativa Bento', rrule: 'FREQ=HOURLY', timeZone: 'UTC', catchUp: 'skip' })
  h.createRoutine({ ...BASE, id: 'r1', prompt: 'Faça.' })
  expect(h.listRoutines(scope).map(item => [item.id, item.system])).toEqual([['r1', undefined], ['initiative:p1', true]])
  const failure = fault(() => h.deleteRoutine({ ...scope, id: 'initiative:p1' }))
  expect(failure.code).toBe('invalid-payload')
  expect(failure.message).toMatch(/Pause/)
  expect(h.pauseRoutine({ ...scope, id: 'initiative:p1', paused: true }).paused).toBe(true)
  expect(h.routines.get('initiative:p1')).toBeDefined()
})

it('only someone who can write in the project edits routines: a guest and a persona are refused, nothing changes', () => {
  const h = host()
  seed(h)
  h.createRoutine({ ...BASE, id: 'r1', prompt: 'Faça.' })
  for (const who of ['gus', 'p1']) {
    h.sessionMemberId = who
    expect(() => h.createRoutine({ ...BASE, id: 'r9', prompt: 'x' }), who).toThrow(/forbidden/u)
    expect(() => h.updateRoutine({ ...scope, id: 'r1', name: 'x' }), who).toThrow(/forbidden/u)
    expect(() => h.deleteRoutine({ ...scope, id: 'r1' }), who).toThrow(/forbidden/u)
    expect(() => h.pauseRoutine({ ...scope, id: 'r1', paused: true }), who).toThrow(/forbidden/u)
  }
  h.sessionMemberId = 'ana'
  expect(h.listRoutines(scope).map(item => item.id)).toEqual(['r1'])
  expect(h.listRoutines(scope)[0]?.paused).toBe(false)
})

it('a routine made by the Remote runs when due: the prompt goes to its owner as a real Ticket, once', async () => {
  const h = host()
  const start = Date.now()
  const clock = { ms: start }
  const nowIso = (): string => new Date(clock.ms).toISOString()
  seed(h)
  h.orchestration.now = nowIso
  h.createRoutine({ ...BASE, id: 'r1', rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0', timeZone: 'UTC', prompt: 'Resuma o que a equipe entregou ontem.', ownerPersonaId: 'p2' })
  const routines = new RoutineRepos(h.store, nowIso)
  const proactivity = new ProactivityHost(h.product, routines, new ProactivityRepos(h.store, nowIso), h.orchestration, nowIso)
  const scheduler = createProactivityScheduler({
    product: h.product, events: h.events, routines, proactivity, screens: h.screens.screens, orchestration: h.orchestration,
    boards: h.boards, teamState: new TeamStateBook(h.screens.screens, routines, nowIso), governance: h.governance,
    draftFiles: h.draftFiles, workingControl: h.workingControl,
  }, { nowMs: () => clock.ms, cycleMs: 0 })
  clock.ms += 26 * 3_600_000 // a 09:00 UTC has surely passed
  await scheduler.cycle()
  await scheduler.whenIdle()
  await h.orchestration.flush('pp')
  const tickets = h.orchestration.runtime('pp').repo.tickets.list()
  expect(tickets).toHaveLength(1)
  expect(tickets[0]?.execution?.name).toBe('Iris')
  const lines = h.listMessages({ ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events.map(item => item.body)
  // EQUIPE-REAL §0 (R5): the routine's request is a trigger, not a line of the thread; the Task above is the proof it ran.
  expect(lines).not.toContain('@Iris Resuma o que a equipe entregou ontem.')
  expect(h.events.listProject('pp').some(event => event.body === '@Iris Resuma o que a equipe entregou ontem.' && event.actorId.startsWith('routine:'))).toBe(true)
  await scheduler.cycle()
  await scheduler.whenIdle()
  await h.orchestration.flush('pp')
  expect(h.orchestration.runtime('pp').repo.tickets.list()).toHaveLength(1)
})
