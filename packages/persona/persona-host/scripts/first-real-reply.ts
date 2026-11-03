/**
 * BANANA proof: one real CLI talk on #geral. ≤3 execs (this script uses 1).
 * Selects coord-m-banana-reply — never the onboarding welcome.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import PersonaRunners from '@deepseek-ai/dsh-persona-runners'
import PersonaHost from '../src/index.ts'

const home = mkdtempSync(join(tmpdir(), 'persona-banana-'))
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
  source: '',
  actorId: '',
  stages: [] as Array<{ name: string; ms: number }>,
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
    instructions: 'Você está em um chat. Não execute ferramenta. Não olhe o disco. Responda só com BANANA.',
    avatarKind: 'gallery', avatarRef: 'guia',
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

h.postMessage({
  id: 'm-banana', ...scope, streamKind: 'channel', ownerId: 'geral',
  body: 'Responda só com a palavra BANANA em maiúsculas',
  actorId: 'owner', subjectId: 't-banana', occurredAt: new Date().toISOString(),
})
report.execs = 1
try {
  await Promise.race([
    h.orchestration.flush(scope.projectId),
    new Promise<never>((_, reject) => { setTimeout(() => { reject(new Error('banana-flush-timeout')) }, 60_000) }),
  ])
} catch (error) {
  (report.broke as string[]).push(error instanceof Error ? error.message : 'flush')
}

const page = h.listMessages({
  ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'owner', afterSeq: 0, limit: 80,
})
const reply = page.events.find(item => item.id === 'coord-m-banana-reply')
  ?? page.events.find(item => item.source === 'runner' && /BANANA/u.test(item.body))
report.reply = reply?.body ?? ''
report.replyActor = reply?.actorId ?? ''
report.source = reply?.source ?? ''
report.type = reply?.type ?? ''
report.ids = page.events.map(item => `${item.id}:${item.actorId}:${item.type}:${item.source}`)
report.stages = h.orchestration.stages
report.permissionSeen = h.orchestration.stages.map(item => item.name)

if (reply === undefined) (report.broke as string[]).push('no coord-m-banana-reply')
if (reply !== undefined && reply.actorId === 'owner') (report.broke as string[]).push('actor is owner')
if (reply !== undefined && reply.source !== 'runner') (report.broke as string[]).push(`source=${reply.source}`)
if (reply !== undefined && !/BANANA/u.test(reply.body)) (report.broke as string[]).push('body is not BANANA')
if (reply !== undefined && /Bem-vindos/u.test(reply.body)) (report.broke as string[]).push('onboarding welcome, not model')

const sqlite = h.store.db.prepare(
  'SELECT id, actor_id AS actorId, type, body FROM event WHERE id = ?',
).get('coord-m-banana-reply') as { id: string; actorId: string; type: string; body: string } | undefined
report.sqlite = sqlite
if (sqlite === undefined) (report.broke as string[]).push('sqlite missing coord-m-banana-reply')
if (sqlite !== undefined && sqlite.type !== 'runner') (report.broke as string[]).push(`sqlite type=${sqlite.type}`)
if (sqlite !== undefined && !/BANANA/u.test(sqlite.body)) (report.broke as string[]).push('sqlite body not BANANA')

report.ms = Date.now() - startedAt
const out = join(home, 'banana-reply.json')
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
await Promise.race([
  ctx.fiber.dispose(),
  new Promise<void>((resolve) => { setTimeout(resolve, 3_000) }),
])
process.exit(report.broke instanceof Array && report.broke.length > 0 ? 1 : 0)
