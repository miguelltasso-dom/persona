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
import PersonaRunners from '@deepseek-ai/dsh-persona-runners'
import PersonaHost from '../src/index.ts'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const artifactDir = join(repoRoot, 'packages', 'persona', 'persona-e2e', 'artifacts')
const artifactPath = join(artifactDir, 'first-delivery-real-cli.json')
const UX_PHASE_A_MS = 120_000
const FLUSH_MS = UX_PHASE_A_MS

const home = mkdtempSync(join(tmpdir(), 'persona-first-delivery-'))
mkdirSync(join(home, 'db'), { recursive: true })
process.env.PERSONA_HOME = home
process.env.PERSONA_REAL_CLI = '1'
delete process.env.CLAUDE_CONFIG_DIR
delete process.env.CODEX_HOME

const report: Record<string, unknown> = {
  home,
  artifactPath,
  usedPersonaRunners: false,
  execs: 0,
  broke: [] as string[],
  ms: 0,
  uxPhaseAMs: UX_PHASE_A_MS,
  ticketId: '',
  runnerReply: '',
  runnerSource: '',
}

const ctx = new Context()
await ctx.plugin(PersonaRunners)
const h = new PersonaHost(ctx, { databasePath: join(home, 'db', 'persona.db') })
report.usedPersonaRunners = h.usedPersonaRunners
if (!h.usedPersonaRunners) (report.broke as string[]).push('ctx.personaRunners not injected')

const cofre = 'Agência Ponto — estúdio de sites e campanhas para PMEs.'
const onb = await h.completeOnboarding({
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
})
const scope = { workspaceId: 'ws', projectId: onb.personalProjectId || 'pp' }
report.listConnectionsFirst = h.listConnections(scope).find(item => item.kind === 'claude')

const t0 = Date.now()
const start = await h.startFirstDelivery(scope)
report.ticketId = start.ticketId
report.execs = 1
try {
  await Promise.race([
    h.orchestration.flush(scope.projectId),
    new Promise<never>((_, reject) => {
      setTimeout(() => { reject(new Error('first-delivery-flush-timeout')) }, FLUSH_MS)
    }),
  ])
} catch (error) {
  (report.broke as string[]).push(error instanceof Error ? error.message : 'flush')
}

report.ms = Date.now() - t0
const page = h.listMessages({
  ...scope,
  streamKind: 'channel',
  ownerId: 'geral',
  actorId: 'owner',
  afterSeq: 0,
  limit: 80,
})
const welcome = /Boas-vindas! Estou aqui para coordenar/u
const reply = page.events.find(item =>
  item.source === 'runner'
  && item.id !== 'first-delivery'
  && !welcome.test(item.body)
  && item.body.trim().length > 40,
)
report.runnerReply = reply?.body?.slice(0, 500) ?? ''
report.runnerSource = reply?.source ?? ''
report.runnerId = reply?.id ?? ''
report.stages = h.orchestration.stages

if (reply === undefined) (report.broke as string[]).push('no-runner-delivery-on-geral')
const elapsedMs = typeof report.ms === 'number' ? report.ms : 0
if (elapsedMs > UX_PHASE_A_MS) (report.broke as string[]).push(`ux-phase-a-exceeded-${elapsedMs}ms`)
if ((report.stages as Array<{ name: string }>).length > 3) {
  (report.broke as string[]).push('exec-budget-exceeded')
}

mkdirSync(artifactDir, { recursive: true })
writeFileSync(artifactPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
await Promise.race([
  ctx.fiber.dispose(),
  new Promise<void>((resolve) => { setTimeout(resolve, 3_000) }),
])
process.exit(report.broke instanceof Array && report.broke.length > 0 ? 1 : 0)
