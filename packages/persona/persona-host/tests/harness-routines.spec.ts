import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { ROUTINES_CREATED_PER_DAY, RoutinePorts, type HarnessIdentity, type HarnessResult } from '../src/harness-routines.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

/** HT-4 (contracts/harness-tools.md §2-D): the persona creates, edits and pauses Routines; the person's request authorizes the verb. */

function setup(): { h: PersonaHost; ports: RoutinePorts } {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'nina', name: 'Nina', title: 'Pesquisa' },
    { id: 'bento', name: 'Bento', title: 'Engenharia' },
  ])
  h.store.db.exec('DELETE FROM routine_run')
  h.store.db.exec('DELETE FROM routine')
  let counter = 0
  const ports = new RoutinePorts({
    product: h.product, routines: h.routines, screens: h.screens.screens,
    now: () => h.orchestration.now(), newId: () => `rt-${String((counter += 1))}`,
  })
  return { h, ports }
}

let call = 0
const nina = (extra: Partial<HarnessIdentity> = {}): HarnessIdentity => ({
  ...SCOPE, personaId: 'nina', initiator: 'person-request', requestId: 'm1', autonomy: 'propose', callId: `c${String((call += 1))}`, ...extra,
})

const weekdays = { frequency: 'weekdays', time: '09:00' } as const
const create = (ports: RoutinePorts, who = nina(), name = 'Resumo do dia') => ports.create(who, { name, prompt: 'Resuma o que a equipe entregou ontem.', schedule: weekdays, timeZone: 'America/Sao_Paulo' })

