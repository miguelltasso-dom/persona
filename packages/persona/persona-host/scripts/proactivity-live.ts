/**
 * IV-1 proof in a REAL host process: real PersonaHost on a temp SQLite home, real timers, the scheduler the host
 * starts by itself (no VITEST), the scripted runner (PERSONA_SCRIPTED=1 — no model is ever called).
 *
 *   PERSONA_SCRIPTED=1 node --import tsx/esm packages/persona/persona-host/scripts/proactivity-live.ts
 *
 * Phases, each printed with the elapsed seconds:
 *   1. rest: no goal, nothing due ⇒ cycles run, ZERO runner resolves;
 *   2. stranded: a ticket whose first run died is resumed by the team on its own and finishes in #geral;
 *   3. routine: a custom routine on an hourly rule becomes a Ticket the minute it is due;
 *   4. plan: an open goal and an empty queue make Coordenação plan;
 *   5. pause: "Pausar equipe" ⇒ nothing more happens until "Retomar".
 */
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { ticketGoal } from '@deepseek-ai/dsh-persona-engine'
import PersonaHost from '../src/index.ts'

if (process.env.PERSONA_SCRIPTED !== '1') throw new Error('refusing to run: set PERSONA_SCRIPTED=1 (no real model in this proof)')

const home = mkdtempSync(join(tmpdir(), 'persona-proactivity-live-'))
mkdirSync(join(home, 'db'), { recursive: true })
process.env.PERSONA_HOME = home
const started = Date.now()
const stamp = (): string => `${((Date.now() - started) / 1000).toFixed(1).padStart(5)}s`
const say = (line: string): void => { console.log(`[${stamp()}] ${line}`) }
const sleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms) })

