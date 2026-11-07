/**
 * Recording pill for "Ensinar": clock + Pausar/Retomar + Parar in a small always-on-top window that is EXCLUDED from the capture.
 *
 * Why a separate window: the in-app pill lives inside the Persona window, which is minimized (or hidden by the app being recorded)
 * the moment a recording of another window or screen starts, so the person could not see the clock or stop. This one stays on top.
 * `setContentProtection(true)` removes it from the captured pixels, so the pill never ends up inside the recording.
 *
 * No preload and no IPC are needed: the page is a static document and its buttons are links to a closed set of URLs
 * (`https://teach-action.persona.invalid/pause|resume|stop`). The main process intercepts the navigation, runs the action
 * and cancels the navigation; every other navigation or new window is refused.
 */

import { createHash } from 'node:crypto'

export type TeachPillAction = 'pause' | 'resume' | 'stop'

/** Host of the action links. `.invalid` never resolves, so even a leaked navigation reaches nothing. */
export const TEACH_PILL_HOST = 'teach-action.persona.invalid'

const ACTIONS: readonly TeachPillAction[] = ['pause', 'resume', 'stop']

/**
 * @param url - Navigation target requested by the pill page.
 * @returns The action when the URL is exactly one of the three action links, otherwise undefined.
 */
export function parseTeachPillAction(url: string): TeachPillAction | undefined {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== TEACH_PILL_HOST || parsed.port !== ''
    || parsed.search !== '' || parsed.hash !== '' || parsed.username !== '' || parsed.password !== '') return undefined
  const name = parsed.pathname.replace(/^\//u, '')
  return (ACTIONS as readonly string[]).includes(name) ? name as TeachPillAction : undefined
}

/** @returns the href the pill renders for an action. */
export function teachPillHref(action: TeachPillAction): string {
  return `https://${TEACH_PILL_HOST}/${action}`
}

export interface TeachPillMessages {
  readonly recording: string
  readonly paused: string
  readonly pause: string
  readonly resume: string
  readonly stop: string
  readonly hidden: string
}

export const teachPillMessages = {
  en: { recording: 'Recording', paused: 'Paused', pause: 'Pause', resume: 'Resume', stop: 'Stop', hidden: 'This bar is not in the recording' },
  pt: { recording: 'Gravando', paused: 'Pausado', pause: 'Pausar', resume: 'Retomar', stop: 'Parar', hidden: 'Esta barra não aparece na gravação' },
} as const satisfies Record<string, TeachPillMessages>

/** @param localeId - Desktop locale id; unsupported ones use English. */
export function teachPillCopy(localeId: string | undefined): TeachPillMessages {
  return localeId === 'pt' ? teachPillMessages.pt : teachPillMessages.en
}

/** What the pill needs to draw. */
export interface TeachPillClock {
  readonly phase: 'recording' | 'paused' | 'idle' | 'stopped'
  readonly elapsedMs: number
}

// A fixed script: its hash goes in the CSP, and the only inputs are numbers read from data-* attributes.
const PILL_SCRIPT = "(function(){var b=document.body,base=Number(b.dataset.base),el=Number(b.dataset.elapsed),p=b.dataset.phase==='paused',t=document.getElementById('t');function f(){var ms=p?el:el+(Date.now()-base);var s=Math.max(0,Math.floor(ms/1000));t.textContent=('0'+Math.floor(s/60)).slice(-2)+':'+('0'+(s%60)).slice(-2)}f();if(!p)setInterval(f,500)})()"

