/** WAVE2 W2-10 — teach capture IPC. Frames leave as { atMs, imageRef, changeScore }. */

import { ipcMain, type BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { DESKTOP_IPC, assertDesktopSender } from './ipc.ts'
import { resolvePersonaProcessHome } from './product.ts'
import {
  TEACH_RETENTION_MS,
  applyTeachRetention,
  createTeachSession,
  projectTeachFrames,
  teachClockView,
  teachBlurRectOk,
  teachConsentOk,
  teachOverlayHtml,
  teachTranscript,
  type TeachBlurRect,
  type TeachProjectedFrame,
  type TeachSource,
} from './teach-capture.ts'
import { prepareTeachImage } from './teach-image.ts'
import type { TeachRecordingHooks } from './teach-chrome.ts'

/** Injectable home and source list for tests. */
export interface TeachCaptureHost {
  personaHome?: () => string
  listSources?: () => Promise<readonly TeachSource[]>
  now?: () => number
  prepareImage?: typeof prepareTeachImage
  /** Window chrome around a recording (minimize the Persona, always-on-top pill). Absent in tests that do not need it. */
  recording?: TeachRecordingHooks
}

/** `stop` payload consumed by host `teachDraftFrom`. */
export interface TeachStopResult {
  readonly artifactPath: string
  readonly frames: readonly TeachProjectedFrame[]
  readonly transcript: string
  readonly blurRects: readonly TeachBlurRect[]
}

/**
 * Install teach list/start/pause/resume/ingest/stop handlers on the app window.
 * @param getWindow - Current local application window.
 * @param host - Persona home and injectable source list.
 */
export function installTeachCapture(
  getWindow: () => BrowserWindow | undefined,
  host: TeachCaptureHost = {},
): void {
  const personaHome = host.personaHome ?? (() => resolvePersonaProcessHome())
  const session = createTeachSession({
    ...(host.listSources === undefined ? {} : { listSources: host.listSources }),
    ...(host.now === undefined ? {} : { now: host.now }),
  })

  // The chrome is a courtesy around the recording: a failure there must never lose or block a recording.
  const chrome = (run: (hooks: TeachRecordingHooks) => void): void => {
    if (host.recording === undefined) return
    try { run(host.recording) } catch (error) { console.error(error) }
  }

  const assertOwner = (event: { readonly sender: unknown; readonly senderFrame: unknown }): void => {
    const window = getWindow()
    if (window === undefined || window.isDestroyed() || event.sender !== window.webContents
      || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('dsh desktop: rejected teach capture from an unowned renderer')
    }
    assertDesktopSender(event as { readonly senderFrame: { readonly url: string } | null }, ['app'])
  }

  ipcMain.handle(DESKTOP_IPC.teachListSources, async (event) => {
    assertOwner(event)
    return session.listSources()
  })
  ipcMain.handle(DESKTOP_IPC.teachStart, (event, sourceId: unknown, mic: unknown, consent: unknown) => {
    assertOwner(event)
    if (typeof sourceId !== 'string' || sourceId.trim() === '') throw new Error('teach: sourceId required')
    if (!teachConsentOk(consent)) throw new Error('teach: consent required')
    session.start(sourceId, mic === true)
    chrome((hooks) => { hooks.started(sourceId, teachClockView(session.state())) })
  })
  ipcMain.handle(DESKTOP_IPC.teachPause, (event) => {
    assertOwner(event)
    session.pause()
    chrome((hooks) => { hooks.changed(teachClockView(session.state())) })
  })
  ipcMain.handle(DESKTOP_IPC.teachResume, (event) => {
    assertOwner(event)
    session.resume()
    chrome((hooks) => { hooks.changed(teachClockView(session.state())) })
  })
  ipcMain.handle(DESKTOP_IPC.teachIngest, (event, raw: unknown) => {
    assertOwner(event)
    return session.ingestFrame(pngOf(raw))
  })
  ipcMain.handle(DESKTOP_IPC.teachBlur, (event, raw: unknown) => {
    assertOwner(event)
    if (!teachBlurRectOk(raw)) throw new Error('teach: blur rect required')
    return session.addBlur(raw)
  })
  ipcMain.handle(DESKTOP_IPC.teachState, (event) => {
    assertOwner(event)
    const clock = teachClockView(session.state())
    return { ...clock, overlayHtml: teachOverlayHtml(clock) }
  })
  ipcMain.handle(DESKTOP_IPC.teachStop, (event, typed: unknown): TeachStopResult => {
    assertOwner(event)
    const dir = join(personaHome(), 'teach')
    // The pill goes away and the Persona comes back even if cleaning old artifacts or writing the new one fails.
    let stopped: ReturnType<typeof session.stop>
    try {
      applyTeachRetention(dir, TEACH_RETENTION_MS)
      stopped = session.stop(dir)
    } finally {
      chrome((hooks) => { hooks.ended() })
    }
    const redact = typed !== null && typeof typed === 'object' && (typed as { redact?: unknown }).redact === true
    const typedText = typeof typed === 'string'
      ? typed
      : typed !== null && typeof typed === 'object' && typeof (typed as { typed?: unknown }).typed === 'string'
        ? (typed as { typed: string }).typed
        : ''
    const prepared = redact ? [] : stopped.frames.map(frame => ({
      atMs: frame.atMs, ...((host.prepareImage ?? prepareTeachImage)(frame.png, session.state().blurRects)),
    }))
    const projected = redact
      ? stopped.frames.map(frame => ({ atMs: frame.atMs, imageRef: 'redacted', changeScore: 0 }))
      : projectTeachFrames(dir, prepared, undefined, `teach-frame-${randomUUID()}`)
        .map((frame, index) => ({ ...frame, imageRef: prepared[index]?.thumbnail ?? 'redacted' }))
    return {
      artifactPath: stopped.artifactPath,
      frames: projected,
      transcript: teachTranscript({ typed: typedText }),
      blurRects: session.state().blurRects,
    }
  })
}

function pngOf(raw: unknown): Buffer {
  if (Buffer.isBuffer(raw)) return raw
  if (raw instanceof Uint8Array) return Buffer.from(raw)
  if (typeof raw === 'string' && raw.length > 0) return Buffer.from(raw, 'base64')
  throw new Error('teach: expected png bytes')
}
