import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Quarantined, TransferRecord } from '../src/computers/handoff.ts'
import { SEEN_KEPT, fileQuarantineStore, fileTransferStore } from '../src/computers/handoff-store.ts'

/**
 * D-116: the durable homes of the handoff's records. A restart at any step reads them back; a damaged file is "no record" and never throws; the quarantine holds ciphertext only.
 */
const dirs: string[] = []
const fresh = (): string => { const dir = mkdtempSync(join(tmpdir(), 'persona-handoff-')); dirs.push(dir); return dir }
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

const sealedStub = { header: { personaId: 'p', workspaceId: 'ws', from: 'a', to: 'b', epoch: 4 }, wrap: { epoch: 4, by: 'a', epk: 'e', ct: 'c', sig: 's' }, sealed: { alg: 'channel', epoch: 4, authorId: 'a', ciphertext: 'AAAA', sig: 's' } }
const record = (over: Partial<TransferRecord> = {}): TransferRecord => ({ transferId: 't1', personaId: 'nina', from: 'a', to: 'b', epoch: 4, phase: 'sealed', digest: 'd', startedAt: 1_800_000_000_000, ...over })
const held = (over: Partial<Quarantined> = {}): Quarantined => ({ transferId: 't1', personaId: 'nina', epoch: 4, from: 'a', digest: 'd', sealed: sealedStub as never, ...over })

describe('fileTransferStore (A)', () => {
  it('writes atomically, reads back after a restart (a new instance), and keeps the escrow with the record', () => {
    const dir = fresh()
    fileTransferStore(dir).put(record({ phase: 'released', activateBefore: 1_800_000_600_000, escrow: sealedStub as never }))
    const after = fileTransferStore(dir) // "restart"
    expect(after.get('nina')).toMatchObject({ phase: 'released', activateBefore: 1_800_000_600_000, escrow: { header: { epoch: 4 } } })
    expect(readdirSync(dir).every(name => /^[0-9a-f]{32}\.json$/u.test(name))).toBe(true) // hashed names, no temp file left
  })

  it('a persona id with characters a file name cannot hold is fine (the name is a hash; the id is inside the file)', () => {
    const dir = fresh()
    const store = fileTransferStore(dir)
    for (const id of ['persona:ana@ws/1', 'a\\b', 'x'.repeat(190), '..']) store.put(record({ personaId: id }))
    for (const id of ['persona:ana@ws/1', 'a\\b', 'x'.repeat(190), '..']) expect(store.get(id)?.personaId).toBe(id)
    expect(readdirSync(dir)).toHaveLength(4)
  })

  it('open() lists only the handoffs that are not over (sealed, released); done and rolled-back are history', () => {
    const store = fileTransferStore(fresh())
    store.put(record({ personaId: 'a', phase: 'sealed' }))
    store.put(record({ personaId: 'b', phase: 'released', activateBefore: 1 }))
    store.put(record({ personaId: 'c', phase: 'done' }))
    store.put(record({ personaId: 'd', phase: 'rolled-back' }))
    expect(store.open().map(item => item.personaId).sort()).toEqual(['a', 'b'])
  })

  it('a damaged or malformed file is "no record": it is never trusted and never throws', () => {
    const dir = fresh()
    const store = fileTransferStore(dir)
    store.put(record())
    const [name] = readdirSync(dir)
    writeFileSync(join(dir, name as string), '{ not json')
    expect(store.get('nina')).toBeUndefined()
    expect(store.open()).toEqual([])
    writeFileSync(join(dir, name as string), JSON.stringify({ ...record(), epoch: 'four' }))
    expect(store.get('nina')).toBeUndefined()
    writeFileSync(join(dir, name as string), JSON.stringify({ ...record(), phase: 'invented' }))
    expect(store.get('nina')).toBeUndefined()
    writeFileSync(join(dir, name as string), JSON.stringify({ ...record(), personaId: 'outra' })) // a file that says it is another persona's
    expect(store.get('nina')).toBeUndefined()
    expect(fileTransferStore(join(dir, 'nao-existe')).open()).toEqual([])
  })

  it('a later record replaces the earlier one of the same persona', () => {
    const store = fileTransferStore(fresh())
    store.put(record({ phase: 'sealed' }))
    store.put(record({ phase: 'released', activateBefore: 5 }))
    expect(store.get('nina')?.phase).toBe('released')
    expect(store.open()).toHaveLength(1)
  })
})

describe('fileQuarantineStore (B)', () => {
  it('keeps the SEALED bundle across a restart and drops it on request; the file holds ciphertext, never a plaintext field', () => {
    const dir = fresh()
    fileQuarantineStore(dir).put(held())
    const after = fileQuarantineStore(dir)
    expect(after.get('nina')).toMatchObject({ transferId: 't1', epoch: 4, sealed: { header: { to: 'b' } } })
    const text = readdirSync(dir).map(name => readFileSync(join(dir, name), 'utf8')).join('')
    expect(text).toContain('"ciphertext":"AAAA"')
    expect(text).not.toMatch(/"memory"|"rules"|"skills"|"body"/u) // no plaintext shape on disk
    after.drop('nina')
    expect(fileQuarantineStore(dir).get('nina')).toBeUndefined()
    after.drop('nina') // dropping what is not there is fine
  })

  it('remembers the bundle ids it accepted (a repeat is refused, also after a restart), once each, and only the last SEEN_KEPT', () => {
    const dir = fresh()
    const store = fileQuarantineStore(dir)
    expect(store.seen('b1')).toBe(false)
    store.markSeen('b1')
    store.markSeen('b1')
    expect(fileQuarantineStore(dir).seen('b1')).toBe(true)
    expect(JSON.parse(readFileSync(join(dir, 'seen.json'), 'utf8'))).toEqual(['b1']) // not twice
    writeFileSync(join(dir, 'seen.json'), JSON.stringify(Array.from({ length: SEEN_KEPT }, (_, index) => `old-${String(index)}`))) // the memory is full
    store.markSeen('new')
    expect(store.seen('old-0')).toBe(false) // the oldest fell out
    expect(store.seen(`old-${String(SEEN_KEPT - 1)}`)).toBe(true)
    expect(store.seen('new')).toBe(true)
    expect(JSON.parse(readFileSync(join(dir, 'seen.json'), 'utf8'))).toHaveLength(SEEN_KEPT)
  })

  it('a damaged quarantine or seen file is "nothing held" / "nothing seen", never an error', () => {
    const dir = fresh()
    const store = fileQuarantineStore(dir)
    store.put(held())
    store.markSeen('b1')
    for (const name of readdirSync(dir)) writeFileSync(join(dir, name), '[1,2')
    expect(store.get('nina')).toBeUndefined()
    expect(store.seen('b1')).toBe(false)
    store.markSeen('b2') // and it can write again
    expect(store.seen('b2')).toBe(true)
  })

  it('one persona\'s quarantine never answers for another\'s', () => {
    const store = fileQuarantineStore(fresh())
    store.put(held({ personaId: 'a' }))
    expect(store.get('b')).toBeUndefined()
    expect(store.get('a')?.personaId).toBe('a')
  })
})
