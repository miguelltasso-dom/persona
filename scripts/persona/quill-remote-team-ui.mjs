// Quill (E13): "convidar → aceitar → ver o canal" driven through the REAL UI of two Persona profiles + a local edge.
// Same harness as packages/persona/persona-host/scripts/remote-team-real.mjs (which operates through RPC); here every
// remote-team action is a click or a typed field in Membros › Equipe remota. Setup (workspace, project, onboarding) stays RPC.
// No dev seed, no real model call, temp homes, free ports. Run under the build lock:
//   node scripts/persona/with-lock.mjs "Quill E13 UI" --lock build -- node scripts/persona/quill-remote-team-ui.mjs
// Env: QUILL_AXE=<axe.min.js> (WCAG A/AA scan of Alice's and Bob's Equipe remota at the end).
// Output: .maestri/tmp/shots/quill/remote-team/<step>-<Alice|Bob>-<light|dark>.png + proof.json (passed:true only if every step held).
import { spawn, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { freePort } from './free-port.mjs'

if (process.env.PERSONA_LOCK !== 'build') throw new Error('Run this under with-lock --lock build')
// Quill's own queue guard: the client bundle must be the fresh one (marker left by the exclusive bundle job).
import { existsSync as markerExists } from 'node:fs'
if (process.env.QUILL_REQUIRE_FRESH_BUNDLE !== '0' && !markerExists('C:/Users/migue/AppData/Local/Temp/claude/8545ae9cdecf2d8b/fbf30984-c33b-4bb3-a697-10b110e8c781/scratchpad/bundle-ok')) {
  console.log('e13-ui: no fresh bundle yet, skipped (re-queue after the exclusive bundle)')
  process.exit(0)
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const require = createRequire(join(root, 'packages/persona/persona-e2e/package.json'))
const { chromium } = require('playwright')
const home = mkdtempSync(join(tmpdir(), 'persona-quill-e13-'))
const out = join(root, '.maestri/tmp/shots/quill/remote-team')
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'proof.json'), `${JSON.stringify({ passed: false, status: 'running' })}\n`)
const scope = { workspaceId: `e13-${randomUUID()}`, projectId: 'shared-ui' }
const channelId = `geral:${scope.projectId}`
const edgePort = String(await freePort())
const aPort = await freePort()
const bPort = await freePort()
const edgeUrl = `http://127.0.0.1:${edgePort}`
const children = new Set()
const contexts = []
const steps = []
const consoleErrors = []
const axeFindings = []
let browser
let stopping = false
const clean = text => text.replace(/token=[^\s]+/gu, 'token=[redacted]')

function launch(label, args, extra = {}, cwd = root) {
  const child = spawn(process.execPath, args, {
    cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PERSONA_SCRIPTED: '1', PERSONA_REAL_CLI: '0', PERSONA_VAULT_TEST_CIPHER: '1', WRANGLER_SEND_METRICS: 'false', DSH_TELEMETRY_DISABLED: '1', ...extra },
  })
  const owned = { child, label, text: '' }
  children.add(owned)
  child.stdout.on('data', (data) => { owned.text += data.toString() })
  child.stderr.on('data', (data) => { owned.text += data.toString() })
  child.on('error', (error) => { owned.text += `\n${error.message}` })
  return owned
}

async function stop(owned) {
  if (!children.has(owned)) return
  if (owned.child.exitCode === null && owned.child.pid !== undefined) {
    try { execFileSync('taskkill', ['/T', '/F', '/PID', String(owned.child.pid)], { stdio: 'ignore' }) } catch { /* already gone */ }
  }
  children.delete(owned)
}

async function until(test, label, ms = 120_000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const value = await test()
    if (value) return value
    await new Promise((done) => { setTimeout(done, 250) })
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
  if (body.result?.ok !== true) throw new Error(`rpc:${method}:${body.result?.error?.code ?? 'invalid-result'}`)
  return body.result.value
}

