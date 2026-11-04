/** Full Web profile with the explicit keyless detector harness, proving FR-3 and unavailable Cofre. */
import { spawn, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { freePort } from '../../../../scripts/persona/free-port.mjs'

if (process.env.PERSONA_LOCK !== 'build') throw new Error('Run under with-lock --lock build')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const require = createRequire(join(root, 'packages/persona/persona-e2e/package.json'))
const { chromium } = require('playwright')
const home = mkdtempSync(join(tmpdir(), 'persona-fr3-runtime-'))
const out = join(root, '.maestri/tmp/shots/remote/engine-unavailable')
mkdirSync(out, { recursive: true })
const scope = { workspaceId: `fr3-${randomUUID()}`, projectId: 'personal' }
const channelId = 'geral'
const port = process.env.PERSONA_FR3_PORT ?? String(await freePort())
let browser
let child
let log = ''
let stopping = false
let passed = false

async function cleanup() {
  if (stopping) return
  stopping = true
  await browser?.close().catch(() => undefined)
  if (child?.exitCode === null && child.pid !== undefined) {
    try { execFileSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' }) }
    catch (error) { if (child.exitCode === null) console.error(`cleanup:${error.name}`) }
  }
}
const watchdog = setTimeout(() => {
  void cleanup().finally(() => { console.error('FR3-runtime:deadline'); process.exit(1) })
}, 240_000)

try {
  child = spawn(process.execPath, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', 'persona',
    '--patch', 'apps/web/tests/pin-browse-picker.overlay.yml', '--no-open', '--host', '127.0.0.1', '--port', port], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    // VITEST selects the existing empty detector. REAL_CLI disables scripted readiness/replies.
    env: { ...process.env, VITEST: 'true', PERSONA_REAL_CLI: '1', PERSONA_SCRIPTED: '0',
      PERSONA_VAULT_TEST_CIPHER: '', DEEPSEEK_API_KEY: '', DSH_HOME: home, PERSONA_HOME: home, DSH_TELEMETRY_DISABLED: '1' },
  })
  child.stdout.on('data', data => { log += data.toString() })
  child.stderr.on('data', data => { log += data.toString() })
  const end = Date.now() + 180_000
  let url
  while (Date.now() < end) {
    url = /dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/u.exec(log)?.[1]
    if (url) break
    if (child.exitCode !== null) throw new Error(`profile exited before boot:${log.replace(/token=[^\s]+/gu, 'token=[redacted]').slice(-3000)}`)
    await new Promise(done => setTimeout(done, 250))
  }
  if (!url) throw new Error('profile boot deadline')
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1440, height: 900 } })
  await context.request.get(url)
  const raw = async (method, request) => {
    const response = await context.request.post(new URL(`/api/persona/${method}`, url).href, {
      data: { type: 'client-request', rpcId: randomUUID(), method: `persona/${method}`, payload: { args: { request } } },
      timeout: 30_000,
    })
    if (!response.ok()) throw new Error(`http:${method}:${response.status()}`)
    return (await response.json()).result
  }
  const rpc = async (method, request) => {
    const result = await raw(method, request)
    if (!result?.ok) throw new Error(`rpc:${method}:${result?.error?.code ?? 'unknown'}`)
    return result.value
  }
  await rpc('createWorkspace', { id: scope.workspaceId, name: 'Prova sem IA', personalProjectId: scope.projectId })
  await rpc('createMember', { ...scope, id: 'ana', displayName: 'Ana', handle: 'ana', role: 'owner' })
  await rpc('createChannel', { ...scope, id: channelId, name: 'geral', topic: '' })
  await rpc('createPersona', { ...scope, id: 'guia', name: 'Guia', title: 'Coordenação', description: 'Prova.',
    personality: 'Calma.', instructions: 'Responda.', avatarKind: 'gallery', avatarRef: 'guia',
    runnerKind: 'dsh', runnerCli: '', runnerModel: 'default', canRecruit: false, createdBy: 'ana', systemRoles: ['coordination'] })
  await rpc('retryEngine', scope)
  const id = randomUUID()
  const start = Date.now()
  await rpc('postMessage', { ...scope, id, streamKind: 'channel', ownerId: channelId, actorId: 'ana',
    body: 'Preciso de uma lista de três ideias para o projeto.', subjectId: 'fr3-runtime', occurredAt: new Date().toISOString() })
  const elapsedMs = Date.now() - start
  const messages = await rpc('listMessages', { ...scope, streamKind: 'channel', ownerId: channelId,
    actorId: 'ana', afterSeq: 0, limit: 100 })
  const notices = messages.events.filter(event => event.type === 'no_engine_ready' && event.runError?.triggerId === id)
  if (notices.length !== 1 || elapsedMs >= 5000) throw new Error('immediate engine notice missing or late')
  if ((await rpc('listTasks', scope)).length !== 0) throw new Error('deferred message created a task')
  const status = await rpc('getEngineStatus', scope)
  if (status.state !== 'unavailable' || status.pending !== 1) throw new Error('wrong engine status')
  const availability = await rpc('getRemoteTeamAvailability', scope)
  if (availability.vault !== 'unavailable') throw new Error('Web Cofre unexpectedly available')
  for (const [method, request] of [
    ['connectRemoteTeam', { ...scope, edgeUrl: 'http://127.0.0.1:1', channelIds: [channelId] }],
    ['issueInvite', { ...scope, inviteId: 'denied', token: '', role: 'member' }],
  ]) {
    const result = await raw(method, request)
    if (result?.ok || result?.error?.code !== 'vault-unavailable') throw new Error(`wrong Cofre failure:${method}`)
  }
  await context.addInitScript(({ scope, channelId }) => {
    localStorage.setItem('persona.tenant.v1', JSON.stringify({ ...scope, memberId: 'ana', channelId }))
    localStorage.setItem('persona.onboarding.complete.v1', '1')
  }, { scope, channelId })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', error => { pageErrors.push(error.name) })
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.locator('[data-persona-shell]').waitFor({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Canais', exact: true }).click()
  await page.locator('[data-persona-area="composer"] textarea').first().waitFor({ timeout: 30_000 })
  await page.screenshot({ path: join(out, 'no-engine-ready.png'), fullPage: true })
  if (pageErrors.length !== 0) throw new Error(`profile UI errors:${pageErrors.join(',')}`)
  await rpc('dismissEngineTrigger', { ...scope, triggerId: id })
  if ((await rpc('getEngineStatus', scope)).pending !== 0) throw new Error('dismiss did not release backlog')
  passed = true
  writeFileSync(join(out, 'proof.json'), `${JSON.stringify({ passed, elapsedMs, status, availability,
    notices: notices.length, tasks: 0, modelCalls: 0, detector: 'explicit keyless harness', home }, null, 2)}\n`)
  console.log(`FR3-runtime:PASS immediate=${elapsedMs}ms deferred=1 task=0 vault-unavailable=2 modelCalls=0`)
} finally {
  if (!passed) writeFileSync(join(out, 'proof.json'), `${JSON.stringify({ passed: false, home })}\n`)
  clearTimeout(watchdog)
  await cleanup()
}
