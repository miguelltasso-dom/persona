import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Muse: guard for the dark palette. A text token defined only in :root silently keeps its light value in dark
 * (achado do Lumen: --persona-ink-muted #60516b on card #2a1e35). Every --persona-ink-* must be redefined in the
 * dark block and reach WCAG AA (4.5:1) on every dark surface that carries text.
 */
// O arquivo pode vir com CRLF (Windows): as buscas por trecho com quebra de linha usam LF.
const CSS = readFileSync(new URL('../src/client/theme/persona-palette.css', import.meta.url), 'utf8').replaceAll('\r\n', '\n')

/**
 * O bloco da paleta que abre com o seletor. Os blocos claro e escuro também valem para um escopo local
 * (`[data-persona-scheme]`, a miniatura da aba Aparência): o seletor pode vir seguido de `,` e do escopo.
 */
function block(selector: string): string {
  const starts = [`${selector} {`, `${selector},\n`].map(head => CSS.indexOf(head)).filter(index => index >= 0)
  expect(starts.length, `${selector} block`).toBeGreaterThan(0)
  const start = Math.min(...starts)
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

/**
 * Axe F5 (Gauge 04/11 20:18): os componentes do host pintam texto com a família `--dsw-alias-label-*`. Ela precisa casar com as
 * tintas do Persona, senão o cinza-azulado do DS cai sobre creme/lilás (claro) ou sobre o roxo (escuro) e reprova o contraste.
 */
describe('host label tokens (descrições de Configurações) reach AA on every text surface, light and dark', () => {
  // A regra dos aliases "label" do host mora numa regra própria, MAIS ESPECÍFICA que o `body`/`body[data-ds-dark-theme]` do design-platform.css.
  const aliasStart = CSS.indexOf('html body,\nhtml body[data-ds-dark-theme] {')
  const aliasBlock = CSS.slice(aliasStart, CSS.indexOf('\n}', aliasStart))
  const aliasOf = (name: string): string => new RegExp(String.raw`--${name}:\s*var\(--(persona-[\w-]+)\)`, 'u').exec(aliasBlock)?.[1] ?? ''

  function resolver(source: string): (name: string) => string {
    const defs = new Map<string, string>()
    for (const match of source.matchAll(/--(persona-[\w-]+):\s*([^;]+);/gu)) defs.set(match[1]!, match[2]!.trim())
    const resolve = (name: string, depth = 0): string => {
      const value = defs.get(name) ?? ''
      const ref = /^var\(--(persona-[\w-]+)\)$/u.exec(value)
      return ref !== null && depth < 8 ? resolve(ref[1]!, depth + 1) : value
    }
    return resolve
  }
  const lightResolve = resolver([root, light].join('\n'))
  const darkResolve = resolver([root, block("body[data-ds-dark-theme='true']")].join('\n'))

  it.each([
    ['dsw-alias-label-primary', 'persona-ink'],
    ['dsw-alias-label-secondary', 'persona-ink-soft'],
    ['dsw-alias-label-tertiary', 'persona-ink-soft'],
  ])('%s -> %s', (alias, token) => {
    expect(aliasOf(alias)).toBe(token)
  })

  it.each([['claro', lightResolve], ['escuro', darkResolve]] as const)('terciário do host em %s: >= 4,5:1 em toda superfície de texto', (scheme, resolve) => {
    const ink = resolve(aliasOf('dsw-alias-label-tertiary'))
    expect(ink).toMatch(/^#[0-9a-fA-F]{6}$/u)
    // No claro o trilho é roxo-médio com tinta clara própria (`--persona-rail-ink`): o texto do host não aparece sobre ele.
    for (const surface of TEXT_SURFACES.filter(name => scheme === 'escuro' || name !== 'persona-rail')) {
      const fill = resolve(surface)
      expect(fill, surface).toMatch(/^#[0-9a-fA-F]{6}$/u)
      expect(contrast(ink, fill), `${ink} on ${surface} ${fill}`).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('os aliases "label" do host vencem o design-platform.css nos DOIS temas (axe F5 no bundle 2)', () => {
  it('a regra tem especificidade MAIOR que `body` e que `body[data-ds-dark-theme]` do host', () => {
    expect(CSS).toContain('html body,\nhtml body[data-ds-dark-theme] {')
    // `html body` = (0,0,2) > `body` (0,0,1); `html body[data-ds-dark-theme]` = (0,1,2) > `body[data-ds-dark-theme]` (0,1,1)
    const rule = CSS.slice(CSS.indexOf('html body,\nhtml body[data-ds-dark-theme] {'))
    expect(rule).toContain('--dsw-alias-label-tertiary: var(--persona-ink-soft)')
  })

  it('o `body` simples do bloco de aliases NÃO redefine mais o label (um lugar só, o mais forte)', () => {
    const compat = CSS.slice(CSS.indexOf('Compatibility aliases'), CSS.indexOf('html body,\nhtml body[data-ds-dark-theme] {'))
    expect(compat).not.toContain('--dsw-alias-label-')
  })
})
