import { expect, it } from 'vitest'
import { HOME_KIND, HomeError, PersonaHomeBook, presenceOf, type HomeDoc } from '../src/persona-home.ts'

/**
 * D-116 "Onde roda", the host's model: ONE home per persona (a doc in the screens KV), a compare-and-set by epoch, "closed before moved", fencing by a higher epoch, and the presence of the persona = the presence of her computer.
 * Pure: the host hands in the KV, the persona→project map, "which computer is this" and the runtime stop. The clock is injected.
 */
const THIS = 'pc-dono'
const NOW = '2026-11-12T15:00:00.000Z'

function rig() {
  const docs = new Map<string, HomeDoc>()
  const events: string[] = []
  const reasons: string[] = []
  const store = { get: (p: string, k: string, i: string) => docs.get(`${p}/${k}/${i}`), put: (p: string, k: string, i: string, v: HomeDoc) => { docs.set(`${p}/${k}/${i}`, v); events.push(`put:${i}:${v.state}`) } }
  const personas = ['bia', 'caio', 'lia']
  const book = new PersonaHomeBook({
    store,
    thisComputerId: () => THIS,
    projectOf: id => (personas.includes(id) ? 'pp' : undefined),
    personaIds: () => personas,
    onHomeChanged: (id, from, to) => { events.push(`moved:${id}:${from}->${to}`) },
    stopRuntime: (id, reason) => { events.push(`stop:${id}:${docs.get(`pp/${HOME_KIND}/${id}`)?.state ?? 'none'}`); reasons.push(reason) }, // what the doc says AT the moment the runtime is stopped, and why
  })
  return { book, docs, events, reasons }
}

it('a persona with no doc lives on THIS computer, active (every persona made before D-116 is the creator\'s): no migration, nothing to show', () => {
  const { book } = rig()
  expect(book.resolve('bia')).toEqual({ computerId: THIS, epoch: 0, state: 'active', isThis: true, explicit: false })
  expect(book.runsHere('bia')).toBe(true)
})

it('set is a COMPARE-AND-SET by epoch: a higher epoch writes, an equal or lower one is refused `stale-epoch` and nothing changes', () => {
  const { book, docs } = rig()
  book.set('bia', { computerId: 'pc-padaria', epoch: 1, record: { sig: 'x' } }, NOW)
  expect(book.resolve('bia')).toMatchObject({ computerId: 'pc-padaria', epoch: 1, state: 'active', isThis: false, explicit: true })
  for (const epoch of [1, 0]) {
    try { book.set('bia', { computerId: THIS, epoch }, NOW); expect.unreachable() } catch (error) { expect((error as HomeError).code).toBe('stale-epoch') }
  }
  expect(docs.get(`pp/${HOME_KIND}/bia`)).toMatchObject({ computerId: 'pc-padaria', epoch: 1 })
  book.set('bia', { computerId: THIS, epoch: 2 }, NOW)
  expect(book.runsHere('bia')).toBe(true)
})

it('this host RUNS a persona only when her home is this computer AND she is active: one homed elsewhere, or moving, does not run here', () => {
  const { book } = rig()
  book.set('caio', { computerId: 'pc-padaria', epoch: 1 }, NOW)
  expect(book.runsHere('caio')).toBe(false)
  book.set('lia', { computerId: THIS, epoch: 1 }, NOW)
  expect(book.runsHere('lia')).toBe(true)
  book.close('lia', 'moving', 'pc-padaria')
  expect(book.runsHere('lia')).toBe(false)
})

it('close writes `moving` DURABLY BEFORE the runtime is stopped (a host that falls between the two comes back knowing), is idempotent, and open() reopens only a moving persona', () => {
  const { book, events, reasons } = rig()
  book.close('bia', 'moving', 'pc-padaria')
  expect(events).toEqual(['put:bia:moving', 'stop:bia:moving']) // the doc already said "moving" when the runtime stopped
  expect(reasons).toEqual(['moving']) // the host stops her computer-use runs for this reason ("persona-fechada")
  book.close('bia', 'moving', 'pc-padaria')
  expect(events).toEqual(['put:bia:moving', 'stop:bia:moving']) // idempotent: no second stop
  expect(book.resolve('bia')).toMatchObject({ state: 'moving', isThis: true })
  book.open('bia')
  expect(book.resolve('bia')).toMatchObject({ state: 'active' })
  expect(book.runsHere('bia')).toBe(true)
  book.open('caio') // never moving: nothing happens
  expect(book.resolve('caio').explicit).toBe(false)
})

it('fencing: a record of a HIGHER epoch seen for a persona this host runs closes her at once and moves her home to where the record says; an older or equal one is ignored', () => {
  const { book, events, reasons } = rig()
  book.set('bia', { computerId: THIS, epoch: 3 }, NOW)
  events.length = 0
  expect(book.onHigherEpochSeen('bia', 3, { computerId: 'pc-padaria', record: {} }, NOW)).toBe(false)
  expect(book.onHigherEpochSeen('bia', 2, { computerId: 'pc-padaria', record: {} }, NOW)).toBe(false)
  expect(events).toEqual([])
  expect(book.onHigherEpochSeen('bia', 4, { computerId: 'pc-padaria', record: { sig: 'y' } }, NOW)).toBe(true)
  expect(events[0]).toBe('put:bia:moving') // closed first
  expect(events).toContain('stop:bia:moving')
  expect(reasons).toEqual(['fenced']) // the host tells the computer-use runs why she was closed
  expect(book.resolve('bia')).toMatchObject({ computerId: 'pc-padaria', epoch: 4, isThis: false })
  expect(book.runsHere('bia')).toBe(false)
})