const ctx = new Context()
const h = new PersonaHost(ctx, { databasePath: join(home, 'db', 'persona.db'), proactivityCycleMs: 500 })
const scope = { workspaceId: 'ws', projectId: 'pp' }
h.sessionMemberId = 'ana'
h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
for (const [id, name] of [['p1', 'Bento'], ['p2', 'Iris']] as const) {
  h.createPersona({
    id, workspaceId: 'ws', projectId: 'pp', name, title: 'Engenharia', description: 'Implementa.',
    personality: 'Direto.', instructions: 'Prove.', avatarKind: 'gallery', avatarRef: 'bento',
    runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
}

let resolves = 0
const original = h.orchestration.runnerFactory
h.orchestration.runnerFactory = (request) => {
  resolves += 1
  return original(request)
}

const lines = (): string[] => h.events.listProject('pp').filter(item => item.streamId === 'channel:geral').map(item => `${item.actorId.padEnd(18)} ${item.body}`)
const audits = (): string[] => h.proactivity.repos.auditsSince('pp', '1970-01-01T00:00:00.000Z').filter(row => row.kind.startsWith('sched:')).map(row => `${row.kind} ${row.detail}`)
const tickets = () => h.orchestration.runtime('pp').repo.tickets.list()
async function until(label: string, check: () => boolean, ms: number): Promise<boolean> {
  const limit = Date.now() + ms
  while (Date.now() < limit) {
    if (check()) return true
    await sleep(250)
  }
  say(`TIMEOUT waiting for: ${label}`)
  return false
}

const results: Record<string, boolean> = {}
say(`host up on ${home}; scheduler running=${String(h.getProactivityStatus(scope).running)} cycleMs=${String(h.getProactivityStatus(scope).cycleMs)}`)

// 1. rest — the scheduler arms its first cycle after 5 s; wait for 4 cycles with nothing to do.
await until('first cycles', () => h.getProactivityStatus(scope).lastCycleAt !== '', 15_000)
await sleep(2_500)
say(`phase 1 rest: state=${h.getProactivityStatus(scope).state} runnerResolves=${String(resolves)} tickets=${String(tickets().length)}`)
results.restZeroModelCalls = resolves === 0 && tickets().length === 0 && h.getProactivityStatus(scope).state === 'resting'

// 2. a ticket nobody executes (what a crash or a full slot leaves): open, running, no report, no done line
{
  const at = new Date(Date.now() - 120_000).toISOString()
  h.orchestration.runtime('pp').repo.tickets.save({
    id: 't-stranded', title: 'Relatório do dia', decisionId: 'd1',
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], assignments: [{ id: 't-stranded-a1', state: 'running', createdAt: at, startedAt: at }], inputs: [], undelivered: [],
    createdAt: at, updatedAt: at, origin: { triggerId: 'm-old', triggerIds: ['m-old'] },
    execution: { name: 'Bento', directory: '.', assignment: 'Faça o relatório do dia' },
  })
}
say('phase 2 stranded: ticket t-stranded is running with nobody executing it; waiting for the team to notice…')
results.resumed = await until('ticket finished by the team', () => {
  const t = tickets().find(item => item.id === 't-stranded')
  return t !== undefined && t.assignments.at(-1)?.report?.state === 'ready'
}, 60_000)
say(`phase 2 done: ready=${String(results.resumed)} runnerResolves=${String(resolves)}`)
if (process.env.LIVE_STOP === '2') {
  for (const line of lines()) say(`  ${line.slice(0, 110)}`)
  await ctx.fiber.dispose()
  process.exit(0)
}

// 3. routine on an hourly rule due at the next minute
const minute = (new Date().getUTCMinutes() + 1) % 60
h.createRoutine({
  ...scope, id: 'r1', name: 'Resumo do dia', rrule: `FREQ=HOURLY;BYMINUTE=${String(minute)}`, timeZone: 'UTC', catchUp: 'run_once',
  silenceStart: '', silenceEnd: '',
})
h.screens.screens.put('pp', 'routine_spec', 'r1', { personaId: 'p2', prompt: 'Resuma o que a equipe entregou hoje.' })
say(`phase 3 routine: due at minute :${String(minute).padStart(2, '0')} UTC; waiting (≤ 75 s)…`)
results.routineRan = await until('routine ticket', () => tickets().some(item => item.execution?.name === 'Iris' && item.assignments.at(-1)?.report?.state === 'ready'), 75_000)
say(`phase 3 done: ran=${String(results.routineRan)} runs=${JSON.stringify(h.routines.listRuns('r1').map(run => run.status))}`)
await sleep(2_000)
results.routineOnce = tickets().filter(item => item.execution?.name === 'Iris').length === 1

// 4. goal + empty queue
h.boards.goals.save(ticketGoal('sprint-1', 'pp', 'Site no ar'))
say('phase 4 plan: goal “Site no ar” open, queue empty…')
results.planned = await until('planning ticket', () => tickets().some(item => /Planeje o próximo passo/.test(item.title)), 20_000)
await h.orchestration.flush('pp')
say(`phase 4 done: planned=${String(results.planned)}`)

// 5. pause
h.pauseTeam(scope)
const before = tickets().length
h.boards.goals.save({ ...ticketGoal('sprint-2', 'pp', 'Outro objetivo'), id: 'goal-2' })
await sleep(3_000)
say(`phase 5 pause: paused=${String(h.getTeamState(scope).paused)} state=${h.getProactivityStatus(scope).state} newTickets=${String(tickets().length - before)}`)
results.pausedNothingNew = tickets().length === before && h.getProactivityStatus(scope).state === 'paused'
h.resumeTeam(scope)
results.resumedAfterPause = await until('ticket after Retomar', () => tickets().length > before, 20_000)
await h.orchestration.flush('pp')

say('--- #geral ---')
for (const line of lines()) say(`  ${line.slice(0, 110)}`)
say('--- activity (watchdog_audit) ---')
for (const line of audits()) say(`  ${line.slice(0, 140)}`)
say(`--- result ${JSON.stringify(results)}`)
const ok = Object.values(results).every(Boolean)
await ctx.fiber.dispose()
say(ok ? 'PASS' : 'FAIL')
process.exit(ok ? 0 : 1)
