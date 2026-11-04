/**
 * V1-P0-1 real CLI: onboarding brief → `startFirstDelivery` → runner reply on #geral.
 * ≤3 runner turns (budget 1 ticket). Writes `persona-e2e/artifacts/first-delivery-real-cli.json`.
 * Requires logged-in Claude CLI (`PERSONA_REAL_CLI=1`).
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { verifyFirstDeliveryRun, type FirstDeliveryRunEvidence } from '@deepseek-ai/dsh-persona-engine'
import PersonaRunners from '@deepseek-ai/dsh-persona-runners'
import PersonaHost from '../src/index.ts'
import { DeliveryCallBudget, firstDeliveryProof } from './first-delivery-proof.ts'
import type { CompleteOnboardingRequest, ConnectionView } from '../src/types.ts'

if (process.env.PERSONA_REAL_E2E !== '1' && process.env.PERSONA_REAL_CLI !== '1') {
  throw new Error('First-delivery real smoke requires explicit PERSONA_REAL_E2E=1 or PERSONA_REAL_CLI=1')
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const artifactDir = join(repoRoot, 'packages', 'persona', 'persona-e2e', 'artifacts')
const artifactPath = join(artifactDir, 'first-delivery-real-cli.json')
const UX_PHASE_A_MS = 120_000

const home = mkdtempSync(join(tmpdir(), 'persona-first-delivery-'))
mkdirSync(join(home, 'db'), { recursive: true })
process.env.PERSONA_HOME = home
process.env.PERSONA_REAL_CLI = '1'
delete process.env.CLAUDE_CONFIG_DIR
delete process.env.CODEX_HOME

const ctx = new Context()
await ctx.plugin(PersonaRunners)
const h = new PersonaHost(ctx, { databasePath: join(home, 'db', 'persona.db') })
const budget = new DeliveryCallBudget(h.orchestration.runnerFactory, 3)
h.orchestration.runnerFactory = request => budget.resolve(request)
const failures: string[] = []
if (!h.usedPersonaRunners) failures.push('ctx.personaRunners not injected')
const scope = { workspaceId: 'ws', projectId: 'pp' }
const t0 = Date.now()

const cofre = 'Agência Ponto — estúdio de sites e campanhas para PMEs.'
const request: CompleteOnboardingRequest = {
  workspaceId: 'ws',
  personalProjectId: 'pp',
  displayName: 'Miguel',
  team: [{
    name: 'Atlas',
    title: 'Coordenação',
    description: 'Triagem e primeira entrega.',
    personality: 'Direta.',
    instructions: [
      'Você está no chat #geral da Persona.',
      'Entregue em português do Brasil: 5 pontos fiéis ao brief do Cofre e 1 tarefa da semana (dono + critério de pronto).',
      'Não invente cliente, preço ou ferramenta fora do brief.',
    ].join(' '),
    avatarKind: 'gallery',
    avatarRef: 'guia',
    runnerKind: 'cli',
    runnerCli: 'claude',
    runnerModel: 'haiku',
    canRecruit: true,
    systemRoles: ['coordination'],
  }],
  templateIds: [],
  runnerChoices: ['claude'],
  cofreSeed: cofre,
}
let connections: readonly ConnectionView[] = []
const execute = async (): Promise<void> => {
  await h.connections.ready()
  await h.completeOnboarding(request)
  connections = h.listConnections(scope)
  await h.startFirstDelivery(scope)
}
let timeout: ReturnType<typeof setTimeout> | undefined
try {
  await Promise.race([
    execute(),
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => { reject(new Error('first-delivery-flush-timeout')) }, UX_PHASE_A_MS)
    }),
  ])
} catch (error) {
  failures.push(error instanceof Error ? error.message : 'first-delivery-execution-failed')
  try {
    await budget.cancelAll()
  } catch (cancelError) {
    failures.push(cancelError instanceof Error ? cancelError.message : 'first-delivery-cancel-failed')
  }
} finally {
  if (timeout !== undefined) clearTimeout(timeout)
}

const elapsedMs = Date.now() - t0
const page = h.listMessages({
  ...scope,
  streamKind: 'channel',
  ownerId: 'geral',
  actorId: 'owner',
  afterSeq: 0,
  limit: 80,
})
const milestone = h.getFirstDelivery(scope)
const proof = firstDeliveryProof({
  elapsedMs, deadlineMs: UX_PHASE_A_MS, milestone,
  tasks: h.listTasks(scope), events: page.events,
})
const storedTicket = h.orchestration.runtime(scope.projectId).repo.tickets.get(milestone.ticketId)
const card = h.listTasks(scope).find(task => task.id === milestone.ticketId)
const delivered = page.events.find(event => event.id === proof.runnerId)
const evidence: FirstDeliveryRunEvidence = {
  askId: milestone.eventId,
  ticket: storedTicket === undefined || card === undefined
    ? undefined
    : { id: card.id, triggerId: storedTicket.origin.triggerId, stage: card.stage },
  loggedCli: connections.filter(connection => connection.loggedIn).map(connection => connection.kind),
  entries: h.ledger.list({ projectId: scope.projectId }),
  delivery: delivered === undefined ? undefined : {
    ticketId: milestone.ticketId, streamKind: 'channel', ownerId: 'geral',
    source: delivered.source, body: delivered.body,
  },
  milestone,
  milestoneEventIds: page.events.filter(event => event.id === milestone.feedEventId).map(event => event.id),
  elapsedMs, maxElapsedMs: UX_PHASE_A_MS, maxCalls: budget.limit,
}
const verification = verifyFirstDeliveryRun(evidence)
const report = {
  ...proof,
  home,
  artifactPath,
  usedPersonaRunners: h.usedPersonaRunners,
  execs: budget.calls.length,
  calls: budget.calls,
  callLimit: budget.limit,
  ms: elapsedMs,
  uxPhaseAMs: UX_PHASE_A_MS,
  ticketId: milestone.ticketId,
  milestone,
  evidence,
  verification,
  stages: h.orchestration.stages,
  broke: [...failures, ...proof.broke, ...verification.failed.map(failure => `evidence:${failure}`)],
}

mkdirSync(artifactDir, { recursive: true })
writeFileSync(artifactPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
await ctx.fiber.dispose()
process.exit(report.broke.length > 0 ? 1 : 0)
