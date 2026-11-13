import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEVICE_ABSOLUTE_MS, DEVICE_IDLE_MS, DeviceBook, MAX_DEVICES, fileDeviceStore, memoryDeviceStore } from '../src/remote-web/device-book.ts'

/**
 * M5: the paired devices. A device is recognised by a secret the PC made (only its SHA-256 is kept), tied to ONE member, revocable, expiring when idle (7 days) and after 30 days whatever it does.
 */
const DAY = 24 * 3_600_000
const clock = (start = 1_800_000_000_000): { now: () => number; advance: (ms: number) => void } => {
  let at = start
  return { now: () => at, advance: (ms) => { at += ms } }
}
const enroll = (book: DeviceBook, member = 'm-a', label = 'um'): { id: string; secret: string } => {
  const made = book.enroll(member, label)
  if (made === 'cheio') throw new Error('book full')
  return made
}

describe('DeviceBook', () => {
  it('pairs a device: the PC makes the id and a 256-bit secret, and keeps only the secret\'s hash', () => {
    const store = memoryDeviceStore()
    const book = new DeviceBook(store)
    const made = enroll(book, 'm-ana', '  Celular da Ana  ')
    const stored = JSON.stringify(store.read())
    expect(stored).not.toContain(made.secret)
    expect(stored).toContain('Celular da Ana')
    expect(made.secret).toHaveLength(64)
    expect(made.id).toHaveLength(32)
    expect(book.verify(made.id, made.secret)?.memberId).toBe('m-ana')
  })

  it('refuses a wrong secret, another device\'s secret, an unknown id and an empty cookie', () => {
    const book = new DeviceBook()
    const one = enroll(book, 'm-a', 'um')
    const two = enroll(book, 'm-b', 'dois')
    expect(book.verify(one.id, 'x'.repeat(64))).toBeUndefined()
    expect(book.verify(one.id, two.secret)).toBeUndefined() // the secret of another device does not open this one
    expect(book.verify('0'.repeat(32), one.secret)).toBeUndefined()
    expect(book.verify(one.id, '')).toBeUndefined()
    expect(book.verify('', '')).toBeUndefined()
  })

  it('a revoked device stops at once, the book says so to the gate, and a second revoke is a no-op', () => {
    const book = new DeviceBook()
    const made = enroll(book)
    const heard: string[] = []
    book.onRevoked(id => heard.push(id))
    expect(book.isLive(made.id)).toBe(true)
    expect(book.revoke(made.id)).toBe(true)
    expect(book.verify(made.id, made.secret)).toBeUndefined()
    expect(book.isLive(made.id)).toBe(false)
    expect(heard).toEqual([made.id])
    expect(book.revoke(made.id)).toBe(false)
    expect(heard).toHaveLength(1)
    expect(book.list()).toHaveLength(0) // the PC's screen no longer shows it
  })

  it('expires when idle (7 days) and, however busy, after 30 days; use inside the window slides the idle clock', () => {
    const time = clock()
    const book = new DeviceBook(memoryDeviceStore(), time.now)
    const made = enroll(book)
    time.advance(DEVICE_IDLE_MS - 1)
    expect(book.verify(made.id, made.secret)).toBeDefined() // used on the last idle ms: the clock slides
    time.advance(DEVICE_IDLE_MS - 1)
    expect(book.verify(made.id, made.secret)).toBeDefined()
    time.advance(DEVICE_IDLE_MS + 1)
    expect(book.verify(made.id, made.secret)).toBeUndefined() // idle for too long
    expect(book.isLive(made.id)).toBe(false)

    const busy = new DeviceBook(memoryDeviceStore(), time.now)
    const other = enroll(busy, 'm-a', 'dois')
    for (let day = 0; day < 29; day += 1) { time.advance(DAY); expect(busy.verify(other.id, other.secret)).toBeDefined() }
    time.advance(DEVICE_ABSOLUTE_MS - 29 * DAY + 1)
    expect(busy.verify(other.id, other.secret)).toBeUndefined() // the absolute limit holds against a busy device
    expect(busy.isLive(other.id)).toBe(false)
  })

  it('isLive() does not touch the device (the gate asks every second for the sockets it keeps open)', () => {
    const time = clock()
    const book = new DeviceBook(memoryDeviceStore(), time.now)
    const made = enroll(book)
    const before = book.list()[0]?.lastSeenAt
    time.advance(5 * 60_000)
    expect(book.isLive(made.id)).toBe(true)
    expect(book.list()[0]?.lastSeenAt).toBe(before)
    expect(book.isLive('unknown')).toBe(false)
  })

  it('liveRecord() gives the member a live device speaks for, and nothing for an unknown, revoked or expired one', () => {
    const time = clock()
    const book = new DeviceBook(memoryDeviceStore(), time.now)
    const made = enroll(book, 'm-bob', 'Pixel')
    expect(book.liveRecord(made.id)?.memberId).toBe('m-bob')
    expect(book.liveRecord('unknown')).toBeUndefined()
    time.advance(DEVICE_IDLE_MS + 1)
    expect(book.liveRecord(made.id)).toBeUndefined()
    const other = enroll(book, 'm-bob', 'outro')
    book.revoke(other.id)
    expect(book.liveRecord(other.id)).toBeUndefined()
  })

  it('"last seen" is written at most once a minute (a phone polls; the file must not be rewritten per request)', () => {
    const time = clock()
    let writes = 0
    const base = memoryDeviceStore()
    const store = { read: () => base.read(), write: (records: Parameters<typeof base.write>[0]) => { writes += 1; base.write(records) } }
    const book = new DeviceBook(store, time.now)
    const made = enroll(book)
    const afterEnroll = writes
    for (let index = 0; index < 50; index += 1) { time.advance(500); book.verify(made.id, made.secret) }
    expect(writes - afterEnroll).toBeLessThanOrEqual(1)
  })

  it('a device label is one short clean line, never empty; the list never shows a secret hash', () => {
    const book = new DeviceBook()
    const a = enroll(book, 'm-a', '')
    const b = enroll(book, 'm-a', `x\n\ty${'z'.repeat(100)}\u0007`)
    const views = book.list()
    expect(views.find(item => item.id === a.id)?.label).toBe('Celular')
    const label = views.find(item => item.id === b.id)?.label ?? ''
    expect(label.length).toBeLessThanOrEqual(40)
    expect(label).not.toMatch(/[\n\t\u0007]/u)
    expect(JSON.stringify(views)).not.toContain('secretHash')
  })

  it('caps the devices (a household and a small team, not a crowd); revoking frees a seat', () => {
    const book = new DeviceBook()
    const ids: string[] = []
    for (let index = 0; index < MAX_DEVICES; index += 1) ids.push(enroll(book, 'm-a', `d${String(index)}`).id)
    expect(book.enroll('m-a', 'mais um')).toBe('cheio')
    expect(book.revoke(ids[0] as string)).toBe(true)
    expect(book.enroll('m-a', 'agora cabe')).not.toBe('cheio')
  })

  it('rename works on a live device only', () => {
    const book = new DeviceBook()
    const made = enroll(book)
    expect(book.rename(made.id, 'Pixel da Ana')).toBe(true)
    expect(book.list()[0]?.label).toBe('Pixel da Ana')
    book.revoke(made.id)
    expect(book.rename(made.id, 'outro')).toBe(false)
  })
})

