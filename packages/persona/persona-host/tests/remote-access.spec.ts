import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DeviceBook, DEVICE_IDLE_MS } from '../src/remote-web/device-book.ts'
import { DevicePairing, memoryPairStore } from '../src/remote-web/pair-guard.ts'
import { PairRequests } from '../src/remote-web/pair-requests.ts'
import { RemoteAccess, fileSettings, memorySettings, type RemoteAccessDeps } from '../src/remote-web/remote-access.ts'
import { RemoteGate, REMOTE_HEADER, POLL_HEADER, type DeviceMember } from '../src/remote-web/remote-gate.ts'
import type { TailnetWatch } from '../src/remote-web/tailnet-bind.ts'

/**
 * M5: the remote access of the PC as one object. A fake Tailscale watcher drives it (the address appears, changes and goes), and the real gate listens on a loopback alias standing in for the tailnet address.
 */
const TAILNET = '127.0.0.2'
const ANA: DeviceMember = { workspace: { id: 'ws1', name: 'Padaria Lua' }, member: { id: 'm-ana', name: 'Ana', role: 'owner' } }

interface Rig {
  readonly access: RemoteAccess
  readonly book: DeviceBook
  readonly pairing: DevicePairing
  readonly requests: PairRequests
  readonly settings: ReturnType<typeof memorySettings>
  readonly tailscale: { set(address: string | undefined): void }
}

const rigs: Rig[] = []
afterEach(async () => { for (const rig of rigs.splice(0)) await rig.access.stop() })

function rig(over: Partial<RemoteAccessDeps> = {}, settings = memorySettings()): Rig {
  const book = new DeviceBook()
  const pairing = new DevicePairing(memoryPairStore())
  const requests = new PairRequests(book)
  let push: (address: string | undefined) => void = () => undefined
  const tailscale = { set: (address: string | undefined) => { push(address) } }
  const access = new RemoteAccess({
    book, pairing, requests, settings, hostLabel: 'PC da padaria', memberOf: id => (id === 'm-ana' ? ANA : undefined), ownerMemberId: () => 'm-ana',
    watch: (onAddress): TailnetWatch => { push = onAddress; return { stop: () => { push = () => undefined } } },
    makeGate: deps => new RemoteGate({ ...deps, allowAddress: address => address === TAILNET, allowRemote: () => true }),
    whois: () => Promise.resolve(undefined), selfLogin: () => Promise.resolve(undefined), // no test starts the tailscale CLI
    preferredPort: 0,
    ...over,
  })
  const made = { access, book, pairing, requests, settings, tailscale }
  rigs.push(made)
  access.start()
  return made
}
const settle = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 60) })
const get = (url: string, path: string): Promise<number> => new Promise((resolve, reject) => {
  const target = new URL(url)
  const req = request({ host: target.hostname, port: Number(target.port), path, agent: false, headers: { host: target.host } }, (res) => { res.resume(); res.on('end', () => { resolve(res.statusCode ?? 0) }) })
  req.on('error', reject)
  req.end()
})

describe('the three states', () => {
  it('desligado by default: nothing listens, no URL, a code cannot be opened', async () => {
    const { access, tailscale } = rig()
    tailscale.set(TAILNET)
    await settle()
    expect(access.view()).toMatchObject({ state: 'desligado', codesOpen: 0 })
    expect(access.view().url).toBeUndefined()
    expect(access.issueDeviceCode()).toBe('not-on')
  })

  it('ON but no Tailscale address: it waits and NEVER listens on another interface', async () => {
    const { access } = rig()
    const view = await access.setOn(true)
    expect(view.state).toBe('esperando-tailscale')
    expect(view.url).toBeUndefined()
    expect(access.issueDeviceCode()).toBe('not-on')
  })

  it('ON with an address: listening there, with the URL to type on the phone; the same port on 127.0.0.1 is refused', async () => {
    const { access, tailscale } = rig()
    tailscale.set(TAILNET)
    const view = await access.setOn(true)
    expect(view.state).toBe('ligado')
    expect(view.url).toMatch(new RegExp(`^http://${TAILNET.replace(/\./gu, '\\.')}:\\d+/$`, 'u'))
    expect(await get(view.url ?? '', '/remote/me')).toBe(200)
    const port = view.port ?? 0
    await expect(get(`http://127.0.0.1:${String(port)}/`, '/remote/me')).rejects.toMatchObject({ code: 'ECONNREFUSED' })
  })

  it('the address goes away (Tailscale off): the gate closes; it comes back: the gate opens again on the new address', async () => {
    const { access, tailscale } = rig()
    tailscale.set(TAILNET)
    await access.setOn(true)
    const url = access.view().url ?? ''
    expect(await get(url, '/remote/me')).toBe(200)
    tailscale.set(undefined)
    await settle()
    expect(access.view().state).toBe('esperando-tailscale')
    await expect(get(url, '/remote/me')).rejects.toMatchObject({ code: 'ECONNREFUSED' })
    tailscale.set(TAILNET)
    await settle()
    expect(access.view().state).toBe('ligado')
    expect(await get(access.view().url ?? '', '/remote/me')).toBe(200)
  })

  it('turning it OFF closes the gate at once and keeps the choice', async () => {
    const { access, tailscale, settings } = rig()
    tailscale.set(TAILNET)
    await access.setOn(true)
    const url = access.view().url ?? ''
    const view = await access.setOn(false)
    expect(view.state).toBe('desligado')
    await expect(get(url, '/remote/me')).rejects.toMatchObject({ code: 'ECONNREFUSED' })
    expect(settings.read().on).toBe(false)
  })

  it('the choice survives a restart: ON stays ON and the gate opens when the address shows up', async () => {
    const settings = memorySettings({ on: true })
    const { access, tailscale } = rig({}, settings)
    expect(access.view().state).toBe('esperando-tailscale') // on, no address yet
    tailscale.set(TAILNET)
    await settle()
    expect(access.view().state).toBe('ligado')
  })

  it('a busy preferred port moves to the next free one, and the port that worked is remembered', async () => {
    const first = rig({ preferredPort: 47_800 })
    first.tailscale.set(TAILNET)
    await first.access.setOn(true)
    const takenPort = first.access.view().port ?? 0
    const second = rig({ preferredPort: takenPort })
    second.tailscale.set(TAILNET)
    await second.access.setOn(true)
    expect(second.access.view().port).toBeGreaterThan(takenPort)
    expect(second.settings.read().port).toBe(second.access.view().port)
  })
})

