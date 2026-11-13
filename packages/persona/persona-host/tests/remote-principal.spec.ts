import { describe, expect, it } from 'vitest'
import { OWNER_DEVICE_ONLY, PHONE_READS, PHONE_WRITES, REMOTE_NOT_ALLOWED } from '../src/remote-web/phone-allow.ts'
import { createPairedAccessPolicy, pairedPrincipal } from '../src/remote-web/remote-principal.ts'

/**
 * M5: the Gateway policy of a paired device. It lists, as endpoints of the `persona` namespace, ONLY what `phone-allow.ts` permits — and nothing for a device that is not live.
 */
const devices = new Map<string, string>([['d-ana', 'm-ana'], ['d-bob', 'm-bob']])
const owners = new Set(['m-ana'])
const policy = createPairedAccessPolicy({ memberOfDevice: id => devices.get(id), isOwnerMember: member => owners.has(member) })
const actionsOf = (deviceId: string): string[] => policy.bindings(pairedPrincipal(deviceId)).flatMap(binding => [...binding.role.actions])

describe('createPairedAccessPolicy', () => {
  it('the principal says only which device: no member, no credential', () => {
    expect(pairedPrincipal('d-ana')).toEqual({ kind: 'paired', deviceId: 'd-ana' })
  })

  it('a live device of a MEMBER holds the global phone role and nothing else: the permitted reads and writes, as persona/<method>', () => {
    const actions = actionsOf('d-bob')
    expect(actions).toEqual([...PHONE_READS, ...PHONE_WRITES].map(name => `persona/${name}`))
    expect(actions).toContain('persona/listMessages')
    expect(actions).toContain('persona/postMessage')
    for (const refused of ['persona/listCofreEntries', 'persona/moveTicket', 'persona/issueDeviceCode', 'persona/approvePair', 'persona/listDevices', 'persona/getOfficialQuota', 'persona/getTurnContext']) expect(actions, refused).not.toContain(refused)
  })

  it('a device of the OWNER also lists and revokes devices (lose the phone, revoke it from the notebook); issuing and approving stay on the PC', () => {
    const actions = actionsOf('d-ana')
    for (const name of OWNER_DEVICE_ONLY) expect(actions).toContain(`persona/${name}`)
    expect(actions).not.toContain('persona/issueDeviceCode')
    expect(actions).not.toContain('persona/approvePair')
    expect(actions).not.toContain('persona/setRemoteAccess')
  })

  it('a device that is unknown, revoked or expired holds NOTHING (the book answers undefined)', () => {
    expect(policy.bindings(pairedPrincipal('d-never-existed'))).toEqual([])
    devices.delete('d-bob')
    try { expect(policy.bindings(pairedPrincipal('d-bob'))).toEqual([]) } finally { devices.set('d-bob', 'm-bob') }
  })

  it('every binding is on the GLOBAL resource (persona Remotes name no resource, so only a global role can allow them)', () => {
    for (const binding of policy.bindings(pairedPrincipal('d-ana'))) expect(binding.resource).toEqual({ kind: 'global' })
  })

  it('the refusal has the stable code the funnel uses too', () => {
    expect(policy.explain?.({ principal: pairedPrincipal('d-bob'), action: 'persona/moveTicket', resources: [{ kind: 'global' }] })).toBe(REMOTE_NOT_ALLOWED)
    expect(REMOTE_NOT_ALLOWED).toBe('remote-not-allowed')
  })

  it('the namespace is configurable (the PersonaHost declares `persona`)', () => {
    const other = createPairedAccessPolicy({ memberOfDevice: id => devices.get(id), isOwnerMember: () => false, namespace: 'outro' })
    expect(other.bindings(pairedPrincipal('d-bob')).flatMap(binding => [...binding.role.actions])[0]).toMatch(/^outro\//u)
  })

  it('the policy reads the book on EVERY decision (a revoked device loses its grants at the next call, no cache)', () => {
    const live = new Map([['d-x', 'm-x']])
    const live1 = createPairedAccessPolicy({ memberOfDevice: id => live.get(id), isOwnerMember: () => false })
    expect(live1.bindings(pairedPrincipal('d-x')).length).toBe(1)
    live.clear()
    expect(live1.bindings(pairedPrincipal('d-x'))).toEqual([])
  })
})
