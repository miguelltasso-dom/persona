import { afterEach, beforeEach, describe, expect, vi } from 'vitest'
import { RemoteFault } from '../src/remote-guard.ts'
import type PersonaHost from '../src/index.ts'
import { generateIdentity, publicIdentity } from '@deepseek-ai/dsh-persona-sync'
import { it, seedJourney, seedProject } from './journeys/journey-host.ts'
import { openRemoteTeamHarness } from './remote-team-harness.ts'

/**
 * D-116 on the REAL host: the 11 Remotes of the team's computers. Who may call each one (the PC's owner for what changes the team; a member for what only reads; a paired phone only for the two reads on its list and
 * never for who is asking to join), and what each one answers on a fresh PC.
 */
const SCOPE = { workspaceId: 'ws', projectId: 'sh' } as const

const disposers: (() => Promise<void>)[] = []
beforeEach(() => { vi.stubEnv('PERSONA_VAULT_TEST_CIPHER', '1') }) // a host with the REAL Cofre (the vault plugin, test cipher): the device identity lives there
afterEach(async () => { for (const dispose of disposers.splice(0)) await dispose(); vi.unstubAllEnvs() })

function open(): PersonaHost {
  const { h, dispose } = openRemoteTeamHarness('')
  disposers.push(dispose)
  seedJourney(h, [])
  seedProject(h, { id: 'sh', name: 'Loja', team: [] }) // a shared project: the personal one is the owner's alone, a member could not even read it
  h.createMember({ id: 'gus', ...SCOPE, displayName: 'Gus', handle: 'gus', role: 'member' })
  h.sessionMemberId = 'ana'
  return h
}

const asDevice = (h: PersonaHost, deviceId: string): PersonaHost => Object.create(h, { ctx: { value: { invocation: { peer: { principal: { kind: 'paired', deviceId } } } } } }) as PersonaHost
const refusedWith = async (run: () => Promise<unknown>): Promise<string> => {
  try { await run(); return 'none' } catch (error) { return error instanceof RemoteFault ? `${error.code}${error.details.reason === undefined ? '' : `:${String(error.details.reason)}`}` : error instanceof Error ? error.message : 'other' }
}

describe('a fresh PC', () => {
  it('lists no computers and is not the owner\'s PC; typing the first code makes it the owner\'s, with itself in the list', async () => {
    const h = open()
    expect(await h.listComputers(SCOPE)).toMatchObject({ isOwnerPc: false, computers: [], requests: [], enrollment: { state: 'livre' } })
    const issued = await h.issueComputerCode(SCOPE)
    expect(issued).toMatchObject({ ok: true, code: expect.stringMatching(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/u) as string })
    const view = await h.listComputers(SCOPE)
    expect(view.isOwnerPc).toBe(true)
    expect(view.computers).toHaveLength(1)
    expect(view.computers[0]).toMatchObject({ isThis: true, hostFor: ['ana'], maxAutonomy: 'baixa', exposeCount: 0 })
    expect(view.thisComputerId).toBe(view.computers[0]?.computerId)
  })

  it('the owner\'s PC does not join another team, a persona that does not exist has no home, no preview and no move, an unknown transfer is unknown, and "Ativar de novo" needs the confirmation', async () => {
    const h = open()
    await h.issueComputerCode(SCOPE)
    expect(await h.enrollThisComputer({ ...SCOPE, ownerAddress: '100.64.0.2:47310', code: 'AAAA-BBBB', label: 'x' })).toEqual({ ok: false, reason: 'owner-pc-cannot-join' })
    expect(await h.getPersonaHome({ ...SCOPE, personaId: 'ninguem' })).toEqual({ ok: false, reason: 'unknown-persona' })
    expect(await h.previewMovePersona({ ...SCOPE, personaId: 'ninguem', toComputerId: 'x' })).toEqual({ ok: false, reason: 'unknown-persona' })
    expect(await h.movePersona({ ...SCOPE, personaId: 'ninguem', toComputerId: 'x', confirm: false })).toEqual({ ok: false, reason: 'confirm-required' })
    expect(await h.movePersona({ ...SCOPE, personaId: 'ninguem', toComputerId: 'x', confirm: true })).toEqual({ ok: false, reason: 'unknown-persona' })
    expect(await h.getTransfer({ ...SCOPE, transferId: 'nao-existe' })).toEqual({ ok: false, reason: 'unknown-transfer' })
    expect(await h.reactivatePersonaHere({ ...SCOPE, personaId: 'ninguem', confirm: false })).toEqual({ ok: false, reason: 'confirm-required' })
    expect(await h.reactivatePersonaHere({ ...SCOPE, personaId: 'ninguem', confirm: true })).toEqual({ ok: false, reason: 'not-released' })
  })

  it('confirming, rejecting and revoking what does not exist are stable codes, and this PC cannot remove itself', async () => {
    const h = open()
    await h.issueComputerCode(SCOPE)
    expect(await h.confirmComputer({ ...SCOPE, requestId: 'x' })).toEqual({ ok: false, reason: 'unknown-request' })
    expect(await h.rejectComputer({ ...SCOPE, requestId: 'x' })).toEqual({ ok: false, reason: 'unknown-request' })
    expect(await h.revokeComputer({ ...SCOPE, computerId: 'x' })).toEqual({ ok: false, reason: 'unknown-computer' })
    const self = (await h.listComputers(SCOPE)).thisComputerId
    expect(await h.revokeComputer({ ...SCOPE, computerId: self })).toEqual({ ok: false, reason: 'is-this-computer' })
  })
})

