import { Context } from '@deepseek-ai/cordis'
import { latestAssignment } from '@deepseek-ai/dsh-persona-engine'
import { afterAll, afterEach, beforeAll, expect, vi } from 'vitest'
import { GithubSourceHost, detectGh } from '../src/github.ts'
import PersonaHost from '../src/index.ts'
import { HOST_TEST_TIMEOUT_MS, it, resetHost } from './host-harness.ts'

/**
 * Lever 2 of the opening plan (persona-spec/research/perf/ABERTURA.md, "dieta do boot do host"): what is NOT the first screen waits. `gh --version` (a synchronous spawn: 160-240 ms, peaks of 3.5 s) is probed
 * the first time somebody asks and then remembered; the warmups of CLIs/connectors/prewarm, the scheduler and the reports curation start AFTER the constructor returns (a short delay), ONCE, and a host that
 * closes before they start never starts them. Migrations already run only when a version is pending (`openPersonaStoreOnce`: `onDisk < known`): nothing to defer there.
 */
const CLOCK = '2026-11-12T12:00:00.000Z'
let ctx: Context
let h: PersonaHost

beforeAll(() => {
  ctx = new Context()
  h = new PersonaHost(ctx)
  h.orchestration.now = () => CLOCK
}, HOST_TEST_TIMEOUT_MS)

afterEach(() => {
  resetHost(h, CLOCK)
  vi.restoreAllMocks()
  ;(h as unknown as { backgroundStarted: boolean }).backgroundStarted = false // the shared host starts the background work ONCE: each test begins as a host that has not
}, HOST_TEST_TIMEOUT_MS)

afterAll(async () => { await ctx.fiber.dispose() }, HOST_TEST_TIMEOUT_MS)

const sleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms) })

/** The spies on everything the background start must (only then) touch. */
function spies(host: PersonaHost) {
  const bridge = { refresh: vi.fn(() => Promise.resolve()), ports: () => ({}) }
  ;(host as unknown as { connectorBridge: unknown }).connectorBridge = bridge
  return {
    warm: vi.spyOn(host.connections, 'warm').mockImplementation(() => undefined),
    refresh: bridge.refresh,
    prewarm: vi.spyOn(host.orchestration, 'prewarmAll').mockImplementation(() => undefined),
    start: vi.spyOn(host.proactivityScheduler, 'start').mockImplementation(() => undefined),
  }
}

it('detectGh does NOT spawn at construction: the first question probes once, and the answer is remembered', () => {
  let probes = 0
  let runs = 0
  const cli = detectGh((args) => {
    if (args[0] === '--version') { probes += 1; return { status: 0, stdout: 'gh 2', stderr: '' } }
    runs += 1
    return { status: 0, stdout: 'ok', stderr: '' }
  })
  expect(probes, 'nothing was spawned by creating it').toBe(0)
  expect(cli.available).toBe(true)
  expect(cli.available).toBe(true)
  expect(cli.exec(['api', 'user'])).toBe('ok')
  expect(probes, 'one probe for any number of questions').toBe(1)
  expect(runs).toBe(1)
})

it('detectGh: a missing binary is probed once too, and `exec` refuses without spawning anything else', () => {
  let probes = 0
  let runs = 0
  const cli = detectGh((args) => { if (args[0] === '--version') probes += 1; else runs += 1; return { status: 1, stdout: '', stderr: 'not found' } })
  expect(() => cli.exec(['api', 'user'])).toThrow(/gh-unavailable/)
  expect(cli.available).toBe(false)
  expect(probes).toBe(1)
  expect(runs).toBe(0)
})

it('the background work (warmups, prewarm, scheduler, reports curation, the gh probe) starts ONLY when asked, ONCE', () => {
  const seen = spies(h)
  let ghProbes = 0
  ;(h as unknown as { github: GithubSourceHost }).github = new GithubSourceHost(detectGh((args) => { if (args[0] === '--version') ghProbes += 1; return { status: 0, stdout: '', stderr: '' } }), h.orchestration, h.proactivity)
  expect(seen.warm).not.toHaveBeenCalled()
  h.startBackground()
  h.startBackground() // idempotent: a second ask changes nothing
  expect(seen.warm).toHaveBeenCalledTimes(1)
  expect(seen.refresh).toHaveBeenCalledTimes(1)
  expect(seen.prewarm).toHaveBeenCalledTimes(1)
  expect(seen.start).toHaveBeenCalledTimes(1)
  expect(ghProbes, 'the probe of gh happens off the first screen, once').toBe(1)
})

