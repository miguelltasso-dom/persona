/**
 * Marco DOGFOOD, M3: several projects in parallel, none of them waiting for another.
 *  1. ONE work chain per project (a lane): a Task held open in front in project A never delays a Task of project B.
 *  2. A FAIR queue for the execution slots: a request that finds no slot waits (in the routing gate or in the slot queue) and starts BY ITSELF when a slot frees up, round-robin between projects.
 *  3. The runner (and its key) is per project: a persona of A and a persona of B never share a runner.
 * Every wait below is a CONDITION with a generous ceiling, never a fixed sleep: the whole host suite runs these under load.
 */
import { createFakeRunner } from '@deepseek-ai/dsh-persona-runners'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, vi } from 'vitest'
import { backgroundWorkOf } from '../src/background-work.ts'
import { HeldMessages } from '../src/held-messages.ts'
import type PersonaHost from '../src/index.ts'
import type { HostRunnerRequest } from '../src/runner.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) { try { rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }) } catch { /* temp folder: the OS cleans it */ } }
})

/** A host of its own for every test: the slots, the grants and the lanes of one test never reach another (the shared host keeps its ExecutionBudget between tests). */
function fresh(): PersonaHost {
  const dir = mkdtempSync(join(tmpdir(), 'm3-'))
  dirs.push(dir)
  return host(join(dir, 'p.db'))
}
const sleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms) })

/** Poll until the condition holds (or the ceiling passes); the caller asserts what it expected. */
async function until(condition: () => boolean, ceilingMs = 25_000): Promise<boolean> {
  for (let waited = 0; waited < ceilingMs; waited += 50) {
    if (condition()) return true
    await sleep(50)
  }
  return condition()
}

/** Two projects, each with its own channel and one persona (Bia in the personal project `pa`, Beto in `pb`). */
function seed(h: PersonaHost): void {
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pa' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pa', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createProject({ id: 'pb', workspaceId: 'ws', name: 'Obra', description: 'A obra' })
  for (const [projectId, id, name] of [['pa', 'bia', 'Bia'], ['pb', 'beto', 'Beto']] as const) {
    h.createPersona({
      workspaceId: 'ws', projectId, id, name, title: 'Coordenação', description: 'Coordena.', personality: 'Calma.', instructions: 'Despache.',
      avatarKind: 'gallery', avatarRef: 'atlas', runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'haiku', canRecruit: false, createdBy: 'ana', systemRoles: ['coordination'],
    })
    // the automatic #geral of each project already exists (a second one is a name conflict)
  }
  vi.spyOn(h.connections, 'list').mockReturnValue([{ id: 'claude', kind: 'claude', phase: 'ready', available: true, loggedIn: true }] as never)
}

interface Recorded { readonly projectId: string; readonly delivered: string[]; readonly release: () => void }

/** Every Task runner the host opens, tagged with its project; each Task's turn stays open until its own `release()`. */
function recorded(h: PersonaHost, heldProjects: readonly string[]): Recorded[] {
  const runs: Recorded[] = []
  h.orchestration.runnerFactory = (request?: HostRunnerRequest) => {
    const inner = createFakeRunner()
    if (request?.purpose !== 'task') return Promise.resolve(inner)
    const gate = Promise.withResolvers<undefined>()
    const delivered: string[] = []
    const projectId = request.projectId ?? ''
    runs.push({ projectId, delivered, release: () => { gate.resolve(undefined) } })
    if (!heldProjects.includes(projectId)) gate.resolve(undefined)
    return Promise.resolve(new Proxy(inner, {
      get(target, prop, receiver) {
        if (prop === 'whenIdle') return async (session: string) => { await gate.promise; return target.whenIdle(session) }
        if (prop === 'deliver') {
          const original = Reflect.get(target, 'deliver') as (...args: unknown[]) => unknown
          return (...args: unknown[]) => { delivered.push(`${String(args[0])}|${String(args[1])}`); return original.apply(target, args) }
        }
        return Reflect.get(target, prop, receiver) as unknown
      },
    }))
  }
  return runs
}

const started = (runs: readonly Recorded[], projectId: string): boolean => runs.some(run => run.projectId === projectId && run.delivered.length > 0)

const post = (h: PersonaHost, projectId: string, id: string, body: string): void => {
  // the automatic #geral of the personal project is `geral`; the one of any other project is `geral:<project>` (stream ids are global)
  h.postMessage({ id, workspaceId: 'ws', projectId, streamKind: 'channel', ownerId: projectId === 'pa' ? 'geral' : `geral:${projectId}`, body, actorId: 'ana', subjectId: id })
}

interface Slots { setLimits(limits: { global: number; perProject: number }): void; waitingCount(projectId?: string): number; granted: string[] }
const slotsOf = (h: PersonaHost): Slots => h.orchestration.budget