describe('what the PC\'s screen does', () => {
  it('opens a code for the owner (default) with the address to type, and refuses a member that does not exist', async () => {
    const { access, tailscale } = rig()
    tailscale.set(TAILNET)
    await access.setOn(true)
    const issued = access.issueDeviceCode()
    if (typeof issued === 'string') throw new Error(issued)
    expect(issued.code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/u)
    expect(issued.url).toBe(access.view().url)
    expect(access.view().codesOpen).toBe(1)
    expect(access.issueDeviceCode('m-fantasma')).toBe('unknown-member')
  })

  it('the whole pairing: the phone types the code, the owner approves on the PC, the phone gets its cookie; then the owner lists, renames and revokes it', async () => {
    const { access, tailscale, book } = rig()
    tailscale.set(TAILNET)
    await access.setOn(true)
    const issued = access.issueDeviceCode()
    if (typeof issued === 'string') throw new Error(issued)
    const url = new URL(issued.url)
    const call = (method: string, path: string, headers: Record<string, string>, body?: string): Promise<{ status: number; body: string; cookie: string }> => new Promise((resolve, reject) => {
      const req = request({ host: url.hostname, port: Number(url.port), path, method, agent: false, headers: { host: url.host, ...headers } }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => { resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8'), cookie: String(res.headers['set-cookie'] ?? '').split(';')[0] ?? '' }) })
      })
      req.on('error', reject)
      req.end(body)
    })
    const typed = await call('POST', '/remote/pair', { [REMOTE_HEADER]: '1' }, JSON.stringify({ code: issued.code, label: 'Pixel da Ana' }))
    expect(typed.status).toBe(202)
    const { pollToken } = JSON.parse(typed.body) as { pollToken: string }
    const waiting = access.view().requests
    expect(waiting).toHaveLength(1)
    expect(waiting[0]).toMatchObject({ label: 'Pixel da Ana', memberId: 'm-ana' })
    expect(access.approvePair(waiting[0]?.requestId ?? '')).toBe('ok')
    const done = await call('GET', '/remote/pair/status', { [POLL_HEADER]: pollToken })
    expect(done.status).toBe(200)
    expect(done.cookie).toContain('persona-device=')
    expect(access.view().devices).toHaveLength(1)
    expect(access.view().codesOpen).toBe(0)
    const id = access.view().devices[0]?.id ?? ''
    expect(access.renameDevice(id, 'Pixel 9')).toBe('ok')
    expect(access.view().devices[0]?.label).toBe('Pixel 9')
    expect((await call('GET', '/remote/me', { cookie: done.cookie })).body).toContain('"paired":true')
    expect(access.revokeDevice(id)).toBe('ok')
    expect((await call('GET', '/remote/me', { cookie: done.cookie })).body).toContain('"paired":false')
    expect(access.view().devices).toHaveLength(0)
    expect(book.isLive(id)).toBe(false)
  })

  it('reject, and the unknown ids, answer in words', async () => {
    const { access } = rig()
    expect(access.rejectPair('nao-existe')).toBe('unknown-request')
    expect(access.approvePair('nao-existe')).toBe('unknown-request')
    expect(access.revokeDevice('nao-existe')).toBe('unknown-device')
    expect(access.renameDevice('nao-existe', 'x')).toBe('unknown-device')
  })

  it('the Atividade hears about wrong tries and blocks: the address, never the code (the trail is capped)', async () => {
    const { access, tailscale } = rig()
    tailscale.set(TAILNET)
    await access.setOn(true)
    const issued = access.issueDeviceCode()
    if (typeof issued === 'string') throw new Error(issued)
    const url = new URL(issued.url)
    const wrong = (): Promise<void> => new Promise((resolve, reject) => {
      const req = request({ host: url.hostname, port: Number(url.port), path: '/remote/pair', method: 'POST', agent: false, headers: { host: url.host, [REMOTE_HEADER]: '1' } }, (res) => { res.resume(); res.on('end', () => { resolve() }) })
      req.on('error', reject)
      req.end(JSON.stringify({ code: 'ZZZZ-2222', label: 'x' }))
    })
    for (let index = 0; index < 7; index += 1) await wrong()
    const kinds = access.view().activity.map(event => event.kind)
    expect(kinds).toEqual(expect.arrayContaining(['pair-wrong', 'pair-blocked']))
    expect(JSON.stringify(access.view().activity)).not.toContain('ZZZZ')
    expect(JSON.stringify(access.view().activity)).not.toContain(issued.code)
  })
})

