import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  BEAT_MAX_LABEL_CHARS,
  BEAT_MAX_PERSONAS,
  BEAT_MAX_QUEUE,
  BEAT_MAX_RAM_BYTES,
  ComputerPresence,
  createBeatBuilder,
  parseBeat,
  safeAiAccountLabel,
  type Beat,
  type RosterComputer,
} from '../src/station/computer-presence.ts'
import { PRESENCE_FILE, filePresenceStore } from '../src/station/presence-store.ts'

const dirs: string[] = []

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

const BEAT_ONE: Beat = {
  counter: 1,
  running: true,
  ram: { totalBytes: 32 * 1024 ** 3, freeBytes: 16 * 1024 ** 3 },
  personaCount: 2,
  queue: 1,
  aiAccountLabel: 'Claude · conta Ana',
}

describe('M4/D-116 computer presence disk store', () => {
  it('returns empty record when missing and round-trips valid PresenceRecord entries atomically', () => {
    const root = makeTempDir('persona-presence-store-')
    const store = filePresenceStore(root)

    expect(store.load()).toEqual({})

    const records = {
      pc1: { lastSeenAt: 1_762_900_000_000, beat: BEAT_ONE },
      pc2: {
        lastSeenAt: 1_762_900_005_000,
        beat: { counter: 4, running: false, ram: { totalBytes: 16 * 1024 ** 3, freeBytes: 4 * 1024 ** 3 }, personaCount: 0, queue: 0 },
      },
    }
    store.save(records)

    expect(store.load()).toEqual(records)
    expect(JSON.parse(readFileSync(join(root, PRESENCE_FILE), 'utf8'))).toEqual(records)
  })

  it('ignores corrupted JSON or malformed PresenceRecord entries without throwing', () => {
    const root = makeTempDir('persona-presence-corrupt-')
    const store = filePresenceStore(root)

    writeFileSync(join(root, PRESENCE_FILE), '{not json')
    expect(store.load()).toEqual({})

    writeFileSync(join(root, PRESENCE_FILE), JSON.stringify({
      ok: { lastSeenAt: 100, beat: BEAT_ONE },
      badTime: { lastSeenAt: 'agora', beat: BEAT_ONE },
      negCounter: { lastSeenAt: 100, beat: { ...BEAT_ONE, counter: -1 } },
      badRam: { lastSeenAt: 100, beat: { ...BEAT_ONE, ram: { totalBytes: 0, freeBytes: 10 } } },
      freeGtTotal: { lastSeenAt: 100, beat: { ...BEAT_ONE, ram: { totalBytes: 1024, freeBytes: 2048 } } },
      hugeRam: { lastSeenAt: 100, beat: { ...BEAT_ONE, ram: { totalBytes: BEAT_MAX_RAM_BYTES + 1, freeBytes: 0 } } },
      hugeQueue: { lastSeenAt: 100, beat: { ...BEAT_ONE, queue: BEAT_MAX_QUEUE + 1 } },
      hugePersonas: { lastSeenAt: 100, beat: { ...BEAT_ONE, personaCount: BEAT_MAX_PERSONAS + 1 } },
      emailLabel: { lastSeenAt: 100, beat: { ...BEAT_ONE, aiAccountLabel: 'ana@empresa.com' } },
      over80Label: { lastSeenAt: 100, beat: { ...BEAT_ONE, aiAccountLabel: 'a'.repeat(BEAT_MAX_LABEL_CHARS + 1) } },
      badLabel: { lastSeenAt: 100, beat: { ...BEAT_ONE, aiAccountLabel: 123 } },
    }))
    expect(store.load()).toEqual({
      ok: { lastSeenAt: 100, beat: BEAT_ONE },
    })
  })

  it('parseBeat enforces closed schema/caps and createBeatBuilder emits monotonic non-PII heartbeats', () => {
    const parsed = parseBeat({ ...BEAT_ONE, aiAccountLabel: '  Claude · conta Ana  ', token: 'sk-secret', extra: 1 })
    expect(parsed).toEqual({ ...BEAT_ONE, aiAccountLabel: 'Claude · conta Ana' })
    expect(parseBeat({ ...BEAT_ONE, aiAccountLabel: 'ana@mail.test' })).toBeUndefined()
    expect(parseBeat({ ...BEAT_ONE, aiAccountLabel: 'linha1\nlinha2' })).toBeUndefined()
    expect(parseBeat({ ...BEAT_ONE, aiAccountLabel: '   ' })).toBeUndefined()
    expect(parseBeat({ ...BEAT_ONE, counter: 1.5 })).toBeUndefined()

    expect(safeAiAccountLabel('ana@mail.test')).toBeUndefined()
    expect(safeAiAccountLabel('Bearer abc123')).toBeUndefined()
    expect(safeAiAccountLabel('sk-secret-key')).toBeUndefined()
    expect(safeAiAccountLabel('  Claude\nMax  ')).toBe('Claude Max')

    let clock = 1_762_900_000_000
    const nextBeat = createBeatBuilder({
      now: () => clock,
      isRunning: () => true,
      ram: () => ({ totalBytes: 16 * 1024 ** 3, freeBytes: 20 * 1024 ** 3 }),
      personaCount: () => 3,
      queue: () => 2,
      aiAccountLabel: () => 'Claude · time',
    })
    const first = nextBeat()
    const second = nextBeat() // same ms clock: counter must still increase strictly
    clock += 30_000
    const third = nextBeat()
    expect(first.counter).toBe(1_762_900_000_000)
    expect(second.counter).toBe(1_762_900_000_001)
    expect(third.counter).toBe(1_762_900_030_000)
    expect(first.ram).toEqual({ totalBytes: 16 * 1024 ** 3, freeBytes: 16 * 1024 ** 3 })
    expect(first.aiAccountLabel).toBe('Claude · time')
  })

  it('ComputerPresence survives host restart via filePresenceStore and still rejects replayed beat counters', () => {
    const root = makeTempDir('persona-presence-restart-')
    const roster: RosterComputer[] = [{ computerId: 'pc1', label: 'Sala', registeredBy: 'ana', isThis: true }]
    let clock = 1_762_900_000_000

    const first = new ComputerPresence({
      now: () => clock,
      roster: () => roster,
      ...filePresenceStore(root),
    })
    expect(first.heartbeat('pc1', BEAT_ONE)).toBe('ok')

    clock += 10_000
    const second = new ComputerPresence({
      now: () => clock,
      roster: () => roster,
      ...filePresenceStore(root),
    })
    expect(second.list()).toHaveLength(1)
    expect(second.list()[0]).toMatchObject({
      computerId: 'pc1',
      state: 'ligado',
      lastSeenAt: 1_762_900_000_000,
      aiAccountLabel: 'Claude · conta Ana',
      personas: 2,
    })
    expect(second.heartbeat('pc1', BEAT_ONE)).toBe('repetido')
    expect(second.heartbeat('pc1', { ...BEAT_ONE, counter: 2 })).toBe('ok')
  })
})