function ok(result: HarnessResult) {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.message}`)
  return result
}

it('the person asked: the persona creates a routine owned by HER, with the schedule in words, and the activity says how to undo it', () => {
  const { h, ports } = setup()
  const made = ok(create(ports))
  expect(made.routine).toMatchObject({ id: 'rt-1', name: 'Resumo do dia', ownerPersonaId: 'nina', humanSchedule: 'De segunda a sexta, às 9h', catchUp: 'skip', paused: false })
  expect(made.activity).toMatchObject({
    verb: 'routine_create', target: { kind: 'routine', id: 'rt-1', title: 'Resumo do dia' }, initiator: 'person-request', requestId: 'm1',
    status: 'done', undoable: true, undo: { remote: 'deleteRoutine', request: { ...SCOPE, id: 'rt-1' } },
  })
  expect(h.listRoutines(SCOPE).map(row => row.id)).toEqual(['rt-1'])
  // the undo the UI would run
  expect(h.deleteRoutine({ ...SCOPE, id: 'rt-1' })).toBe(true)
  expect(h.listRoutines(SCOPE)).toEqual([])
})

it('the same tool call twice does the action once', () => {
  const { h, ports } = setup()
  const who = nina()
  const first = create(ports, who)
  const second = create(ports, who)
  expect(second).toEqual(first)
  expect(h.listRoutines(SCOPE)).toHaveLength(1)
})

it('update and pause keep the routine hers, record before → after, and the undo restores it', () => {
  const { h, ports } = setup()
  ok(create(ports))
  const edited = ok(ports.update(nina(), { id: 'rt-1', name: 'Resumo semanal', schedule: { frequency: 'weekly', days: [5], time: '17:00' } }))
  expect(edited.routine).toMatchObject({ name: 'Resumo semanal', humanSchedule: 'Toda sexta, às 17h' })
  expect(edited.activity).toMatchObject({ verb: 'routine_update', before: 'Resumo do dia', after: 'Resumo semanal', undo: { remote: 'updateRoutine', request: { name: 'Resumo do dia', rrule: expect.stringContaining('BYDAY=MO,TU,WE,TH,FR') } } })
  // the UI's undo is the Remote with the saved `before`
  const back = h.updateRoutine(edited.activity.undo.request as never)
  expect(back).toMatchObject({ name: 'Resumo do dia', humanSchedule: 'De segunda a sexta, às 9h', prompt: 'Resuma o que a equipe entregou ontem.', ownerPersonaId: 'nina' })

  const paused = ok(ports.pause(nina(), { id: 'rt-1', paused: true }))
  expect(paused.routine.paused).toBe(true)
  expect(paused.activity).toMatchObject({ verb: 'routine_pause', before: 'Ativa', after: 'Pausada', undo: { remote: 'pauseRoutine', request: { id: 'rt-1', paused: false } } })
  expect(h.pauseRoutine(paused.activity.undo.request as never).paused).toBe(false)
})

it('no cron for the model: a bad preset is a sentence back, and nothing is created', () => {
  const { h, ports } = setup()
  const bad = ports.create(nina(), { name: 'x', prompt: 'y', schedule: { frequency: 'weekly', time: '25:99' } as never })
  expect(bad).toMatchObject({ ok: false, code: 'invalid' })
  expect(ports.create(nina(), { name: ' ', prompt: 'y', schedule: weekdays })).toMatchObject({ ok: false, code: 'invalid' })
  expect(ports.create(nina(), { name: 'x', prompt: ' ', schedule: weekdays })).toMatchObject({ ok: false, code: 'invalid' })
  expect(ports.create(nina(), { name: 'x', prompt: 'y', schedule: weekdays, timeZone: 'Marte/Olimpo' })).toMatchObject({ ok: false, code: 'invalid' })
  expect(h.listRoutines(SCOPE)).toEqual([])
})

it('the persona\'s own initiative follows her autonomy: asked = no, propose = ask the person, act = does it and shows it', () => {
  const { h, ports } = setup()
  const initiative = { initiator: 'persona-initiative', requestId: undefined } as const
  expect(create(ports, nina({ ...initiative, autonomy: 'asked' }))).toMatchObject({ ok: false, code: 'forbidden', message: expect.stringMatching(/só age quando a pessoa pede/u) })
  expect(create(ports, nina({ ...initiative, autonomy: 'propose' }))).toMatchObject({ ok: false, code: 'forbidden', message: expect.stringMatching(/Proponha/u) })
  expect(h.listRoutines(SCOPE)).toEqual([])
  const acted = ok(create(ports, nina({ ...initiative, autonomy: 'act' })))
  expect(acted.activity).toMatchObject({ initiator: 'persona-initiative', undoable: true })
  expect(acted.activity.requestId).toBeUndefined()
})

it('ownership: a persona touches only her routines; the Coordenação also the ones nobody owns; another persona\'s only when the person asked', () => {
  const { h, ports } = setup()
  ok(create(ports, nina()))
  const bento = (extra: Partial<HarnessIdentity> = {}): HarnessIdentity => ({ ...nina(), personaId: 'bento', ...extra })
  // initiative: Bento cannot edit Nina's routine
  expect(ports.pause(bento({ initiator: 'persona-initiative', autonomy: 'act' }), { id: 'rt-1', paused: true })).toMatchObject({ ok: false, code: 'forbidden', message: expect.stringMatching(/outra pessoa da equipe/u) })
  // the person asked Bento explicitly: allowed
  expect(ports.pause(bento(), { id: 'rt-1', paused: true }).ok).toBe(true)
  // a routine nobody owns: the Coordenação can, Bento on his own cannot
  h.routines.create({ id: 'sem-dono', workspaceId: 'ws', projectId: 'pp', name: 'Solta', rrule: 'FREQ=DAILY;BYHOUR=9', timeZone: 'UTC', catchUp: 'skip' })
  const guia = (extra: Partial<HarnessIdentity> = {}): HarnessIdentity => ({ ...nina(), personaId: 'guia', initiator: 'persona-initiative', autonomy: 'act', ...extra })
  expect(ports.pause(guia(), { id: 'sem-dono', paused: true }).ok).toBe(true)
  expect(ports.pause(bento({ initiator: 'persona-initiative', autonomy: 'act' }), { id: 'sem-dono', paused: false })).toMatchObject({ ok: false, code: 'forbidden' })
  // giving a routine to another persona is the person's call
  expect(ports.create(nina({ initiator: 'persona-initiative', autonomy: 'act', requestId: undefined }), { name: 'Para o Bento', prompt: 'Faça.', schedule: weekdays, ownerPersonaId: 'bento' }))
    .toMatchObject({ ok: false, code: 'forbidden', message: expect.stringMatching(/Só a pessoa pode dar uma rotina/u) })
  expect(ok(ports.create(nina(), { name: 'Para o Bento', prompt: 'Faça.', schedule: weekdays, ownerPersonaId: 'bento' })).routine.ownerPersonaId).toBe('bento')
  // a persona of another project does not exist here
  expect(ports.create(nina(), { name: 'x', prompt: 'y', schedule: weekdays, ownerPersonaId: 'ninguem' })).toMatchObject({ ok: false, code: 'invalid' })
})

it('the team\'s own routines (initiative:…), routines of another project and unknown ids are off limits', () => {
  const { h, ports } = setup()
  h.routines.create({ id: 'initiative:nina', workspaceId: 'ws', projectId: 'pp', name: 'Iniciativa Nina', rrule: 'FREQ=HOURLY', timeZone: 'UTC', catchUp: 'skip' })
  expect(ports.pause(nina(), { id: 'initiative:nina', paused: true })).toMatchObject({ ok: false, code: 'forbidden', message: expect.stringMatching(/própria equipe/u) })
  h.createProject({ id: 'other', workspaceId: 'ws', name: 'Outro', description: '' })
  h.routines.create({ id: 'de-outro', workspaceId: 'ws', projectId: 'other', name: 'De outro', rrule: 'FREQ=DAILY', timeZone: 'UTC', catchUp: 'skip' })
  expect(ports.pause(nina(), { id: 'de-outro', paused: true })).toMatchObject({ ok: false, code: 'not-found' })
  expect(ports.update(nina(), { id: 'nao-existe', name: 'x' })).toMatchObject({ ok: false, code: 'not-found' })
  expect(h.routines.get('de-outro')?.paused).toBe(false)
})

it('the budget: 3 routines created per day by one persona; the 4th is a sentence, not an error', () => {
  const { h, ports } = setup()
  for (let i = 0; i < ROUTINES_CREATED_PER_DAY; i += 1) ok(create(ports, nina(), `Rotina ${String(i)}`))
  expect(create(ports, nina(), 'Rotina extra')).toMatchObject({ ok: false, code: 'limit', message: 'Já criei as rotinas de hoje; deixe para amanhã ou peça à pessoa.' })
  expect(h.listRoutines(SCOPE)).toHaveLength(ROUTINES_CREATED_PER_DAY)
  // tomorrow she can again
  h.orchestration.now = () => '2026-11-05T12:00:00.000Z'
  expect(create(ports, nina(), 'Rotina de amanhã').ok).toBe(true)
})

it('list lets her see the routines first, so she does not duplicate', () => {
  const { ports } = setup()
  ok(create(ports))
  expect(ports.list(nina()).map(row => [row.id, row.name, row.ownerPersonaId])).toEqual([['rt-1', 'Resumo do dia', 'nina']])
})
