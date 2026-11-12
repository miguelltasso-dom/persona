import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { expect } from 'vitest'
import { RemoteFault, RemoteGuard } from '../src/remote-guard.ts'
import { PairingBook } from '../src/station/pairing.ts'
import { ensureVoiceModelBytes } from '../src/voice-model-host.ts'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * Carbon P0-13 (Tally): the ACL of the `@Remote` that reach the MACHINE (browser profiles, the dedicated station) and the Cofre, a workspace without members, the pairing code and the voice model.
 * Each test was written RED first (reproduced), then the code fixed.
 */
const { host } = bindHostFile('2026-11-12T12:00:00.000Z')
const WS = { workspaceId: 'ws' } as const
const TEAM = { ...WS, projectId: 'team' } as const

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...WS, projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createMember({ id: 'bia', ...WS, projectId: 'pp', displayName: 'Bia', handle: 'bia', role: 'member' })
  h.createMember({ id: 'gus', ...WS, projectId: 'pp', displayName: 'Gus', handle: 'gus', role: 'guest' })
  h.createProject({ id: 'team', ...WS, name: 'Time', description: '' })
  h.sessionMemberId = 'ana'
}

/** One attempt at a time, as the wire does: a throw and a rejection are the same refusal. */
async function refusal(attempt: () => unknown): Promise<string> {
  try {
    await Promise.resolve(attempt())
    return 'ran'
  } catch (error) {
    return error instanceof Error ? error.message : 'error'
  }
}

it('P0-13: a MEMBER of a shared project does not write to the machine (browser, station) or to the Cofre: owner only', async () => {
  const h = host()
  seed(h)
  h.sessionMemberId = 'bia'
  expect(await refusal(() => h.listTasks(TEAM)), 'control: the member does work in the shared project').toBe('ran')
  const attempts: ReadonlyArray<readonly [string, () => unknown]> = [
    ['createBrowserProfile', () => h.createBrowserProfile({ ...TEAM, name: 'Meu Chrome' })],
    ['renameBrowserProfile', () => h.renameBrowserProfile({ ...TEAM, profileId: 'x', name: 'Outro' })],
    ['grantBrowserProfile', () => h.grantBrowserProfile({ ...TEAM, personaId: 'p', profileId: 'x' })],
    ['revokeBrowserProfile', () => h.revokeBrowserProfile({ ...TEAM, personaId: 'p', profileId: 'x' })],
    ['takeBrowserProfile', () => h.takeBrowserProfile({ ...TEAM, profileId: 'x' })],
    ['releaseBrowserProfile', () => h.releaseBrowserProfile({ ...TEAM, profileId: 'x' })],
    ['closeBrowserProfile', () => h.closeBrowserProfile({ ...TEAM, profileId: 'x' })],
    ['issueStationCode', () => h.issueStationCode(TEAM)],
    ['pairStation', () => h.pairStation({ ...TEAM, code: 'ABCD-EFGH' })],
    ['setStationRunning', () => h.setStationRunning({ ...TEAM, running: false })],
    ['saveCofreLogin', () => h.saveCofreLogin({ ...TEAM, site: 'x.com', username: 'u', password: 'p' })],
    ['saveCofreKey', () => h.saveCofreKey({ ...TEAM, service: 'x', secret: 's' })],
    ['saveCofreCompany', () => h.saveCofreCompany({ ...TEAM, legalName: 'Acme', document: '1' })],
    ['removeCofreEntry', () => h.removeCofreEntry({ ...TEAM, id: 'cofre-key-x' })],
    ['commitCofreImport', () => h.commitCofreImport({ ...TEAM, csv: 'name,url,username,password\nPortal,https://p.com,ana,segredo' })],
    ['fillCofreCode', () => h.fillCofreCode({ ...TEAM, id: 'c1', code: '123456' })],
    ['cancelCofreCode', () => h.cancelCofreCode({ ...TEAM, id: 'c1' })],
  ]
  for (const [name, attempt] of attempts) {
    expect(await refusal(attempt), name).toBe('forbidden')
  }
})

