import { latestAssignment } from '@deepseek-ai/dsh-persona-engine'
import { createFakeRunner } from '@deepseek-ai/dsh-persona-runners'
import { expect, vi } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { RAM_FLOOR_BYTES, RAM_PER_CLI_BYTES } from '../src/station/admission.ts'
import { Station } from '../src/station/station.ts'
import { StationBusyError } from '../src/station/station-gate.ts'
import { loadStationState } from '../src/station/station-store.ts'
import { dirname } from 'node:path'
import { SCOPE, dbPathOf, it, openJourney, openJourneyFile, reopenJourney } from './journeys/journey-host.ts'

/**
 * P1-10 (Carbon, colheita-s1), Item 24: `Station.admitTurn` and `noteTurnEnded` had NO caller in production — "Desligar" stopped nothing, the RAM floor never ran and
 * Windows was never held awake. Policy (Keel 12/11 04:33): ON by default; "Desligada" holds on ANY machine; the RAM floor and the awake request only on the PAIRED
 * station; a refusal is a calm "sem vaga": the Task is blocked with an honest line and runs again by itself (switch on, or memory back); never an error.
 */

const GB = 1024 ** 3
const FREE_ENOUGH = RAM_FLOOR_BYTES + RAM_PER_CLI_BYTES * 3
const FREE_LOW = 400 * 1024 ** 2
const OFF_LINE = 'O computador dedicado está desligado. Ligue-o em Configurações › Conexões e a equipe volta ao trabalho.'
const LOW_LINE = 'O computador dedicado está sem memória livre agora. A equipe volta ao trabalho sozinha quando houver espaço.'

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  for (const [id, name] of [['p1', 'Guia'], ['p2', 'Nina']] as const) {
    h.createPersona({
      id, ...SCOPE, name, title: 'Cargo', description: 'x', personality: 'Direta.', instructions: 'Prove.', avatarKind: 'gallery', avatarRef: name.toLowerCase(),
      runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'haiku', canRecruit: false, createdBy: 'ana',
    })
  }
  h.product.updatePersona({ ...h.product.getPersona('p1')!, systemRoles: ['coordination'] }, 'pp')
  h.createChannel({ id: 'geral', ...SCOPE, name: 'geral', topic: '' })
  h.sessionMemberId = 'ana'
}

/** The machine's free memory, as the station reads it (the real reading is `os.freemem`). */
function setFree(h: PersonaHost, bytes: number): void {
  ;(h.station as unknown as { deps: { freeBytes: () => number } }).deps.freeBytes = () => bytes
}

function pair(h: PersonaHost): void {
  const code = h.station.issueCode()
  expect(h.station.redeem(code.code)).toBe('ok')
}

function resolve(h: PersonaHost): Promise<unknown> {
  const call = (h.orchestration as unknown as { resolveFor(persona: unknown, projectId: string, mode: string, purpose: string, onFirstToken: undefined, answerOnly: boolean, ticketId: string): Promise<unknown> }).resolveFor
  return call.call(h.orchestration, h.product.getPersona('p2'), 'pp', 'asked', 'task', undefined, false, 't1')
}

const ask = async (h: PersonaHost, id: string, body: string): Promise<void> => {
  h.postMessage({ id, ...SCOPE, streamKind: 'channel', ownerId: 'geral', body, actorId: 'ana', subjectId: id })
  await h.orchestration.flush('pp')
}
const ticketOf = (h: PersonaHost, triggerId: string) => h.orchestration.runtime('pp').repo.tickets.list().find(item => item.origin.triggerId === triggerId)

it('a machine nobody configured runs every turn, even with very little memory (the floor is for the paired station only)', async () => {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seed(h)
  setFree(h, FREE_LOW)
  expect(h.station.isPaired()).toBe(false)
  expect(h.station.isRunning()).toBe(true) // ON by default
  await expect(resolve(h)).resolves.toBeDefined()
  expect((await h.stationView(SCOPE)).power).toBe('livre') // nothing is held awake on an ordinary computer
})

it('the paired station with little memory does not take the turn ("sem vaga"), and takes it when there is memory again', async () => {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seed(h)
  pair(h)
  setFree(h, FREE_LOW)
  await expect(resolve(h)).rejects.toBeInstanceOf(StationBusyError)
  await expect(resolve(h)).rejects.toThrow(LOW_LINE)
  setFree(h, FREE_ENOUGH)
  await expect(resolve(h)).resolves.toBeDefined()
})

