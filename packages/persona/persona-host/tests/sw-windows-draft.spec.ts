/**
 * SW-4 / SW-5 through the REAL host (persona-spec/contracts/sw-windows-draft.md): an ordinary Windows folder (no `.git`),
 * the user's PATH without git, the bundled MinGit, files another program holds, paths over 260 characters and online-only
 * OneDrive files. The worker must run in the DRAFT, never in the folder; Aplicar must be all-or-nothing and Desfazer exact.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, toNamespacedPath } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { createFakeRunner, createWindowsHistoryFileOps, resolveGitExecutable, type WindowsHistoryIo } from '@deepseek-ai/dsh-persona-runners'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PersonaHost from '../src/index.ts'
import { reviewTreesOf } from '../src/review.ts'

const WIN = process.platform === 'win32'
const MINGIT_CACHE = 'C:/p8c'
const MINGIT_ZIP = `${MINGIT_CACHE}/mingit/MinGit-2.56.0.4-64-bit.zip`
const SCOPE = { workspaceId: 'ws', projectId: 'pp' } as const
const TIMEOUT = 120_000

const contexts: Context[] = []
const trash: string[] = []
const locks: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const release of locks.splice(0)) await release()
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  vi.unstubAllEnvs()
  for (const dir of trash.splice(0)) rmSync(toNamespacedPath(dir), { recursive: true, force: true })
})

function temp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  trash.push(dir)
  return dir
}

function put(root: string, relative: string, body: string | Buffer): void {
  const file = join(root, relative)
  mkdirSync(toNamespacedPath(dirname(file)), { recursive: true })
  writeFileSync(toNamespacedPath(file), body)
}

const text = (root: string, relative: string): string => readFileSync(toNamespacedPath(join(root, relative)), 'utf8')

/** A real Windows exclusive lock (`FileShare.None`): what Excel does with an open workbook. */
async function holdExclusiveLock(file: string): Promise<() => Promise<void>> {
  const script = [
    `$f = [System.IO.File]::Open('${file.replace(/'/gu, "''")}', 'Open', 'ReadWrite', 'None')`,
    "[Console]::Out.WriteLine('LOCKED'); [Console]::Out.Flush()",
    '[Console]::In.ReadLine() | Out-Null',
    '$f.Dispose()',
  ].join('; ')
  const child: ChildProcess = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
  await new Promise<void>((resolveLock, reject) => {
    let out = ''
    const timer = setTimeout(() => { reject(new Error(`lock not confirmed within 20 s: ${out}`)) }, 20_000)
    child.stdout?.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8')
      if (out.includes('LOCKED')) { clearTimeout(timer); resolveLock() }
    })
    child.on('error', (error) => { clearTimeout(timer); reject(error) })
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`lock process exited early (${String(code)}): ${out}`)) })
  })
  let released = false
  const release = async (): Promise<void> => {
    if (released) return
    released = true
    child.removeAllListeners('exit')
    if (child.exitCode !== null) return
    child.stdin?.end('\n')
    await new Promise<void>((done) => {
      const timer = setTimeout(() => { child.kill(); done() }, 5_000)
      child.on('exit', () => { clearTimeout(timer); done() })
    })
  }
  locks.push(release)
  return release
}

interface Seen { cwd?: string }

/** A host with `root` as the project folder and a worker that edits `edits` in whatever folder it is started in. */
function hostFor(root: string, edits: Record<string, string>, seen: Seen = {}): PersonaHost {
  const home = temp('persona-sw-home-')
  vi.stubEnv('PERSONA_HOME', home)
  const ctx = new Context()
  contexts.push(ctx)
  const h = new PersonaHost(ctx, { databasePath: join(home, 'persona.db'), engineRetryPollMs: 0, remoteTeamPollMs: 0 })
  h.orchestration.now = () => '2026-11-04T12:00:00.000Z'
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ ...SCOPE, id: 'ana', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({ ...SCOPE, id: 'worker', name: 'Bia', title: 'Documentos', description: '', personality: '', instructions: '',
    avatarKind: 'gallery', avatarRef: 'bia', runnerKind: 'dsh', runnerCli: '', runnerModel: 'default', canRecruit: false, createdBy: 'ana' })
  h.product.updatePersona({ ...h.product.getPersona('worker')!, systemRoles: ['coordination'] }, 'pp')
  h.createChannel({ ...SCOPE, id: 'geral', name: 'geral', topic: '' })
  h.setProjectRoot({ ...SCOPE, rootPath: root })
  h.orchestration.runnerFactory = async () => {
    const runner = createFakeRunner()
    return { ...runner, deliver: async (sessionId, requestId, body, mode) => {
      await runner.deliver(sessionId, requestId, body, mode)
      if (!sessionId.startsWith('worker-')) return
      const directory = h.orchestration.runtime('pp').repo.tickets.list()[0]?.execution?.directory
      if (directory === undefined || directory === '.') return
      seen.cwd = directory
      for (const [name, body2] of Object.entries(edits)) put(directory, name, body2)
    } }
  }
  return h
}