it('P0-13: a workspace WITHOUT members never opens the machine: no early return for the browser and the station', async () => {
  const h = host()
  seed(h)
  h.createWorkspace({ id: 'w2', name: 'Vazio', personalProjectId: 'p2' })
  const EMPTY = { workspaceId: 'w2', projectId: 'p2' } as const
  const attempts: ReadonlyArray<readonly [string, () => unknown]> = [
    ['createBrowserProfile', () => h.createBrowserProfile({ ...EMPTY, name: 'Meu Chrome' })],
    ['closeBrowserProfile', () => h.closeBrowserProfile({ ...EMPTY, profileId: 'x' })],
    ['takeBrowserProfile', () => h.takeBrowserProfile({ ...EMPTY, profileId: 'x' })],
    ['issueStationCode', () => h.issueStationCode(EMPTY)],
    ['pairStation', () => h.pairStation({ ...EMPTY, code: 'ABCD-EFGH' })],
    ['setStationRunning', () => h.setStationRunning({ ...EMPTY, running: false })],
    ['browserView', () => h.browserView(EMPTY)],
    ['stationView', () => h.stationView(EMPTY)],
  ]
  for (const [name, attempt] of attempts) {
    expect(await refusal(attempt), name).toBe('forbidden')
  }
})

it('P0-13: the owner still runs the station and reads the browser (control for the two tests above)', async () => {
  const h = host()
  seed(h)
  expect(await refusal(() => h.stationView({ ...TEAM }))).toBe('ran')
  expect(await refusal(() => h.browserView({ ...TEAM }))).toBe('ran')
  expect(await refusal(() => h.setStationRunning({ ...TEAM, running: true }))).toBe('ran')
})

it('P0-13: forgetPlaybook is a WRITE: a guest is refused (and so is anyone who cannot write the project)', async () => {
  const h = host()
  seed(h)
  h.sessionMemberId = 'gus'
  expect(await refusal(() => h.forgetPlaybook({ ...TEAM, id: 'n1' }))).toBe('forbidden')
  expect(await refusal(() => h.forgetPlaybook({ workspaceId: 'ws', projectId: 'pp', id: 'n1' }))).toBe('forbidden')
})

it('P0-13: pairStation has a strict limit (5 tries per 10 minutes), not the 2000 per 10 s of a read', () => {
  let now = 0
  const guard = new RemoteGuard({ now: () => now })
  const attempt = (): string => {
    try {
      guard.admit('pairStation', [{ workspaceId: 'ws', projectId: 'pp', code: 'AAAA-BBBB' }])
      return 'admitted'
    } catch (error) {
      return error instanceof RemoteFault ? error.code : 'error'
    }
  }
  expect(Array.from({ length: 5 }, attempt)).toEqual(['admitted', 'admitted', 'admitted', 'admitted', 'admitted'])
  expect(attempt(), 'the sixth try within ten minutes').toBe('rate-limited')
  now += 9 * 60_000
  expect(attempt(), 'still inside the window').toBe('rate-limited')
  now += 2 * 60_000
  expect(attempt(), 'the window passed').toBe('admitted')
})

it('P0-13: the verbs that save, remove, pair, ensure, pin... are WRITES for the limit (the 240 per 10 s, not the 2000 of a read)', () => {
  const guard = new RemoteGuard({ now: () => 0, rateMax: 2000, writeRateMax: 3 })
  for (const name of ['saveCofreKey', 'removeCofreEntry', 'fillCofreCode', 'takeBrowserProfile', 'releaseBrowserProfile', 'renameBrowserProfile', 'forgetPlaybook', 'answerAttention', 'continueTask', 'stopTurn', 'steerTurn', 'pinMessage', 'unpinMessage', 'refreshBrief']) {
    let admitted = 0
    for (let i = 0; i < 10; i += 1) {
      try { guard.admit(name, [{ workspaceId: 'ws' }]); admitted += 1 } catch { /* limited */ }
    }
    expect(admitted, name).toBe(3)
  }
})

it('P0-13: a book of pairing codes locks after five wrong tries, even for the right code, until the lock ends', () => {
  let now = 1_000_000
  const book = new PairingBook({ now: () => now })
  const issued = book.issue()
  for (let i = 0; i < 5; i += 1) expect(book.redeem('ZZZZ-ZZZZ')).toBe('invalido')
  expect(book.redeem(issued.code), 'locked: not even the right code').toBe('bloqueado')
  now += 5 * 60_000
  expect(book.redeem(issued.code), 'still locked inside the lock time').toBe('bloqueado')
  now += 6 * 60_000
  expect(book.redeem(issued.code), 'the lock is over, but the code is ten minutes old: the lock does not give it a longer life').toBe('expirado')
  expect(book.redeem(book.issue().code), 'a code issued after the lock pairs').toBe('ok')
})

it('P0-13: the owner issuing a NEW code opens a locked book (a stranger cannot keep the owner out by guessing)', () => {
  const now = 5_000_000
  const book = new PairingBook({ now: () => now })
  book.issue()
  for (let i = 0; i < 5; i += 1) book.redeem('ZZZZ-ZZZZ')
  expect(book.redeem('ZZZZ-ZZZZ')).toBe('bloqueado')
  const fresh = book.issue()
  expect(book.redeem(fresh.code)).toBe('ok')
})