async function prepare(desk) {
  desk.context = await browser.newContext({ locale: 'pt-BR', viewport: { width: 960, height: 640 } })
  contexts.push(desk.context)
  await desk.context.request.get(desk.url)
  await rpc(desk, 'createWorkspace', { id: scope.workspaceId, name: `Mesa ${desk.name}`, personalProjectId: `personal-${desk.name}` })
  await rpc(desk, 'createMember', { ...scope, projectId: `personal-${desk.name}`, id: desk.name, displayName: desk.name, handle: desk.name, role: 'owner' })
  await rpc(desk, 'createProject', { id: scope.projectId, workspaceId: scope.workspaceId, name: 'Canal compartilhado', description: '' })
  await rpc(desk, 'completeOnboarding', {
    workspaceId: scope.workspaceId, personalProjectId: `personal-${desk.name}`, displayName: desk.name,
    team: [{ name: `Equipe ${desk.name}`, title: 'Coordenação local', description: 'Prova local.', personality: 'Direta.',
      instructions: 'Responda em português.', avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'dsh',
      runnerCli: '', runnerModel: 'default', canRecruit: false, systemRoles: ['coordination'] }],
    templateIds: [], runnerChoices: ['dsh'], cofreSeed: `Dados exclusivos da mesa ${desk.name}.`,
  })
  await desk.context.addInitScript(({ scopeValue, channel, actor }) => {
    localStorage.setItem('persona.tenant.v1', JSON.stringify({ ...scopeValue, memberId: actor, channelId: channel }))
    localStorage.setItem('persona.onboarding.complete.v1', '1')
    localStorage.removeItem('persona.devSeed.v1')
  }, { scopeValue: scope, channel: channelId, actor: desk.name })
  desk.page = await desk.context.newPage()
  desk.page.on('pageerror', (error) => { consoleErrors.push(`${desk.name}: pageerror ${String(error).slice(0, 200)}`) })
  desk.page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(`${desk.name}: ${message.text().slice(0, 200)}`) })
  await desk.page.goto(desk.url, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await desk.page.locator('[data-persona-shell]').waitFor({ timeout: 120_000 })
}

async function nav(page, label) {
  for (let attempt = 0; attempt < 3 && await page.getByRole('button', { name: label, exact: true }).count() === 0; attempt += 1) {
    for (const toggle of await page.locator('button[aria-controls^="persona-nav-"][aria-expanded="false"]').all()) {
      await toggle.evaluate((node) => { node.click() }).catch(() => undefined)
    }
    await page.waitForTimeout(500)
  }
  const target = page.getByRole('button', { name: label, exact: true }).first()
  await target.evaluate((node) => { node.scrollIntoView({ block: 'center' }) })
  await target.click({ timeout: 10_000 })
  await page.waitForTimeout(900)
}

const remoteCard = page => page.locator('[data-persona-surface="remote-team"]')

/** Light then dark shot of the current state at the current size (the app reads the theme from a body attribute). */
async function capture(desk, step, suffix) {
  for (const scheme of ['light', 'dark']) {
    await desk.page.evaluate((dark) => {
      if (dark) document.body.setAttribute('data-ds-dark-theme', 'true')
      else document.body.removeAttribute('data-ds-dark-theme')
    }, scheme === 'dark')
    await desk.page.waitForTimeout(250)
    const file = join(out, `${step}-${desk.name}-${scheme}${suffix}.png`)
    await desk.page.screenshot({ path: file })
    // A near-empty PNG is a blank page: a FAILURE, never a result (Keel, D-067 addendum).
    if (statSync(file).size < 10_000) {
      rmSync(file, { force: true })
      throw new Error(`blank capture (<10 KB): ${step} ${desk.name} ${scheme}${suffix}`)
    }
  }
  await desk.page.evaluate(() => { document.body.removeAttribute('data-ds-dark-theme') })
}

// Acceptance sizes (D-076): 960x640 (the base, no suffix), 1440x900, and 640x360 = what 200% zoom leaves of a 1280x720 window.
const EXTRA_SIZES = [{ tag: '1440', width: 1440, height: 900 }, { tag: 'zoom200', width: 640, height: 360 }]

