/**
 * Read-only acceptance verdict of one real (or rehearsed) first-delivery run, by Forge's PURE verifier `verifyRealFirstDeliveryRun`
 * (persona-spec/contracts/first-delivery-real-proof.md). The run's database is COPIED to a scratch directory; the copy is opened with the
 * host's own read APIs for the observation (ticket, delivery, milestone). No runner, no CLI: every engine is hidden from PATH, so nothing
 * can spend. The verdict that decides acceptance is `passed` of THIS verifier, never `run.passed` alone.
 *
 *   node --import tsx/esm packages/persona/persona-e2e/scripts/verify-real-run.ts --home <run home> --input <input.json> --out <verdict.json>
 *
 * input.json: { ledger (canonical TurnLedgerEntry[] read from the DB, unknown to this script), attempts (whole history INCLUDING the
 * current attempt, `paidTurns` per settled row), currentAttempt (1-based, last), elapsedMs, maxElapsedMs }. Writes one JSON document to --out.
 */
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { verifyRealFirstDeliveryRun } from '../../persona-engine/src/index.ts'
import { withNoEngineOnPath } from '../src/fake-cli.ts'

function arg(name: string): string {
  const index = process.argv.indexOf(`--${name}`)
  const value = index < 0 ? undefined : process.argv[index + 1]
  if (value === undefined || value === '') throw new Error(`missing --${name}`)
  return value
}

interface VerifierInput {
  ledger: unknown
  attempts: unknown
  currentAttempt: number
  elapsedMs: number
  maxElapsedMs: number
  /** CLIs reporting a logged-in account, asked independently of the run. Absent only in a rehearsal (then derived, which is circular). */
  loggedCli?: string[]
}

const home = arg('home')
const outFile = arg('out')
const input = JSON.parse(readFileSync(arg('input'), 'utf8')) as VerifierInput
const source = join(home, 'db', 'persona.db')
if (!existsSync(source)) throw new Error(`no database at ${source}`)

const scratch = mkdtempSync(join(tmpdir(), 'verify-real-run-'))
const copy = join(scratch, 'persona.db')
copyFileSync(source, copy)
for (const suffix of ['-wal', '-shm']) if (existsSync(source + suffix)) copyFileSync(source + suffix, copy + suffix)

// Nothing in this process may reach a real engine.
const noEngine = withNoEngineOnPath()
process.env.PERSONA_HOME = scratch
delete process.env.PERSONA_REAL_CLI
process.env.PERSONA_SCRIPTED = '1'

const probe = new DatabaseSync(copy, { readOnly: true })
const workspace = probe.prepare('SELECT id FROM workspace ORDER BY created_at LIMIT 1').get() as { id: string } | undefined
const project = probe.prepare("SELECT id FROM project WHERE kind = 'personal' LIMIT 1").get() as { id: string } | undefined
const owner = probe.prepare("SELECT id FROM member WHERE role = 'owner' LIMIT 1").get() as { id: string } | undefined
probe.close()
if (workspace === undefined || project === undefined || owner === undefined) {
  writeFileSync(outFile, JSON.stringify({ passed: false, failed: ['observation-unavailable'], detail: 'workspace/personal project/owner not found in the database copy' }))
  noEngine.restore()
  rmSync(scratch, { recursive: true, force: true })
  process.exit(0)
}
const scope = { workspaceId: workspace.id, projectId: project.id }

// Non-literal specifier on purpose: cordis is a dependency of persona-host, not of this package (no static resolution/types here).
const cordisEntry = '../../persona-host/node_modules/@deepseek-ai/cordis/lib/index.js'
const { Context } = await import(cordisEntry) as { Context: new () => { fiber: { dispose(): Promise<void> } } }
const { default: PersonaHost } = await import('../../persona-host/src/index.ts')
const ctx = new Context()
const host = new PersonaHost(ctx as never, { databasePath: copy })

const milestone = host.getFirstDelivery(scope)
const page = host.listMessages({ ...scope, streamKind: 'channel', ownerId: 'geral', actorId: owner.id, afterSeq: 0, limit: 200 })
const tasks = host.listTasks(scope)
const stored = host.orchestration.runtime(scope.projectId).repo.tickets.get(milestone.ticketId)
const card = tasks.find(task => task.id === milestone.ticketId)
const delivered = page.events.find(event => event.id === `coord-${milestone.ticketId}-done` && event.source === 'runner')
const ledgerRows = Array.isArray(input.ledger) ? input.ledger as { kind?: string; engine?: string }[] : []
const executed = ledgerRows.find(row => row.kind === 'execution')
const observation = {
  askId: milestone.eventId,
  ticket: stored === undefined || card === undefined ? undefined : { id: card.id, triggerId: stored.origin.triggerId, stage: card.stage },
  // `loggedCli` comes from the harness (`claude auth status --json` before the run, outside the app); only a rehearsal without it falls back
  // to the engine of the ledger's own row, which makes the connected-cli check circular.
  loggedCli: Array.isArray(input.loggedCli) ? input.loggedCli : (executed?.engine === undefined ? [] : [executed.engine]),
  delivery: delivered === undefined ? undefined : { ticketId: milestone.ticketId, streamKind: 'channel', ownerId: 'geral', source: delivered.source, body: delivered.body },
  milestone,
  milestoneEventIds: page.events.filter(event => event.id === milestone.feedEventId).map(event => event.id),
  elapsedMs: input.elapsedMs,
  maxElapsedMs: input.maxElapsedMs,
  maxCalls: 1,
}

const result = verifyRealFirstDeliveryRun({
  observation: observation as never,
  ledger: input.ledger,
  attempts: input.attempts,
  currentAttempt: input.currentAttempt,
})

await ctx.fiber.dispose().catch(() => {})
noEngine.restore()
rmSync(scratch, { recursive: true, force: true })
writeFileSync(outFile, JSON.stringify({
  passed: result.passed,
  result,
  observation: {
    askId: observation.askId,
    ticket: observation.ticket,
    loggedCli: observation.loggedCli,
    deliveryFound: delivered !== undefined,
    deliveryBodyChars: delivered?.body.length ?? 0,
    milestoneStatus: milestone.status,
    milestoneEventIds: observation.milestoneEventIds,
    elapsedMs: observation.elapsedMs,
  },
}, null, 2))
process.exit(0)
