// Seed a temp PERSONA_HOME, post a channel request through the host, boot the
// persona profile, screenshot channel + kanban. Run under the lock:
// node scripts/persona/with-lock.mjs "Anvil loop real" --release-on "http://127.0.0.1" -- node scripts/persona/loop-real.mjs
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { Context } from '@deepseek-ai/cordis'
import PersonaHost from '@deepseek-ai/dsh-persona-host'

const root = 'C:/Users/migue/dev/persona'
const home = `${root}/.maestri/tmp/loop-real-home`
const dbDir = `${home}/db`
const outDir = `${root}/.maestri/tmp/shots/real`
mkdirSync(dbDir, { recursive: true })
mkdirSync(outDir, { recursive: true })
const ctx = new Context()
const host = new PersonaHost(ctx, { databasePath: join(dbDir, 'persona.db') })
host.createWorkspace({ id: 'ws-persona-local', name: 'Persona', personalProjectId: 'proj-pessoal' })
host.createMember({
  id: 'member-owner', workspaceId: 'ws-persona-local', projectId: 'proj-pessoal',
  displayName: 'Miguel', handle: 'owner', role: 'owner',
})
host.createChannel({
  id: 'ch-geral', workspaceId: 'ws-persona-local', projectId: 'proj-pessoal', name: 'geral', topic: 'Conversas',
})
host.createPersona({
  workspaceId: 'ws-persona-local', projectId: 'proj-pessoal', id: 'coord-guia',
  name: 'Guia', title: 'Coordenação', description: 'Triagem.', personality: 'Calma.',
  instructions: 'Aceite pedidos claros.', avatarKind: 'gallery', avatarRef: 'atlas',
  runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: true, createdBy: 'member-owner',
  systemRoles: ['coordination'],
})
host.createPersona({
  workspaceId: 'ws-persona-local', projectId: 'proj-pessoal', id: 'exec-bento',
  name: 'Bento', title: 'Engenharia', description: 'Implementa.', personality: 'Direto.',
  instructions: 'Prove.', avatarKind: 'gallery', avatarRef: 'bento',
  runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'member-owner',
})
const t0 = Date.now()
host.postMessage({
  id: 'm-loop-1', workspaceId: 'ws-persona-local', projectId: 'proj-pessoal',
  streamKind: 'channel', ownerId: 'ch-geral', body: 'preciso de um README no projeto',
  actorId: 'member-owner', subjectId: 'loop', occurredAt: new Date().toISOString(),
})
await host.orchestration.flush('proj-pessoal')
const firstReplyMs = Date.now() - t0
const tasks = host.listTasks({ workspaceId: 'ws-persona-local', projectId: 'proj-pessoal' })
const page = host.listMessages({
  workspaceId: 'ws-persona-local', projectId: 'proj-pessoal',
  streamKind: 'channel', ownerId: 'ch-geral', actorId: 'member-owner', afterSeq: 0, limit: 50,
})
const log = {
  firstUsefulReplyMs: firstReplyMs,
  tasks: tasks.map(item => ({ id: item.id, title: item.title, stage: item.stage })),
  coordReplies: page.events.filter(item => item.actorId === 'coord-guia').map(item => item.body),
}
writeFileSync(`${outDir}/loop-host.json`, JSON.stringify(log, null, 2))
host.store.close()

const require = createRequire(`${root}/packages/persona/persona-e2e/package.json`)
const { chromium } = require('playwright')
const env = { ...process.env, DSH_HOME: home, PERSONA_HOME: home, DSH_TELEMETRY_DISABLED: '1' }
const child = spawn(process.execPath, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', 'persona', '--no-open'], {
  cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'],
})
let out = ''
const finish = async (code, note) => {
  console.log(note)
  console.log(JSON.stringify(log))
  try { execFileSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' }) } catch { /* gone */ }
  process.exit(code)
}
const timer = setTimeout(() => finish(1, `TIMEOUT\n${out.slice(-1200)}`), 180_000)
const onData = async (chunk) => {
  out += chunk.toString()
  const match = /(http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/.exec(out)
  if (!match) return
  child.stdout.off('data', onData)
  child.stderr.off('data', onData)
  clearTimeout(timer)
  try {
    const browser = await chromium.launch({ channel: 'chrome', headless: true })
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' })
    const page = await context.newPage()
    await page.goto(match[1], { waitUntil: 'load', timeout: 120_000 })
    await page.waitForTimeout(6000)
    await page.screenshot({ path: `${outDir}/loop-channel.png` })
    const kanban = page.getByRole('button', { name: /Quadro|Kanban|Tarefas/u }).first()
    if (await kanban.isVisible().catch(() => false)) {
      await kanban.click()
      await page.waitForTimeout(1500)
    }
    await page.screenshot({ path: `${outDir}/loop-kanban.png` })
    writeFileSync(`${outDir}/loop-boot.log`, out.slice(-4000))
    await browser.close()
    await finish(0, `shots ${outDir}`)
  } catch (error) {
    await finish(1, `failed: ${error instanceof Error ? error.message : String(error)}\n${out.slice(-800)}`)
  }
}
child.stdout.on('data', onData)
child.stderr.on('data', onData)
child.on('exit', (code) => {
  clearTimeout(timer)
  console.log(`host exited ${code}\n${out.slice(-800)}`)
  process.exit(1)
})
