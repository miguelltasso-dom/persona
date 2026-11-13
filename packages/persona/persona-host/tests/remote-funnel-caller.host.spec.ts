import { describe, expect } from 'vitest'
import { runAs } from '../src/remote-web/caller-context.ts'
import { RemoteFault } from '../src/remote-guard.ts'
import type PersonaHost from '../src/index.ts'
import { CLOCK, it, openJourney, sayOn, seedJourney, seedProject } from './journeys/journey-host.ts'

/**
 * M5 S2 (Lumen P0, Gauge R3/R11/R12): the FUNNEL fixes who is calling, per call, from the Peer the Gateway fixed. A phone of a member (`paired`) speaks as THAT member and reaches only the permitted list; the owner at
 * the keyboard is unchanged; a device that is not live, or a Peer that is neither the owner nor a paired device, is refused; the PC-only checks refuse a paired caller even when the member is the owner.
 * To place in persona-host/tests/ AFTER apply-s2-guard.cjs and apply-s2-host.cjs (it uses `h.remoteDevices` and the funnel's `callerOf`).
 */
const MARK_DM = 'FESTA-SURPRESA-JOAO-4821' // what Ana said in a DM with Bia
const SH = { workspaceId: 'ws', projectId: 'sh' } as const

function open(): PersonaHost {
  const h = openJourney()
  seedJourney(h, [])
  seedProject(h, { id: 'sh', name: 'Loja', team: [{ id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }, { id: 'bia', name: 'Bia', title: 'Texto' }] })
  h.createMember({ id: 'gus', ...SH, displayName: 'Gus', handle: 'gus', role: 'member' })
  h.createDm({ id: 'dm-bia', ...SH, participantA: 'ana', participantB: 'bia' })
  h.postMessage({ id: 'dm-mem', ...SH, streamKind: 'dm', ownerId: 'dm-bia', body: `Lembra da festa, código ${MARK_DM}.`, actorId: 'ana', subjectId: 'dm-mem', occurredAt: CLOCK })
  sayOn(h, 'sh', 'sh1', 'Bom dia, pessoal')
  h.sessionMemberId = 'ana' // the owner is at the keyboard (the legacy session the host keeps when no Peer is named)
  return h
}

/** The per-call view of the service the Gateway calls a Remote on: `this.ctx.invocation.peer.principal` is who is calling. */
const viewFor = (h: PersonaHost, principal: unknown): PersonaHost => Object.create(h, { ctx: { value: { invocation: { peer: { principal } } } } }) as PersonaHost
const asDevice = (h: PersonaHost, deviceId: string): PersonaHost => viewFor(h, { kind: 'paired', deviceId })
const enroll = (h: PersonaHost, member: string): string => {
  const made = h.remoteDevices.enroll(member, 'Pixel', { address: '100.64.0.9' })
  if (made === 'cheio') throw new Error('book full')
  return made.id
}
const dmRequest = { ...SH, actorId: 'gus', streamKind: 'dm', ownerId: 'dm-bia', dmId: 'dm-bia', limit: 50, afterSeq: 0 }
const call = (view: PersonaHost, name: string, request: unknown, ...rest: unknown[]): unknown => (view as unknown as Record<string, (...input: unknown[]) => unknown>)[name]?.call(view, request, ...rest)
const faultOf = (run: () => unknown): { code: string; reason: string | undefined } | 'none' => {
  try { run(); return 'none' } catch (error) { return error instanceof RemoteFault ? { code: error.code, reason: error.details.reason } : { code: 'other', reason: error instanceof Error ? error.message : undefined } }
}
const leaks = (value: unknown): boolean => (JSON.stringify(value) ?? '').includes(MARK_DM)

