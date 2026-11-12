// Faixa da equipe, 2º degrau: a ≤ 100 px por membro (o zoom 200% com 5 pessoas dá ~94 px) o nome do Gestor ficava com reticências porque o ícone do bastão, o nome e o ⋯ não cabiam.
// Guarda do CSS (o layout real é medido em Chrome pela galeria do staging e pela cena `faixa-equipe` do shell real).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const CSS = readFileSync(join(import.meta.dirname, '../src/client/team/TeamChannelStrip.module.css'), 'utf8').replaceAll('\r\n', '\n')

function containerBody(query: string): string {
  const start = CSS.indexOf(`@container ${query} {`)
  if (start < 0) return ''
  const open = CSS.indexOf('{', start)
  let depth = 0
  for (let i = open; i < CSS.length; i++) {
    if (CSS[i] === '{') depth++
    if (CSS[i] === '}' && --depth === 0) return CSS.slice(open + 1, i)
  }
  return ''
}

describe('faixa da equipe: 2º degrau (≤ 100 px por membro)', () => {
  const tier2 = containerBody('persona-member (max-width: 100px)')

  it('existe e vem DEPOIS do degrau de 144 px (a cascata não o desfaz)', () => {
    expect(tier2).not.toBe('')
    expect(CSS.indexOf('@container persona-member (max-width: 100px) {')).toBeGreaterThan(CSS.indexOf('@container persona-member (max-width: 144px) {'))
  })

  it('o ícone do Gestor (decorativo) cede o lugar ao nome; o ⋯ encosta mais e a etiqueta perde 2 px de cada lado', () => {
    expect(tier2).toMatch(/\.gestorIcon\s*\{[^}]*display:\s*none\s*;/u)
    expect(tier2).toMatch(/\.tagMore\s*\{[^}]*margin-left:\s*2px\s*;/u)
    expect(tier2).toMatch(/\.tag\s*\{[^}]*padding-inline:\s*6px\s*;/u)
  })

  it('o ⋯ NUNCA some nem encolhe (é o jeito de abrir o cartão com o mouse; segue com 24 px) e o texto do estado segue só para o leitor de tela (degrau de 144 px)', () => {
    expect(tier2).not.toMatch(/\.tagMore\s*\{[^}]*display:\s*none/u)
    expect(tier2).not.toMatch(/\.tagMore\s*\{[^}]*(width|height):/u)
    expect(containerBody('persona-member (max-width: 144px)')).toMatch(/\.tagStatusText\s*\{[^}]*clip:\s*rect\(0 0 0 0\)/u)
  })
})
