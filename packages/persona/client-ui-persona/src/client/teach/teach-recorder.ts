/**
 * "Ensinar a persona" (W2-10) — the renderer side of the capture.
 * The desktop (Rivet) lists sources and keeps the key frames; the renderer opens the chosen screen/window, samples it
 * and hands PNG frames over (`window.personaDesktop.teach`). Nothing leaves the computer: no upload, no network.
 * Without that bridge (plain browser) there is nothing to record, and the UI says so instead of pretending.
 */

export interface TeachSource {
  readonly id: string
  readonly name: string
  readonly kind: 'screen' | 'window'
}

/** A key frame as the host draft builder wants it. */
export interface TeachKeyFrame {
  readonly atMs: number
  readonly imageRef: string
  readonly changeScore: number
}

export interface TeachStopPayload {
  readonly frames: readonly TeachKeyFrame[]
  readonly transcript: string
}

export interface TeachRecorder {
  /** `desktop` records for real; `synthetic` is the dev/test example that records nothing. */
  readonly kind: 'desktop' | 'synthetic'
  listSources(): Promise<readonly TeachSource[]>
  start(sourceId: string, microphone: boolean): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  /** Stop and hand back the key frames. `typed` is the person's own words about what was done. */
  stop(options: { readonly typed: string; readonly discardImages: boolean }): Promise<TeachStopPayload>
}

/** The four consent flags the desktop requires before it starts (W2-10). */
export const TEACH_CONSENT = { accepted: true, storesLocally: true, notUploaded: true, avoidPasswords: true } as const

/** Shape of `window.personaDesktop.teach` (preload-app.ts). Results are `unknown`: parsed below. */
export interface TeachBridge {
  listSources(): Promise<unknown>
  start(sourceId: string, microphone: boolean, consent: unknown): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  ingestFrame(png: string): Promise<boolean>
  stop(typed?: unknown): Promise<unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function parseTeachSources(raw: unknown): readonly TeachSource[] {
  const list: readonly unknown[] = Array.isArray(raw) ? raw : []
  const out: TeachSource[] = []
  for (const row of list) {
    if (!isRecord(row)) continue
    const { id, name, kind } = row
    if (typeof id !== 'string' || id === '' || typeof name !== 'string') continue
    out.push({ id, name, kind: kind === 'window' ? 'window' : 'screen' })
  }
  return out
}

export function parseTeachStop(raw: unknown): TeachStopPayload {
  if (!isRecord(raw)) return { frames: [], transcript: '' }
  const frames: TeachKeyFrame[] = []
  const rows: readonly unknown[] = Array.isArray(raw.frames) ? raw.frames : []
  for (const row of rows) {
    if (!isRecord(row)) continue
    const { atMs, imageRef, changeScore } = row
    if (typeof atMs !== 'number' || typeof imageRef !== 'string') continue
    frames.push({ atMs, imageRef, changeScore: typeof changeScore === 'number' ? changeScore : 0 })
  }
  return { frames, transcript: typeof raw.transcript === 'string' ? raw.transcript : '' }
}

/** Longest recording (WAVE2-SPEC b.4). */
export const TEACH_MAX_SECONDS = 600
/** How often the screen is sampled; the desktop keeps only frames that changed enough. */
export const TEACH_SAMPLE_MS = 1500

/** The part of a MediaStream the recorder needs (a real MediaStream satisfies it). */
export interface CaptureStream {
  getTracks(): readonly { stop(): void }[]
}

export interface DesktopRecorderDeps {
  /** Open the chosen screen/window as a video stream (no audio: narration is typed). */
  openStream(sourceId: string): Promise<CaptureStream>
  /** One PNG (base64, no prefix) of what the stream shows now; `null` while it has no picture yet. */
  grabFrame(stream: CaptureStream): string | null
  setInterval(handler: () => void, ms: number): number
  clearInterval(handle: number): void
}

/** Recorder over the desktop bridge. */
export function createDesktopRecorder(bridge: TeachBridge, deps: DesktopRecorderDeps): TeachRecorder {
  let stream: CaptureStream | null = null
  let timer: number | null = null
  let paused = false
  let busy = false

  const halt = (): void => {
    if (timer !== null) { deps.clearInterval(timer); timer = null }
    stream?.getTracks().forEach((track) => { track.stop() })
    stream = null
  }

  return {
    kind: 'desktop',
    async listSources() {
      return parseTeachSources(await bridge.listSources())
    },
    async start(sourceId, microphone) {
      stream = await deps.openStream(sourceId)
      try {
        await bridge.start(sourceId, microphone, TEACH_CONSENT)
      } catch (error) {
        // The desktop refused (e.g. no consent): do not leave the screen stream open behind a failed start.
        halt()
        throw error
      }
      paused = false
      const opened = stream
      timer = deps.setInterval(() => {
        // One frame at a time: a slow PNG hand-over never queues up behind the next sample.
        if (paused || busy) return
        const png = deps.grabFrame(opened)
        if (png === null) return
        busy = true
        void bridge.ingestFrame(png).catch(() => false).finally(() => { busy = false })
      }, TEACH_SAMPLE_MS)
    },
    async pause() {
      paused = true
      await bridge.pause()
    },
    async resume() {
      paused = false
      await bridge.resume()
    },
    async stop({ typed, discardImages }) {
      halt()
      return parseTeachStop(await bridge.stop(discardImages ? { typed, redact: true } : typed))
    },
  }
}

/** Real stream/frame helpers for Chromium inside Electron (not exercised in jsdom). */
export function browserRecorderDeps(win: Window & typeof globalThis): DesktopRecorderDeps {
  const canvas = win.document.createElement('canvas')
  const video = win.document.createElement('video')
  video.muted = true
  return {
    async openStream(sourceId) {
      const desktopVideo: MediaTrackConstraints & { mandatory: Record<string, unknown> } = {
        mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId, maxWidth: 1920, maxHeight: 1080 },
      }
      const opened = await win.navigator.mediaDevices.getUserMedia({ audio: false, video: desktopVideo })
      video.srcObject = opened
      await video.play()
      return opened
    },
    grabFrame() {
      if (video.videoWidth === 0 || video.videoHeight === 0) return null
      const scale = Math.min(1, 1280 / video.videoWidth)
      canvas.width = Math.round(video.videoWidth * scale)
      canvas.height = Math.round(video.videoHeight * scale)
      const context = canvas.getContext('2d')
      if (context === null) return null
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/u, '')
    },
    setInterval: (handler, ms) => win.setInterval(handler, ms),
    clearInterval: (handle) => { win.clearInterval(handle) },
  }
}

