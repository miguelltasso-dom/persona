/**
 * WAVE2 §2 spike — local screen teach capture (no upload).
 * Main lists sources via desktopCapturer; renderer records with MediaRecorder.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

export type TeachPhase = 'idle' | 'recording' | 'paused' | 'stopped'

export interface TeachSource {
  readonly id: string
  readonly name: string
  readonly kind: 'screen' | 'window'
}

export interface TeachFrame {
  readonly atMs: number
  readonly png: Buffer
}

/** Host / Forge draft frame (`teachDraftFrom`). */
export interface TeachProjectedFrame {
  readonly atMs: number
  readonly imageRef: string
  readonly changeScore: number
}

/** Local teach artifacts older than this are dropped. */
export const TEACH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

/** Consent the UI must collect before `start` (W2-10). */
export interface TeachConsent {
  readonly accepted: true
  readonly storesLocally: true
  readonly notUploaded: true
  readonly avoidPasswords: true
}

/** Pixel rectangle to blur (DIP or buffer coords). */
export interface TeachBlurRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface TeachSessionState {
  phase: TeachPhase
  sourceId?: string
  mic: boolean
  startedAt?: number
  pausedMs: number
  frames: TeachFrame[]
  artifactPath?: string
  elapsedMs?: number
  blurRects: TeachBlurRect[]
}

/** Overlay clock — no PNG bytes. */
export interface TeachClockView {
  readonly phase: TeachPhase
  readonly elapsedMs: number
  readonly mic: boolean
  readonly frameCount: number
  readonly blurCount: number
}

/**
 * Elapsed recording time. Pause does not advance the clock.
 * @param state - Session.
 * @param now - Clock.
 * @param pauseStarted - When the current pause began (0 if recording).
 */
export function teachElapsedMs(
  state: Pick<TeachSessionState, 'phase' | 'startedAt' | 'pausedMs'>,
  now: number,
  pauseStarted = 0,
): number {
  if (state.startedAt === undefined || state.phase === 'idle') return 0
  const livePause = state.phase === 'paused' ? Math.max(0, now - pauseStarted) : 0
  return Math.max(0, now - state.startedAt - state.pausedMs - livePause)
}

/**
 * Safe clock for the renderer overlay. Never includes frame pixels.
 * @param state - Session snapshot.
 */
export function teachClockView(state: TeachSessionState): TeachClockView {
  return {
    phase: state.phase,
    elapsedMs: state.elapsedMs ?? 0,
    mic: state.mic,
    frameCount: state.frames.length,
    blurCount: state.blurRects.length,
  }
}

function escapeTeachHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/**
 * data: URL for {@link teachOverlayHtml}. Never a network URL.
 * @param clock - Safe overlay view.
 */
export function teachOverlayDocumentUrl(clock: TeachClockView): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(teachOverlayHtml(clock))}`
}

/**
 * Discrete teach chrome: clock + pause/stop. Never embeds frame pixels.
 * @param clock - Safe overlay view.
 */
export function teachOverlayHtml(clock: TeachClockView): string {
  const seconds = Math.floor(clock.elapsedMs / 1000)
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
html,body{margin:0;background:transparent;pointer-events:none;font:14px Nunito,sans-serif}
.bar,.btn{pointer-events:auto}
.bar{display:flex;gap:8px;align-items:center;padding:6px 10px}
</style></head><body>
<div class="bar" data-phase="${escapeTeachHtml(clock.phase)}">
  <span class="clock">${mm}:${ss}</span>
  <span>${clock.mic ? 'mic' : 'sem mic'}</span>
  <span data-blur="${clock.blurCount}">${clock.blurCount} borrões</span>
  <button class="btn" type="button" data-act="pause">Pausar</button>
  <button class="btn" type="button" data-act="stop">Parar</button>
</div>
<p>Evite senhas — regiões marcadas ficam borradas.</p>
</body></html>`
}

export interface TeachCaptureIo {
  listSources?: () => Promise<readonly TeachSource[]>
  now?: () => number
  write?: (path: string, bytes: Buffer) => void
  mkdir?: (path: string) => void
  whisperBin?: string
}

const CHANGE_RATIO = 0.04

/**
 * Hash-byte difference in 0..1 between two PNG buffers.
 * @param previous - Last kept PNG.
 * @param next - Candidate PNG.
 */
export function frameChangeScore(previous: Buffer | undefined, next: Buffer): number {
  if (previous === undefined) return 1
  if (previous.length === 0 || next.length === 0) return previous.length === next.length ? 0 : 1
  const left = createHash('sha256').update(previous).digest()
  const right = createHash('sha256').update(next).digest()
  let diff = 0
  for (let i = 0; i < left.length; i += 1) if (left[i] !== right[i]) diff += 1
  return diff / left.length
}

