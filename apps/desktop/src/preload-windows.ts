import { WINDOWS_TITLEBAR_HEIGHT } from './windows-layout.ts'
/** Synchronizes Windows context menus and caption colors with the application document. */
import { ipcRenderer } from 'electron'
import { DESKTOP_IPC } from './ipc.ts'
import { installWindowsMenu } from './preload-menu.ts'

/** A COMPUTED `rgb(r, g, b)` / `rgba(r, g, b, a)`: what `getComputedStyle` returns for hex, `rgb()` and resolved named colors. */
const CHANNEL = String.raw`\s*(\d{1,3}(?:\.\d+)?)\s*`
const ALPHA = String.raw`(?:,\s*(\d(?:\.\d+)?|\.\d+)\s*)?`
const COMPUTED_RGB = new RegExp(`^rgba?\\(${CHANNEL},${CHANNEL},${CHANNEL}${ALPHA}\\)$`, 'u')

/**
 * The color as `rgba(r, g, b, a)` the way a canvas reads it back (whole 0–255 channels; alpha as a byte over 255), without a canvas.
 * @param color - A computed CSS color.
 * @returns The string `nativeColor` has always produced, or `undefined` when the value is not a plain computed `rgb()`/`rgba()`.
 */
export function rgbOf(color: string): string | undefined {
  const match = COMPUTED_RGB.exec(color.trim())
  if (match === null) return undefined
  const channel = (value: string | undefined): number => Math.min(255, Math.max(0, Math.round(Number(value))))
  const alpha = match[4] === undefined ? 255 : Math.round(Math.min(1, Math.max(0, Number(match[4]))) * 255)
  return `rgba(${channel(match[1])}, ${channel(match[2])}, ${channel(match[3])}, ${alpha / 255})`
}

/** Install the Windows-only titlebar marker and observe application language and palette changes. */
export function syncWindowsAppearance(): void {
  if (process.platform !== 'win32') return
  const mark = (): void => {
    const root = document.documentElement
    root.dataset.windowsTitlebar = ''
    root.style.setProperty('--dsh-windows-titlebar-height', `${WINDOWS_TITLEBAR_HEIGHT}px`)
  }
  // The root can be absent before the HTML parser creates it.
  if ((document.documentElement as HTMLElement | null) !== null) mark()
  const install = (): void => {
    mark()
    const root = document.documentElement
    const menu = installWindowsMenu()
    const probe = document.createElement('span')
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;background-color:var(--dsw-specific-sidebar-fill);color:var(--dsw-alias-label-primary)'
    document.body.append(probe)
    // The 2D canvas is a FALLBACK, made the first time a color the browser keeps as written (`oklch()`, `hsl()`, a name) needs
    // resolving: a computed `rgb()`/`rgba()` is read straight from the string. The context and its read-backs cost ~0.6 s of the
    // renderer's first second on a loaded machine (boot profile of 752e85396a).
    let context: CanvasRenderingContext2D | undefined
    const canvasColor = (color: string): string => {
      if (context === undefined) {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        const created = canvas.getContext('2d', { willReadFrequently: true })
        if (created === null) throw new Error('Desktop caption requires a 2D canvas context')
        context = created
      }
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data
      return `rgba(${red}, ${green}, ${blue}, ${Number(alpha) / 255})`
    }
    const nativeColor = (color: string): string => {
      const direct = rgbOf(color)
      return direct === undefined ? canvasColor(color) : direct
    }
    let previous = ''
    const send = (): void => {
      const style = getComputedStyle(probe)
      const color = nativeColor(style.backgroundColor)
      const symbolColor = nativeColor(style.color)
      const values = [root.lang, color, symbolColor]
      const current = JSON.stringify(values)
      if (current === previous) return
      previous = current
      menu.update()
      ipcRenderer.send(DESKTOP_IPC.windowsAppearance, ...values)
    }
    const observer = new MutationObserver(send)
    observer.observe(root, { attributes: true, attributeFilter: ['lang'] })
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'style'] })
    observer.observe(document.head, { childList: true, subtree: true, characterData: true })
    document.head.addEventListener('load', send, true)
    window.addEventListener('pagehide', () => {
      observer.disconnect()
      menu.dispose()
      probe.remove()
      document.head.removeEventListener('load', send, true)
    }, { once: true })
    send()
  }
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', install, { once: true })
  else install()
}
