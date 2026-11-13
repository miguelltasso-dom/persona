import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { generateIdentity, publicIdentity } from '@deepseek-ai/dsh-persona-sync'
import { ROSTER_FRESH_MS, RosterGuard, computerFingerprint, computerIdOf, memoryRosterStore, verifyCert } from '../src/computers/computer-cert.ts'
import { COMPUTER_COLLECT_MS, COMPUTER_REQUEST_TTL_MS, ComputerRegistry, MAX_COMPUTER_REQUESTS, ROSTER_REISSUE_MS, fileRegistryStore, memoryRegistryStore, type HelloInput } from '../src/computers/computer-registry.ts'
import { DevicePairing, memoryPairStore } from '../src/remote-web/pair-guard.ts'

/**
 * D-116 B2: the owner's side of registering a computer. A right code opens a REQUEST; only the owner's confirmation signs a certificate; the roster only goes up; a revoked id never comes back.
 */
const NOW = 1_800_000_000_000
const OWNER = generateIdentity()
const PC = generateIdentity()
const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

function rig(): { registry: ComputerRegistry; clock: { now: number }; helloFrom(who: ReturnType<typeof generateIdentity>, over?: Partial<HelloInput>, address?: string): ReturnType<ComputerRegistry['hello']>; store: ReturnType<typeof memoryRegistryStore> } {
  const clock = { now: NOW }
  const store = memoryRegistryStore()
  const registry = new ComputerRegistry({
    workspaceId: 'ws1', owner: { memberId: 'ana', signingSeed: OWNER.signing.seed, signingPublic: OWNER.signing.publicKey }, thisComputerId: computerIdOf(publicIdentity(PC)),
    pairing: new DevicePairing(memoryPairStore(), () => clock.now), store, now: () => clock.now,
  })
  registry.ensureSelf(publicIdentity(PC), 'PC da Ana')
  const helloFrom = (who: ReturnType<typeof generateIdentity>, over: Partial<HelloInput> = {}, address = '100.64.0.5'): ReturnType<ComputerRegistry['hello']> => {
    const { code } = registry.issueCode()
    const pub = publicIdentity(who)
    return registry.hello({ code, label: 'PC da padaria', signing: pub.signing, agreement: pub.agreement, ramMb: 8192, ...over }, address, { node: 'padaria', login: 'ana@example.com' })
  }
  return { registry, clock, helloFrom, store }
}
const requestOf = (result: ReturnType<ComputerRegistry['hello']>): { requestId: string; pollToken: string } => {
  if (!result.ok) throw new Error(`hello refused: ${result.reason}`)
  return result
}

describe('this PC is a computer of the team', () => {
  it('has a certificate signed by the owner, with nothing exposed and nobody but the owner as host', () => {
    const { registry } = rig()
    const [self] = registry.computers()
    expect(self).toMatchObject({ label: 'PC da Ana', isThis: true, registeredBy: 'ana', caps: { expose: [], hostFor: ['ana'], maxAutonomy: 'baixa' } })
    const roster = registry.signedRoster()
    expect(roster?.roster.version).toBe(1)
    expect(verifyCert(roster?.roster.certs[0], OWNER.signing.publicKey)?.computerId).toBe(self?.computerId)
  })

  it('is made once: asking again returns the same certificate and does not raise the version', () => {
    const { registry } = rig()
    const before = registry.signedRoster()?.roster.version
    registry.ensureSelf(publicIdentity(PC), 'outro nome')
    expect(registry.signedRoster()?.roster.version).toBe(before)
    expect(registry.computers()).toHaveLength(1)
  })
})