it('"Desligada" holds on ANY machine: no turn starts, and turning it on lets the next one through', async () => {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seed(h)
  setFree(h, 32 * GB)
  await h.setStationRunning({ ...SCOPE, running: false })
  await expect(resolve(h)).rejects.toThrow(OFF_LINE)
  await h.setStationRunning({ ...SCOPE, running: true })
  await expect(resolve(h)).resolves.toBeDefined()
})

it('a Task stopped by the switch is blocked with the honest line (not an error) and runs again BY ITSELF when the station is turned on', async () => {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seed(h)
  await h.setStationRunning({ ...SCOPE, running: false })
  await ask(h, 'm1', '@Nina preciso de um README no projeto')
  const stopped = ticketOf(h, 'm1')
  expect(stopped).toBeDefined()
  expect(stopped!.attention?.question).toBe(OFF_LINE) // the Task waits, and says why in plain words
  expect(h.events.listProject('pp').some(event => event.body.includes('engine_unavailable'))).toBe(false)
  expect(h.orchestration.stationGate!.waitingCount()).toBe(1)
  const firstAssignment = latestAssignment(stopped!)!.id
  await h.setStationRunning({ ...SCOPE, running: true })
  await vi.waitFor(() => {
    const after = ticketOf(h, 'm1')!
    expect(latestAssignment(after)!.id).not.toBe(firstAssignment) // a new Assignment ran: nobody had to click Retomar
  }, { timeout: 10_000 })
  expect(h.orchestration.stationGate!.waitingCount()).toBe(0)
})

it('quitting the host does NOT turn the station off (the shutdown only lets Windows sleep and writes nothing); what the person chose does survive the restart', async () => {
  const first = openJourneyFile('2026-11-04T12:00:00.000Z')
  seed(first)
  const path = dbPathOf(first)
  await (first as unknown as { ctx: { fiber: { dispose(): Promise<void> } } }).ctx.fiber.dispose()
  const again = reopenJourney(path, '2026-11-04T12:00:00.000Z')
  expect(again.station.isRunning()).toBe(true) // before the fix, the quit wrote "off" and the next launch blocked every turn
  expect(loadStationState(dirname(path))).toEqual({ paired: false, running: true })
  // the person's own "Desligar" is the one thing that is remembered
  again.sessionMemberId = 'ana' // the workspace and its owner came back with the database
  await again.setStationRunning({ ...SCOPE, running: false })
  await (again as unknown as { ctx: { fiber: { dispose(): Promise<void> } } }).ctx.fiber.dispose()
  const third = reopenJourney(path, '2026-11-04T12:00:00.000Z')
  expect(third.station.isRunning()).toBe(false)
})

it('P1-08: a runner evicted while working lets Windows sleep again (the dispose emits no `idle`), and the counters of the screen are the real ones', async () => {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seed(h)
  setFree(h, 32 * GB)
  h.orchestration.runnerFactory = () => Promise.resolve(createFakeRunner({ holdUntilIdle: true })) // the turn stays open until the runner is cancelled or evicted
  const ended = vi.spyOn(h.station, 'noteTurnEnded')
  const runner = await resolve(h) as { ensureSession(id: string, cwd: string, title: string, role: string): Promise<void>; deliver(id: string, request: string, text: string, mode: string): Promise<void> }
  expect((await h.stationView(SCOPE)).clis).toBe(1) // the warm runner counts (before: always 0)
  await runner.ensureSession('s1', '.', 'Tarefa', 'worker')
  await runner.deliver('s1', 'r1', 'faça', 'queue')
  ended.mockClear()
  h.orchestration.evictWarmRunners('pp', 'p2')
  expect(ended).toHaveBeenCalledWith(0) // forgotten: not left "working" forever
  expect((await h.stationView(SCOPE)).clis).toBe(0)
})

it('the pairing and the switch survive a restart (they used to live only in RAM)', () => {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seed(h)
  pair(h)
  h.station.setRunning(false)
  const saved = loadStationState(h.browserDataRoot)
  expect(saved).toEqual({ paired: true, running: false })
  const reopened = new Station({ initial: saved })
  expect(reopened.isPaired()).toBe(true)
  expect(reopened.isRunning()).toBe(false)
  // a missing or damaged file is the default: ON, not paired (nothing blocks someone who never touched the station)
  expect(loadStationState(`${h.browserDataRoot}-nao-existe`)).toEqual({ paired: false, running: true })
})
