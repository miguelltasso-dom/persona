import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTeachRecordingChrome, type TeachChromeWindow } from '../src/teach-chrome.ts'
import type { TeachPillAction } from '../src/teach-pill.ts'

const RECORDING = { phase: 'recording', elapsedMs: 0 } as const
const PAUSED = { phase: 'paused', elapsedMs: 4000 } as const

function setup(options: { ownSource?: string; minimized?: boolean; maxRecordingMs?: number } = {}) {
  const calls: string[] = []
  let destroyed = false
  let minimized = options.minimized === true
  const window: TeachChromeWindow = {
    isDestroyed: () => destroyed,
    isMinimized: () => minimized,
    minimize: () => { minimized = true; calls.push('minimize') },
    restore: () => { minimized = false; calls.push('restore') },
    focus: () => { calls.push('focus') },
    getMediaSourceId: () => options.ownSource ?? 'window:100:0',
    webContents: { setBackgroundThrottling: (allowed) => { calls.push(`throttle:${String(allowed)}`) } },
  }
  const pill = {
    show: vi.fn(() => { calls.push('pill.show') }),
    update: vi.fn(() => { calls.push('pill.update') }),
    hide: vi.fn(() => { calls.push('pill.hide') }),
  }
  const relayed: TeachPillAction[] = []
  let current: TeachChromeWindow | undefined = window
  const chrome = createTeachRecordingChrome({
    getWindow: () => current,
    pill,
    relay: (action) => { relayed.push(action) },
    ...(options.maxRecordingMs === undefined ? {} : { maxRecordingMs: options.maxRecordingMs }),
  })
  return {
    chrome, calls, pill, relayed,
    destroy: () => { destroyed = true },
    dropWindow: () => { current = undefined },
  }
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('teach recording chrome', () => {
  it('on start: keeps the renderer running, minimizes the Persona and shows the pill', () => {
    const t = setup()
    t.chrome.started('screen:0:0', RECORDING)
    expect(t.calls).toEqual(['throttle:false', 'minimize', 'pill.show'])
    expect(t.pill.show).toHaveBeenCalledWith(RECORDING)
  })

  it('keeps the Persona up when the person records the Persona window itself', () => {
    const t = setup({ ownSource: 'window:77:0' })
    t.chrome.started('window:77:0', RECORDING)
    expect(t.calls).toEqual(['throttle:false', 'pill.show'])
    t.chrome.ended()
    expect(t.calls).toEqual(['throttle:false', 'pill.show', 'pill.hide', 'throttle:true'])
  })

  it('on end: hides the pill, restores throttling, puts the Persona back and focuses it', () => {
    const t = setup()
    t.chrome.started('screen:0:0', RECORDING)
    t.calls.length = 0
    t.chrome.ended()
    expect(t.calls).toEqual(['pill.hide', 'throttle:true', 'restore', 'focus'])
  })

  it('does not restore a window the person had already minimized', () => {
    const t = setup({ minimized: true })
    t.chrome.started('screen:0:0', RECORDING)
    expect(t.calls).toEqual(['throttle:false', 'pill.show'])
    t.calls.length = 0
    t.chrome.ended()
    expect(t.calls).toEqual(['pill.hide', 'throttle:true'])
  })

  it('is idempotent: a second end, or an end with nothing recording, does nothing', () => {
    const t = setup()
    t.chrome.ended()
    expect(t.calls).toEqual([])
    t.chrome.started('screen:0:0', RECORDING)
    t.chrome.ended()
    t.calls.length = 0
    t.chrome.ended()
    expect(t.calls).toEqual([])
    expect(t.pill.hide).toHaveBeenCalledTimes(1)
  })

  it('a second start while recording only refreshes the pill (no second minimize)', () => {
    const t = setup()
    t.chrome.started('screen:0:0', RECORDING)
    t.chrome.started('screen:0:0', RECORDING)
    expect(t.calls.filter(call => call === 'minimize')).toHaveLength(1)
    expect(t.pill.show).toHaveBeenCalledTimes(1)
    expect(t.pill.update).toHaveBeenCalledTimes(1)
  })

  it('updates the pill on pause and resume, and only while recording', () => {
    const t = setup()
    t.chrome.changed(PAUSED)
    expect(t.pill.update).not.toHaveBeenCalled()
    t.chrome.started('screen:0:0', RECORDING)
    t.chrome.changed(PAUSED)
    t.chrome.changed(RECORDING)
    expect(t.pill.update.mock.calls).toEqual([[PAUSED], [RECORDING]])
  })

  it('relays pill buttons to the renderer; Parar closes the pill and brings the Persona back at once', () => {
    const t = setup()
    t.chrome.started('screen:0:0', RECORDING)
    t.calls.length = 0
    t.chrome.onPillAction('pause')
    t.chrome.onPillAction('resume')
    expect(t.calls).toEqual([])
    t.chrome.onPillAction('stop')
    expect(t.calls).toEqual(['pill.hide', 'restore', 'focus'])
    expect(t.relayed).toEqual(['pause', 'resume', 'stop'])
    // The narration is typed, then the renderer calls teach.stop: nothing is restored twice.
    t.calls.length = 0
    t.chrome.ended()
    expect(t.calls).toEqual(['pill.hide', 'throttle:true'])
  })

  it('after the pill\'s Parar, the pill stays closed while the narration is typed (pause/resume do not bring it back)', () => {
    const t = setup()
    t.chrome.started('screen:0:0', RECORDING)
    t.chrome.onPillAction('stop')
    t.pill.update.mockClear()
    t.chrome.changed(PAUSED)
    t.chrome.changed(RECORDING)
    expect(t.pill.update).not.toHaveBeenCalled()
    expect(t.pill.show).toHaveBeenCalledTimes(1)
  })

  it('a new recording after a pill Parar whose teach.stop never came (discarded) gets its pill and its minimize again', () => {
    const t = setup()
    t.chrome.started('screen:0:0', RECORDING)
    t.chrome.onPillAction('stop')
    t.calls.length = 0
    t.chrome.started('screen:0:0', RECORDING)
    expect(t.calls).toEqual(['pill.hide', 'throttle:true', 'throttle:false', 'minimize', 'pill.show'])
    expect(t.pill.show).toHaveBeenCalledTimes(2)
    t.chrome.ended()
    expect(t.calls.slice(-4)).toEqual(['pill.hide', 'throttle:true', 'restore', 'focus'])
  })

  it('ignores pill buttons when nothing is recording', () => {
    const t = setup()
    t.chrome.onPillAction('stop')
    expect(t.relayed).toEqual([])
  })

  it('takes the pill down by itself if nobody ends the recording (renderer gone)', () => {
    const t = setup({ maxRecordingMs: 60_000 })
    t.chrome.started('screen:0:0', RECORDING)
    vi.advanceTimersByTime(59_999)
    expect(t.pill.hide).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2)
    expect(t.pill.hide).toHaveBeenCalledTimes(1)
    expect(t.calls.slice(-2)).toEqual(['restore', 'focus'])
  })

  it('a normal end cancels the watchdog', () => {
    const t = setup({ maxRecordingMs: 60_000 })
    t.chrome.started('screen:0:0', RECORDING)
    t.chrome.ended()
    vi.advanceTimersByTime(120_000)
    expect(t.pill.hide).toHaveBeenCalledTimes(1)
  })

  it('survives a destroyed or missing window (still shows and hides the pill)', () => {
    const gone = setup()
    gone.destroy()
    expect(() => { gone.chrome.started('screen:0:0', RECORDING); gone.chrome.ended() }).not.toThrow()
    expect(gone.calls).toEqual(['pill.show', 'pill.hide'])
    const none = setup()
    none.dropWindow()
    expect(() => { none.chrome.started('screen:0:0', RECORDING); none.chrome.onPillAction('stop'); none.chrome.ended() }).not.toThrow()
    expect(none.relayed).toEqual(['stop'])
  })
})