describe('a right code is a REQUEST, not a registration', () => {
  it('shows the owner the name, the RAM, what Tailscale says and the fingerprint of both keys; the roster does not change until she confirms', () => {
    const { registry, helloFrom } = rig()
    const before = registry.signedRoster()?.roster.version
    const other = generateIdentity()
    requestOf(helloFrom(other))
    const [view] = registry.requests()
    expect(view).toMatchObject({ label: 'PC da padaria', address: '100.64.0.5', node: 'padaria', login: 'ana@example.com', ramMb: 8192, known: false, fingerprint: computerFingerprint(publicIdentity(other)) })
    expect(registry.computers()).toHaveLength(1)
    expect(registry.signedRoster()?.roster.version).toBe(before)
  })

  it('a wrong code is refused with the one reason `recusado` and opens nothing; five wrong tries from one address lock that address', () => {
    const { registry } = rig()
    const pub = publicIdentity(generateIdentity())
    registry.issueCode()
    const wrong = (): ReturnType<ComputerRegistry['hello']> => registry.hello({ code: 'ZZZZ-ZZZZ', label: 'x', signing: pub.signing, agreement: pub.agreement }, '100.64.0.7')
    for (let index = 0; index < 5; index += 1) expect(wrong()).toEqual({ ok: false, reason: 'recusado' })
    expect(wrong()).toMatchObject({ ok: false, reason: 'bloqueado' })
    expect(registry.requests()).toEqual([])
  })

  it('a malformed hello (keys that are not keys, a name that is not text, RAM that is not a number) is `invalido` and does NOT spend the code', () => {
    const { registry } = rig()
    const { code } = registry.issueCode()
    const good = publicIdentity(generateIdentity())
    expect(registry.hello({ code, label: 'x', signing: 'abc', agreement: good.agreement }, '100.64.0.5')).toEqual({ ok: false, reason: 'invalido' })
    expect(registry.hello({ code, label: 'x', signing: good.signing, agreement: good.signing + 'zz' }, '100.64.0.5')).toEqual({ ok: false, reason: 'invalido' })
    expect(registry.hello({ code, label: 'x', signing: good.signing, agreement: good.agreement, ramMb: -1 }, '100.64.0.5')).toEqual({ ok: false, reason: 'invalido' })
    expect(registry.hello({ code, label: 42 as unknown as string, signing: good.signing, agreement: good.agreement }, '100.64.0.5')).toEqual({ ok: false, reason: 'invalido' })
    expect(registry.hello({ code, label: 'x', signing: good.signing, agreement: good.agreement }, '100.64.0.5').ok).toBe(true) // the same code still works
  })

  it('a code works once', () => {
    const { registry } = rig()
    const { code } = registry.issueCode()
    const pub = publicIdentity(generateIdentity())
    expect(registry.hello({ code, label: 'a', signing: pub.signing, agreement: pub.agreement }, '100.64.0.5').ok).toBe(true)
    expect(registry.hello({ code, label: 'a', signing: pub.signing, agreement: pub.agreement }, '100.64.0.5')).toEqual({ ok: false, reason: 'recusado' })
  })

  it('the screen is one short list: a flood of requests is `cheio` and does not spend the code', () => {
    const { registry, helloFrom } = rig()
    for (let index = 0; index < MAX_COMPUTER_REQUESTS; index += 1) requestOf(helloFrom(generateIdentity()))
    const { code } = registry.issueCode()
    const pub = publicIdentity(generateIdentity())
    expect(registry.hello({ code, label: 'a', signing: pub.signing, agreement: pub.agreement }, '100.64.0.5')).toEqual({ ok: false, reason: 'cheio' })
    const [first] = registry.requests()
    registry.reject(first?.requestId ?? '')
    registry.poll('x') // sweep
    expect(registry.hello({ code, label: 'a', signing: pub.signing, agreement: pub.agreement }, '100.64.0.5').ok).toBe(true) // the code was not spent
  })

  it('the name the computer gives itself is cleaned (control characters, a wall of spaces, a novel)', () => {
    const { registry, helloFrom } = rig()
    requestOf(helloFrom(generateIdentity(), { label: `  PC\u0000 da\n\n padaria ${'x'.repeat(200)}` }))
    const label = registry.requests()[0]?.label ?? ''
    expect(label.startsWith('PC da padaria')).toBe(true)
    expect(label.length).toBeLessThanOrEqual(80)
    expect(/\p{Cc}/u.test(label)).toBe(false)
  })

  it('requests expire when the owner does not answer', () => {
    const { registry, helloFrom, clock } = rig()
    const { pollToken } = requestOf(helloFrom(generateIdentity()))
    clock.now += COMPUTER_REQUEST_TTL_MS + 1
    expect(registry.requests()).toEqual([])
    expect(registry.poll(pollToken)).toEqual({ state: 'desconhecido' })
  })
})

