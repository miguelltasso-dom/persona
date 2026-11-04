import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import {
  OVERLAY_DEVOLVER_MESSAGE,
  OVERLAY_HOVER_PREFIX,
  interpretOverlayConsole,
  overlayDispatchScript,
  personaCursorOverlayHtml,
  type OverlayCommand,
} from '../src/computer-use-cursor-renderer.ts'

interface OverlayApi {
  dispatch(cmd: OverlayCommand): void
  snapshot(): { id: string; x: number; y: number; state: string; label: string }[]
}

function boot(): { dom: JSDOM; api: OverlayApi; logs: string[] } {
  const logs: string[] = []
  const dom = new JSDOM(personaCursorOverlayHtml(), { runScripts: 'dangerously', pretendToBeVisual: true })
  ;(dom.window as unknown as { console: { info: (msg: string) => void } }).console.info = (msg: string) => { logs.push(msg) }
  const api = (dom.window as unknown as { __personaOverlay: OverlayApi }).__personaOverlay
  return { dom, api, logs }
}

const nina = { id: 'nina', name: 'Nina', color: '#f0be6a' }
const bento = { id: 'bento', name: 'Bento', color: '#9fd3c7' }
const sol = { id: 'sol', name: 'Sol', color: '#f4a3a8' }

describe('persona cursor overlay renderer (W3-6, COMPUTER-USE-SPEC)', () => {
  it('is self-contained: no network URL, reduced-motion block present', () => {
    const html = personaCursorOverlayHtml()
    expect(html.replaceAll('http://www.w3.org/2000/svg', '')).not.toMatch(/https?:\/\//u)
    expect(html).toContain('prefers-reduced-motion:reduce')
    expect(interpretOverlayConsole(OVERLAY_DEVOLVER_MESSAGE)).toEqual({ kind: 'devolver' })
    expect(interpretOverlayConsole(`${OVERLAY_HOVER_PREFIX}1`)).toEqual({ kind: 'hover', hovered: true })
    expect(interpretOverlayConsole('other')).toBeUndefined()
  })

  it('caps visible cursors at 2 and tells who waits for the screen', () => {
    const { dom, api } = boot()
    api.dispatch({ type: 'cu:state', personas: [nina, sol, bento] })
    expect(api.snapshot().map(c => c.id)).toEqual(['nina', 'sol'])
    expect(dom.window.document.getElementById('wait')!.textContent).toBe('Bento espera a tela')
  })

  it('never draws secret text; shows the tail of normal typing', () => {
    const { api } = boot()
    api.dispatch({ type: 'cu:state', personas: [nina] })
    api.dispatch({ type: 'cu:type', id: 'nina', text: 'hunter2-senha', secret: true })
    expect(api.snapshot()[0]!.label).not.toContain('hunter2')
    expect(api.snapshot()[0]!.label).toMatch(/^•+$/u)
    api.dispatch({ type: 'cu:type', id: 'nina', text: 'Padaria Lua' })
    expect(api.snapshot()[0]!.label).toBe('Padaria Lua')
  })

  it('human takeover: label says "você assumiu", Devolver appears and reports to main', () => {
    const { dom, api, logs } = boot()
    api.dispatch({ type: 'cu:state', personas: [nina] })
    api.dispatch({ type: 'cu:frame', id: 'nina', rect: { x: 100, y: 100, width: 400, height: 300 } })
    const button = dom.window.document.querySelector<HTMLButtonElement>('.devolver')!
    expect(button.hidden).toBe(true)
    api.dispatch({ type: 'cu:state', personas: [nina], human: true })
    expect(api.snapshot()[0]).toMatchObject({ state: 'human', label: 'você assumiu' })
    expect(button.hidden).toBe(false)
    expect(dom.window.document.querySelector('.tagtext')!.textContent).toBe('Você está no controle')
    button.click()
    expect(logs).toContain(OVERLAY_DEVOLVER_MESSAGE)
  })

  it('escapes persona names', () => {
    const { dom, api } = boot()
    api.dispatch({ type: 'cu:state', personas: [{ ...nina, name: '<img src=x onerror=alert(1)>' }] })
    expect(dom.window.document.querySelector('.cursor img[src="x"]')).toBeNull()
  })

  it('lands exactly on the target after the arc', async () => {
    const { api } = boot()
    api.dispatch({ type: 'cu:state', personas: [nina] })
    api.dispatch({ type: 'cu:move', id: 'nina', x: 300, y: 220, detail: 'Salvar' })
    await new Promise(resolve => setTimeout(resolve, 1200))
    expect(api.snapshot()[0]).toMatchObject({ x: 300, y: 220 })
  })

  it('dispatch script is a guarded one-liner the main process can executeJavaScript', () => {
    expect(overlayDispatchScript({ type: 'cu:click', id: 'nina' })).toBe('window.__personaOverlay && window.__personaOverlay.dispatch({"type":"cu:click","id":"nina"})')
  })
})
