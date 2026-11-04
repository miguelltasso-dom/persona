/** Two full Persona profiles + local edge, no development seed and no real model calls. Run under --lock build. */
import { spawn, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { freePort } from '../../../../scripts/persona/free-port.mjs'

if (process.env.PERSONA_LOCK !== 'build') throw new Error('Run this proof under with-lock --lock build')

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const require = createRequire(join(root, 'packages/persona/persona-e2e/package.json'))
const { chromium } = require('playwright')
const home = mkdtempSync(join(tmpdir(), 'persona-sync-real-'))
const out = join(root, '.maestri/tmp/shots/remote/sync-real')
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'proof.json'), `${JSON.stringify({ passed: false, status: 'running', home })}\n`)
const scope = { workspaceId: `sync-${randomUUID()}`, projectId: 'shared-sync' }
const channelId = `geral:${scope.projectId}`
const streamId = `project:${scope.projectId}:channel:${channelId}`
const edgePort = process.env.PERSONA_SYNC_EDGE_PORT ?? String(await freePort())
const aPort = Number(process.env.PERSONA_SYNC_A_PORT ?? await freePort())
const bPort = Number(process.env.PERSONA_SYNC_B_PORT ?? await freePort())
const edgeUrl = `http://127.0.0.1:${edgePort}`
const children = new Set()
const contexts = []
const steps = []
const fatal = []
let browser
let stopping = false
const clean = text => text.replace(/token=[^\s]+/gu, 'token=[redacted]')

function launch(label, args, extra = {}, cwd = root) {
  const child = spawn(process.execPath, args, {
    cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PERSONA_SCRIPTED: '1', PERSONA_REAL_CLI: '0', PERSONA_VAULT_TEST_CIPHER: '1', WRANGLER_SEND_METRICS: 'false',
      DSH_TELEMETRY_DISABLED: '1', ...extra },
  })
  const owned = { child, label, text: '' }
  children.add(owned)
  child.stdout.on('data', data => { owned.text += data.toString() })
  child.stderr.on('data', data => { owned.text += data.toString() })
  child.on('error', error => { owned.text += `\n${error.message}` })
  return owned
}

async function stop(owned) {
  if (!children.has(owned)) return
  if (owned.child.exitCode === null && owned.child.pid !== undefined) {
    try { execFileSync('taskkill', ['/T', '/F', '/PID', String(owned.child.pid)], { stdio: 'ignore' }) }
    catch (error) { if (owned.child.exitCode === null) throw error }
  }
  children.delete(owned)
}

async function until(test, label, ms = 120_000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const value = await test()
    if (value) return value
    await new Promise(done => setTimeout(done, 250))
  }
  throw new Error(`timeout:${label}`)
}

async function startDesk(name, port) {
  const deskHome = join(home, name)
  mkdirSync(deskHome, { recursive: true })
  const patch = join(deskHome, 'sync.overlay.yml')
  writeFileSync(patch, '- id: persona-host\n  config:\n    databasePath: ""\n    remoteTeamPollMs: 500\n    remoteTeamTimeoutMs: 5000\n')
  const owned = launch(name, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', 'persona',
    '--patch', 'apps/web/tests/pin-browse-picker.overlay.yml', '--patch', patch,
    '--no-open', '--host', '127.0.0.1', '--port', String(port)],
  { DSH_HOME: deskHome, PERSONA_HOME: deskHome })
  const url = await until(() => {
    const match = /dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/u.exec(owned.text)
    if (match) return match[1]
    if (owned.child.exitCode !== null) throw new Error(`${name}-boot-exited:${clean(owned.text).slice(-1200)}`)
    return undefined
  }, `${name}-boot`, 180_000)
  return { name, port, owned, url, home: deskHome }
}

async function rpc(desk, method, request) {
  const response = await desk.context.request.post(new URL(`/api/persona/${method}`, desk.url).href, {
    data: { type: 'client-request', rpcId: randomUUID(), method: `persona/${method}`, payload: { args: { request } } },
    timeout: 60_000,
  })
  if (!response.ok()) throw new Error(`rpc:${method}:http-${response.status()}`)
  const body = await response.json()
  if (body.result?.ok !== true) {
    const message = body.result?.error?.message ?? ''
    const safe = /^remote-team-/u.test(message) ? message : (body.result?.error?.code ?? 'invalid-result')
    throw new Error(`rpc:${method}:${safe}`)
  }
  return body.result.value
}