describe('the owner confirms: a certificate she signs, a roster that goes up', () => {
  it('confirm signs a certificate with the owner\'s key (nothing exposed, only the owner as host), raises the roster version and hands it to the computer that holds the token, ONCE', () => {
    const { registry, helloFrom } = rig()
    const newcomer = generateIdentity()
    const { requestId, pollToken } = requestOf(helloFrom(newcomer))
    expect(registry.poll(pollToken)).toEqual({ state: 'esperando-o-dono' })
    const before = registry.signedRoster()?.roster.version ?? 0
    expect(registry.confirm(requestId)).toBe('ok')
    const polled = registry.poll(pollToken)
    if (polled.state !== 'aprovado') throw new Error(`state ${polled.state}`)
    const { grant } = polled
    expect(grant.workspaceId).toBe('ws1')
    expect(grant.ownerSigningPublic).toBe(OWNER.signing.publicKey)
    expect(verifyCert(grant.cert, OWNER.signing.publicKey)).toMatchObject({ computerId: computerIdOf(publicIdentity(newcomer)), label: 'PC da padaria', registeredBy: 'ana', caps: { expose: [], hostFor: ['ana'] } })
    expect(grant.roster.roster.version).toBe(before + 1)
    expect(registry.poll(pollToken)).toEqual({ state: 'desconhecido' }) // once
    expect(registry.computers().map(item => item.label)).toEqual(['PC da Ana', 'PC da padaria'])
  })

  it('the new computer trusts the roster only because the owner\'s key signed it; a roster signed by another key is refused', () => {
    const { registry, helloFrom } = rig()
    const { requestId, pollToken } = requestOf(helloFrom(generateIdentity()))
    registry.confirm(requestId)
    const polled = registry.poll(pollToken)
    if (polled.state !== 'aprovado') throw new Error('not approved')
    const guard = new RosterGuard('ws1', polled.grant.ownerSigningPublic, memoryRosterStore(), () => NOW)
    expect(guard.accept(polled.grant.roster)).toBe('ok')
    expect(guard.certOf(polled.grant.cert.cert.computerId)).toBeDefined()
    const stranger = new RosterGuard('ws1', generateIdentity().signing.publicKey, memoryRosterStore(), () => NOW)
    expect(stranger.accept(polled.grant.roster)).toBe('bad-cert')
  })

  it('reject answers `recusado` once and the roster does not change', () => {
    const { registry, helloFrom } = rig()
    const before = registry.signedRoster()?.roster.version
    const { requestId, pollToken } = requestOf(helloFrom(generateIdentity()))
    expect(registry.reject(requestId)).toBe(true)
    expect(registry.reject(requestId)).toBe(false)
    expect(registry.confirm(requestId)).toBe('desconhecido')
    expect(registry.poll(pollToken)).toEqual({ state: 'recusado' })
    expect(registry.signedRoster()?.roster.version).toBe(before)
    expect(registry.computers()).toHaveLength(1)
  })

  it('an approval nobody collects expires; the computer is in the roster, and asking again with a new code (the same keys) hands the SAME certificate without a new version', () => {
    const { registry, helloFrom, clock } = rig()
    const newcomer = generateIdentity()
    const first = requestOf(helloFrom(newcomer))
    registry.confirm(first.requestId)
    const version = registry.signedRoster()?.roster.version
    clock.now += COMPUTER_COLLECT_MS + 1
    expect(registry.poll(first.pollToken)).toEqual({ state: 'desconhecido' })
    const again = requestOf(helloFrom(newcomer))
    expect(registry.requests()[0]?.known).toBe(true)
    expect(registry.confirm(again.requestId)).toBe('ok')
    expect(registry.computers()).toHaveLength(2)
    expect(registry.signedRoster()?.roster.version).toBe(version)
    const polled = registry.poll(again.pollToken)
    expect(polled.state).toBe('aprovado')
  })

  it('the same computer typing a second code replaces its own earlier request', () => {
    const { registry, helloFrom } = rig()
    const newcomer = generateIdentity()
    requestOf(helloFrom(newcomer))
    requestOf(helloFrom(newcomer))
    expect(registry.requests()).toHaveLength(1)
  })

  it('a team that is full refuses another computer (`cheio`) and the roster does not change', () => {
    const { registry, helloFrom } = rig()
    for (let index = 0; index < 49; index += 1) { const { requestId } = requestOf(helloFrom(generateIdentity(), {}, `100.64.1.${String(index % 250)}`)); registry.confirm(requestId) }
    expect(registry.computers()).toHaveLength(50)
    const { requestId } = requestOf(helloFrom(generateIdentity(), {}, '100.64.2.1'))
    expect(registry.confirm(requestId)).toBe('cheio')
  })
})