describe('who may call what', () => {
  it('a plain member of the team reads the list but cannot issue, enroll, confirm, reject, revoke, move or reactivate (those change the team and are the owner\'s, at the PC)', async () => {
    const h = open()
    await h.issueComputerCode(SCOPE)
    h.sessionMemberId = 'gus'
    expect((await h.listComputers(SCOPE)).isOwnerPc).toBe(true)
    const calls: [string, () => Promise<unknown>][] = [
      ['issueComputerCode', () => h.issueComputerCode(SCOPE)],
      ['enrollThisComputer', () => h.enrollThisComputer({ ...SCOPE, ownerAddress: '100.64.0.2:1', code: 'AAAA-BBBB', label: 'x' })],
      ['confirmComputer', () => h.confirmComputer({ ...SCOPE, requestId: 'x' })],
      ['rejectComputer', () => h.rejectComputer({ ...SCOPE, requestId: 'x' })],
      ['revokeComputer', () => h.revokeComputer({ ...SCOPE, computerId: 'x' })],
      ['movePersona', () => h.movePersona({ ...SCOPE, personaId: 'p', toComputerId: 'x', confirm: true })],
      ['reactivatePersonaHere', () => h.reactivatePersonaHere({ ...SCOPE, personaId: 'p', confirm: true })],
    ]
    for (const [name, run] of calls) expect(await refusedWith(run), name).not.toBe('none')
  })

  it('a paired PHONE reads `listComputers` and `getPersonaHome` as the member of the device — and never who is asking to join; every other call is refused by the funnel', async () => {
    const h = open()
    const issued = await h.issueComputerCode(SCOPE)
    if (!issued.ok || issued.code === undefined) throw new Error('no code')
    const live = await h.computers.ready()
    if (typeof live === 'string' || live.registry === undefined) throw new Error('no registry')
    const pub = publicIdentity(generateIdentity())
    expect(live.registry.hello({ code: issued.code, label: 'Notebook novo', signing: pub.signing, agreement: pub.agreement }, '100.64.0.7', { node: 'notebook', login: 'ana@example.com' }).ok).toBe(true)
    expect((await h.listComputers(SCOPE)).requests).toHaveLength(1) // the owner at the PC sees the request

    const device = h.remoteDevices.enroll('gus', 'Pixel', { address: '100.64.0.9' })
    if (device === 'cheio') throw new Error('book full')
    const phone = asDevice(h, device.id)
    const seen = await phone.listComputers(SCOPE)
    expect(seen.computers).toHaveLength(1)
    expect(seen.requests).toEqual([]) // a phone sees which computers are on, never who asks to join
    expect(await refusedWith(() => phone.issueComputerCode(SCOPE))).toBe('forbidden:remote-not-allowed')
    expect(await refusedWith(() => phone.movePersona({ ...SCOPE, personaId: 'p', toComputerId: 'x', confirm: true }))).toBe('forbidden:remote-not-allowed')
    expect(await refusedWith(() => phone.confirmComputer({ ...SCOPE, requestId: 'x' }))).toBe('forbidden:remote-not-allowed')
    expect(await refusedWith(() => phone.revokeComputer({ ...SCOPE, computerId: 'x' }))).toBe('forbidden:remote-not-allowed')
  })
})
