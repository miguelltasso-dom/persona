import { afterAll, beforeAll, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unstable_dev, type Unstable_DevWorker } from 'wrangler'
import { IdentityCipher, MemorySyncLog } from '../../../packages/persona/persona-core/src/sync/index.ts'
import type { SyncEnvelope } from '../../../packages/persona/persona-core/src/sync/types.ts'
import { HttpTransport, SyncClient, WorkspaceCipher } from '../../../packages/persona/persona-sync/src/index.ts'

const scriptPath = fileURLToPath(new URL('../src/index.ts', import.meta.url))
const configPath = fileURLToPath(new URL('../wrangler.toml', import.meta.url))
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const shotsDir = join(repoRoot, '.maestri', 'tmp', 'shots', 'remote')

const WORKSPACE = 'remote-ab'
const STREAM = 'channel:geral'

let worker: Unstable_DevWorker | undefined

beforeAll(async () => {
  worker = await unstable_dev(scriptPath, {
    config: configPath,
    persist: false,
    local: true,
    logLevel: 'error',
    vars: { GITHUB_WEBHOOK_SECRET: 'test-secret' },
    experimental: {
      disableExperimentalWarning: true,
      forceLocal: true,
      disableDevRegistry: true,
      watch: false,
    },
  })
}, 90_000)

afterAll(async () => {
  await worker?.stop()
})

function fetchImpl(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (worker === undefined) throw new Error('wrangler')
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input.url
  return worker.fetch(url, init)
}

function envelope(overrides: Partial<SyncEnvelope> = {}): SyncEnvelope {
  return {
    workspaceId: WORKSPACE,
    streamId: STREAM,
    seq: 1,
    idempotencyKey: 'ab-1',
    classification: 'channel',
    at: '2026-11-04T05:00:00Z',
    payload: IdentityCipher.seal('olá do A', 'wk1'),
    ...overrides,
  }
}