describe('revoking a computer', () => {
  it('takes its certificate out and keeps its id revoked in every later roster; the guard of another computer stops giving its certificate', () => {
    const { registry, helloFrom } = rig()
    const newcomer = generateIdentity()
    const { requestId } = requestOf(helloFrom(newcomer))
    registry.confirm(requestId)
    const id = computerIdOf(publicIdentity(newcomer))
    const guard = new RosterGuard('ws1', OWNER.signing.publicKey, memoryRosterStore(), () => NOW)
    expect(guard.accept(registry.signedRoster())).toBe('ok')
    expect(guard.certOf(id)).toBeDefined()
    expect(registry.revoke(id)).toBe('ok')
    expect(guard.accept(registry.signedRoster())).toBe('ok')
    expect(guard.certOf(id)).toBeUndefined()
    expect(guard.isRevoked(id)).toBe(true)
    expect(registry.computers().map(item => item.computerId)).not.toContain(id)
    registry.ensureSelf(publicIdentity(generateIdentity()), 'outro') // a later change keeps the revoked id in the roster
    expect(registry.signedRoster()?.roster.revoked).toContain(id)
  })

  it('an old roster (before the revocation) is refused as a rollback: replaying it cannot bring the computer back', () => {
    const { registry, helloFrom } = rig()
    const newcomer = generateIdentity()
    const { requestId } = requestOf(helloFrom(newcomer))
    registry.confirm(requestId)
    const old = registry.signedRoster()
    registry.revoke(computerIdOf(publicIdentity(newcomer)))
    const guard = new RosterGuard('ws1', OWNER.signing.publicKey, memoryRosterStore(), () => NOW)
    expect(guard.accept(registry.signedRoster())).toBe('ok')
    expect(guard.accept(old)).toBe('rollback')
  })

  it('a revoked computer that types a new code is `revogado` (it must come back as a NEW identity), and the code is spent', () => {
    const { registry, helloFrom } = rig()
    const newcomer = generateIdentity()
    const { requestId } = requestOf(helloFrom(newcomer))
    registry.confirm(requestId)
    registry.revoke(computerIdOf(publicIdentity(newcomer)))
    expect(helloFrom(newcomer)).toEqual({ ok: false, reason: 'revogado' })
    expect(requestOf(helloFrom(generateIdentity())).requestId).toBeTruthy() // a new identity is welcome
  })

  it('this PC cannot remove itself, and an unknown id is `unknown`', () => {
    const { registry } = rig()
    expect(registry.revoke(computerIdOf(publicIdentity(PC)))).toBe('is-this-computer')
    expect(registry.revoke('nao-existe')).toBe('unknown')
    expect(registry.computers()).toHaveLength(1)
  })
})

describe('what a computer allows (Lumen L1/L2)', () => {
  it('the owner widens hosting and exposure on purpose; the roster goes up; the owner stays a host even if she leaves herself out', () => {
    const { registry, helloFrom } = rig()
    const newcomer = generateIdentity()
    const { requestId } = requestOf(helloFrom(newcomer))
    registry.confirm(requestId)
    const id = computerIdOf(publicIdentity(newcomer))
    const before = registry.signedRoster()?.roster.version ?? 0
    expect(registry.setCaps(id, { expose: [`${id}:gmail`], hostFor: ['bia'], perCreatorMax: 5, maxAutonomy: 'media' })).toBe('ok')
    const view = registry.computers().find(item => item.computerId === id)
    expect(view?.caps).toEqual({ expose: [`${id}:gmail`], hostFor: ['ana', 'bia'], perCreatorMax: 5, maxAutonomy: 'media' })
    expect(registry.signedRoster()?.roster.version).toBe(before + 1)
    const stored = registry.signedRoster()?.roster.certs.find(item => item.cert.computerId === id)
    expect(verifyCert(stored, OWNER.signing.publicKey)?.caps.perCreatorMax).toBe(5) // re-signed by the owner
  })

  it('refuses caps that are not caps, and a computer that does not exist', () => {
    const { registry } = rig()
    const self = computerIdOf(publicIdentity(PC))
    expect(registry.setCaps(self, { expose: [], hostFor: [], perCreatorMax: -1, maxAutonomy: 'baixa' })).toBe('invalid')
    expect(registry.setCaps(self, { expose: [], hostFor: [], perCreatorMax: 2, maxAutonomy: 'total' as 'alta' })).toBe('invalid')
    expect(registry.setCaps('nao-existe', { expose: [], hostFor: [], perCreatorMax: 2, maxAutonomy: 'baixa' })).toBe('unknown')
  })
})

