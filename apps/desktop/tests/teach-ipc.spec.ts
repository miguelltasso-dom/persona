import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DESKTOP_IPC } from '../src/ipc.ts'

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

function fixture(url: string = 'dsh-app://app/') {
  const frame = { url }
  const window = {
    webContents: { mainFrame: frame },
    isDestroyed: vi.fn(() => false),
  }
  const home = mkdtempSync(join(tmpdir(), 'persona-teach-ipc-'))
  installTeachCapture(() => window as unknown as BrowserWindow, {
    personaHome: () => home,
    listSources: async () => [{ id: 'screen:0', name: 'Tela 1', kind: 'screen' }],
    now: () => 5_000,
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
    expect(stopped.frames[0]?.imageRef).toMatch(/^file:/u)
    expect(stopped.frames[0]?.changeScore).toBe(1)
    expect(stopped.blurRects).toEqual([{ x: 1, y: 2, width: 3, height: 4 }])
  })

  it('strips imageRef when stop asks for redaction', () => {
    const f = fixture()
    f.handler(DESKTOP_IPC.teachStart)!(f.event, 'screen:0', false, CONSENT)
    f.handler(DESKTOP_IPC.teachIngest)!(f.event, Buffer.from('frame-a'))
    const stopped = f.handler(DESKTOP_IPC.teachStop)!(f.event, { typed: 'ok', redact: true }) as {
      frames: Array<{ imageRef: string }>
    }
    expect(stopped.frames[0]?.imageRef).toBe('redacted')
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
