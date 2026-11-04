/**
 * W3-5 Electron overlay (COMPUTER-USE-SPEC §7): one window per monitor,
 * click-through, DIP conversion. Muse owns the cursor renderer.
 */

/** One monitor the overlay covers. */
export interface OverlayDisplay {
  readonly id: number
  readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  readonly scaleFactor: number
}

/** BrowserWindow options for a click-through overlay. */
export interface OverlayWindowSpec {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly alwaysOnTopLevel: 'screen-saver'
  readonly focusable: false
  readonly skipTaskbar: true
  readonly frame: false
  readonly transparent: true
  readonly ignoreMouseEvents: { readonly ignore: true; readonly forward: true }
}

/** DIP bounds after scaleFactor conversion. */
export interface DipRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * Convert a physical UIA rect to DIP for the matching display.
 * @param physical - Pixels from UIA.
 * @param scaleFactor - `display.scaleFactor`.
 */
export function physicalToDip(physical: DipRect, scaleFactor: number): DipRect {
  const scale = scaleFactor > 0 ? scaleFactor : 1
  return {
    x: physical.x / scale,
    y: physical.y / scale,
    width: physical.width / scale,
    height: physical.height / scale,
  }
}

/**
 * BrowserWindow constructor fields for one overlay. Main still calls `setAlwaysOnTop`.
 * @param spec - {@link overlayWindowSpec} result.
 */
export function overlayBrowserWindowOptions(spec: OverlayWindowSpec): {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly frame: false
  readonly transparent: true
  readonly skipTaskbar: true
  readonly focusable: false
  readonly alwaysOnTop: true
  readonly show: true
  readonly webPreferences: { readonly sandbox: true; readonly contextIsolation: true; readonly nodeIntegration: false }
} {
  return {
    x: spec.x,
    y: spec.y,
    width: spec.width,
    height: spec.height,
    frame: spec.frame,
    transparent: spec.transparent,
    skipTaskbar: spec.skipTaskbar,
    focusable: spec.focusable,
    alwaysOnTop: true,
    show: true,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  }
}

/**
 * BrowserWindow options for one overlay (click-through until Devolver hover).
 * @param display - Target monitor.
 */
export function overlayWindowSpec(display: OverlayDisplay): OverlayWindowSpec {
  return {
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    alwaysOnTopLevel: 'screen-saver',
    focusable: false,
    skipTaskbar: true,
    frame: false,
    transparent: true,
    ignoreMouseEvents: { ignore: true, forward: true },
  }
}

/** Max visible persona cursors per monitor (Muse §7). */
export const OVERLAY_CURSOR_CAP = 2

/** Window handle the host can close. */
export interface OverlayWindowHandle {
  setIgnoreMouseEvents(ignore: boolean, options: { forward: boolean }): void
  close(): void
  loadURL?(url: string): void
}

/** Cursor state drawn on the overlay (Muse §7). */
export type OverlayPersonaState = 'moving' | 'typing' | 'human' | 'done'

/** One visible persona cursor. */
export interface OverlayPersona {
  readonly name: string
  readonly state: OverlayPersonaState
}

/**
 * Legacy static overlay HTML. Bind loads the Muse cursor renderer instead.
 * @param input - Visible personas; extras wait.
 */
export function computerUseOverlayHtml(input: {
  readonly personas?: readonly OverlayPersona[]
} = {}): string {
  const personas = (input.personas ?? []).slice(0, OVERLAY_CURSOR_CAP)
  const waiting = (input.personas ?? []).length > OVERLAY_CURSOR_CAP
  const labels = personas.map((persona) => {
    const text = persona.state === 'typing' ? 'digitando ••••' : persona.name
    return `<div class="cursor" data-state="${persona.state}"><i></i><b>${escapeOverlay(text)}</b></div>`
  }).join('')
  const wait = waiting ? '<p class="wait">Bento espera a tela</p>' : ''
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:transparent;pointer-events:none;overflow:hidden}
.cursor{position:absolute;transform:translate(0,0);will-change:transform}
.devolver,.wait{pointer-events:auto}
@media (prefers-reduced-motion:reduce){* {animation:none!important;transition:none!important}}
</style></head><body>
${labels}${wait}
<button class="devolver" type="button">Devolver</button>
<script>
const IPC = ['cu:move','cu:click','cu:type','cu:state','cu:frame']
function tick(){ requestAnimationFrame(tick) }
requestAnimationFrame(tick)
</script>
</body></html>`
}

function escapeOverlay(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/**
 * data: URL for {@link computerUseOverlayHtml}. Never a network URL.
 * @param html - Overlay document.
 */
export function overlayDocumentUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

/**
 * Click-through except while the pointer is on Devolver.
 * @param devolverHovered - True only under the Devolver button.
 */
export function overlayMouseIgnore(devolverHovered: boolean): { readonly ignore: boolean; readonly forward: true } {
  return devolverHovered ? { ignore: false, forward: true } : { ignore: true, forward: true }
}

/**
 * Open one click-through overlay per display. Loads Rivet HTML when `loadURL` exists.
 * @param displays - Current monitors.
 * @param createWindow - Electron BrowserWindow factory.
 * @param html - Optional overlay document.
 */
export function installComputerUseOverlays(
  displays: readonly OverlayDisplay[],
  createWindow: (spec: OverlayWindowSpec) => OverlayWindowHandle,
  html = computerUseOverlayHtml(),
): { specs: readonly OverlayWindowSpec[]; close(): void } {
  const url = overlayDocumentUrl(html)
  const windows = displays.map((display) => {
    const spec = overlayWindowSpec(display)
    const window = createWindow(spec)
    window.setIgnoreMouseEvents(true, { forward: true })
    window.loadURL?.(url)
    return window
  })
  return {
    specs: displays.map(overlayWindowSpec),
    close: () => {
      for (const window of windows) window.close()
    },
  }
}