async function askForWork(h: PersonaHost): Promise<string> {
  h.postMessage({ ...SCOPE, id: 'edit', streamKind: 'channel', ownerId: 'geral', actorId: 'ana',
    body: 'preciso atualizar o cardápio', subjectId: 'menu', occurredAt: '2026-11-04T12:00:00.000Z' })
  await h.orchestration.flush('pp')
  const ticket = h.orchestration.runtime('pp').repo.tickets.list()[0]
  if (ticket === undefined) throw new Error('missing ticket')
  return ticket.id
}

describe.skipIf(!WIN)('SW-4/SW-5 — rascunho invisível no Windows, pelo host real', () => {
  it.skipIf(!existsSync(MINGIT_ZIP))('S2: sem git no PATH usa o MinGit embutido; o worker roda no rascunho; Aplicar e Desfazer exatos; a pasta não ganha .git', async () => {
    const resources = temp('persona-sw-resources-')
    const installer = await import(pathToFileURL(resolve(__dirname, '../../../../apps/desktop/scripts/persona-mingit.mjs')).href) as {
      installPersonaMinGit(resources: string, env: Record<string, string>): Promise<unknown>
    }
    await installer.installPersonaMinGit(resources, { DSH_DESKTOP_PACKAGE_CACHE_DIR: MINGIT_CACHE })
    const bundled = join(resources, 'mingit', 'cmd', 'git.exe')
    expect(existsSync(bundled)).toBe(true)

    const root = temp('persona-sw-docs-')
    put(root, 'cardapio.txt', 'velho\n')
    put(root, 'precos.xlsx', 'planilha-v1')
    const seen: Seen = {}
    const h = hostFor(root, { 'cardapio.txt': 'novo\n' }, seen)
    vi.stubEnv('PATH', join(process.env.SystemRoot ?? 'C:/Windows', 'System32')) // the user has no git
    vi.stubEnv('PERSONA_BUNDLED_GIT', bundled)
    expect((await resolveGitExecutable({ env: process.env, bundledExecutable: bundled })).source).toBe('bundled')

    const ticketId = await askForWork(h)
    // the worker ran in the DRAFT, never in the user's folder, and the folder is untouched until Aplicar
    expect(seen.cwd).toBeDefined()
    expect(resolve(seen.cwd!)).not.toBe(resolve(root))
    expect(resolve(seen.cwd!).startsWith(`${resolve(reviewTreesOf('pp'))}\\`)).toBe(true)
    expect(text(root, 'cardapio.txt')).toBe('velho\n')
    const summary = await h.reviewSummary({ ...SCOPE, ticketId, command: 'complete', reason: '' })
    expect(summary.hasWorktree).toBe(true)
    expect(summary.files.map(file => file.path)).toContain('cardapio.txt')

    const applied = await h.acceptReview({ ...SCOPE, ticketId, mode: 'ff' })
    expect(applied.kind).toBe('merged')
    expect(applied.restorePointId).toBeDefined()
    expect(text(root, 'cardapio.txt')).toBe('novo\n')
    expect(text(root, 'precos.xlsx')).toBe('planilha-v1')
    expect(existsSync(join(root, '.git'))).toBe(false)

    expect(await h.undoApply({ ...SCOPE, restorePointId: applied.restorePointId! })).toMatchObject({ kind: 'restored' })
    expect(text(root, 'cardapio.txt')).toBe('velho\n')
    expect(existsSync(join(root, '.git'))).toBe(false)
  }, TIMEOUT)

  it('S3a: planilha aberta ao PREPARAR o rascunho — o host usa as travas do Windows: "Feche “precos.xlsx”…", nada fica pela metade', async () => {
    const root = temp('persona-sw-docs-')
    put(root, 'cardapio.txt', 'velho\n')
    put(root, 'precos.xlsx', 'planilha-v1')
    const h = hostFor(root, { 'cardapio.txt': 'novo\n' })
    const release = await holdExclusiveLock(join(root, 'precos.xlsx'))
    const delivery = await h.orchestration.reviewDelivery('pp')
    expect(delivery).toBeDefined()
    // without the Windows file layer this is a raw "EBUSY: resource busy or locked"
    await expect(delivery!.prepare({ id: 'a1', ticketId: 't1' })).rejects.toMatchObject({
      message: expect.stringMatching(/Feche “precos\.xlsx”/u),
    })
    expect(existsSync(join(reviewTreesOf('pp'), 't1'))).toBe(false)
    expect(text(root, 'cardapio.txt')).toBe('velho\n')
    await release()
    await expect(delivery!.prepare({ id: 'a1', ticketId: 't1' })).resolves.toBeDefined() // closes the sheet, tries again: it works
  }, TIMEOUT)

  it('S3a: planilha aberta durante o APLICAR — tudo ou nada, aviso acionável, funciona depois de fechar, Desfazer exato', async () => {
    const root = temp('persona-sw-docs-')
    put(root, 'cardapio.txt', 'velho\n')
    put(root, 'precos.xlsx', 'planilha-v1')
    const h = hostFor(root, { 'cardapio.txt': 'novo\n', 'precos.xlsx': 'planilha-v2' })
    const ticketId = await askForWork(h)
    const release = await holdExclusiveLock(join(root, 'precos.xlsx')) // the person opens the sheet while the persona worked
    let outcome = 'threw'
    let message = ''
    try {
      const result = await h.acceptReview({ ...SCOPE, ticketId, mode: 'ff' })
      outcome = result.kind
      message = result.kind === 'blocked' ? result.explanation : ''
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(outcome).not.toBe('merged')
    expect(message).toMatch(/Feche “precos\.xlsx”/u)
    expect(text(root, 'cardapio.txt')).toBe('velho\n') // all-or-nothing: the other file was NOT half-applied
    expect(existsSync(join(root, '.git'))).toBe(false)
    await release()
    expect(text(root, 'precos.xlsx')).toBe('planilha-v1')
    const retry = await h.acceptReview({ ...SCOPE, ticketId, mode: 'ff' })
    expect(retry.kind).toBe('merged')
    expect(text(root, 'cardapio.txt')).toBe('novo\n')
    expect(text(root, 'precos.xlsx')).toBe('planilha-v2')
    expect(await h.undoApply({ ...SCOPE, restorePointId: retry.restorePointId! })).toMatchObject({ kind: 'restored' })
    expect(text(root, 'cardapio.txt')).toBe('velho\n')
    expect(text(root, 'precos.xlsx')).toBe('planilha-v1')
  }, TIMEOUT)

  it('S3b: caminho com mais de 260 caracteres — o rascunho, o Aplicar e o Desfazer funcionam', async () => {
    const root = temp('persona-sw-docs-')
    const deep = Array.from({ length: 6 }, (_, i) => `pasta-bem-comprida-numero-${String(i)}-para-passar-de-260`).join('/')
    const relative = `${deep}/relatorio.txt`
    expect(join(root, relative).length).toBeGreaterThan(300)
    put(root, relative, 'velho\n')
    put(root, 'cardapio.txt', 'velho\n')
    const h = hostFor(root, { [relative]: 'novo\n' })
    const ticketId = await askForWork(h)
    const summary = await h.reviewSummary({ ...SCOPE, ticketId, command: 'complete', reason: '' })
    expect(summary.files.map(file => file.path.replaceAll('\\', '/'))).toContain(relative)
    const applied = await h.acceptReview({ ...SCOPE, ticketId, mode: 'ff' })
    expect(applied.kind).toBe('merged')
    expect(text(root, relative)).toBe('novo\n')
    expect(await h.undoApply({ ...SCOPE, restorePointId: applied.restorePointId! })).toMatchObject({ kind: 'restored' })
    expect(text(root, relative)).toBe('velho\n')
    expect(existsSync(join(root, '.git'))).toBe(false)
  }, TIMEOUT)

  it('S3c: arquivo só online (OneDrive, simulado) é hidratado ANTES de ser copiado; se a hidratação falha, o aviso manda abrir o OneDrive', async () => {
    const root = temp('persona-sw-onedrive-')
    put(root, 'planilha.xlsx', 'so-online')
    put(root, 'cardapio.txt', 'velho\n')
    const h = hostFor(root, { 'cardapio.txt': 'novo\n' })
    const calls: string[] = []
    const io: WindowsHistoryIo = {
      hydrate: async (path) => { calls.push(`hydrate:${path.split('\\').at(-1) ?? path}`) },
      copy: async (source, destination) => {
        calls.push(`copy:${source.split('\\').at(-1) ?? source}`)
        writeFileSync(toNamespacedPath(destination).replace(/^\\\\\?\\/u, ''), readFileSync(toNamespacedPath(source).replace(/^\\\\\?\\/u, '')))
      },
    }
    h.orchestration.reviewOptions = { fileOps: createWindowsHistoryFileOps({ cloudRoots: [root] }, io) }
    const delivery = await h.orchestration.reviewDelivery('pp')
    await delivery!.prepare({ id: 'a1', ticketId: 't1' })
    for (const name of ['planilha.xlsx', 'cardapio.txt']) {
      expect(calls.indexOf(`hydrate:${name}`), name).toBeGreaterThanOrEqual(0)
      expect(calls.indexOf(`hydrate:${name}`), name).toBeLessThan(calls.indexOf(`copy:${name}`))
    }
    // the cloud cannot deliver the bytes: an actionable line, no draft left behind, the folder untouched
    h.orchestration.reviewOptions = { fileOps: createWindowsHistoryFileOps({ cloudRoots: [root] }, {
      hydrate: async () => { throw Object.assign(new Error('offline detail'), { code: 'ENOENT' }) },
      copy: async () => { throw new Error('unexpected copy') },
    }) }
    const offline = await h.orchestration.reviewDelivery('pp')
    await expect(offline!.prepare({ id: 'a2', ticketId: 't2' })).rejects.toMatchObject({ message: expect.stringMatching(/OneDrive.*Sempre manter neste dispositivo/u) })
    expect(existsSync(join(reviewTreesOf('pp'), 't2'))).toBe(false)
    expect(text(root, 'cardapio.txt')).toBe('velho\n')
  }, TIMEOUT)
})
