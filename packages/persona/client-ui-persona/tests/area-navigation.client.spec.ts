// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { installAreaNavigation, listAreas } from '../src/client/shell/area-navigation.ts'

let uninstall: (() => void) | undefined
afterEach(() => { uninstall?.(); document.body.innerHTML = '' })

describe('F6 between areas (harvest §1)', () => {
  it('cycles rail → main → composer (nested) → rail and remembers the last control', () => {
    document.body.innerHTML = `
      <nav data-persona-area="rail"><button id="r1">a</button><button id="r2">b</button></nav>
      <div data-persona-area="main"><button id="m1">m</button>
        <form data-persona-area="composer"><textarea id="c1"></textarea></form>
      </div>`
    // jsdom has no layout: treat every area as visible.
    for (const el of document.querySelectorAll<HTMLElement>('[data-persona-area], button, textarea')) {
      Object.defineProperty(el, 'getClientRects', { value: () => [{}] })
    }
    uninstall = installAreaNavigation()
    expect(listAreas().length).toBe(3)
    const press = (shift = false): void => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F6', shiftKey: shift, bubbles: true })) }
    document.getElementById('r2')!.focus()
    press()
    expect(document.activeElement?.id).toBe('m1')
    press()
    expect(document.activeElement?.id).toBe('c1')
    press()
    expect(document.activeElement?.id).toBe('r2')
    press(true)
    expect(document.activeElement?.id).toBe('c1')
  })
})
