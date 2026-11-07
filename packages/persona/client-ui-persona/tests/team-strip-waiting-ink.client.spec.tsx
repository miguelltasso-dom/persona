// Faixa da equipe, TINTA DO ÂMBAR: no tema ESCURO o nome e o ⋯ de quem está "Aguardando você" ficavam em creme (--persona-ink = #f6eee0) sobre o âmbar da etiqueta (--persona-amber-400 =
// #e8af54): 1,7:1, abaixo dos 4,5:1 do texto (axe color-contrast, serious; achado no staging do modo estreito, onde a sombra do chão não atrapalha o cálculo). O estado em texto já usava
// --persona-accent-ink; o nome e o ⋯ passam a usar a mesma tinta. Guarda do CSS + a conta dos contrastes a partir da paleta de verdade (o axe em Chrome real é a prova da galeria).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const CSS = readFileSync(join(import.meta.dirname, '../src/client/team/TeamChannelStrip.module.css'), 'utf8').replaceAll('\r\n', '\n')
// No staging a paleta não existe ao lado; cai no tree de verdade (no tree, o caminho relativo é o que vale).
const paletteLocal = join(import.meta.dirname, '../src/client/theme/persona-palette.css')
const PALETTE = readFileSync(existsSync(paletteLocal) ? paletteLocal : 'C:/Users/migue/dev/persona/packages/persona/client-ui-persona/src/client/theme/persona-palette.css', 'utf8').replaceAll('\r\n', '\n')

/** O valor `#rrggbb` de um token da paleta (a primeira definição). */
function token(name: string): string {
  const match = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`, 'u').exec(PALETTE)
  if (match === null) throw new Error(`token ${name} não encontrado`)
  return match[1]!
}

function luminance(hex: string): number {
  const channel = (offset: number): number => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

/** Corpo da regra cujo seletor (ou lista de seletores) começa por `selector` no começo da linha. */
function rule(selector: string): string {
  const start = CSS.indexOf(`\n${selector}`)
  if (start < 0) return ''
  const open = CSS.indexOf('{', start)
  return CSS.slice(open + 1, CSS.indexOf('}', open))
}

describe('faixa da equipe: a etiqueta de quem espera você é legível nos dois temas', () => {
  const amber = token('--persona-amber-400')
  const accentInk = token('--persona-accent-ink')
  const darkThemeInk = '#f6eee0'

  it('a conta: a tinta do âmbar passa dos 4,5:1 sobre o âmbar; o creme do tema escuro NÃO passava (1,7:1)', () => {
    expect(contrast(accentInk, amber)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token('--persona-ink'), amber)).toBeGreaterThanOrEqual(4.5) // o claro (a tinta é a mesma ameixa)
    expect(contrast(darkThemeInk, amber)).toBeLessThan(2) // o defeito que o conserto tira
  })

  it('o nome e o ⋯ de quem espera usam a tinta do âmbar (como o estado em texto já usava)', () => {
    const waiting = rule(".member[data-state='waiting'] .tagName,")
    expect(waiting).toMatch(/color:\s*var\(--persona-accent-ink\)\s*;/u)
    expect(CSS).toMatch(/\.member\[data-state='waiting'\] \.tagName,\s*\.member\[data-state='waiting'\] \.tagMore\s*\{/u)
    expect(rule(".member[data-state='waiting'] .tagStatus {")).toMatch(/color:\s*var\(--persona-accent-ink\)\s*;/u)
  })

  it('o ⋯ de quem espera tem hover/aberto coerentes (escuro sobre o âmbar, nunca o fundo claro do tema escuro)', () => {
    expect(CSS).toMatch(/\.member\[data-state='waiting'\] \.tagMore:hover,\s*\.member\[data-state='waiting'\] \.tagMore\[aria-expanded='true'\]\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--persona-accent-ink\) 14%, transparent\)\s*;[^}]*color:\s*var\(--persona-accent-ink\)\s*;/u)
  })
})