it('D-117: a change of COMPUTER tells the host (it turns computer use off in the new home); a higher epoch on the SAME computer does not', () => {
  const { book, events } = rig()
  book.set('bia', { computerId: 'pc-padaria', epoch: 1 }, NOW)
  expect(events).toContain(`moved:bia:${THIS}->pc-padaria`)
  events.length = 0
  book.set('bia', { computerId: 'pc-padaria', epoch: 2 }, NOW)
  expect(events.filter(item => item.startsWith('moved:'))).toEqual([])
  book.set('bia', { computerId: THIS, epoch: 3 }, NOW)
  expect(events).toContain(`moved:bia:pc-padaria->${THIS}`)
})

it('D-117: a home the placement rule refuses (a forged record, a transfer to a forbidden computer) is refused BEFORE anything is written — and so is a higher epoch seen on the mesh', () => {
  const docs = new Map<string, HomeDoc>()
  const book = new PersonaHomeBook({
    store: { get: (p, k, i) => docs.get(`${p}/${k}/${i}`), put: (p, k, i, v) => { docs.set(`${p}/${k}/${i}`, v) } },
    thisComputerId: () => THIS,
    projectOf: id => (id === 'bia' ? 'pp' : undefined),
    personaIds: () => ['bia'],
    stopRuntime: () => undefined,
    placement: (_id, computerId) => (computerId === 'pc-padaria' ? 'private-persona-on-team-pc' : undefined),
  })
  try { book.set('bia', { computerId: 'pc-padaria', epoch: 1 }, NOW); expect.unreachable() } catch (error) {
    expect((error as HomeError).code).toBe('placement-refused')
    expect((error as HomeError).detail).toBe('private-persona-on-team-pc')
  }
  expect(docs.size).toBe(0)
  book.set('bia', { computerId: THIS, epoch: 1 }, NOW)
  expect(book.runsHere('bia')).toBe(true)
  expect(book.onHigherEpochSeen('bia', 5, { computerId: 'pc-padaria', record: {} }, NOW)).toBe(false) // a forbidden record never fences a persona that is running
  expect(book.runsHere('bia')).toBe(true)
  expect(book.resolve('bia')).toMatchObject({ computerId: THIS, epoch: 1, state: 'active' })
  book.set('bia', { computerId: 'pc-outro', epoch: 2 }, NOW)
  expect(book.resolve('bia').computerId).toBe('pc-outro')
})

it('placesOf: the personas of a computer (the ones with no doc count for THIS computer) — "roda N personas"', () => {
  const { book } = rig()
  book.set('caio', { computerId: 'pc-padaria', epoch: 1 }, NOW)
  expect(book.placesOf(THIS).sort()).toEqual(['bia', 'lia'])
  expect(book.placesOf('pc-padaria')).toEqual(['caio'])
  expect(book.placesOf('pc-que-nao-existe')).toEqual([])
})

it('presence = the computer\'s: on THIS host (active / paused / no engine / no sheet / moving), on ANOTHER computer (on / off / unknown = off); the reason code is the closed vocabulary', () => {
  const home = (over: Partial<ReturnType<PersonaHomeBook['resolve']>>) => ({ computerId: THIS, epoch: 1, state: 'active' as const, isThis: true, explicit: true, ...over })
  const ok = { paused: false, engineOk: true, sheetOk: true, online: () => true }
  expect(presenceOf(home({}), ok)).toEqual({ status: 'ativa' })
  expect(presenceOf(home({}), { ...ok, paused: true })).toEqual({ status: 'fora-do-ar', reasonCode: 'pausada' })
  expect(presenceOf(home({}), { ...ok, sheetOk: false })).toEqual({ status: 'fora-do-ar', reasonCode: 'sem-ficha' })
  expect(presenceOf(home({}), { ...ok, engineOk: false })).toEqual({ status: 'fora-do-ar', reasonCode: 'sem-motor' })
  expect(presenceOf(home({ state: 'moving' }), ok)).toEqual({ status: 'em-transferencia', reasonCode: 'em-transferencia' })
  expect(presenceOf(home({ computerId: 'pc-padaria', isThis: false }), ok)).toEqual({ status: 'ativa' })
  expect(presenceOf(home({ computerId: 'pc-padaria', isThis: false }), { ...ok, online: () => false })).toEqual({ status: 'fora-do-ar', reasonCode: 'computador-desligado' })
  expect(presenceOf(home({ computerId: 'pc-padaria', isThis: false }), { ...ok, online: () => undefined })).toEqual({ status: 'fora-do-ar', reasonCode: 'computador-desligado' }) // unknown is never "probably on"
  expect(presenceOf(home({ computerId: 'pc-padaria', isThis: false, state: 'moving' }), ok)).toEqual({ status: 'em-transferencia', reasonCode: 'em-transferencia' })
})