it('scheduled with a delay: nothing starts before it, everything starts after it', async () => {
  const seen = spies(h)
  h.scheduleBackground(60)
  expect(seen.warm).not.toHaveBeenCalled()
  expect(seen.start).not.toHaveBeenCalled()
  await sleep(40)
  expect(seen.warm, 'still waiting').not.toHaveBeenCalled()
  await sleep(120)
  expect(seen.warm).toHaveBeenCalledTimes(1)
  expect(seen.prewarm).toHaveBeenCalledTimes(1)
  expect(seen.start).toHaveBeenCalledTimes(1)
})

it('a host that closes BEFORE the delay never starts the background work', async () => {
  const local = new Context()
  const early = new PersonaHost(local)
  const seen = spies(early)
  early.scheduleBackground(80)
  await local.fiber.dispose()
  await sleep(160)
  expect(seen.warm).not.toHaveBeenCalled()
  expect(seen.prewarm).not.toHaveBeenCalled()
  expect(seen.start).not.toHaveBeenCalled()
}, HOST_TEST_TIMEOUT_MS)

it('a routine that came due DURING the boot window is not lost, only later: the first cycle after the background start claims it, exactly once', async () => {
  const seen = spies(h)
  const clock = { iso: '2026-11-03T08:00:00.000Z' }
  h.orchestration.now = () => clock.iso
  h.timezoneOffsetMinutes = () => 0
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    id: 'p2', workspaceId: 'ws', projectId: 'pp', name: 'Iris', title: 'Engenharia', description: 'Implementa.', personality: 'Direta.', instructions: 'Prove.',
    avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
  h.routines.create({ id: 'r1', workspaceId: 'ws', projectId: 'pp', name: 'Resumo do dia', rrule: 'FREQ=DAILY;BYHOUR=9', timeZone: 'UTC', catchUp: 'run_once' })
  h.screens.screens.put('pp', 'routine_spec', 'r1', { personaId: 'p2', prompt: 'Resuma o que a equipe entregou ontem.' })
  clock.iso = '2026-11-03T10:00:00.000Z' // 09:00 passed while the host was still booting: the scheduler had not started
  const tickets = (): number => h.orchestration.runtime('pp').repo.tickets.list().length
  expect(tickets(), 'nothing runs before the background start').toBe(0)
  h.startBackground()
  expect(seen.start).toHaveBeenCalledTimes(1)
  await h.proactivityScheduler.cycle() // the first cycle (the timer arms it 5 s after the start; called directly here)
  await h.proactivityScheduler.whenIdle()
  await h.orchestration.flush('pp')
  expect(tickets(), 'the overdue routine ran: late, not lost').toBe(1)
  const [ticket] = h.orchestration.runtime('pp').repo.tickets.list()
  expect(ticket?.execution?.name).toBe('Iris')
  expect(ticket === undefined ? undefined : latestAssignment(ticket)?.report?.state).toBe('ready')
  await h.proactivityScheduler.cycle()
  await h.orchestration.flush('pp')
  expect(tickets(), 'and exactly once').toBe(1)
})

it('dispose leaves no live timer of the boot diet behind (the pending start is cleared; the scheduler is stopped)', async () => {
  const local = new Context()
  const early = new PersonaHost(local)
  early.scheduleBackground(60_000)
  const timer = (early as unknown as { backgroundTimer?: { hasRef: () => boolean } }).backgroundTimer
  expect(timer, 'the start is pending').toBeDefined()
  expect(timer?.hasRef(), 'and it never keeps the process alive').toBe(false)
  await local.fiber.dispose()
  expect((early as unknown as { backgroundTimer?: unknown }).backgroundTimer, 'cleared by dispose').toBeUndefined()
  expect((early as unknown as { backgroundStarted: boolean }).backgroundStarted, 'and it can never start afterwards').toBe(true)
}, HOST_TEST_TIMEOUT_MS)