describe('a device is BOUND to the address it paired from (Lumen P1-3)', () => {
  it('the address (and what Tailscale said) is kept and shown to the owner; a device enrolled with no address is not bound (the gate never accepts it)', () => {
    const book = new DeviceBook()
    const bound = book.enroll('m-ana', 'Pixel', { address: '100.64.0.7', node: 'pixel-da-ana', login: 'ana@exemplo.com' })
    const free = book.enroll('m-ana', 'sem endereco')
    if (bound === 'cheio' || free === 'cheio') throw new Error('book full')
    const views = book.list()
    expect(views.find(item => item.id === bound.id)).toMatchObject({ address: '100.64.0.7', node: 'pixel-da-ana', login: 'ana@exemplo.com' })
    expect(views.find(item => item.id === free.id)?.address).toBe('')
    expect(book.verify(bound.id, bound.secret)?.address).toBe('100.64.0.7')
  })

  it('the binding survives a restart', () => {
    const dir = mkdtempSync(join(tmpdir(), 'persona-bind-'))
    try {
      const file = join(dir, 'devices.json')
      const made = new DeviceBook(fileDeviceStore(file)).enroll('m-ana', 'Pixel', { address: '100.64.0.7', login: 'ana@exemplo.com' })
      if (made === 'cheio') throw new Error('book full')
      expect(new DeviceBook(fileDeviceStore(file)).verify(made.id, made.secret)).toMatchObject({ address: '100.64.0.7', login: 'ana@exemplo.com' })
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

describe('fileDeviceStore (one JSON file, written atomically)', () => {
  it('survives a restart, leaves no temp file, keeps a revocation, and a damaged file is an empty book (nobody stays paired by accident)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'persona-devices-'))
    try {
      const file = join(dir, 'sub', 'devices.json')
      const first = new DeviceBook(fileDeviceStore(file))
      const made = enroll(first)
      const second = new DeviceBook(fileDeviceStore(file)) // "restart"
      expect(second.verify(made.id, made.secret)?.memberId).toBe('m-a')
      expect(readdirSync(join(dir, 'sub'))).toEqual(['devices.json'])
      expect(readFileSync(file, 'utf8')).not.toContain(made.secret)
      second.revoke(made.id)
      expect(new DeviceBook(fileDeviceStore(file)).verify(made.id, made.secret)).toBeUndefined() // the revocation survives the restart

      const broken = join(dir, 'broken.json')
      writeFileSync(broken, '{ not json at all')
      expect(fileDeviceStore(broken).read()).toEqual([])
      writeFileSync(broken, JSON.stringify([{ id: 1 }, 'x', null, { id: 'a', memberId: 'm', label: 'l', secretHash: 'h', address: '', pairedAt: 1, lastSeenAt: 1 }, { id: 'old', memberId: 'm', label: 'l', secretHash: 'h', pairedAt: 1, lastSeenAt: 1 }]))
      expect(fileDeviceStore(broken).read().map(item => item.id)).toEqual(['a']) // only well-formed rows are kept
      expect(new DeviceBook(fileDeviceStore(join(dir, 'missing.json'))).list()).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
