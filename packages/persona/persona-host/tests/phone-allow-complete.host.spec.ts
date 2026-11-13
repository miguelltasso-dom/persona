import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { expect } from 'vitest'
import { OWNER_DEVICE_ONLY, PHONE_NEVER, PHONE_PLANNED, PHONE_READS, PHONE_WITHHELD, PHONE_WRITES } from '../src/remote-web/phone-allow.ts'
import { PHONE_DENY } from '../src/remote-web/phone-deny.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * M5 (Lumen D1/D5): EVERY Remote of the host is classified for a paired phone — permitted, owner-device-only, withheld (with a reason) or reviewed-and-denied — so a new Remote is born REFUSED for the phone until
 * somebody chooses (the way `surface-table-complete` works). To classify a new Remote: put its name in `PHONE_READS`/`PHONE_WRITES` (a decision, with a test), or in `PHONE_DENY` (the default).
 */
const { host } = bindHostFile()

const names = (): string[] => remoteMethods(host()).map(item => item.method)
const permitted = [...PHONE_READS, ...PHONE_WRITES]

it('every Remote of the host is classified for the phone (a new one fails until somebody chooses)', () => {
  const classified = new Set<string>([...permitted, ...OWNER_DEVICE_ONLY, ...Object.keys(PHONE_WITHHELD), ...PHONE_DENY])
  expect(names().filter(name => !classified.has(name)), 'Remotes nobody classified for the phone: add each to PHONE_DENY (the default) or, as a decision with a test, to PHONE_READS/PHONE_WRITES').toEqual([])
})

it('a name is in ONE list only', () => {
  const lists: [string, readonly string[]][] = [['reads', PHONE_READS], ['writes', PHONE_WRITES], ['owner-only', OWNER_DEVICE_ONLY], ['withheld', Object.keys(PHONE_WITHHELD)], ['deny', PHONE_DENY]]
  const where = new Map<string, string[]>()
  for (const [label, list] of lists) for (const name of list) where.set(name, [...(where.get(name) ?? []), label])
  expect([...where].filter(([, labels]) => labels.length > 1)).toEqual([])
})

it('no stale names: denied and withheld names are still Remotes, permitted names are Remotes or planned, and a planned name is not a Remote yet', () => {
  const have = new Set(names())
  expect(PHONE_DENY.filter(name => !have.has(name)), 'denied names that are no longer Remotes').toEqual([])
  expect(Object.keys(PHONE_WITHHELD).filter(name => !have.has(name)), 'withheld names that are no longer Remotes').toEqual([])
  expect([...permitted, ...OWNER_DEVICE_ONLY].filter(name => !have.has(name) && !PHONE_PLANNED.includes(name)), 'permitted names that are not Remotes and not planned').toEqual([])
  expect(PHONE_PLANNED.filter(name => have.has(name)), 'planned names that already exist: remove them from PHONE_PLANNED').toEqual([])
})

it('the things a phone must NEVER do are all denied or withheld, and the phone may call a small part of the host (under 15%)', () => {
  const all = names()
  const dangerous = all.filter(name => PHONE_NEVER.some(rule => rule.test(name)))
  expect(dangerous.length).toBeGreaterThan(30)
  expect(dangerous.filter(name => !PHONE_DENY.includes(name) && !(name in PHONE_WITHHELD)), 'dangerous-looking Remotes that are not denied').toEqual([])
  const callable = [...permitted, ...OWNER_DEVICE_ONLY].filter(name => all.includes(name))
  expect(callable.length / all.length).toBeLessThan(0.15)
})
