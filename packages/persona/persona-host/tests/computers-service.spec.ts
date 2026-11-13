import { describe, expect, it, vi } from 'vitest'
import { generateIdentity, publicIdentity } from '@deepseek-ai/dsh-persona-sync'
import { RosterGuard, computerIdOf, memoryRosterStore } from '../src/computers/computer-cert.ts'
import type { ComputerEnrollment, EnrollState } from '../src/computers/computer-enroll.ts'
import { ComputerRegistry, memoryRegistryStore } from '../src/computers/computer-registry.ts'
import { ComputersService, type ComputersDeps, type HomeFacts, type PersonaPreview } from '../src/computers/computers-service.ts'
import { HandoffError, type TransferRecord } from '../src/computers/handoff.ts'
import { DevicePairing, memoryPairStore } from '../src/remote-web/pair-guard.ts'

/**
 * D-116: what the screens ask about the team's computers, and the rules of taking a persona to another one: only from her home, only to a computer of the team that is on and may host her (the DESTINATION's certificate
 * decides), only with `confirm: true`, and every refusal is a stable code.
 */
const NOW = 1_800_000_000_000
const OWNER = generateIdentity()
const IA = generateIdentity()
const IB = generateIdentity()
const A = computerIdOf(publicIdentity(IA))
const B = computerIdOf(publicIdentity(IB))
const PREVIEW: PersonaPreview = { memoryItems: 12, rules: 3, skills: 2, bytes: 40_000, openTurn: false, hasPrivateDm: false }

interface World {
  readonly clock: { now: number }
  readonly registry: ComputerRegistry
  readonly roster: RosterGuard
  readonly service: ComputersService
  readonly online: Set<string>
  readonly homes: Map<string, HomeFacts>
  readonly creators: Map<string, { memberId: string; autonomy: 'baixa' | 'media' | 'alta' }>
  readonly previews: Map<string, PersonaPreview>
  readonly hosted: { count: number }
  readonly records: Map<string, TransferRecord>
  readonly sender: { start: ReturnType<typeof vi.fn>; reactivateHere: ReturnType<typeof vi.fn> }
  readonly enrollment: { status: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn> }
}

function world(opts: { owner?: boolean; stale?: boolean } = {}): World {
  const clock = { now: NOW }
  const registry = new ComputerRegistry({
    workspaceId: 'ws1', owner: { memberId: 'm-ana', signingSeed: OWNER.signing.seed, signingPublic: OWNER.signing.publicKey }, thisComputerId: A,
    pairing: new DevicePairing(memoryPairStore(), () => clock.now), store: memoryRegistryStore(), now: () => clock.now,
  })
  registry.ensureSelf(publicIdentity(IA), 'PC da Ana')
  const { code } = registry.issueCode()
  const hello = registry.hello({ code, label: 'PC da padaria', signing: IB.signing.publicKey, agreement: IB.agreement.publicKey }, '100.64.0.9')
  if (!hello.ok) throw new Error('hello refused')
  registry.confirm(hello.requestId)
  const roster = new RosterGuard('ws1', OWNER.signing.publicKey, memoryRosterStore(), () => (opts.stale === true ? clock.now + 3 * 24 * 3_600_000 : clock.now))
  roster.accept(registry.signedRoster())
  registry.onRoster((signed) => { roster.accept(signed) })
  const online = new Set<string>([A, B])
  const homes = new Map<string, HomeFacts>([['nina', { computerId: A, epoch: 3, state: 'active' }]])
  const creators = new Map([['nina', { memberId: 'm-ana', autonomy: 'baixa' as const }]])
  const previews = new Map([['nina', PREVIEW]])
  const hosted = { count: 0 }
  const records = new Map<string, TransferRecord>()
  const sender = { start: vi.fn((input: { personaId: string; toComputerId: string }) => ({ transferId: `t-${input.personaId}` })), reactivateHere: vi.fn() }
  const enrollment = { status: vi.fn((): EnrollState => ({ state: 'livre' })), start: vi.fn((): Promise<EnrollState> => Promise.resolve({ state: 'esperando-o-dono', ownerAddress: '100.64.0.2:47310', fingerprint: 'aa' })) }
  const deps: ComputersDeps = {
    thisComputerId: A, registry: () => (opts.owner === false ? undefined : registry), enrollment: enrollment as unknown as ComputerEnrollment, isOnline: id => online.has(id), roster,
    sender, transfers: { get: personaId => records.get(personaId), open: () => [...records.values()].filter(item => item.phase === 'sealed' || item.phase === 'released') },
    homeOf: id => homes.get(id), previewOf: id => previews.get(id), creatorOf: id => creators.get(id), hostedBy: () => hosted.count, now: () => clock.now,
  }
  return { clock, registry, roster, service: new ComputersService(deps), online, homes, creators, previews, hosted, records, sender, enrollment }
}