it('two desks: invite, #geral converges, DM/task stay local, B offline/resume, revoke cuts', async () => {
  const cipher = new WorkspaceCipher('segredo-ws', 'wk1')
  const transportA = new HttpTransport('http://edge.test', WORKSPACE, fetchImpl, 'ana')
  const transportB = new HttpTransport('http://edge.test', WORKSPACE, fetchImpl, 'beto')
  const deskA = new SyncClient({
    log: new MemorySyncLog(), transport: transportA, cipher, workspaceKeyId: 'wk1',
  })
  const deskB = new SyncClient({
    log: new MemorySyncLog(), transport: transportB, cipher, workspaceKeyId: 'wk1',
  })

  const owner = {
    kind: 'user' as const,
    id: 'ana',
    workspaceId: WORKSPACE,
    workspaceRole: 'owner' as const,
    projectIds: ['launch'],
  }
  const guest = {
    kind: 'user' as const,
    id: 'beto',
    workspaceId: WORKSPACE,
    workspaceRole: 'guest' as const,
    projectIds: [] as string[],
  }

  const joined = await fetchImpl(`http://edge.test/w/${WORKSPACE}/members`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(owner),
  })
  expect(joined.ok).toBe(true)

  const issued = await fetchImpl(`http://edge.test/w/${WORKSPACE}/invites`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-persona-actor': 'ana' },
    body: JSON.stringify({
      id: 'inv-ab',
      token: 'tok-ab',
      grant: { workspaceRole: 'member', projectIds: ['launch'], channelIds: ['geral'], dmIds: [] },
      ttlMs: 60_000,
    }),
  })
  expect(issued.ok).toBe(true)

  const redeemed = await fetchImpl(`http://edge.test/w/${WORKSPACE}/invites/tok-ab/redeem`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(guest),
  })
  const redeemedBody = await redeemed.json() as { actor: { projectIds: string[]; workspaceRole: string } }
  expect(redeemedBody.actor.projectIds).toContain('launch')
  expect(redeemedBody.actor.workspaceRole).toBe('member')

  expect(await deskA.push(envelope({ payload: deskA.seal('olá do A') }))).toMatchObject({
    status: 'appended', seq: 1,
  })
  await deskB.pull(STREAM)
  expect(deskB.log.after(STREAM, 0).map(item => item.seq)).toEqual([1])
  expect(deskB.open(deskB.log.after(STREAM, 0)[0].payload)).toBe('olá do A')

  expect(await deskB.push(envelope({
    seq: 2,
    idempotencyKey: 'ab-2',
    at: '2026-11-04T05:01:00Z',
    payload: deskB.seal('oi, estou no #geral'),
  }))).toMatchObject({ status: 'appended', seq: 2 })
  await deskA.pull(STREAM)
  expect(deskA.log.after(STREAM, 0).map(item => item.seq)).toEqual([1, 2])
  expect(deskB.log.after(STREAM, 0).map(item => item.seq)).toEqual([1, 2])

  expect(await deskA.push(envelope({
    classification: 'dm', streamId: 'dm:ana-beto', seq: 1, idempotencyKey: 'dm-ab',
    payload: deskA.seal('segredo do A'),
  }))).toMatchObject({ status: 'refused', code: 'PRIVATE_NOT_SHARED' })
  expect(deskA.outbox).toHaveLength(0)

  const localRun: SyncEnvelope = envelope({
    classification: 'private',
    streamId: 'task-run:raposa-1',
    seq: 1,
    idempotencyKey: 'run-ab',
    payload: IdentityCipher.seal('executou no A', 'wk1'),
  })
  expect(await deskA.push(localRun)).toMatchObject({ status: 'refused', code: 'PRIVATE_NOT_SHARED' })
  deskA.log.append(localRun)
  expect(deskA.log.head('task-run:raposa-1')).toBe(1)
  expect(deskB.log.head('task-run:raposa-1')).toBe(0)

  const gate = {
    online: false,
    async append(next: SyncEnvelope) {
      if (!this.online) return { status: 'offline' as const, seq: 0 }
      return transportB.append(next)
    },
    after(streamId: string, afterSeq: number) {
      return this.online ? transportB.after(streamId, afterSeq) : Promise.resolve([])
    },
  }
  const parked = new SyncClient({
    log: deskB.log, transport: gate, cipher, workspaceKeyId: 'wk1',
  })
  parked.restoreCursors(deskB.cursorSnapshot())
  expect(await parked.push(envelope({
    seq: 3,
    idempotencyKey: 'ab-3',
    at: '2026-11-04T05:02:00Z',
    payload: deskB.seal('B escreveu offline'),
  }))).toMatchObject({ status: 'offline' })
  expect(await deskA.push(envelope({
    seq: 3,
    idempotencyKey: 'ab-3a',
    at: '2026-11-04T05:02:30Z',
    payload: deskA.seal('A enquanto B estava fora'),
  }))).toMatchObject({ status: 'appended', seq: 3 })
  gate.online = true
  expect(await parked.flush()).toMatchObject([{ status: 'refused', code: 'SEQ_GAP' }])
  await parked.pull(STREAM)
  expect(parked.log.after(STREAM, 0).map(item => item.seq)).toEqual([1, 2, 3])
  expect(parked.open(parked.log.after(STREAM, 0)[2].payload)).toBe('A enquanto B estava fora')

  const revoked = await fetchImpl(`http://edge.test/w/${WORKSPACE}/invites/inv-ab/revoke`, {
    method: 'POST',
    headers: { 'x-persona-actor': 'ana' },
  })
  expect(revoked.ok).toBe(true)

  const cutAppend = await fetchImpl(`http://edge.test/w/${WORKSPACE}/sync/append`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-persona-actor': 'beto' },
    body: JSON.stringify(envelope({
      seq: 4, idempotencyKey: 'ab-4', payload: deskB.seal('B depois da revogação'),
    })),
  })
  expect(cutAppend.status).toBe(403)
  expect(await cutAppend.json()).toMatchObject({ status: 'refused', code: 'ACCESS_REVOKED' })

  const cutAfter = await fetchImpl(
    `http://edge.test/w/${WORKSPACE}/sync/after?streamId=${STREAM}&afterSeq=0`,
    { headers: { 'x-persona-actor': 'beto' } },
  )
  expect(cutAfter.status).toBe(403)
  expect(await cutAfter.json()).toMatchObject({ status: 'refused', code: 'ACCESS_REVOKED' })

  expect(await deskA.push(envelope({
    seq: 4,
    idempotencyKey: 'ab-4a',
    at: '2026-11-04T05:04:00Z',
    payload: deskA.seal('A segue no #geral'),
  }))).toMatchObject({ status: 'appended', seq: 4 })
  expect(deskA.log.after(STREAM, 0).map(item => item.seq)).toEqual([1, 2, 3, 4])
  expect(deskB.log.after(STREAM, 0).map(item => item.seq)).toEqual([1, 2, 3])

  writeRemoteShots({
    aSeq: deskA.log.after(STREAM, 0).map(item => deskA.open(item.payload)),
    bSeq: deskB.log.after(STREAM, 0).map(item => deskB.open(item.payload)),
    aHasTaskRun: deskA.log.head('task-run:raposa-1') === 1,
    bHasTaskRun: deskB.log.head('task-run:raposa-1') === 1,
    revoked: true,
  })
})