async function prepare(desk) {
  desk.context = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1440, height: 900 } })
  contexts.push(desk.context)
  await desk.context.request.get(desk.url)
  await rpc(desk, 'createWorkspace', { id: scope.workspaceId, name: `Mesa ${desk.name}`, personalProjectId: `personal-${desk.name}` })
  await rpc(desk, 'createMember', { ...scope, projectId: `personal-${desk.name}`, id: desk.name,
    displayName: desk.name, handle: desk.name, role: 'owner' })
  await rpc(desk, 'createProject', { id: scope.projectId, workspaceId: scope.workspaceId, name: 'Canal compartilhado', description: '' })
  await rpc(desk, 'completeOnboarding', {
    workspaceId: scope.workspaceId, personalProjectId: `personal-${desk.name}`, displayName: desk.name,
    team: [{ name: `Equipe ${desk.name}`, title: 'Coordenação local', description: 'Prova local.', personality: 'Direta.',
      instructions: 'Responda em português.', avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'dsh',
      runnerCli: '', runnerModel: 'default', canRecruit: false, systemRoles: ['coordination'] }],
    templateIds: [], runnerChoices: ['dsh'], cofreSeed: `Dados exclusivos da mesa ${desk.name}.`,
  })
  await desk.context.addInitScript(({ scope, channelId, actor }) => {
    localStorage.setItem('persona.tenant.v1', JSON.stringify({ ...scope, memberId: actor, channelId }))
    localStorage.setItem('persona.onboarding.complete.v1', '1')
    localStorage.removeItem('persona.devSeed.v1')
  }, { scope, channelId, actor: desk.name })
  desk.page = await desk.context.newPage()
  desk.page.on('pageerror', error => { fatal.push(`${desk.name}:${error.name}`) })
  await desk.page.goto(desk.url, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await openChannel(desk)
}

async function openChannel(desk) {
  await desk.page.locator('[data-persona-shell]').waitFor({ timeout: 120_000 })
  await desk.page.getByRole('button', { name: 'Canais', exact: true }).click()
  await desk.page.locator('[data-persona-area="composer"] textarea').first().waitFor({ timeout: 60_000 })
}

async function messages(desk, streamKind = 'channel', ownerId = channelId) {
  return rpc(desk, 'listMessages', { ...scope, streamKind, ownerId, actorId: desk.name, afterSeq: 0, limit: 100 })
}

async function post(desk, body, streamKind = 'channel', ownerId = channelId) {
  return rpc(desk, 'postMessage', { ...scope, id: randomUUID(), streamKind, ownerId, body,
    actorId: desk.name, subjectId: 'sync-real-proof', occurredAt: new Date().toISOString() })
}

async function pair(step, a, b) {
  for (const desk of [a, b]) await desk.page.screenshot({ path: join(out, `${step}-${desk.name}.png`), fullPage: true })
  steps.push({ step, at: new Date().toISOString(), a: await rpc(a, 'getRemoteTeamState', scope),
    b: await rpc(b, 'getRemoteTeamState', scope) })
  console.log(`sync-real:${step}`)
}

async function cleanup() {
  if (stopping) return
  stopping = true
  for (const context of contexts) await context.close().catch(() => undefined)
  await browser?.close().catch(() => undefined)
  for (const owned of [...children]) await stop(owned).catch(() => undefined)
}

const watchdog = setTimeout(() => {
  void cleanup().finally(() => { console.error('sync-real:deadline'); process.exit(1) })
}, 600_000)