const open = (w: World, over: Partial<Parameters<ComputerRegistry['setCaps']>[1]> = {}): void => {
  expect(w.registry.setCaps(B, { expose: [], hostFor: ['m-bia'], perCreatorMax: 2, maxAutonomy: 'media', ...over })).toBe('ok')
}

describe('the screen: Computadores da equipe', () => {
  it('on the owner\'s PC: the computers the roster names (this one first, with who is on), the requests waiting, and this computer\'s own joining', () => {
    const w = world()
    w.online.delete(B)
    const { code } = w.registry.issueCode()
    const pub = publicIdentity(generateIdentity())
    expect(w.registry.hello({ code, label: 'Notebook novo', signing: pub.signing, agreement: pub.agreement, ramMb: 4096 }, '100.64.0.7', { node: 'notebook', login: 'ana@example.com' }).ok).toBe(true)
    const view = w.service.view()
    expect(view).toMatchObject({ thisComputerId: A, isOwnerPc: true, enrollment: { state: 'livre' } })
    expect(view.computers.map(item => [item.label, item.isThis, item.online])).toEqual([['PC da Ana', true, true], ['PC da padaria', false, false]])
    expect(view.computers[1]).toMatchObject({ hostFor: ['m-ana'], perCreatorMax: 3, maxAutonomy: 'baixa', exposeCount: 0 })
    expect(view.computers[1]?.fingerprint).toMatch(/^[0-9a-f]{4}( [0-9a-f]{4}){4}$/u)
    expect(view.requests).toHaveLength(1)
    expect(view.requests[0]).toMatchObject({ label: 'Notebook novo', node: 'notebook', login: 'ana@example.com', ramMb: 4096, known: false })
  })

  it('on a member: the same list from its own roster, no requests, and it is not the owner\'s PC', () => {
    const w = world({ owner: false })
    const view = w.service.view()
    expect(view).toMatchObject({ isOwnerPc: false, requests: [] })
    expect(view.computers.map(item => item.label)).toEqual(['PC da Ana', 'PC da padaria'])
  })

  it('a computer the owner revoked leaves the list', () => {
    const w = world()
    expect(w.service.revoke(B)).toEqual({ ok: true })
    expect(w.service.view().computers.map(item => item.computerId)).toEqual([A])
  })
})

describe('only the owner\'s PC runs the team', () => {
  it('a member refuses to issue a code, confirm, reject or revoke (`not-owner-pc`)', () => {
    const w = world({ owner: false })
    for (const result of [w.service.issueCode(), w.service.confirm('x'), w.service.reject('x'), w.service.revoke(B)]) expect(result).toEqual({ ok: false, reason: 'not-owner-pc' })
  })

  it('the owner\'s PC does not join a team (it is the first computer of it), and a member hands its typing to the enrollment', async () => {
    const owner = world()
    expect(await owner.service.enroll({ ownerAddress: '100.64.0.2:47310', code: 'AAAA-BBBB', label: 'x' })).toEqual({ ok: false, reason: 'owner-pc-cannot-join' })
    expect(owner.enrollment.start).not.toHaveBeenCalled()
    const member = world({ owner: false })
    expect(await member.service.enroll({ ownerAddress: '100.64.0.2:47310', code: 'AAAA-BBBB', label: 'PC' })).toMatchObject({ ok: true, enrollment: { state: 'esperando-o-dono' } })
    expect(member.enrollment.start).toHaveBeenCalledWith({ ownerAddress: '100.64.0.2:47310', code: 'AAAA-BBBB', label: 'PC' })
  })

  it('the owner issues a code, confirms and rejects requests, and every unknown id is a stable code', () => {
    const w = world()
    expect(w.service.issueCode()).toMatchObject({ ok: true, code: expect.stringMatching(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/u) as string })
    expect(w.service.confirm('nao-existe')).toEqual({ ok: false, reason: 'unknown-request' })
    expect(w.service.reject('nao-existe')).toEqual({ ok: false, reason: 'unknown-request' })
    expect(w.service.revoke('nao-existe')).toEqual({ ok: false, reason: 'unknown-computer' })
    expect(w.service.revoke(A)).toEqual({ ok: false, reason: 'is-this-computer' })
    const { code } = w.registry.issueCode()
    const pub = publicIdentity(generateIdentity())
    const hello = w.registry.hello({ code, label: 'Outro', signing: pub.signing, agreement: pub.agreement }, '100.64.0.8')
    if (!hello.ok) throw new Error('refused')
    expect(w.service.confirm(hello.requestId)).toEqual({ ok: true })
    expect(w.service.view().computers).toHaveLength(3)
  })
})

