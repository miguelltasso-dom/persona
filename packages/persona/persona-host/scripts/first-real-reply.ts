/**
 * First real #geral reply: temp PERSONA_HOME, PERSONA_REAL_CLI=1, Claude haiku.
 * ≤3 execs. Prints a JSON report for the Status line. Does not start the web UI
 * (Probe owns the browser E2E); this is the same host inject the persona profile uses.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import PersonaRunners from '@deepseek-ai/dsh-persona-runners'
import PersonaHost from '../src/index.ts'

const home = mkdtempSync(join(tmpdir(), 'persona-real-'))
mkdirSync(join(home, 'db'), { recursive: true })
process.env.PERSONA_HOME = home
process.env.PERSONA_REAL_CLI = '1'
delete process.env.CLAUDE_CONFIG_DIR
delete process.env.CODEX_HOME

const startedAt = Date.now()
const report: Record<string, unknown> = {
  home,
  usedPersonaRunners: false,
  execs: 0,
  broke: [] as string[],
  reply: '',
  stages: [] as string[],
  ms: 0,
}

const ctx = new Context()
await ctx.plugin(PersonaRunners)
const h = new PersonaHost(ctx, { databasePath: join(home, 'db', 'persona.db') })
report.usedPersonaRunners = h.usedPersonaRunners
if (!h.usedPersonaRunners) (report.broke as string[]).push('ctx.personaRunners not injected')

const onb = await h.completeOnboarding({
  workspaceId: 'ws',
  personalProjectId: 'pp',
  displayName: 'Ana',
  team: [{
    name: 'Guia', title: 'Coordenação', description: 'Triagem.', personality: 'Calma.',
    instructions: 'Responda em uma frase curta.', avatarKind: 'gallery', avatarRef: 'guia',
    runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'haiku', canRecruit: true,
    systemRoles: ['coordination'],
  }],
  templateIds: [],
  runnerChoices: ['claude'],
  cofreSeed: '',
})
const scope = { workspaceId: 'ws', projectId: onb.personalProjectId || 'pp' }
const firstPaint = await h.listConnections(scope)
report.listConnectionsFirst = firstPaint.find(item => item.kind === 'claude')
const cards = await h.connections.ready()
const claude = cards.find(item => item.kind === 'claude')
report.claude = claude === undefined
  ? 'missing'
  : { available: claude.available, loggedIn: claude.loggedIn, phase: claude.phase, error: claude.error }
if (claude?.loggedIn !== true) {
  (report.broke as string[]).push(
    `listConnections ready: ${claude?.error?.message ?? 'claude not logged in'}`,
  )
}
{
  const at = new Date().toISOString()
  h.postMessage({
    id: 'm-hi', ...scope, streamKind: 'channel', ownerId: 'geral',
    body: 'Responda só OK.', actorId: 'owner', subjectId: 't', occurredAt: at,
  })
  report.execs = Number(report.execs) + 1
  try {
    await Promise.race([
      h.orchestration.flush(scope.projectId),
      new Promise<never>((_, reject) => { setTimeout(() => { reject(new Error('flush-timeout')) }, 90_000) }),
    ])
  } catch (error) {
    (report.broke as string[]).push(error instanceof Error ? error.message : 'flush')
  }
  const page = h.listMessages({
    ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'owner', afterSeq: 0, limit: 50,
  })
  const reply = page.events.find(item => item.actorId !== 'owner' && item.id !== 'm-hi')
  report.reply = reply?.body ?? ''
  report.replyActor = reply?.actorId
  if (reply === undefined) (report.broke as string[]).push('no persona reply in SQLite')
  if (reply !== undefined && /Olá — em que posso ajudar/u.test(reply.body)) {
    (report.broke as string[]).push('reply stayed scripted (runner text not captured)')
  }

  h.postMessage({
    id: 'm-task', ...scope, streamKind: 'channel', ownerId: 'geral',
    body: 'preciso de um README no projeto', actorId: 'owner', subjectId: 't2',
    occurredAt: new Date().toISOString(),
  })
  report.execs = Number(report.execs) + 1
  report.stages = h.listTasks(scope).map(item => item.stage)
  try {
    await Promise.race([
      h.orchestration.flush(scope.projectId),
      new Promise<never>((_, reject) => { setTimeout(() => { reject(new Error('task-flush-timeout')) }, 90_000) }),
    ])
  } catch (error) {
    (report.broke as string[]).push(error instanceof Error ? error.message : 'task-flush')
  }
  report.stagesAfter = h.listTasks(scope).map(item => `${item.stage}:${item.title}`)
}

report.ms = Date.now() - startedAt
const out = join(home, 'first-real-reply.json')
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
await Promise.race([
  ctx.fiber.dispose(),
  new Promise<void>((resolve) => { setTimeout(resolve, 3_000) }),
])
process.exit(0)
