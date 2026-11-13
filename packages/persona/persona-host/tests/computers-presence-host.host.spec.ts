import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, vi } from 'vitest'
import { generateIdentity, publicIdentity } from '@deepseek-ai/dsh-persona-sync'
import { Context } from '@deepseek-ai/cordis'
import PersonaHost from '../src/index.ts'
import { RemoteFault } from '../src/remote-guard.ts'
import { FEATURE_OFF_REASON } from '../src/surface-gates.ts'
import { it, seedJourney, seedProject } from './journeys/journey-host.ts'
import PersonaVault from '../../persona-vault/src/plugin.ts'

const SCOPE = { workspaceId: 'ws', projectId: 'sh' } as const

function openPersistentHost(databasePath: string, vaultPath: string): { h: PersonaHost; dispose: () => Promise<void> } {
  const ctx = new Context()
  new PersonaVault(ctx, { path: vaultPath })
  const h = new PersonaHost(ctx, { databasePath, remoteTeamPollMs: 0, remoteTeamLive: false })
  return { h, dispose: async () => { await ctx.fiber.dispose() } }
}

describe('PersonaHost ComputerPresence wiring (M4/D-116)', () => {
  const dirs: string[] = []
  const cleanups: (() => Promise<void> | void)[] = []

  beforeEach(() => { vi.stubEnv('PERSONA_VAULT_TEST_CIPHER', '1') })
  afterEach(async () => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    for (const drop of cleanups.splice(0).reverse()) await drop()
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  })

  it('populates listComputers.presence for self (ligado -> pausado), masks personal RAM from other members, accepts verified link beats, and persists lastSeenAt across reboot', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'persona-presence-host-'))
    dirs.push(dir)
    const dbPath = join(dir, 'p.db')
    const vaultPath = join(dir, 'persona-vault.json')
    const baseMs = Date.parse('2026-11-12T10:00:00.000Z')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(baseMs)

    const { h, dispose: closeFirst } = openPersistentHost(dbPath, vaultPath)
    cleanups.push(closeFirst)
    h.orchestration.now = () => new Date(baseMs).toISOString()
    seedJourney(h, [])
    seedProject(h, { id: 'sh', name: 'Loja', team: [] })
    h.createMember({ id: 'gus', ...SCOPE, displayName: 'Gus', handle: 'gus', role: 'member' })
    h.sessionMemberId = 'ana'

    const issued = await h.issueComputerCode(SCOPE)
    if (!issued.ok || issued.code === undefined) throw new Error('no code')
    const live = await h.computers.ready()
    if (typeof live === 'string' || live.registry === undefined) throw new Error('no registry')

    const memberIdKeys = generateIdentity()
    const memberPub = publicIdentity(memberIdKeys)
    const hello = live.registry.hello({ code: issued.code, label: 'PC da padaria', signing: memberPub.signing, agreement: memberPub.agreement }, '100.64.0.7', { node: 'padaria', login: 'ana@example.com' })
    if (!hello.ok) throw new Error('hello failed')
    expect((await h.confirmComputer({ ...SCOPE, requestId: hello.requestId })).ok).toBe(true)

    const selfId = (await h.listComputers(SCOPE)).thisComputerId
    const ownerView = await h.listComputers(SCOPE)
    const selfRow = ownerView.presence?.find(item => item.computerId === selfId)
    expect(selfRow).toBeDefined()
    expect(selfRow?.state).toBe('ligado')
    expect(selfRow?.kind).toBe('personal')
    expect(selfRow?.ram).toBeDefined()
    expect(typeof selfRow?.capacity).toBe('number')
    expect(existsSync(join(dir, 'computer-presence.json'))).toBe(true)

    // Personal PC RAM + headroom are omitted when another member reads the list.
    h.sessionMemberId = 'gus'
    const memberView = await h.listComputers(SCOPE)
    const memberSelfRow = memberView.presence?.find(item => item.computerId === selfId)
    expect(memberSelfRow?.ram).toBeUndefined()
    expect(memberSelfRow?.capacity).toBeUndefined()
    h.sessionMemberId = 'ana'

    // Turning the station off flips this computer's presence to pausado.
    await h.setStationRunning({ ...SCOPE, running: false })
    const pausedView = await h.listComputers(SCOPE)
    expect(pausedView.presence?.find(item => item.computerId === selfId)?.state).toBe('pausado')
    await h.setStationRunning({ ...SCOPE, running: true })

    // Verified beat from the enrolled member updates presence and drops PII in aiAccountLabel.
    const memberComputerId = live.roster.certs().find(cert => cert.computerId !== selfId)?.computerId
    if (memberComputerId === undefined) throw new Error('no member computer')
    const beatAnswer = await h.computers.linkDoor.handle('beat', memberComputerId, '100.64.0.7', JSON.stringify({
      port: 47310,
      status: { counter: 1, running: true, ram: { totalBytes: 16 * 1024 ** 3, freeBytes: 8 * 1024 ** 3 }, personaCount: 3, queue: 1, aiAccountLabel: 'Claude' },
    }))
    expect(beatAnswer.status).toBe(200)
    const withRemote = await h.listComputers(SCOPE)
    expect(withRemote.presence?.find(item => item.computerId === memberComputerId)).toMatchObject({
      computerId: memberComputerId, state: 'ligado', personas: 3, aiAccountLabel: 'Claude', lastSeenAt: baseMs,
    })

    // A forged beat with an email address in aiAccountLabel must not poison or overwrite clean presence with PII.
    await h.computers.linkDoor.handle('beat', memberComputerId, '100.64.0.7', JSON.stringify({
      port: 47310,
      status: { counter: 2, running: true, ram: { totalBytes: 16 * 1024 ** 3, freeBytes: 8 * 1024 ** 3 }, personaCount: 4, queue: 0, aiAccountLabel: 'ana@secret.com' },
    }))
    const afterBadBeat = await h.listComputers(SCOPE)
    expect(afterBadBeat.presence?.find(item => item.computerId === memberComputerId)?.personas).toBe(3)
    expect(afterBadBeat.presence?.find(item => item.computerId === memberComputerId)?.aiAccountLabel).toBe('Claude')

    await closeFirst()
    cleanups.pop()

    // Rebooting >90 s later preserves lastSeenAt from computer-presence.json and marks the quiet member desligado.
    const laterMs = baseMs + 120_000
    vi.setSystemTime(laterMs)
    const { h: second, dispose: closeSecond } = openPersistentHost(dbPath, vaultPath)
    cleanups.push(closeSecond)
    second.orchestration.now = () => new Date(laterMs).toISOString()
    second.sessionMemberId = 'ana'
    const afterReboot = await second.listComputers(SCOPE)
    const memberAfterReboot = afterReboot.presence?.find(item => item.computerId === memberComputerId)
    expect(memberAfterReboot?.state).toBe('desligado')
    expect(memberAfterReboot?.lastSeenAt).toBe(baseMs)
  })

  it('D-113: never reads or writes computer-presence.json and keeps listComputers refused with feature-off under production defaults', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'persona-presence-d113-'))
    dirs.push(dir)
    const ctx = new Context()
    const host = new PersonaHost(ctx, { databasePath: join(dir, 'p.db'), flagDefaults: 'production' })
    try {
      host.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
      host.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
      host.sessionMemberId = 'ana'
      let reason: string | undefined
      try {
        await host.listComputers({ workspaceId: 'ws', projectId: 'pp' })
      } catch (error) {
        reason = error instanceof RemoteFault ? error.details.reason : 'other'
      }
      expect(reason).toBe(FEATURE_OFF_REASON)
      expect(existsSync(join(dir, 'computer-presence.json'))).toBe(false)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