function writeRemoteShots(input: {
  readonly aSeq: readonly string[]
  readonly bSeq: readonly string[]
  readonly aHasTaskRun: boolean
  readonly bHasTaskRun: boolean
  readonly revoked: boolean
}): void {
  mkdirSync(shotsDir, { recursive: true })
  writeFileSync(join(shotsDir, 'transcript.json'), `${JSON.stringify({
    workspace: WORKSPACE,
    stream: STREAM,
    deskA: { home: 'PERSONA_HOME=A', messages: input.aSeq, taskRunPresent: input.aHasTaskRun },
    deskB: { home: 'PERSONA_HOME=B', messages: input.bSeq, taskRunPresent: input.bHasTaskRun },
    revokeCuts: input.revoked,
    capturedAt: new Date().toISOString(),
  }, null, 2)}\n`)
  writeFileSync(join(shotsDir, 'index.html'), dualPaneHtml(input))
  writeFileSync(join(shotsDir, 'README.md'), [
    '# Equipes à distância — prova local',
    '',
    'Dois desks (homes isolados = `MemorySyncLog`) + `persona-edge` em `wrangler unstable_dev`.',
    '',
    '- Convite A→B redimido uma vez',
    '- `#geral` converge (mesmos seq)',
    '- DM e `task-run:` nunca sobem',
    '- Tarefa da persona de A executa só no desk A',
    '- B offline e retoma o canal',
    '- Revogar o convite corta append/after do B (`ACCESS_REVOKED`)',
    '',
    'Abrir `index.html` lado a lado. E11 (deploy Cloudflare) continua blocked até o Atlas.',
    '',
  ].join('\n'))
}

function dualPaneHtml(input: {
  readonly aSeq: readonly string[]
  readonly bSeq: readonly string[]
  readonly aHasTaskRun: boolean
  readonly bHasTaskRun: boolean
  readonly revoked: boolean
}): string {
  const rows = (bodies: readonly string[], extra: string) => [
    ...bodies.map((body, index) => `<div class="msg"><span class="seq">#geral · ${index + 1}</span>${escapeHtml(body)}</div>`),
    extra,
  ].join('')
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Persona — equipes à distância</title>
<style>
  :root { color-scheme: light; --ink:#1c1917; --muted:#78716c; --line:#e7e5e4; --ok:#166534; --cut:#9f1239; }
  body { margin:0; font:14px/1.45 ui-sans-serif, system-ui; background:#f5f5f4; color:var(--ink); }
  h1 { font-size:16px; margin:16px 24px 8px; }
  .sub { margin:0 24px 16px; color:var(--muted); }
  .pair { display:grid; grid-template-columns:1fr 1fr; gap:16px; padding:0 24px 24px; }
  .win { background:#fff; border:1px solid var(--line); border-radius:12px; min-height:420px; overflow:hidden; }
  .chrome { padding:10px 14px; border-bottom:1px solid var(--line); font-weight:600; }
  .home { font-weight:400; color:var(--muted); font-size:12px; }
  .feed { padding:14px; display:flex; flex-direction:column; gap:8px; }
  .msg { padding:8px 10px; background:#fafaf9; border-radius:8px; }
  .seq { display:block; font-size:11px; color:var(--muted); }
  .local { background:#ecfdf5; color:var(--ok); }
  .cut { background:#fff1f2; color:var(--cut); }
</style></head><body>
<h1>Persona — duas janelas (A | B)</h1>
<p class="sub">Edge local · convite · #geral · DM/tarefa locais · B offline/retoma · revogar corta</p>
<div class="pair">
  <section class="win">
    <div class="chrome">Desk A <span class="home">PERSONA_HOME=A · porta local A</span></div>
    <div class="feed">${rows(input.aSeq, `<div class="msg local">${input.aHasTaskRun ? 'Tarefa da Raposa executou aqui (task-run:raposa-1). Não subiu.' : 'falhou: tarefa não ficou local'}</div>`)}</div>
  </section>
  <section class="win">
    <div class="chrome">Desk B <span class="home">PERSONA_HOME=B · porta local B</span></div>
    <div class="feed">${rows(input.bSeq, `<div class="msg cut">${input.revoked ? 'Acesso revogado — append/after = ACCESS_REVOKED. Sem a 4ª mensagem do A.' : 'revogação não cortou'}</div><div class="msg local">${input.bHasTaskRun ? 'ERRO: tarefa de A vazou para B' : 'Tarefa de A não está neste desk.'}</div>`)}</div>
  </section>
</div>
</body></html>
`
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
