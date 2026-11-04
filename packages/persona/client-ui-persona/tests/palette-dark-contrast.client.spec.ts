import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Muse: guard for the dark palette. A text token defined only in :root silently keeps its light value in dark
 * (achado do Lumen: --persona-ink-muted #60516b on card #2a1e35). Every --persona-ink-* must be redefined in the
 * dark block and reach WCAG AA (4.5:1) on every dark surface that carries text.
 */
const CSS = readFileSync(new URL('../src/client/theme/persona-palette.css', import.meta.url), 'utf8')

function block(selector: string): string {
  const start = CSS.indexOf(`${selector} {`)
  expect(start, `${selector} block`).toBeGreaterThanOrEqual(0)
  return CSS.slice(start, CSS.indexOf('}', start))
}

function hexTokens(source: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const match of source.matchAll(/--(persona-[\w-]+):\s*(#[0-9a-fA-F]{6})\b/gu)) out.set(match[1]!, match[2]!)
  return out
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

const root = block(':root')
const dark = hexTokens(block("body[data-ds-dark-theme='true']"))
const TEXT_SURFACES = ['persona-paper', 'persona-paper-sunken', 'persona-card', 'persona-card-raised', 'persona-wash', 'persona-wash-strong', 'persona-rail']
const light = block("body:not([data-ds-dark-theme='true'])")
const INK = [...new Set([...[root, light].join('\n').matchAll(/--(persona-ink(?:-[\w-]+)?):\s*#/gu)].map(m => m[1]!))]

describe('dark palette text tokens', () => {
  it('finds the ink tokens and the dark surfaces', () => {
    expect(INK).toEqual(expect.arrayContaining(['persona-ink', 'persona-ink-soft', 'persona-ink-faint', 'persona-ink-muted']))
    for (const surface of TEXT_SURFACES) expect(dark.get(surface), surface).toMatch(/^#/u)
  })

  it.each(INK)('%s is redefined in dark and reaches 4.5:1 on every text surface', (token) => {
    const ink = dark.get(token)
    expect(ink, `${token} missing from the dark block`).toBeDefined()
    for (const surface of TEXT_SURFACES) {
      expect(contrast(ink!, dark.get(surface)!), `${token} on ${surface}`).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('dark palette coverage', () => {
  // Raw scales (plum-900, lilac-700…) are the same in both themes on purpose; semantic colour tokens are not.
  const SCALE = /^persona-(plum|lilac|cream|amber|honey|mint|rose|sky|leaf|gray)-|^persona-accent-ink$/u
  const darkNames = new Set([...block("body[data-ds-dark-theme='true']").matchAll(/--(persona-[\w-]+):/gu)].map(m => m[1]!))

  it('every semantic colour token in :root is redefined for dark', () => {
    const rootColours = [...root.matchAll(/--(persona-[\w-]+):\s*(#|var\(--persona-|color-mix)/gu)].map(m => m[1]!)
    const missing = rootColours.filter(name => !SCALE.test(name) && !darkNames.has(name))
    expect(missing).toEqual([])
  })
})