/**
 * Keep a frame when the screen changed enough vs the last keyframe.
 * @param previous - Last kept PNG.
 * @param next - Candidate PNG.
 */
export function isKeyframe(previous: Buffer | undefined, next: Buffer): boolean {
  return frameChangeScore(previous, next) >= CHANGE_RATIO
}

/**
 * Persist keyframes as local files and emit the Forge/host frame list.
 * @param dir - Private teach dir.
 * @param frames - In-memory PNG keyframes.
 * @param write - Injectable write.
 */
export function projectTeachFrames(
  dir: string,
  frames: readonly TeachFrame[],
  write: (path: string, bytes: Buffer) => void = writeFileSync,
): TeachProjectedFrame[] {
  return frames.map((frame, index) => {
    const path = join(dir, `teach-frame-${String(index).padStart(3, '0')}.png`)
    write(path, frame.png)
    const previous = frames[index - 1]
    return {
      atMs: frame.atMs,
      imageRef: pathToFileURL(path).href,
      changeScore: frameChangeScore(previous?.png, frame.png),
    }
  })
}

/**
 * Delete projected PNG files after a stop that requested redaction.
 * @param dir - Private teach dir.
 * @param unlink - Injectable unlink.
 */
export function redactTeachArtifacts(
  dir: string,
  unlink: (path: string) => void = unlinkSync,
): void {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    if (!name.startsWith('teach-frame-') || !name.endsWith('.png')) continue
    unlink(join(dir, name))
  }
}

/**
 * Strip imageRef so a redacted stop never leaks a file URL.
 * @param frames - Projected frames.
 */
export function redactProjectedFrames(frames: readonly TeachProjectedFrame[]): TeachProjectedFrame[] {
  return frames.map(frame => ({
    atMs: frame.atMs,
    imageRef: 'redacted',
    changeScore: frame.changeScore,
  }))
}

/**
 * True when the user accepted the four W2-10 consent flags.
 * @param raw - IPC payload.
 */
export function teachConsentOk(raw: unknown): raw is TeachConsent {
  if (raw === null || typeof raw !== 'object') return false
  const row = raw as Record<string, unknown>
  return row.accepted === true
    && row.storesLocally === true
    && row.notUploaded === true
    && row.avoidPasswords === true
}

/**
 * True when the payload is a finite blur rectangle.
 * @param raw - IPC payload.
 */
export function teachBlurRectOk(raw: unknown): raw is TeachBlurRect {
  if (raw === null || typeof raw !== 'object') return false
  const row = raw as Record<string, unknown>
  return [row.x, row.y, row.width, row.height].every(
    value => typeof value === 'number' && Number.isFinite(value),
  )
}

/**
 * Zero a rectangle in an RGBA buffer. Password regions never stay in the frame.
 * @param pixels - Tight RGBA (4 bytes/pixel).
 * @param width - Buffer width.
 * @param height - Buffer height.
 * @param rect - Inclusive-origin rect, clipped to the buffer.
 */
export function blurTeachPixels(
  pixels: Buffer,
  width: number,
  height: number,
  rect: TeachBlurRect,
): Buffer {
  const out = Buffer.from(pixels)
  const x0 = Math.max(0, Math.floor(rect.x))
  const y0 = Math.max(0, Math.floor(rect.y))
  const x1 = Math.min(width, Math.ceil(rect.x + rect.width))
  const y1 = Math.min(height, Math.ceil(rect.y + rect.height))
  for (let y = y0; y < y1; y += 1) {
    const row = y * width * 4
    out.fill(0, row + x0 * 4, row + x1 * 4)
  }
  return out
}

/** Skill from a teach draft is always a candidate. Never auto-activates. */
export function teachDraftStatus(): 'candidate' {
  return 'candidate'
}

/** Where the teach artifact was recorded. */
export type TeachAudience = 'dm' | 'project' | 'public'

/**
 * Public skill publish. DM/project stay private unless the human promotes.
 * @param audience - Capture origin.
 * @param explicitPromote - Explicit "tornar pública" action.
 */
export function teachPublicPublishOk(audience: TeachAudience, explicitPromote: boolean): boolean {
  return explicitPromote === true && audience === 'public'
}

/** Synthetic spike cost (W2-9). Whisper stays no-go unless a bin is injected. */
export interface TeachSpikeMeasure {
  readonly frames: number
  readonly bytes: number
  readonly ms: number
  readonly whisper: 'go' | 'no-go'
}

/**
 * Measure a local teach run. Does not invent token or upload costs.
 * @param input - Frame count, artifact size, clock, optional whisper bin.
 */
