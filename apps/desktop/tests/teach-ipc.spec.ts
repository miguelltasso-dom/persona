import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DESKTOP_IPC } from '../src/ipc.ts'
import type { TeachRecordingHooks } from '../src/teach-chrome.ts'

const electron = vi.hoisted(() => ({
  handle: vi.fn<(
    channel: string,
    handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
  ) => void>(),
}))
vi.mock('electron', () => ({
  ipcMain: { handle: electron.handle },
}))

const { installTeachCapture } = await import('../src/teach-ipc.ts')

const CONSENT = {
  accepted: true as const,
  storesLocally: true as const,
  notUploaded: true as const,
  avoidPasswords: true as const,
}

beforeEach(() => { vi.resetAllMocks() })

function fixture(url: string = 'dsh-app://app/', extra: { recording?: TeachRecordingHooks; home?: string } = {}) {
  const frame = { url }
  const window = {
    webContents: { mainFrame: frame },
    isDestroyed: vi.fn(() => false),
  }
  const home = extra.home ?? mkdtempSync(join(tmpdir(), 'persona-teach-ipc-'))
  installTeachCapture(() => window as unknown as BrowserWindow, {
    personaHome: () => home,
    ...(extra.recording === undefined ? {} : { recording: extra.recording }),
    listSources: async () => [{ id: 'screen:0', name: 'Tela 1', kind: 'screen' }],
    now: () => 5_000,
    prepareImage: (_png, rects) => ({ png: Buffer.from(`sanitized:${String(rects.length)}`), thumbnail: 'data:image/png;base64,cHJldmlldw==' }),
  })
  const handler = (channel: string) => electron.handle.mock.calls.find(call => call[0] === channel)?.[1]
  const event = { sender: window.webContents, senderFrame: frame } as unknown as IpcMainInvokeEvent
  return { event, home, handler }
}

