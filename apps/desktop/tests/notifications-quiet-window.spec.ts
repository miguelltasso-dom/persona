/**
 * HONEST-1 (Atlas 11/11): the desktop toast obeys the "Janela de silêncio" the person SAVED, not a window written in `main.ts`.
 * Before: `policyFromAutonomy({ silenceStart: '22:00', silenceEnd: '07:00' })` was hard-coded, so toasts were held 22:00–07:00 whatever the
 * person set (and a window she did set never reached the desktop). Now the renderer sets the team's windows (`listQuietWindows`) on the
 * existing `attention` channel — `{ kind: 'quiet', windows }`, like `resolved` — and the toast policy is built from them. No window saved
 * means no silence: nothing is held in secret.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isAlwaysOnQuiet } from '../src/always-on-ipc.ts'
import { DesktopNotifications, toastPolicyFrom } from '../src/notifications.ts'

function rig(windows: readonly { start: string; end: string }[], iso: string) {
  const shown: Array<{ title: string; body: string }> = []
  let now = new Date(iso)
  const notifications = new DesktopNotifications({
    policy: () => toastPolicyFrom(windows),
    localeId: () => 'pt', clock: { now: () => now }, isAppFocused: () => false,
    notify: { show: (payload) => { shown.push(payload); return {} } }, open: () => {},
  })
  return { notifications, shown, at: (next: string) => { now = new Date(next) } }
}

const failure = { id: 'a', kind: 'failed' as const, title: 'Erro', ticketId: 't-1', at: 'now' }

describe('desktop toast policy from the saved quiet windows', () => {
  it('no window saved: a toast at 23:30 is SHOWN (the old hard-coded 22:00–07:00 is gone)', () => {
    const f = rig([], '2026-11-03T23:30:00')
    f.notifications.ingest(failure)
    expect(f.shown).toHaveLength(1)
  })

  it('a saved window holds the toast inside it and releases ONE grouped toast when it ends', () => {
    const f = rig([{ start: '13:00', end: '15:00' }], '2026-11-03T14:00:00')
    f.notifications.ingest(failure)
    f.notifications.ingest({ ...failure, id: 'b', ticketId: 't-2' })
    expect(f.shown).toEqual([])
    f.at('2026-11-03T15:00:00') // the end is exclusive
    f.notifications.flushQuietHours()
    expect(f.shown).toHaveLength(1)
  })

  it('an overnight window wraps midnight; a toast outside it is shown at once', () => {
    const f = rig([{ start: '20:00', end: '08:00' }], '2026-11-03T02:00:00')
    f.notifications.ingest(failure)
    expect(f.shown).toEqual([])
    const outside = rig([{ start: '20:00', end: '08:00' }], '2026-11-03T12:00:00')
    outside.notifications.ingest(failure)
    expect(outside.shown).toHaveLength(1)
  })

  it('several windows: any of them holds the toast', () => {
    const f = rig([{ start: '12:00', end: '13:00' }, { start: '18:00', end: '19:00' }], '2026-11-03T18:30:00')
    f.notifications.ingest(failure)
    expect(f.shown).toEqual([])
  })
})

describe('the renderer → main payload of the windows', () => {
  it('accepts { kind: "quiet", windows } with HH:MM times', () => {
    expect(isAlwaysOnQuiet({ kind: 'quiet', windows: [] })).toBe(true)
    expect(isAlwaysOnQuiet({ kind: 'quiet', windows: [{ start: '20:00', end: '08:00' }] })).toBe(true)
  })

  it('refuses anything else: a bad time, an extra shape, too many windows, another kind', () => {
    expect(isAlwaysOnQuiet({ kind: 'quiet', windows: [{ start: '25:00', end: '08:00' }] })).toBe(false)
    expect(isAlwaysOnQuiet({ kind: 'quiet', windows: [{ start: '20:00' }] })).toBe(false)
    expect(isAlwaysOnQuiet({ kind: 'quiet', windows: 'x' })).toBe(false)
    expect(isAlwaysOnQuiet({ kind: 'quiet', windows: Array.from({ length: 17 }, () => ({ start: '20:00', end: '08:00' })) })).toBe(false)
    expect(isAlwaysOnQuiet({ kind: 'resolved', windows: [] })).toBe(false)
    expect(isAlwaysOnQuiet(null)).toBe(false)
  })
})

describe('main.ts', () => {
  const main = readFileSync(fileURLToPath(new URL('../src/main.ts', import.meta.url)), 'utf8')

  it('no longer carries a silence the person never set, and builds the toast policy from the windows it receives', () => {
    expect(main).not.toMatch(/silenceStart:\s*'22:00'/u)
    expect(main).toMatch(/toastPolicyFrom\(/u)
    expect(main).toMatch(/isAlwaysOnQuiet\(/u)
  })
})
