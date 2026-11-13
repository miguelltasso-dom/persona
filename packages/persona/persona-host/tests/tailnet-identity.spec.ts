import { describe, expect, it } from 'vitest'
import { parseSelfLogin, parseWhois, selfLogin, whois, type CommandRunner } from '../src/remote-web/tailnet-identity.ts'

/**
 * M5 (Lumen P1-3): what Tailscale says about an address, for the owner's approval screen. Pure parsing, and a runner that only ever receives a validated tailnet address.
 */
const WHOIS = JSON.stringify({ Node: { ComputedName: 'pixel-da-ana', Name: 'pixel-da-ana.tail1234.ts.net.' }, UserProfile: { LoginName: 'ana@exemplo.com', DisplayName: 'Ana' } })
const STATUS = JSON.stringify({ Self: { UserID: 4242, DNSName: 'pc-padaria.tail1234.ts.net.' }, User: { '4242': { LoginName: 'ana@exemplo.com' }, '7': { LoginName: 'outro@x.com' } } })

describe('parseWhois', () => {
  it('reads the node and the login (the computed name first, the trailing dot of a DNS name dropped)', () => {
    expect(parseWhois(WHOIS)).toEqual({ node: 'pixel-da-ana', login: 'ana@exemplo.com' })
    expect(parseWhois(JSON.stringify({ Node: { Name: 'pc.tail.ts.net.' }, UserProfile: { LoginName: 'a@b.c' } }))).toEqual({ node: 'pc.tail.ts.net', login: 'a@b.c' })
  })

  it('a partial answer keeps what it has; nothing usable, or not JSON, is undefined', () => {
    expect(parseWhois(JSON.stringify({ Node: { ComputedName: 'so-no' } }))).toEqual({ node: 'so-no' })
    expect(parseWhois(JSON.stringify({ UserProfile: { LoginName: 'so-login@x.com' } }))).toEqual({ login: 'so-login@x.com' })
    for (const bad of ['', '{}', 'not json', 'null', '[]', JSON.stringify({ Node: { ComputedName: 5 }, UserProfile: {} })]) expect(parseWhois(bad), bad).toBeUndefined()
  })

  it('what it returns goes on the owner\'s screen: one short clean line (control characters and length are cut)', () => {
    const hostile = JSON.stringify({ Node: { ComputedName: `noh\n\u0007${'x'.repeat(200)}` }, UserProfile: { LoginName: 'a\tb@c.d' } })
    const got = parseWhois(hostile)
    expect(got?.node?.length).toBeLessThanOrEqual(80)
    expect(got?.node).not.toMatch(/[\n\u0007]/u)
    expect(got?.login).toBe('a b@c.d')
  })
})

describe('whois (the command only ever receives a validated tailnet address)', () => {
  it('asks `tailscale whois --json <ip>` with no shell, and returns what it parses', async () => {
    const calls: (readonly string[])[] = []
    const run: CommandRunner = (command, args) => { calls.push([command, ...args]); return Promise.resolve(WHOIS) }
    expect(await whois('100.88.1.2', run)).toEqual({ node: 'pixel-da-ana', login: 'ana@exemplo.com' })
    expect(calls).toEqual([['tailscale', 'whois', '--json', '100.88.1.2']])
  })

  it('anything that is not a tailnet address never reaches a command (injection, flags, LAN, loopback, wildcard)', async () => {
    let ran = 0
    const run: CommandRunner = () => { ran += 1; return Promise.resolve(WHOIS) }
    for (const bad of ['--help', '100.88.1.2; rm -rf /', '$(whoami)', '127.0.0.1', '192.168.0.5', '0.0.0.0', '', '100.88.1.2 --x', '100.88.1.2\n']) expect(await whois(bad, run), bad).toBeUndefined()
    expect(ran).toBe(0)
  })

  it('a missing CLI or a failing command is "Tailscale does not say" (undefined), never an error', async () => {
    expect(await whois('100.88.1.2', () => Promise.reject(new Error('spawn tailscale ENOENT')))).toBeUndefined()
    expect(await whois('100.88.1.2', () => Promise.resolve('garbage'))).toBeUndefined()
  })
})

describe('the login of THIS PC', () => {
  it('reads Self.UserID into User', () => {
    expect(parseSelfLogin(STATUS)).toBe('ana@exemplo.com')
    expect(parseSelfLogin(JSON.stringify({ Self: { UserID: '7' }, User: { '7': { LoginName: 'outro@x.com' } } }))).toBe('outro@x.com')
  })

  it('missing pieces are undefined', () => {
    for (const bad of ['', 'not json', '{}', JSON.stringify({ Self: {} }), JSON.stringify({ Self: { UserID: 1 }, User: {} })]) expect(parseSelfLogin(bad), bad).toBeUndefined()
  })

  it('selfLogin asks `tailscale status --json`, and a failing command is undefined', async () => {
    const calls: (readonly string[])[] = []
    expect(await selfLogin((command, args) => { calls.push([command, ...args]); return Promise.resolve(STATUS) })).toBe('ana@exemplo.com')
    expect(calls).toEqual([['tailscale', 'status', '--json']])
    expect(await selfLogin(() => Promise.reject(new Error('nope')))).toBeUndefined()
  })
})