describe('a fresh PC is neither the owner\'s nor a member until it does one of the two', () => {
  function fresh(): { service: ComputersService; registry: ComputerRegistry; enrollment: World['enrollment']; claimed: { times: number } } {
    const clock = { now: NOW }
    const registry = new ComputerRegistry({
      workspaceId: 'ws1', owner: { memberId: 'm-ana', signingSeed: OWNER.signing.seed, signingPublic: OWNER.signing.publicKey }, thisComputerId: A,
      pairing: new DevicePairing(memoryPairStore(), () => clock.now), store: memoryRegistryStore(), now: () => clock.now,
    })
    const roster = new RosterGuard('ws1', OWNER.signing.publicKey, memoryRosterStore(), () => clock.now)
    registry.onRoster((signed) => { roster.accept(signed) })
    const enrollment = { status: vi.fn((): EnrollState => ({ state: 'livre' })), start: vi.fn((): Promise<EnrollState> => Promise.resolve({ state: 'esperando-o-dono', ownerAddress: '100.64.0.2:47310', fingerprint: 'aa' })) }
    const claimed = { times: 0 }
    const service = new ComputersService({
      thisComputerId: A, registry: () => registry, claimOwner: () => { claimed.times += 1; registry.ensureSelf(publicIdentity(IA), 'PC da Ana') }, enrollment: enrollment as unknown as ComputerEnrollment, isOnline: () => true, roster,
      sender: { start: vi.fn(), reactivateHere: vi.fn() }, transfers: { get: () => undefined, open: () => [] }, homeOf: () => undefined, previewOf: () => undefined, creatorOf: () => undefined, hostedBy: () => 0, now: () => clock.now,
    })
    return { service, registry, enrollment, claimed }
  }

  it('shows no computers and is not the owner\'s PC; it may join a team (the typing goes to the enrollment)', async () => {
    const { service, enrollment } = fresh()
    expect(service.view()).toMatchObject({ isOwnerPc: false, computers: [], requests: [] })
    expect(await service.enroll({ ownerAddress: '100.64.0.2:47310', code: 'AAAA-BBBB', label: 'PC' })).toMatchObject({ ok: true })
    expect(enrollment.start).toHaveBeenCalledTimes(1)
  })

  it('its first code makes it the owner\'s PC: its own certificate is signed then, and from then on it cannot join another team', async () => {
    const { service, claimed } = fresh()
    expect(service.issueCode()).toMatchObject({ ok: true })
    expect(claimed.times).toBe(1)
    expect(service.view()).toMatchObject({ isOwnerPc: true })
    expect(service.view().computers.map(item => item.label)).toEqual(['PC da Ana'])
    expect(await service.enroll({ ownerAddress: '100.64.0.2:47310', code: 'AAAA-BBBB', label: 'PC' })).toEqual({ ok: false, reason: 'owner-pc-cannot-join' })
  })

  it('confirming or rejecting on a PC that never issued a code is `unknown-request`, not a crash', () => {
    const { service } = fresh()
    expect(service.confirm('x')).toEqual({ ok: false, reason: 'unknown-request' })
    expect(service.reject('x')).toEqual({ ok: false, reason: 'unknown-request' })
    expect(service.revoke('x')).toEqual({ ok: false, reason: 'unknown-computer' })
  })
})

describe('where a persona lives', () => {
  it('says which computer, whether it is on and whether it is this one; a persona with no home is unknown', () => {
    const w = world()
    for (const id of ['bia', 'cris']) w.creators.set(id, { memberId: 'm-ana', autonomy: 'baixa' })
    expect(w.service.home('nina')).toEqual({ ok: true, home: { personaId: 'nina', computerId: A, computerLabel: 'PC da Ana', isThis: true, online: true, epoch: 3, state: 'active' } })
    w.homes.set('bia', { computerId: B, epoch: 4, state: 'active' })
    w.online.delete(B)
    expect(w.service.home('bia')).toMatchObject({ ok: true, home: { computerLabel: 'PC da padaria', isThis: false, online: false } })
    w.homes.set('cris', { computerId: A, epoch: 5, state: 'moving', movingTo: B })
    expect(w.service.home('cris')).toMatchObject({ ok: true, home: { state: 'moving', movingTo: B } })
    expect(w.service.home('ninguem')).toEqual({ ok: false, reason: 'unknown-persona' })
    w.homes.set('fantasma', { computerId: A, epoch: 0, state: 'active' }) // the book answers for any id; a persona that does not exist has no home to show
    expect(w.service.home('fantasma')).toEqual({ ok: false, reason: 'unknown-persona' })
  })

  it('a computer that is not in the roster any more has the plain label `Computador`', () => {
    const w = world()
    w.creators.set('bia', { memberId: 'm-ana', autonomy: 'baixa' })
    w.homes.set('bia', { computerId: 'sumiu', epoch: 1, state: 'active' })
    expect(w.service.home('bia')).toMatchObject({ ok: true, home: { computerLabel: 'Computador' } })
  })
})

