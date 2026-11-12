// The place tab bar must keep its own height. PersonaAppFrame gives every child of the center column `flex: 1 1 auto; min-height: 0` (`.center > *`),
// and a lone `.bar { flex: 0 0 auto }` has the SAME specificity, so the stylesheet loaded last won: the bar shrank on every page taller than the
// window (measured on Saúde in the real shell: 31px for a 42px track at 1440x900) and cut the tabs. jsdom has no layout, so this pins the rule.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const shellDir = fileURLToPath(new URL('../src/client/shell/', import.meta.url))
const barCss = readFileSync(`${shellDir}PlaceTabsBar.module.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '')
const frameCss = readFileSync(`${shellDir}PersonaAppFrame.module.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '')

describe('the place tab bar against the frame', () => {
  it('the frame really gives its children flex-shrink 1 (the reason the bar needs more specificity)', () => {
    expect(frameCss).toMatch(/\.center\s*>\s*\*\s*\{[^}]*flex:\s*1 1 auto/u)
  })

  it('every rule of the bar names the element (div.bar), so it beats `.center > *` whatever the load order', () => {
    const selectors = [...barCss.matchAll(/(^|\})\s*([^{}@]+)\{/gu)].map(match => (match[2] ?? '').trim()).filter(selector => selector.length > 0)
    expect(selectors.length).toBeGreaterThan(0)
    // Every rule starts at the bar element; what is inside it (`div.bar [role='tab']`…) is a descendant, not a flex child of `.center`.
    for (const selector of selectors) expect(selector).toMatch(/^div\.bar(::[\w-]+|\s+[^,{}]+)?$/u)
  })

  it('and it keeps flex: 0 0 auto: it never shrinks', () => {
    expect(barCss).toMatch(/div\.bar\s*\{[^}]*flex:\s*0 0 auto/u)
  })
})
