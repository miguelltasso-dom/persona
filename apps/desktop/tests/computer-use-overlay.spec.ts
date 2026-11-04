import { describe, expect, it } from 'vitest'
import {
  OVERLAY_CURSOR_CAP,
  computerUseOverlayHtml,
  installComputerUseOverlays,
  overlayBrowserWindowOptions,
  overlayDocumentUrl,
  overlayMouseIgnore,
  overlayWindowSpec,
  physicalToDip,
  type OverlayWindowSpec,
} from '../src/computer-use-overlay.ts'
import { createFakeUiaPort, uiaOverlayLabel } from '../src/computer-use-uia.ts'
import { createComputerUseController, humanHoldsComputer } from '../src/computer-use-control.ts'

describe('W3-5 overlay and UIA', () => {
  it('converts physical UIA rects to DIP and builds a click-through window', () => {
    expect(physicalToDip({ x: 200, y: 100, width: 400, height: 80 }, 2)).toEqual({
      x: 100, y: 50, width: 200, height: 40,
    })
    const spec = overlayWindowSpec({
      id: 1,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      scaleFactor: 1.5,
    })
    expect(spec.alwaysOnTopLevel).toBe('screen-saver')
    expect(spec.focusable).toBe(false)
    expect(spec.ignoreMouseEvents).toEqual({ ignore: true, forward: true })
    const opts = overlayBrowserWindowOptions(spec)
    expect(opts.transparent).toBe(true)
    expect(opts.focusable).toBe(false)
    expect(opts.webPreferences).toEqual({ sandbox: true, contextIsolation: true, nodeIntegration: false })
    expect(OVERLAY_CURSOR_CAP).toBe(2)
    const created: OverlayWindowSpec[] = []
    const closed: number[] = []
    const installed = installComputerUseOverlays([
      { id: 1, bounds: { x: 0, y: 0, width: 800, height: 600 }, scaleFactor: 1 },
    ], (spec) => {
      created.push(spec)
      return {
        setIgnoreMouseEvents: () => undefined,
        close: () => { closed.push(1) },
      }
    })
    expect(created[0]?.ignoreMouseEvents.forward).toBe(true)
    installed.close()
    expect(closed).toEqual([1])
    const html = computerUseOverlayHtml({
      personas: [
        { name: 'Nina', state: 'typing' },
        { name: 'Luna', state: 'moving' },
        { name: 'Bento', state: 'done' },
      ],
    })
    expect(html).toContain('pointer-events:none')
    expect(html).toContain('Devolver')
    expect(html).toContain('requestAnimationFrame')
    expect(html).toContain('cu:state')
    expect(html).toContain('digitando ••••')
    expect(html).toContain('Bento espera a tela')
    expect(html).toContain('prefers-reduced-motion')
    expect(html).not.toContain('Bento</b>')
    expect(overlayDocumentUrl(html)).toMatch(/^data:text\/html/u)
    expect(overlayMouseIgnore(false)).toEqual({ ignore: true, forward: true })
    expect(overlayMouseIgnore(true)).toEqual({ ignore: false, forward: true })
    const loaded: string[] = []
    installComputerUseOverlays([
      { id: 1, bounds: { x: 0, y: 0, width: 100, height: 100 }, scaleFactor: 1 },
    ], () => ({
      setIgnoreMouseEvents: () => undefined,
      close: () => undefined,
      loadURL: (url) => { loaded.push(url) },
    })).close()
    expect(loaded[0]).toMatch(/^data:text\/html/u)
  })

  it('masks password nodes and reports when the human holds control', () => {
    const uia = createFakeUiaPort([
      { id: '1', name: 'Senha', role: 'edit', rect: { x: 0, y: 0, width: 10, height: 10 }, isPassword: true },
      { id: '2', name: 'Salvar', role: 'button', rect: { x: 0, y: 20, width: 10, height: 10 } },
    ])
    expect(uiaOverlayLabel(uia.find('Senha')!)).toBe('digitando ••••')
    expect(uiaOverlayLabel(uia.find('Salvar')!)).toBe('Salvar')
    const control = createComputerUseController()
    control.begin('nina')
    expect(humanHoldsComputer(control)).toBe(false)
    control.onInput('human')
    expect(humanHoldsComputer(control)).toBe(true)
  })
})