describe('what taking her would do (nothing moves)', () => {
  it('lists what travels and what the screen must SAY: the AI login stays, an open turn is cancelled, private DM memory stays', () => {
    const w = world()
    open(w, { hostFor: ['m-ana'] })
    expect(w.service.preview('nina', B)).toEqual({ ok: true, personaId: 'nina', toComputerId: B, toLabel: 'PC da padaria', preview: PREVIEW, notes: ['ai-login-stays'] })
    w.previews.set('nina', { ...PREVIEW, openTurn: true, hasPrivateDm: true })
    expect(w.service.preview('nina', B)).toMatchObject({ ok: true, notes: ['ai-login-stays', 'open-turn-cancelled', 'private-dm-stays'] })
    expect(w.sender.start).not.toHaveBeenCalled()
  })

  it('refuses in a fixed order with a stable code each: unknown persona, not her home, this computer, stale roster, unknown computer, offline', () => {
    const w = world()
    open(w, { hostFor: ['m-ana'] })
    expect(w.service.preview('ninguem', B)).toEqual({ ok: false, reason: 'unknown-persona' })
    w.homes.set('nina', { computerId: B, epoch: 3, state: 'active' })
    expect(w.service.preview('nina', B)).toEqual({ ok: false, reason: 'not-home' }) // her home is the other computer: only the home may send her
    w.homes.set('nina', { computerId: A, epoch: 3, state: 'moving', movingTo: B })
    expect(w.service.preview('nina', B)).toEqual({ ok: false, reason: 'not-home' }) // already on her way
    w.homes.set('nina', { computerId: A, epoch: 3, state: 'active' })
    expect(w.service.preview('nina', A)).toEqual({ ok: false, reason: 'is-this-computer' })
    expect(w.service.preview('nina', 'nao-existe')).toEqual({ ok: false, reason: 'unknown-computer' })
    w.online.delete(B)
    expect(w.service.preview('nina', B)).toEqual({ ok: false, reason: 'destination-offline' })
    w.online.add(B)
    w.registry.revoke(B)
    expect(w.service.preview('nina', B)).toEqual({ ok: false, reason: 'unknown-computer' }) // a revoked computer is nobody
    expect(world({ stale: true }).service.preview('nina', B)).toEqual({ ok: false, reason: 'stale-roster' }) // no fresh roster: no moves (safe failure)
  })

  it('the DESTINATION\'s certificate decides who may put a persona there: `host-not-allowed`, `creator-quota`, `autonomy-too-high`', () => {
    const w = world()
    expect(w.service.preview('nina', B)).toMatchObject({ ok: true }) // the owner is always a host
    w.creators.set('nina', { memberId: 'm-bia', autonomy: 'baixa' })
    expect(w.service.preview('nina', B)).toEqual({ ok: false, reason: 'host-not-allowed' }) // the certificate does not list her creator
    open(w) // hostFor: m-bia, at most 2, autonomy up to `media`
    expect(w.service.preview('nina', B)).toMatchObject({ ok: true })
    w.hosted.count = 2
    expect(w.service.preview('nina', B)).toEqual({ ok: false, reason: 'creator-quota' })
    w.hosted.count = 0
    w.creators.set('nina', { memberId: 'm-bia', autonomy: 'alta' })
    expect(w.service.preview('nina', B)).toEqual({ ok: false, reason: 'autonomy-too-high' })
  })
})

