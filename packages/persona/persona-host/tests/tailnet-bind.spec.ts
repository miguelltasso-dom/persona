import type { networkInterfaces } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isTailnetAddress, refuseBind, tailnetAddressOf, TAILNET_WATCH_MS, watchTailnet } from '../src/remote-web/tailnet-bind.ts'

/**
 * M5: the gate listens on the Tailscale address and nowhere else. The rule is pure: 100.64.0.0/10, a strict dotted quad.
 */
describe('isTailnetAddress (100.64.0.0/10, strict)', () => {
  it('the edges of the range', () => {
    expect(isTailnetAddress('100.63.255.255')).toBe(false)
    expect(isTailnetAddress('100.64.0.0')).toBe(true)
    expect(isTailnetAddress('100.100.100.100')).toBe(true)
    expect(isTailnetAddress('100.127.255.255')).toBe(true)
    expect(isTailnetAddress('100.128.0.0')).toBe(false)
  })
  it('anything that is not a plain dotted quad is not an address', () => {
    for (const bad of ['', '100.64.0', '100.64.0.1.2', '100.064.0.1', '100.64.0.256', ' 100.64.0.1', '100.64.0.1 ', '100.64.0.1\n', '100.64.0.x', '+100.64.0.1', '100.64.0.-1', '::ffff:100.64.0.1', '100.64.0.1/10']) {
      expect(isTailnetAddress(bad), JSON.stringify(bad)).toBe(false)
    }
  })
})

describe('refuseBind (the gate never listens on a wildcard, loopback or a LAN address)', () => {
  it('names the mistake, and accepts only the tailnet', () => {
    for (const wild of ['0.0.0.0', '::', '::0', '0:0:0:0:0:0:0:0', '']) expect(refuseBind(wild), JSON.stringify(wild)).toBe('curinga')
    for (const loop of ['127.0.0.1', '127.0.0.2', '::1', 'localhost']) expect(refuseBind(loop), loop).toBe('loopback')
    for (const lan of ['192.168.0.10', '10.0.0.5', '172.16.1.1', '169.254.1.1', '8.8.8.8', 'fd7a:115c:a1e0::1', 'minha-maquina']) expect(refuseBind(lan), lan).toBe('fora-do-tailnet')
    expect(refuseBind('100.64.12.34')).toBeUndefined()
  })
})

type Interfaces = ReturnType<typeof networkInterfaces>
const row = (address: string, family: 'IPv4' | 'IPv6' = 'IPv4', internal = false): NonNullable<Interfaces[string]>[number] => ({
  address, family, internal, netmask: '255.0.0.0', mac: '00:00:00:00:00:00', cidr: null,
} as NonNullable<Interfaces[string]>[number])

describe('tailnetAddressOf', () => {
  it('picks the Tailscale address among the interfaces, ignoring LAN, loopback and IPv6', () => {
    const interfaces = (): Interfaces => ({
      Ethernet: [row('192.168.0.20')],
      Loopback: [row('127.0.0.1', 'IPv4', true)],
      Tailscale: [row('fd7a:115c:a1e0::1', 'IPv6'), row('100.88.1.2')],
    })
    expect(tailnetAddressOf(interfaces)).toBe('100.88.1.2')
  })
  it('none: the mesh is not up here', () => {
    expect(tailnetAddressOf(() => ({ Ethernet: [row('192.168.0.20')] }))).toBeUndefined()
    expect(tailnetAddressOf(() => ({}))).toBeUndefined()
  })
  it('an internal address in the range does not count', () => {
    expect(tailnetAddressOf(() => ({ Odd: [row('100.70.0.1', 'IPv4', true)] }))).toBeUndefined()
  })
})

describe('watchTailnet (the gate follows the address: it appears with the VPN and goes with it)', () => {
  afterEach(() => { vi.useRealTimers() })

  it('reports a change once, never twice in a row, and "gone" when Tailscale stops', async () => {
    vi.useFakeTimers()
    const states = [
      { state: 'parado' as const, line: '' },
      { state: 'ativo' as const, address: '100.64.0.9', line: '' },
      { state: 'ativo' as const, address: '100.64.0.9', line: '' },
      { state: 'ativo' as const, address: '100.64.0.10', line: '' },
      { state: 'parado' as const, address: '100.64.0.10', line: '' },
    ]
    let at = 0
    const heard: (string | undefined)[] = []
    const watch = watchTailnet({ read: () => Promise.resolve(states[Math.min(at++, states.length - 1)] as never), onAddress: address => heard.push(address) })
    await vi.advanceTimersByTimeAsync(0)
    for (let step = 0; step < 4; step += 1) await vi.advanceTimersByTimeAsync(TAILNET_WATCH_MS)
    watch.stop()
    expect(heard).toEqual([undefined, '100.64.0.9', '100.64.0.10', undefined])
  })

  it('an address outside the range is never reported, and a reader that fails means "no address"', async () => {
    vi.useFakeTimers()
    const heard: (string | undefined)[] = []
    const reads = [
      () => Promise.resolve({ state: 'ativo' as const, address: '192.168.0.2', line: '' }),
      () => Promise.reject(new Error('tailscale: not found')),
    ]
    let at = 0
    const watch = watchTailnet({ read: () => (reads[Math.min(at++, 1)] as () => Promise<never>)(), onAddress: address => heard.push(address) })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(TAILNET_WATCH_MS)
    watch.stop()
    expect(heard).toEqual([undefined]) // never an address; "none" said once, not twice
  })

  it('stop() ends the watching (no look after it)', async () => {
    vi.useFakeTimers()
    let looks = 0
    const watch = watchTailnet({ read: () => { looks += 1; return Promise.resolve({ state: 'parado' as const, line: '' }) }, onAddress: () => undefined })
    await vi.advanceTimersByTimeAsync(0)
    watch.stop()
    const before = looks
    await vi.advanceTimersByTimeAsync(TAILNET_WATCH_MS * 5)
    expect(looks).toBe(before)
  })
})