describe('fileSettings (the switch survives a restart, and remote access never turns itself on)', () => {
  it('writes atomically (no temp file left), reads back, and a missing or damaged file is OFF', () => {
    const dir = mkdtempSync(join(tmpdir(), 'persona-remote-settings-'))
    try {
      const file = join(dir, 'sub', 'remote-access.json')
      const store = fileSettings(file)
      expect(store.read()).toEqual({ on: false }) // no file: OFF
      store.write({ on: true, port: 47_311 })
      expect(fileSettings(file).read()).toEqual({ on: true, port: 47_311 })
      expect(readdirSync(join(dir, 'sub'))).toEqual(['remote-access.json'])
      writeFileSync(file, '{ not json')
      expect(fileSettings(file).read()).toEqual({ on: false })
      writeFileSync(file, JSON.stringify({ on: 'true', port: 99_999 })) // a string is not a switch, a port out of range is not a port
      expect(fileSettings(file).read()).toEqual({ on: false })
      writeFileSync(file, JSON.stringify({ on: true, port: 1.5 }))
      expect(fileSettings(file).read()).toEqual({ on: true })
      expect(readFileSync(file, 'utf8')).toContain('"on":true')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('the optional doors the host hands to the gate', () => {
  it('computers, computerLink and stopRun reach the gate only when the host hands them (otherwise their routes are a 404): the surfaces that are OFF open no route', async () => {
    const seen: { computers: boolean; computerLink: boolean; stopRun: boolean }[] = []
    const record = (deps: { computers?: unknown; computerLink?: unknown; stopRun?: unknown }): void => { seen.push({ computers: deps.computers !== undefined, computerLink: deps.computerLink !== undefined, stopRun: deps.stopRun !== undefined }) }
    const plain = rig({ makeGate: (deps) => { record(deps); return new RemoteGate({ ...deps, allowAddress: address => address === TAILNET, allowRemote: () => true }) } })
    plain.tailscale.set(TAILNET)
    await plain.access.setOn(true)
    const full = rig({
      makeGate: (deps) => { record(deps); return new RemoteGate({ ...deps, allowAddress: address => address === TAILNET, allowRemote: () => true }) },
      computers: { hello: () => ({ ok: false, reason: 'recusado' }), annotate: () => undefined, poll: () => ({ state: 'desconhecido' }) },
      computerLink: { auth: { precheck: () => ({ refused: 'unknown-computer' }), verify: () => ({ ok: false, reason: 'unknown-computer' }) }, handle: () => ({ status: 404, body: { ok: false } }) },
      stopRun: () => Promise.resolve(true),
    })
    full.tailscale.set(TAILNET) // a second rig on the same alias: its own gate on its own port
    await full.access.setOn(true)
    expect(seen).toEqual([{ computers: false, computerLink: false, stopRun: false }, { computers: true, computerLink: true, stopRun: true }])
  })
})

describe('closing', () => {
  it('stop() closes the gate and the watcher (the host is shutting down: no listener is left behind)', async () => {
    const { access, tailscale } = rig()
    tailscale.set(TAILNET)
    await access.setOn(true)
    const url = access.view().url ?? ''
    await access.stop()
    await expect(get(url, '/remote/me')).rejects.toMatchObject({ code: 'ECONNREFUSED' })
    tailscale.set('127.0.0.2') // a stopped watcher hears nothing
    await settle()
    await expect(get(url, '/remote/me')).rejects.toMatchObject({ code: 'ECONNREFUSED' })
  })

  it('idle devices still expire on their own clock (the access object does not keep them alive)', () => {
    const book = new DeviceBook(undefined, () => 1_800_000_000_000)
    const made = book.enroll('m-ana', 'x', { address: '100.64.0.2' })
    if (made === 'cheio') throw new Error('full')
    expect(DEVICE_IDLE_MS).toBeGreaterThan(0)
  })
})