/** A request that found no slot is either in the slot queue or held by the routing gate: either way it is WAITING. */
const waiting = (h: PersonaHost, projectId: string): boolean => slotsOf(h).waitingCount(projectId) > 0 || new HeldMessages(h.screens.screens).list(projectId).length > 0

it('M3 lane: a Task held open in FRONT in project A does not delay project B (one work chain per project)', async () => {
  const h = fresh()
  seed(h)
  backgroundWorkOf(h.orchestration, { afterMs: 60_000, nowMs: () => Date.parse(h.orchestration.now()) }) // A stays "in front" for the whole test
  const runs = recorded(h, ['pa'])
  post(h, 'pa', 'ua', '@Bia monte o cardápio da semana com preços')
  expect(await until(() => started(runs, 'pa')), 'the Task of A is running').toBe(true)
  post(h, 'pb', 'ub', '@Beto monte o orçamento da laje com prazos')
  expect(await until(() => started(runs, 'pb')), 'the Task of B started while A is still running').toBe(true)
  for (const run of runs) run.release()
})

it('M3 fair queue: with ONE slot, the request that found no slot starts BY ITSELF when the slot frees up (no starvation)', async () => {
  const h = fresh()
  seed(h)
  slotsOf(h).setLimits({ global: 1, perProject: 1 })
  backgroundWorkOf(h.orchestration, { afterMs: 60_000, nowMs: () => Date.parse(h.orchestration.now()) })
  const runs = recorded(h, ['pa'])
  post(h, 'pa', 'ua-r2', '@Bia monte o cardápio da semana com preços')
  expect(await until(() => started(runs, 'pa')), 'the Task of A took the only slot').toBe(true)
  post(h, 'pb', 'ub-r2', '@Beto monte o orçamento da laje com prazos')
  expect(await until(() => waiting(h, 'pb')), 'B is waiting for a slot').toBe(true)
  expect(started(runs, 'pb'), 'B waits: the only slot is A\'s').toBe(false)
  // A ends: every run A opened is released (the coordination turn and the one that executes), so its slot frees up
  for (let waited = 0; waited < 25_000 && !started(runs, 'pb'); waited += 100) {
    for (const run of runs.filter(item => item.projectId === 'pa')) run.release()
    await sleep(100)
  }
  expect(started(runs, 'pb'), 'B started by itself when the slot freed up').toBe(true)
  for (const run of runs) run.release()
})

it('M3 round-robin: with ONE slot and 3 requests of A queued before 1 of B, B gets the SECOND slot (not after every Task of A)', async () => {
  const h = fresh()
  seed(h)
  const budget = slotsOf(h)
  budget.setLimits({ global: 1, perProject: 1 })
  backgroundWorkOf(h.orchestration, { afterMs: 60_000, nowMs: () => Date.parse(h.orchestration.now()) })
  const runs = recorded(h, ['pa'])
  post(h, 'pa', 'ua1', '@Bia monte o cardápio da semana com preços')
  post(h, 'pa', 'ua2', '@Bia monte a lista de compras da semana')
  post(h, 'pa', 'ua3', '@Bia monte o quadro de horários da semana')
  expect(await until(() => budget.granted.includes('pa')), 'A took the only slot').toBe(true)
  post(h, 'pb', 'ub', '@Beto monte o orçamento da laje com prazos')
  expect(await until(() => waiting(h, 'pb')), 'B is waiting for a slot').toBe(true)
  for (let waited = 0; waited < 25_000 && !started(runs, 'pb'); waited += 100) {
    for (const run of runs.filter(item => item.projectId === 'pa')) run.release()
    await sleep(100)
  }
  expect(budget.granted.indexOf('pb'), `B must get the second slot; slots were handed out as: ${budget.granted.join(', ')}`).toBe(1)
  for (const run of runs) run.release()
})

it('M3 lock-in: the runner of a persona is per PROJECT (the key carries the project), so A and B never share one', async () => {
  const h = fresh()
  seed(h)
  backgroundWorkOf(h.orchestration, { afterMs: 60_000, nowMs: () => Date.parse(h.orchestration.now()) })
  const runs = recorded(h, [])
  post(h, 'pa', 'ua', '@Bia monte o cardápio da semana com preços')
  post(h, 'pb', 'ub', '@Beto monte o orçamento da laje com prazos')
  const taskKeys = (): string[] => [...h.orchestration.warmRunners.keys()].filter(key => key.includes(':task'))
  await until(() => taskKeys().some(key => key.startsWith('pa:bia:')) && taskKeys().some(key => key.startsWith('pb:beto:')))
  const keys = taskKeys()
  expect(keys.some(key => key.startsWith('pa:bia:')), JSON.stringify(keys)).toBe(true)
  expect(keys.some(key => key.startsWith('pb:beto:')), JSON.stringify(keys)).toBe(true)
  expect(keys.every(key => key.startsWith('pa:') || key.startsWith('pb:'))).toBe(true)
  expect(new Set(runs.map(run => run.projectId))).toEqual(new Set(['pa', 'pb']))
})