/** @returns the CSP `sha256-…` source of the pill script. */
export function teachPillScriptHash(): string {
  return `sha256-${createHash('sha256').update(PILL_SCRIPT).digest('base64')}`
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

/**
 * The pill document. Never carries frame pixels.
 * @param clock - Phase and elapsed time at `nowMs`.
 * @param copy - Strings in the app language.
 * @param nowMs - The instant `clock.elapsedMs` was read; the page keeps counting from it.
 */
export function teachPillHtml(clock: TeachPillClock, copy: TeachPillMessages, nowMs: number): string {
  const paused = clock.phase === 'paused'
  const elapsed = Number.isFinite(clock.elapsedMs) && clock.elapsedMs > 0 ? Math.floor(clock.elapsedMs) : 0
  return `<!doctype html><html lang="${copy === teachPillMessages.pt ? 'pt-BR' : 'en'}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src '${teachPillScriptHash()}'">
<style>
html,body{margin:0;height:100%;background:transparent;overflow:hidden;font:700 14px Nunito,"Segoe UI",system-ui,sans-serif;user-select:none}
.pill{box-sizing:border-box;display:flex;align-items:center;gap:10px;height:100%;padding:0 12px 0 16px;border-radius:26px;background:#1e1526;color:#faf3e4;border:1.5px solid #5b4a6b}
.dot{width:10px;height:10px;border-radius:50%;background:${paused ? '#d9a441' : '#e5484d'};flex:none}
.rec .dot{animation:pulse 1.4s ease-in-out infinite}
@keyframes pulse{50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){.rec .dot{animation:none}}
.state{opacity:.85;flex:none}
#t{font-variant-numeric:tabular-nums;min-width:3.2em;flex:none}
.grow{flex:1}
a{color:#faf3e4;text-decoration:none;padding:6px 12px;border-radius:16px;background:#3a2c49;flex:none}
a:hover,a:focus-visible{background:#54406a;outline:none}
a.stop{background:#e5484d;color:#fff}
a.stop:hover,a.stop:focus-visible{background:#c93b40}
</style></head>
<body data-phase="${escapeHtml(clock.phase)}" data-base="${String(Math.floor(nowMs))}" data-elapsed="${String(elapsed)}" title="${escapeHtml(copy.hidden)}">
<div class="pill ${paused ? 'paused' : 'rec'}" role="group" aria-label="${escapeHtml(paused ? copy.paused : copy.recording)}">
  <span class="dot" aria-hidden="true"></span>
  <span class="state">${escapeHtml(paused ? copy.paused : copy.recording)}</span>
  <span id="t" role="timer">00:00</span>
  <span class="grow"></span>
  <a href="${teachPillHref(paused ? 'resume' : 'pause')}">${escapeHtml(paused ? copy.resume : copy.pause)}</a>
  <a class="stop" href="${teachPillHref('stop')}">${escapeHtml(copy.stop)}</a>
</div>
<script>${PILL_SCRIPT}</script>
</body></html>`
}

/** `data:` URL of {@link teachPillHtml}. */
export function teachPillDocumentUrl(clock: TeachPillClock, copy: TeachPillMessages, nowMs: number): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(teachPillHtml(clock, copy, nowMs))}`
}

export const TEACH_PILL_SIZE = { width: 330, height: 52 } as const

/** The slice of BrowserWindow the pill uses (a double in tests). */
export interface TeachPillWindow {
  loadURL(url: string): unknown
  setContentProtection(enable: boolean): void
  setAlwaysOnTop(flag: boolean, level?: 'screen-saver'): void
  setPosition(x: number, y: number): void
  showInactive(): void
  close(): void
  isDestroyed(): boolean
  webContents: {
    on(event: 'will-navigate', listener: (event: { preventDefault(): void }, url: string) => void): unknown
    setWindowOpenHandler(handler: () => { action: 'deny' }): unknown
  }
}

export interface TeachPillOptions {
  /** Create the (hidden) window with the given size. */
  readonly createWindow: (size: { width: number; height: number }) => TeachPillWindow
  /** Work area of the display the pill goes on. */
  readonly workArea: () => { x: number; y: number; width: number; height: number }
  readonly localeId?: () => string | undefined
  readonly now?: () => number
  readonly onAction: (action: TeachPillAction) => void
}

/** @returns controls for the single pill window. */
export function createTeachPill(options: TeachPillOptions): {
  show(clock: TeachPillClock): void
  update(clock: TeachPillClock): void
  hide(): void
  readonly visible: boolean
} {
  const now = options.now ?? Date.now
  let window: TeachPillWindow | undefined
  let phase: TeachPillClock['phase'] | undefined
  const load = (clock: TeachPillClock): void => {
    if (window === undefined || window.isDestroyed()) return
    phase = clock.phase
    void window.loadURL(teachPillDocumentUrl(clock, teachPillCopy(options.localeId?.()), now()))
  }
  return {
    show(clock) {
      if (window !== undefined && !window.isDestroyed()) {
        load(clock)
        return
      }
      const created = options.createWindow({ ...TEACH_PILL_SIZE })
      window = created
      // Out of the capture, above everything (full-screen apps included), and never a way to navigate anywhere.
      created.setContentProtection(true)
      created.setAlwaysOnTop(true, 'screen-saver')
      created.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      created.webContents.on('will-navigate', (event, url) => {
        event.preventDefault()
        const action = parseTeachPillAction(url)
        if (action !== undefined) options.onAction(action)
      })
      const area = options.workArea()
      created.setPosition(Math.round(area.x + (area.width - TEACH_PILL_SIZE.width) / 2), Math.round(area.y + 12))
      load(clock)
      created.showInactive()
    },
    // Only a change of phase needs a new document: the page counts the seconds itself.
    update(clock) {
      if (clock.phase === phase) return
      load(clock)
    },
    hide() {
      const closing = window
      window = undefined
      phase = undefined
      if (closing !== undefined && !closing.isDestroyed()) closing.close()
    },
    get visible() { return window !== undefined && !window.isDestroyed() },
  }
}