export function measureTeachSpike(input: {
  readonly frames: number
  readonly bytes: number
  readonly startedAt: number
  readonly stoppedAt: number
  readonly whisperBin?: string
}): TeachSpikeMeasure {
  return {
    frames: input.frames,
    bytes: input.bytes,
    ms: Math.max(0, input.stoppedAt - input.startedAt),
    whisper: input.whisperBin !== undefined && input.whisperBin.length > 0 ? 'go' : 'no-go',
  }
}

/**
 * Drop teach artifacts older than maxAgeMs. Never touches other folders.
 * @param dir - Private teach dir under PERSONA_HOME.
 * @param maxAgeMs - Retention window.
 * @param now - Clock.
 */
export function applyTeachRetention(dir: string, maxAgeMs: number, now = Date.now): number {
  if (!existsSync(dir)) return 0
  let removed = 0
  for (const name of readdirSync(dir)) {
    if (!/^teach-/u.test(name)) continue
    const path = join(dir, name)
    if (now() - statSync(path).mtimeMs > maxAgeMs) {
      unlinkSync(path)
      removed += 1
    }
  }
  return removed
}

/**
 * Transcript: whisper.cpp stdout if present, else the typed explanation.
 * @param input - Local STT text and/or typed fallback.
 */
export function teachTranscript(input: { whisperText?: string; typed?: string }): string {
  const whisper = input.whisperText?.trim() ?? ''
  if (whisper.length > 0) return whisper
  return input.typed?.trim() ?? ''
}

/**
 * Locate whisper.cpp. Missing binary is a documented no-go (typed fallback).
 * @param env - Process env.
 */
export function detectWhisperCpp(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const pinned = env.PERSONA_WHISPER_CPP?.trim()
  if (pinned !== undefined && pinned.length > 0 && existsSync(pinned)) return pinned
  const probe = spawnSync('whisper-cli', ['-h'], { encoding: 'utf8', windowsHide: true, timeout: 3_000 })
  if (probe.error !== undefined) return undefined
  if (probe.status === 0 || probe.status === 1) return 'whisper-cli'
  return undefined
}

/**
 * In-memory teach session. Persist only under the caller-supplied private dir.
 */
export function createTeachSession(io: TeachCaptureIo = {}): {
  state: () => TeachSessionState
  listSources: () => Promise<readonly TeachSource[]>
  start: (sourceId: string, mic: boolean) => void
  pause: () => void
  resume: () => void
  ingestFrame: (png: Buffer) => boolean
  addBlur: (rect: TeachBlurRect) => boolean
  stop: (dir: string, bytes?: Buffer) => { artifactPath: string; frames: readonly TeachFrame[] }
} {
  const now = io.now ?? Date.now
  const write = io.write ?? writeFileSync
  const mkdir = io.mkdir ?? ((path: string) => { mkdirSync(path, { recursive: true }) })
  const listSources = io.listSources ?? (async () => [])
  const state: TeachSessionState = { phase: 'idle', mic: false, pausedMs: 0, frames: [], blurRects: [] }
  let pauseStarted = 0
  return {
    state: () => {
      const at = now()
      return {
        ...state,
        frames: [...state.frames],
        blurRects: [...state.blurRects],
        elapsedMs: teachElapsedMs(state, at, pauseStarted),
      }
    },
    listSources,
    start: (sourceId, mic) => {
      state.phase = 'recording'
      state.sourceId = sourceId
      state.mic = mic
      state.startedAt = now()
      state.pausedMs = 0
      state.frames = []
      state.blurRects = []
      delete state.artifactPath
    },
    addBlur: (rect) => {
      if (state.phase !== 'recording' && state.phase !== 'paused') return false
      state.blurRects.push(rect)
      return true
    },
    pause: () => {
      if (state.phase !== 'recording') return
      state.phase = 'paused'
      pauseStarted = now()
    },
    resume: () => {
      if (state.phase !== 'paused') return
      state.phase = 'recording'
      state.pausedMs += now() - pauseStarted
    },
    ingestFrame: (png) => {
      if (state.phase !== 'recording') return false
      const last = state.frames[state.frames.length - 1]
      if (!isKeyframe(last?.png, png)) return false
      state.frames.push({ atMs: now() - (state.startedAt ?? now()) - state.pausedMs, png })
      return true
    },
    stop: (dir, bytes) => {
      state.phase = 'stopped'
      mkdir(dir)
      const name = `teach-${state.startedAt ?? now()}.webm`
      const artifactPath = join(dir, name)
      write(artifactPath, bytes ?? Buffer.alloc(0))
      state.artifactPath = artifactPath
      return { artifactPath, frames: [...state.frames] }
    },
  }
}