try {
  const edge = launch('edge', [join(root, 'apps/persona-edge/node_modules/wrangler/bin/wrangler.js'),
    'dev', '--local', '--ip', '127.0.0.1', '--port', edgePort, '--persist-to', join(home, 'edge')], {}, join(root, 'apps/persona-edge'))
  await until(() => edge.text.includes(`Ready on http://127.0.0.1:${edgePort}`), 'edge-ready', 90_000)
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const a = await startDesk('Alice', aPort)
  const b = await startDesk('Bob', bPort)
  await prepare(a)
  await prepare(b)
  await rpc(a, 'connectRemoteTeam', { ...scope, edgeUrl, channelIds: [channelId] })
  const invite = await rpc(a, 'issueInvite', { ...scope, inviteId: randomUUID(), token: '', role: 'member' })
  await pair('01-invite', a, b)
  await rpc(b, 'acceptInvite', { ...scope, edgeUrl, token: invite.token })
  await pair('02-accepted', a, b)
  const marker = `Mensagem nova do A · ${randomUUID().slice(0, 8)}`
  if ((await messages(b)).events.some(event => event.body === marker)) throw new Error('marker-existed-before-send')
  await post(a, marker)
  await until(async () => (await messages(b)).events.some(event => event.body === marker), 'B-receives-new-message', 30_000)
  await b.page.getByText(marker, { exact: true }).waitFor({ timeout: 30_000 })
  await a.page.getByText(marker, { exact: true }).waitFor({ timeout: 30_000 })
  await pair('03-channel-converged', a, b)
  await rpc(a, 'createMember', { ...scope, id: 'local-friend', displayName: 'Contato local', handle: 'local-friend', role: 'member' })
  await rpc(a, 'createDm', { ...scope, id: 'private-proof', participantA: a.name, participantB: 'local-friend' })
  const secret = `DM só na mesa A · ${randomUUID().slice(0, 8)}`
  const privateEvent = await post(a, secret, 'dm', 'private-proof')
  await rpc(a, 'syncRemoteTeam', scope)
  await rpc(b, 'syncRemoteTeam', scope)
  if ((await messages(b)).events.some(event => event.id === privateEvent.id)) throw new Error('dm-leaked')
  await a.page.reload({ waitUntil: 'domcontentloaded' })
  await a.page.locator('[data-persona-shell]').waitFor({ timeout: 60_000 })
  await a.page.getByRole('button', { name: 'Mensagens diretas', exact: true }).click()
  await a.page.getByRole('button').filter({ hasText: 'Contato local' }).first().click({ timeout: 30_000 })
  await a.page.getByText(secret, { exact: true }).waitFor({ timeout: 30_000 })
  await pair('04-dm-isolated', a, b)
  await openChannel(a)
  const firstCursor = await rpc(b, 'getRemoteTeamState', scope)
  await stop(b.owned)
  const offlineMarker = `Mensagem durante a pausa do B · ${randomUUID().slice(0, 8)}`
  await post(a, offlineMarker)
  await rpc(a, 'syncRemoteTeam', scope)
  const resumed = await startDesk('Bob', bPort)
  b.owned = resumed.owned
  b.url = resumed.url
  await b.context.request.get(b.url)
  await b.page.goto(b.url, { waitUntil: 'domcontentloaded' })
  await openChannel(b)
  await until(async () => (await messages(b)).events.some(event => event.body === offlineMarker), 'cursor-resume', 30_000)
  await b.page.getByText(offlineMarker, { exact: true }).waitFor({ timeout: 30_000 })
  await pair('05-offline-resumed', a, b)
  await rpc(a, 'revokeMember', { ...scope, inviteId: invite.id })
  await until(async () => (await rpc(b, 'getRemoteTeamState', scope))?.status === 'revoked', 'revoked-state', 30_000)
  const forbidden = `Depois da revogação · ${randomUUID().slice(0, 8)}`
  await post(a, forbidden)
  await rpc(a, 'syncRemoteTeam', scope)
  await rpc(b, 'syncRemoteTeam', scope)
  if ((await messages(b)).events.some(event => event.body === forbidden)) throw new Error('revoked-B-received')
  const bAfter = `B revogado tenta enviar · ${randomUUID().slice(0, 8)}`
  await post(b, bAfter)
  await rpc(b, 'syncRemoteTeam', scope)
  await rpc(a, 'syncRemoteTeam', scope)
  if ((await messages(a)).events.some(event => event.body === bAfter)) throw new Error('revoked-B-sent')
  await pair('06-revoked', a, b)
  const replay = await fetch(`${edgeUrl}/w/${scope.workspaceId}/sync/after?streamId=${encodeURIComponent(streamId)}&afterSeq=0`, {
    headers: { 'x-persona-actor': a.name },
  })
  const edgeLog = await replay.json()
  const serialized = JSON.stringify(edgeLog)
  if (serialized.includes(secret) || serialized.includes(bAfter)) throw new Error('private-or-revoked-event-on-edge')
  if (fatal.length > 0) throw new Error(`client-errors:${fatal.join(',')}`)
  writeFileSync(join(out, 'proof.json'), `${JSON.stringify({
    passed: true, home, scope, streamId, noDevSeed: true, realModelCalls: 0,
    operationsViaAuthenticatedHostRpc: true, firstCursor, steps,
    edgeSeq: edgeLog.envelopes.map(event => event.seq),
    dmAbsentFromEdge: true, revokedReceiveStopped: true, revokedSendStopped: true,
  }, null, 2)}\n`)
  console.log('sync-real:PASS channel + DM isolation + cursor resume + revocation; modelCalls=0')
} catch (error) {
  for (const context of contexts) {
    for (const page of context.pages()) {
      await page.screenshot({ path: join(out, `failure-${new URL(page.url()).port || 'page'}.png`) }).catch(() => undefined)
    }
  }
  writeFileSync(join(out, 'failure.json'), `${JSON.stringify({ passed: false, error: clean(String(error)), steps,
    boot: [...children].map(owned => ({ label: owned.label, tail: clean(owned.text).slice(-1500) })) }, null, 2)}\n`)
  console.error(clean(String(error)))
  process.exitCode = 1
} finally {
  clearTimeout(watchdog)
  await cleanup()
}