describe('the funnel resolves the caller per call (R3, R11, R12)', () => {
  it('control: the owner in-process (no Peer) is the owner at the keyboard and reads her own DM, as it always was', () => {
    const h = open()
    expect(leaks(call(h, 'listMessages', { ...dmRequest, actorId: 'ana' }))).toBe(true)
  })

  it('R3: the phone of Gus reads AS Gus: the DM of Ana with Bia does not come back, even though the PC itself is in the owner\'s session', () => {
    const h = open()
    const device = enroll(h, 'gus')
    const view = asDevice(h, device)
    const outcome = (() => { try { return call(view, 'listMessages', dmRequest) } catch { return 'refused' } })()
    expect(leaks(outcome)).toBe(false)
    expect(call(view, 'listTasks', { ...SH })).toBeDefined() // control: a read of the shared project works for him
  })

  it('R11: the owner (no Peer) and the phone of Gus, calling one after the other on the SAME host, each keep their own identity (no field of the service is borrowed)', () => {
    const h = open()
    const view = asDevice(h, enroll(h, 'gus'))
    for (let round = 0; round < 5; round += 1) {
      expect(leaks(call(h, 'listMessages', { ...dmRequest, actorId: 'ana' }))).toBe(true) // the owner still reads hers after the phone's call
      expect((() => { try { return leaks(call(view, 'listMessages', dmRequest)) } catch { return false } })()).toBe(false)
    }
  })

  it('a paired device reaches ONLY the permitted list: a Remote outside it is refused as `remote-not-allowed` (the owner\'s phone too)', () => {
    const h = open()
    for (const member of ['gus', 'ana']) {
      const view = asDevice(h, enroll(h, member))
      for (const name of ['completeOnboarding', 'createProject', 'moveTicket', 'setProjectRoot', 'saveConnectorSecret']) {
        expect(faultOf(() => call(view, name, { ...SH })), `${member}: ${name}`).toEqual({ code: 'forbidden', reason: 'remote-not-allowed' })
      }
    }
  })

  it('R12: a device that never existed, was revoked or expired is refused (`device-revoked`) and never answers with the owner\'s data', () => {
    const h = open()
    expect(faultOf(() => call(asDevice(h, 'nunca-existiu'), 'listMessages', dmRequest))).toEqual({ code: 'forbidden', reason: 'device-revoked' })
    const id = enroll(h, 'gus')
    expect(h.remoteDevices.revoke(id)).toBe(true)
    expect(faultOf(() => call(asDevice(h, id), 'listMessages', dmRequest))).toEqual({ code: 'forbidden', reason: 'device-revoked' })
  })

  it('a Peer that is neither the owner nor a paired device (any other kind) is refused: the product serves no one else', () => {
    const h = open()
    expect(faultOf(() => call(viewFor(h, { kind: 'share-viewer', shareId: 's' }), 'listTasks', { ...SH }))).toEqual({ code: 'forbidden', reason: undefined })
    expect(faultOf(() => call(viewFor(h, { kind: 'paired' }), 'listTasks', { ...SH }))).toEqual({ code: 'forbidden', reason: undefined }) // no device id
    expect(call(viewFor(h, { kind: 'owner' }), 'listTasks', { ...SH })).toBeDefined() // the owner's Peer is unchanged
  })

  it('the PC-only checks refuse a paired caller even when its member IS the owner, and pass the owner and the host acting for itself', () => {
    const h = open()
    const ownerDevice = enroll(h, 'ana')
    const internals = h as unknown as { requireMachineOwnerLocal(): void }
    expect(faultOf(() => { runAs({ kind: 'paired', memberId: 'ana', deviceId: ownerDevice }, () => { internals.requireMachineOwnerLocal() }) })).toEqual({ code: 'forbidden', reason: 'pc-only' })
    expect(faultOf(() => { runAs({ kind: 'owner' }, () => { internals.requireMachineOwnerLocal() }) })).toBe('none')
  })

  it('a stream a paired device opens is pulled as the device: the DM of Ana does not come back through it either', async () => {
    const h = open()
    const view = asDevice(h, enroll(h, 'gus'))
    let seen = ''
    const abort = new AbortController()
    try {
      const stream = call(view, 'followMessages', { ...dmRequest, afterSeq: 0 }, abort.signal) as AsyncIterable<unknown>
      const iterator = stream[Symbol.asyncIterator]()
      const first = await Promise.race([iterator.next(), new Promise<IteratorResult<unknown>>((resolve) => { setTimeout(() => { resolve({ done: true, value: undefined }) }, 300) })])
      seen = JSON.stringify(first.value ?? '')
      await iterator.return?.()
    } catch {
      seen = ''
    } finally {
      abort.abort()
    }
    expect(seen.includes(MARK_DM)).toBe(false)
  })
})