it('P0-13: a wrong code does not count against a right one: the misses reset on success', () => {
  const now = 7_000_000
  const book = new PairingBook({ now: () => now })
  const first = book.issue()
  for (let i = 0; i < 4; i += 1) book.redeem('ZZZZ-ZZZZ')
  expect(book.redeem(first.code)).toBe('ok')
  const second = book.issue()
  for (let i = 0; i < 4; i += 1) book.redeem('ZZZZ-ZZZZ')
  expect(book.redeem(second.code), 'four misses after a success are still under the lock').toBe('ok')
})

it('P0-13: the voice model is read and encoded ONCE for the same file, not once per call (32 MB read + 43 MB base64 each)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'persona-voice-'))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'model.tar.gz'), Buffer.alloc(64_000, 7))
  let ensured = 0
  const components = {
    configured: true,
    ensure: async () => { ensured += 1; return { state: 'installed', path: dir, version: 'v1' } },
  }
  const ctx = { get: () => components } as unknown as Context
  const views = await Promise.all(Array.from({ length: 6 }, () => ensureVoiceModelBytes(ctx)))
  expect(views.every(view => view.state === 'ready')).toBe(true)
  expect(new Set(views).size, 'one shared answer for the burst').toBe(1)
  expect(await ensureVoiceModelBytes(ctx), 'and the next call reuses it while the file is the same').toBe(views[0])
  expect(ensured, 'the install check still runs every time').toBeGreaterThan(0)
  writeFileSync(join(dir, 'model.tar.gz'), Buffer.alloc(70_000, 9))
  const changed = await ensureVoiceModelBytes(ctx)
  expect(changed, 'a replaced file is read again').not.toBe(views[0])
  expect(changed.state === 'ready' ? changed.bytes : 0).toBe(70_000)
})

it('P0-13: ensureVoiceModel has its own strict limit (it moves 43 MB per answer)', () => {
  const guard = new RemoteGuard({ now: () => 0 })
  let admitted = 0
  for (let i = 0; i < 50; i += 1) {
    try { guard.admit('ensureVoiceModel', []); admitted += 1 } catch { /* limited */ }
  }
  expect(admitted).toBeLessThanOrEqual(6)
  expect(admitted).toBeGreaterThan(0)
})

it('P0-13 (Keel): the Remotes with NO tenant in the request (backup, diagnostics, store health, CLI skills) ask who is asking: the owner restores, backs up and exports; a member only reads; a guest and a stranger nothing', async () => {
  const h = host()
  seed(h)
  const ownerOnly: ReadonlyArray<readonly [string, () => unknown]> = [
    ['restoreBackup', () => h.restoreBackup({ filename: 'nao-existe.db' })],
    ['backupNow', () => h.backupNow()],
    ['checkpointWal', () => h.checkpointWal()],
    ['exportDiagnostics', () => h.exportDiagnostics()],
  ]
  const reads: ReadonlyArray<readonly [string, () => unknown]> = [
    ['getStoreHealth', () => h.getStoreHealth()],
    ['listBackups', () => h.listBackups()],
    ['previewCliSkills', () => h.previewCliSkills()],
    ['pickDirectory', () => h.pickDirectory()],
  ]
  h.sessionMemberId = 'ana'
  for (const [name, attempt] of [...ownerOnly, ...reads]) expect(await refusal(attempt), `owner: ${name}`).not.toBe('forbidden')
  h.sessionMemberId = 'bia'
  for (const [name, attempt] of ownerOnly) expect(await refusal(attempt), `member: ${name}`).toBe('forbidden')
  for (const [name, attempt] of reads) expect(await refusal(attempt), `member reads: ${name}`).not.toBe('forbidden')
  for (const session of ['gus', 'ghost']) {
    h.sessionMemberId = session
    for (const [name, attempt] of [...ownerOnly, ...reads]) expect(await refusal(attempt), `${session}: ${name}`).toBe('forbidden')
  }
})

it('P0-13 (Keel): a fresh install (nobody is a member anywhere yet) can still read its store health and back up: there is nobody to protect and no peer', async () => {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  expect(await refusal(() => h.getStoreHealth())).not.toBe('forbidden')
  expect(await refusal(() => h.listBackups())).not.toBe('forbidden')
  expect(await refusal(() => h.backupNow())).not.toBe('forbidden')
})