describe('teach capture IPC', () => {
  it('rejects foreign windows and frames before capture actions', async () => {
    const owner = fixture()
    const foreign = fixture()
    const channels = [DESKTOP_IPC.teachListSources, DESKTOP_IPC.teachStart, DESKTOP_IPC.teachPause,
      DESKTOP_IPC.teachResume, DESKTOP_IPC.teachIngest, DESKTOP_IPC.teachBlur, DESKTOP_IPC.teachState, DESKTOP_IPC.teachStop]
    for (const channel of channels) {
      const handler = owner.handler(channel)!
      await expect(Promise.resolve().then(() => handler(foreign.event))).rejects.toThrow(/unowned renderer/u)
      await expect(Promise.resolve().then(() => handler({ ...owner.event, senderFrame: foreign.event.senderFrame }))).rejects.toThrow(/unowned renderer/u)
    }
  })

  it('rejects a non-application origin even in the owning frame', async () => {
    const owner = fixture('https://foreign.example/')
    await expect(owner.handler(DESKTOP_IPC.teachListSources)!(owner.event)).rejects.toThrow(/rejected/u)
  })

  it('lists sources, records a keyframe, and stops with host frames', async () => {
    const f = fixture()
    const sources = await f.handler(DESKTOP_IPC.teachListSources)!(f.event)
    expect(sources).toEqual([{ id: 'screen:0', name: 'Tela 1', kind: 'screen' }])
    f.handler(DESKTOP_IPC.teachStart)!(f.event, 'screen:0', true, CONSENT)
    expect(f.handler(DESKTOP_IPC.teachIngest)!(f.event, Buffer.from('frame-a'))).toBe(true)
    expect(f.handler(DESKTOP_IPC.teachBlur)!(f.event, { x: 1, y: 2, width: 3, height: 4 })).toBe(true)
    f.handler(DESKTOP_IPC.teachPause)!(f.event)
    expect(f.handler(DESKTOP_IPC.teachIngest)!(f.event, Buffer.from('frame-b'))).toBe(false)
    f.handler(DESKTOP_IPC.teachResume)!(f.event)
    const stopped = f.handler(DESKTOP_IPC.teachStop)!(f.event, '  clique em salvar  ') as {
      artifactPath: string
      frames: Array<{ atMs: number; imageRef: string; changeScore: number }>
      transcript: string
      blurRects: Array<{ x: number; y: number; width: number; height: number }>
    }
    expect(stopped.transcript).toBe('clique em salvar')
    expect(stopped.artifactPath).toMatch(/teach-5000\.webm$/u)
    expect(stopped.frames).toHaveLength(1)
    expect(stopped.frames[0]?.imageRef).toBe('data:image/png;base64,cHJldmlldw==')
    const stored = readdirSync(join(f.home, 'teach')).find(name => name.startsWith('teach-frame-'))!
    expect(readFileSync(join(f.home, 'teach', stored), 'utf8')).toBe('sanitized:1')
    expect(stopped.frames[0]?.changeScore).toBe(1)
    expect(stopped.blurRects).toEqual([{ x: 1, y: 2, width: 3, height: 4 }])
  })

  it('strips imageRef when stop asks for redaction', () => {
    const f = fixture()
    const dir = join(f.home, 'teach')
    f.handler(DESKTOP_IPC.teachStart)!(f.event, 'screen:0', false, CONSENT)
    f.handler(DESKTOP_IPC.teachIngest)!(f.event, Buffer.from('frame-a'))
    const stopped = f.handler(DESKTOP_IPC.teachStop)!(f.event, { typed: 'ok', redact: true }) as {
      frames: Array<{ imageRef: string }>
    }
    expect(stopped.frames[0]?.imageRef).toBe('redacted')
    expect(readdirSync(dir).filter(name => name.endsWith('.png'))).toEqual([])
  })

  it('does not remove previously saved frames when a different capture is discarded', () => {
    const f = fixture()
    f.handler(DESKTOP_IPC.teachStart)!(f.event, 'screen:0', false, CONSENT)
    f.handler(DESKTOP_IPC.teachIngest)!(f.event, Buffer.from('first'))
    f.handler(DESKTOP_IPC.teachStop)!(f.event, { typed: 'first' })
    const dir = join(f.home, 'teach')
    const original = readdirSync(dir).find(name => name.endsWith('.png'))!
    writeFileSync(join(dir, original), 'previous')
    f.handler(DESKTOP_IPC.teachStart)!(f.event, 'screen:0', false, CONSENT)
    f.handler(DESKTOP_IPC.teachIngest)!(f.event, Buffer.from('second'))
    f.handler(DESKTOP_IPC.teachStop)!(f.event, { redact: true })
    expect(readFileSync(join(dir, original), 'utf8')).toBe('previous')
  })

  describe('recording chrome hooks (minimize the Persona, always-on-top pill)', () => {
    const hooks = () => ({ started: vi.fn(), changed: vi.fn(), ended: vi.fn() })

    it('announces start, pause, resume and end with the clock, in order', () => {
      const recording = hooks()
      const f = fixture('dsh-app://app/', { recording })
      f.handler(DESKTOP_IPC.teachStart)!(f.event, 'window:42:0', false, CONSENT)
      expect(recording.started).toHaveBeenCalledTimes(1)
      expect(recording.started.mock.calls[0]?.[0]).toBe('window:42:0')
      expect(recording.started.mock.calls[0]?.[1]).toMatchObject({ phase: 'recording' })
      f.handler(DESKTOP_IPC.teachPause)!(f.event)
      expect(recording.changed.mock.calls.at(-1)?.[0]).toMatchObject({ phase: 'paused' })
      f.handler(DESKTOP_IPC.teachResume)!(f.event)
      expect(recording.changed.mock.calls.at(-1)?.[0]).toMatchObject({ phase: 'recording' })
      expect(recording.ended).not.toHaveBeenCalled()
      f.handler(DESKTOP_IPC.teachStop)!(f.event, 'x')
      expect(recording.ended).toHaveBeenCalledTimes(1)
    })

    it('does not announce anything for a refused start (no consent, no source)', () => {
      const recording = hooks()
      const f = fixture('dsh-app://app/', { recording })
      expect(() => f.handler(DESKTOP_IPC.teachStart)!(f.event, 'window:1:0', false, { accepted: false })).toThrow(/consent/u)
      expect(() => f.handler(DESKTOP_IPC.teachStart)!(f.event, '  ', false, CONSENT)).toThrow(/sourceId/u)
      expect(recording.started).not.toHaveBeenCalled()
    })

    it('a failing chrome never loses or blocks the recording', () => {
      const boom = () => { throw new Error('window gone') }
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const f = fixture('dsh-app://app/', { recording: { started: boom, changed: boom, ended: boom } })
      f.handler(DESKTOP_IPC.teachStart)!(f.event, 'screen:0', false, CONSENT)
      expect(f.handler(DESKTOP_IPC.teachIngest)!(f.event, Buffer.from('frame-a'))).toBe(true)
      f.handler(DESKTOP_IPC.teachPause)!(f.event)
      f.handler(DESKTOP_IPC.teachResume)!(f.event)
      const stopped = f.handler(DESKTOP_IPC.teachStop)!(f.event, 'ok') as { frames: unknown[] }
      expect(stopped.frames).toHaveLength(1)
      expect(error).toHaveBeenCalled()
      error.mockRestore()
    })

    it('takes the pill down and brings the Persona back even when writing the artifact fails', () => {
      const recording = hooks()
      // `teach` cannot be created under a regular file, so session.stop() throws.
      const blocker = join(mkdtempSync(join(tmpdir(), 'persona-teach-block-')), 'not-a-dir')
      writeFileSync(blocker, 'file')
      const f = fixture('dsh-app://app/', { recording, home: blocker })
      f.handler(DESKTOP_IPC.teachStart)!(f.event, 'screen:0', false, CONSENT)
      expect(() => f.handler(DESKTOP_IPC.teachStop)!(f.event, 'x')).toThrow()
      expect(recording.ended).toHaveBeenCalledTimes(1)
    })
  })

  it('refuses start without the four consent flags', () => {
    const f = fixture()
    expect(() => f.handler(DESKTOP_IPC.teachStart)!(f.event, 'screen:0', true)).toThrow(/consent/u)
  })

  it('exposes a clock without frame pixels', () => {
    const f = fixture()
    f.handler(DESKTOP_IPC.teachStart)!(f.event, 'screen:0', true, CONSENT)
    f.handler(DESKTOP_IPC.teachIngest)!(f.event, Buffer.from('frame-a'))
    const state = f.handler(DESKTOP_IPC.teachState)!(f.event) as {
      phase: string
      elapsedMs: number
      mic: boolean
      frameCount: number
      overlayHtml: string
    }
    expect(state).toMatchObject({
      phase: 'recording',
      elapsedMs: 0,
      mic: true,
      frameCount: 1,
    })
    expect(state.overlayHtml).toContain('Pausar')
    expect(state.overlayHtml).toContain('00:00')
    expect(state.overlayHtml).not.toMatch(/data:image|frame-a/u)
    expect(f.handler(DESKTOP_IPC.teachBlur)!(f.event, { x: 2, y: 3, width: 4, height: 5 })).toBe(true)
    const after = f.handler(DESKTOP_IPC.teachState)!(f.event) as { blurCount: number }
    expect(after.blurCount).toBe(1)
    expect(() => f.handler(DESKTOP_IPC.teachBlur)!(f.event, { x: 1 })).toThrow(/blur rect/u)
  })
})