describe('the roster stays fresh and the PC\'s own guard follows it', () => {
  it('re-signs with a higher version and a new date once it is getting old, never before', () => {
    const { registry, clock } = rig()
    const first = registry.signedRoster()
    clock.now += ROSTER_REISSUE_MS - 1
    registry.tick()
    expect(registry.signedRoster()?.roster.version).toBe(first?.roster.version)
    clock.now += 2
    registry.tick()
    const second = registry.signedRoster()
    expect((second?.roster.version ?? 0) > (first?.roster.version ?? 0)).toBe(true)
    expect(Date.parse(second?.roster.issuedAt ?? '') - Date.parse(first?.roster.issuedAt ?? '')).toBeGreaterThan(ROSTER_REISSUE_MS - 5)
    expect(ROSTER_REISSUE_MS).toBeLessThan(ROSTER_FRESH_MS) // the new one always comes before the old one stops being fresh
  })

  it('tells its listeners about every roster it signs', () => {
    const { registry, helloFrom } = rig()
    const seen: number[] = []
    const stop = registry.onRoster((roster) => { seen.push(roster.roster.version) })
    const { requestId } = requestOf(helloFrom(generateIdentity()))
    registry.confirm(requestId)
    stop()
    registry.revoke('nao-existe')
    expect(seen).toEqual([2])
  })
})

describe('the registry on disk', () => {
  it('survives a restart: the computers, the revoked and the version are read back, and a roster after the restart goes UP', () => {
    const dir = mkdtempSync(join(tmpdir(), 'persona-registry-'))
    dirs.push(dir)
    const path = join(dir, 'computers.json')
    const clock = { now: NOW }
    const open = (): ComputerRegistry => new ComputerRegistry({
      workspaceId: 'ws1', owner: { memberId: 'ana', signingSeed: OWNER.signing.seed, signingPublic: OWNER.signing.publicKey }, thisComputerId: computerIdOf(publicIdentity(PC)),
      pairing: new DevicePairing(memoryPairStore(), () => clock.now), store: fileRegistryStore(path, OWNER.signing.publicKey), now: () => clock.now,
    })
    const first = open()
    first.ensureSelf(publicIdentity(PC), 'PC da Ana')
    const pub = publicIdentity(generateIdentity())
    const { code } = first.issueCode()
    const hello = first.hello({ code, label: 'Padaria', signing: pub.signing, agreement: pub.agreement }, '100.64.0.5')
    if (!hello.ok) throw new Error('refused')
    first.confirm(hello.requestId)
    first.revoke(computerIdOf(pub))
    const version = first.signedRoster()?.roster.version ?? 0
    const after = open() // "restart"
    expect(after.computers().map(item => item.label)).toEqual(['PC da Ana'])
    expect(after.signedRoster()?.roster.revoked).toEqual([computerIdOf(pub)])
    expect((after.signedRoster()?.roster.version ?? 0) > version).toBe(true)
  })

  it('a hand-edited certificate (a wider `caps`) loses its line; a damaged file is "nothing registered"; the file holds public keys and signatures only', () => {
    const dir = mkdtempSync(join(tmpdir(), 'persona-registry-'))
    dirs.push(dir)
    const path = join(dir, 'computers.json')
    const store = fileRegistryStore(path, OWNER.signing.publicKey)
    const clock = { now: NOW }
    const registry = new ComputerRegistry({
      workspaceId: 'ws1', owner: { memberId: 'ana', signingSeed: OWNER.signing.seed, signingPublic: OWNER.signing.publicKey }, thisComputerId: computerIdOf(publicIdentity(PC)),
      pairing: new DevicePairing(memoryPairStore(), () => clock.now), store, now: () => clock.now,
    })
    registry.ensureSelf(publicIdentity(PC), 'PC da Ana')
    const text = readFileSync(path, 'utf8')
    expect(text).not.toContain(OWNER.signing.seed)
    expect(text).not.toContain(PC.signing.seed)
    expect(text).not.toContain(PC.agreement.secret)
    const parsed = JSON.parse(text) as { certs: { cert: { caps: { hostFor: string[] } } }[] }
    parsed.certs[0]?.cert.caps.hostFor.push('intruso')
    writeFileSync(path, JSON.stringify(parsed))
    expect(store.read()?.certs).toEqual([])
    writeFileSync(path, '{ not json')
    expect(store.read()).toBeUndefined()
  })
})