/** The state at the base size, then at the other acceptance sizes (only while the window is at its base 960x640). */
async function shoot(desk, step) {
  await desk.page.waitForSelector('[data-persona-shell]', { timeout: 15_000 })
  const base = desk.page.viewportSize()
  await capture(desk, step, '')
  if (base !== null && base.width === 960 && base.height === 640) {
    for (const size of EXTRA_SIZES) {
      await desk.page.setViewportSize({ width: size.width, height: size.height })
      await desk.page.waitForTimeout(300)
      await capture(desk, step, `-${size.tag}`)
    }
    await desk.page.setViewportSize(base)
    await desk.page.waitForTimeout(200)
  }
  steps.push({ step, desk: desk.name, at: new Date().toISOString() })
  console.log(`e13-ui:${step}:${desk.name}`)
}

async function axe(desk, label) {
  if (process.env.QUILL_AXE === undefined) return
  await desk.page.addScriptTag({ path: process.env.QUILL_AXE })
  const found = await desk.page.evaluate(async () => {
    const result = await globalThis.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })
    return result.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes.slice(0, 2).map(n => n.target.join(' ')) }))
  })
  axeFindings.push({ label, desk: desk.name, violations: found })
  for (const v of found) console.log(`[axe ${label} ${desk.name}] ${v.impact} ${v.id} x${v.nodes} :: ${v.sample.join(' | ').slice(0, 160)}`)
}

async function cleanup() {
  if (stopping) return
  stopping = true
  for (const context of contexts) await context.close().catch(() => undefined)
  await browser?.close().catch(() => undefined)
  for (const owned of [...children]) await stop(owned).catch(() => undefined)
}

const watchdog = setTimeout(() => { void cleanup().finally(() => { console.error('e13-ui:deadline'); process.exit(1) }) }, 780_000)