describe('taking her', () => {
  it('without `confirm: true` nothing moves, and nothing is even checked', () => {
    const w = world()
    for (const confirm of [false, undefined as unknown as boolean]) expect(w.service.move({ personaId: 'nina', toComputerId: B, confirm })).toEqual({ ok: false, reason: 'confirm-required' })
    expect(w.sender.start).not.toHaveBeenCalled()
  })

  it('with the confirmation it starts the handoff; private DM memory travels only when the creator said so', () => {
    const w = world()
    expect(w.service.move({ personaId: 'nina', toComputerId: B, confirm: true })).toEqual({ ok: true, transferId: 't-nina' })
    expect(w.sender.start).toHaveBeenLastCalledWith({ personaId: 'nina', toComputerId: B, includesPrivateDm: false })
    w.service.move({ personaId: 'nina', toComputerId: B, confirm: true, includePrivateDm: true })
    expect(w.sender.start).toHaveBeenLastCalledWith({ personaId: 'nina', toComputerId: B, includesPrivateDm: true })
  })

  it('a preview refusal is returned and the handoff is never started; the handoff\'s own refusals keep their code; anything else is not swallowed', () => {
    const w = world()
    w.online.delete(B)
    expect(w.service.move({ personaId: 'nina', toComputerId: B, confirm: true })).toEqual({ ok: false, reason: 'destination-offline' })
    expect(w.sender.start).not.toHaveBeenCalled()
    w.online.add(B)
    w.sender.start.mockImplementationOnce(() => { throw new HandoffError('transfer-in-progress') })
    expect(w.service.move({ personaId: 'nina', toComputerId: B, confirm: true })).toEqual({ ok: false, reason: 'transfer-in-progress' })
    w.sender.start.mockImplementationOnce(() => { throw new Error('disk full') })
    expect(() => w.service.move({ personaId: 'nina', toComputerId: B, confirm: true })).toThrow('disk full')
  })
})

describe('how far a transfer is', () => {
  const record = (over: Partial<TransferRecord> = {}): TransferRecord => ({ transferId: 't-nina', personaId: 'nina', from: A, to: B, epoch: 4, phase: 'sealed', digest: 'd', startedAt: NOW, ...over })

  it('is known by the id `move` returned, while it is open and after it is over', () => {
    const w = world()
    w.service.move({ personaId: 'nina', toComputerId: B, confirm: true })
    w.records.set('nina', record())
    expect(w.service.transfer('t-nina')).toMatchObject({ ok: true, transfer: { transferId: 't-nina', personaId: 'nina', toLabel: 'PC da padaria', epoch: 4, phase: 'sealed', destinationSilent: false } })
    w.records.set('nina', record({ phase: 'done' }))
    expect(w.service.transfer('t-nina')).toMatchObject({ ok: true, transfer: { phase: 'done' } })
  })

  it('is known after a restart too, from the open records (the id map is only a convenience)', () => {
    const w = world()
    w.records.set('nina', record({ phase: 'released', activateBefore: NOW + 600_000 }))
    expect(w.service.transfer('t-nina')).toMatchObject({ ok: true, transfer: { phase: 'released', activateBefore: NOW + 600_000, destinationSilent: false } })
  })

  it('says the destination is SILENT once it released and the destination\'s window is over (the screen then offers "Ativar de novo aqui" with the partition warning)', () => {
    const w = world()
    w.records.set('nina', record({ phase: 'released', activateBefore: NOW + 600_000 }))
    w.clock.now = NOW + 600_000
    expect(w.service.transfer('t-nina')).toMatchObject({ ok: true, transfer: { destinationSilent: true } })
    w.records.set('nina', record({ phase: 'sealed' }))
    expect(w.service.transfer('t-nina')).toMatchObject({ ok: true, transfer: { destinationSilent: false } }) // only a RELEASED handoff can be silent
  })

  it('an id it never gave, or one that a newer transfer of the same persona replaced, is `unknown-transfer`', () => {
    const w = world()
    expect(w.service.transfer('nao-existe')).toEqual({ ok: false, reason: 'unknown-transfer' })
    w.service.move({ personaId: 'nina', toComputerId: B, confirm: true })
    w.records.set('nina', record({ transferId: 'outro' }))
    expect(w.service.transfer('t-nina')).toEqual({ ok: false, reason: 'unknown-transfer' })
  })
})

describe('"Ativar de novo aqui"', () => {
  it('goes to the sender with the confirmation, and its refusals keep their code', () => {
    const w = world()
    expect(w.service.reactivate('nina', true)).toEqual({ ok: true })
    expect(w.sender.reactivateHere).toHaveBeenCalledWith('nina', true)
    for (const code of ['confirm-required', 'too-early', 'not-released', 'already-moved'] as const) {
      w.sender.reactivateHere.mockImplementationOnce(() => { throw new HandoffError(code) })
      expect(w.service.reactivate('nina', false)).toEqual({ ok: false, reason: code })
    }
    w.sender.reactivateHere.mockImplementationOnce(() => { throw new Error('boom') })
    expect(() => w.service.reactivate('nina', true)).toThrow('boom')
  })
})