const SYNTHETIC_FLAG = 'persona.teach.synthetic'

function syntheticFrame(label: string, accent: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="352" height="220" viewBox="0 0 352 220"><rect width="352" height="220" fill="#faf3e4"/><rect x="0" y="0" width="352" height="26" fill="#675290"/><rect x="18" y="46" width="316" height="22" rx="6" fill="#e4d7f1"/><rect x="18" y="84" width="196" height="16" rx="5" fill="#e4d7f1"/><rect x="18" y="112" width="244" height="16" rx="5" fill="#e4d7f1"/><rect x="226" y="164" width="108" height="38" rx="10" fill="${accent}" stroke="#34243f" stroke-width="3"/><text x="18" y="18" font-family="sans-serif" font-size="13" font-weight="700" fill="#fff">${label}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/**
 * Example recorder for development and tests: lists one pretend screen and, on stop, returns four made-up frames.
 * It records NOTHING. Only used when `localStorage['persona.teach.synthetic'] === '1'` and there is no desktop bridge.
 */
export function createSyntheticRecorder(): TeachRecorder {
  return {
    kind: 'synthetic',
    listSources: () => Promise.resolve([
      { id: 'synthetic:screen', name: 'Tela de exemplo', kind: 'screen' },
      { id: 'synthetic:window', name: 'Janela de exemplo', kind: 'window' },
    ] as const),
    start: () => Promise.resolve(),
    pause: () => Promise.resolve(),
    resume: () => Promise.resolve(),
    stop: ({ typed, discardImages }) => Promise.resolve({
      frames: [
        { atMs: 1200, imageRef: discardImages ? 'redacted' : syntheticFrame('Pedido novo', '#e8af54'), changeScore: 1 },
        { atMs: 5400, imageRef: discardImages ? 'redacted' : syntheticFrame('Conferir dados', '#c8b8e8'), changeScore: 0.6 },
        { atMs: 9800, imageRef: discardImages ? 'redacted' : syntheticFrame('Aprovar entrega', '#e8af54'), changeScore: 0.5 },
        { atMs: 14200, imageRef: discardImages ? 'redacted' : syntheticFrame('Avisar o cliente', '#c8b8e8'), changeScore: 0.4 },
      ],
      transcript: typed,
    }),
  }
}

interface WindowWithTeach {
  readonly personaDesktop?: { readonly teach?: TeachBridge }
}

/**
 * The recorder this window can use, or `null` when there is nothing to record with
 * (plain browser: "Ensinar" explains that it needs the installed app).
 */
export function detectTeachRecorder(win: (Window & typeof globalThis) | undefined = typeof window === 'undefined' ? undefined : window): TeachRecorder | null {
  if (win === undefined) return null
  const bridge = (win as Window & typeof globalThis & WindowWithTeach).personaDesktop?.teach
  if (bridge !== undefined) return createDesktopRecorder(bridge, browserRecorderDeps(win))
  try {
    if (win.localStorage.getItem(SYNTHETIC_FLAG) === '1') return createSyntheticRecorder()
  } catch { /* storage blocked: no example mode */ }
  return null
}