try {
  const edge = launch('edge', [join(root, 'apps/persona-edge/node_modules/wrangler/bin/wrangler.js'),
    'dev', '--local', '--ip', '127.0.0.1', '--port', edgePort, '--persist-to', join(home, 'edge')], {}, join(root, 'apps/persona-edge'))
  await until(() => edge.text.includes(`Ready on http://127.0.0.1:${edgePort}`), 'edge-ready', 90_000)
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const a = await startDesk('Alice', aPort)
  const b = await startDesk('Bob', bPort)
  await prepare(a)
  await prepare(b)

  // 0 — before anything: both screens say "Não conectada" and offer the right next step
  await nav(a.page, 'Membros')
  await nav(b.page, 'Membros')
  await remoteCard(a.page).getByText('Não conectada').waitFor({ timeout: 20_000 })
  await shoot(a, '00-before')
  await shoot(b, '00-before')

  // 1 — Alice connects: address + the channel to share (UI only)
  const alice = remoteCard(a.page)
  await alice.getByRole('button', { name: 'Conectar', exact: true }).click()
  await alice.getByText('Confira o endereço da equipe').waitFor({ timeout: 10_000 })
  await shoot(a, '01-connect-errors')
  // Alice's card has two address fields (connect + "entrar com um convite"): the first is the connect one.
  await alice.getByLabel('Endereço da equipe').first().fill(edgeUrl)
  await alice.getByRole('checkbox', { name: /#geral/u }).check()
  await shoot(a, '02-connect-filled')
  await alice.getByRole('button', { name: 'Conectar', exact: true }).click()
  await alice.getByText('Conectada', { exact: true }).waitFor({ timeout: 30_000 })
  await shoot(a, '03-connected')
  await axe(a, 'connected')

  // 2 — Alice invites: the code shows ONCE
  // The card shows "Gerar convite" twice (the primary one and the empty-list shortcut): the first is the primary.
  await alice.getByRole('button', { name: 'Gerar convite' }).first().click()
  const code = alice.locator('code').first()
  await code.waitFor({ timeout: 30_000 })
  const token = (await code.textContent())?.trim() ?? ''
  if (token.length < 8) throw new Error('invite-token-empty')
  await shoot(a, '04-invite-shown-once')
  await alice.getByRole('button', { name: 'Já enviei' }).click()
  if (await alice.locator('code').count() !== 0) throw new Error('token-still-visible-after-dismiss')
  await shoot(a, '05-invite-dismissed')

  // 3 — Bob joins with the address and the code he received (UI only)
  const bob = remoteCard(b.page)
  await bob.getByLabel('Endereço da equipe').last().fill(edgeUrl)
  await bob.getByLabel('Código do convite').fill(token)
  await shoot(b, '06-accept-filled')
  await bob.getByRole('button', { name: 'Entrar na equipe' }).click()
  await bob.getByText('Conectada', { exact: true }).waitFor({ timeout: 30_000 })
  await shoot(b, '07-accepted')
  await axe(b, 'accepted')

  // 4 — Alice writes in #geral (UI composer); Bob sees it in his #geral
  await nav(a.page, 'Canais')
  await a.page.locator('[data-persona-area="composer"] textarea').first().waitFor({ timeout: 60_000 })
  const marker = `Olá do Alice · ${randomUUID().slice(0, 8)}`
  await a.page.locator('[data-persona-area="composer"] textarea').first().fill(marker)
  await a.page.keyboard.press('Enter')
  await a.page.getByText(marker, { exact: true }).waitFor({ timeout: 30_000 })
  await nav(b.page, 'Canais')
  await b.page.getByText(marker, { exact: true }).waitFor({ timeout: 45_000 })
  await shoot(a, '08-channel-alice')
  await shoot(b, '09-channel-bob-received')

  // 5 — Alice revokes (UI); Bob's screen says "Acesso encerrado" and offers no way to send
  await nav(a.page, 'Membros')
  // The host lists the people of the remote project: Bob has a row with his name, and the button names him.
  await remoteCard(a.page).getByRole('heading', { name: 'Pessoas na equipe' }).waitFor({ timeout: 30_000 })
  await remoteCard(a.page).getByRole('button', { name: /^Encerrar acesso de / }).first().waitFor({ timeout: 30_000 })
  await shoot(a, '09b-people-alice')
  await axe(a, 'people')
  await remoteCard(a.page).getByRole('button', { name: /^Encerrar acesso de / }).first().click()
  await a.page.getByRole('dialog').getByRole('button', { name: 'Encerrar acesso', exact: true }).click()
  await until(async () => (await remoteCard(a.page).getByText('Encerrado', { exact: true }).count()) > 0, 'member-revoked-on-alice', 30_000)
  await shoot(a, '10-revoked-alice')
  await nav(b.page, 'Membros')
  await remoteCard(b.page).getByText('Acesso encerrado').waitFor({ timeout: 30_000 })
  await shoot(b, '11-revoked-bob')
  await axe(b, 'revoked')

  // 6 — narrow window (640 wide) for the main states
  for (const desk of [a, b]) await desk.page.setViewportSize({ width: 640, height: 360 })
  await shoot(a, '12-narrow-alice')
  await shoot(b, '13-narrow-bob')

  const sideways = []
  for (const desk of [a, b]) {
    const wide = await desk.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    if (wide) sideways.push(desk.name)
  }
  writeFileSync(join(out, 'proof.json'), `${JSON.stringify({ at: new Date().toISOString(), passed: consoleErrors.length === 0, scope, steps: steps.length, consoleErrors, sideways, axe: axeFindings, realModelCalls: 0, noDevSeed: true, operatedThroughUi: ['connect', 'issueInvite', 'dismiss', 'accept', 'post', 'revoke'] }, null, 2)}\n`)
  console.log(`e13-ui:PASS steps=${steps.length} consoleErrors=${consoleErrors.length} sideways=${sideways.join(',') || 'none'}`)
  process.exitCode = consoleErrors.length === 0 ? 0 : 1
} catch (error) {
  for (const context of contexts) {
    for (const page of context.pages()) await page.screenshot({ path: join(out, `failure-${new URL(page.url()).port || 'page'}.png`) }).catch(() => undefined)
  }
  writeFileSync(join(out, 'failure.json'), `${JSON.stringify({ passed: false, error: clean(String(error)), steps, consoleErrors, boot: [...children].map(owned => ({ label: owned.label, tail: clean(owned.text).slice(-1200) })) }, null, 2)}\n`)
  console.error(clean(String(error)))
  process.exitCode = 1
} finally {
  clearTimeout(watchdog)
  await cleanup()
}
