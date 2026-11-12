// Carbon, 2ª leitura (teste-pipeline.md, itens 2 e 4): a faixa "Sua equipe neste canal" se organiza pela LARGURA QUE O CANAL lhe dá (container), não pela
// janela; o corpo do bicho nunca passa da caixa do membro; o selo/overlay nunca sai da pose (a faixa corta o que sai); o ponto de "Esperando você" tem tinta escura.
// Guardas do CSS (o layout real é medido em Chrome pela rodada de capturas do shell real).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (file: string): string => readFileSync(join(import.meta.dirname, '../src/client/team', file), 'utf8').replaceAll('\r\n', '\n')
const STRIP = read('TeamChannelStrip.module.css')
const FIGURE = read('PersonaTeamFigure.module.css')

/** The body of the first block that starts with `header` (up to its matching brace), or ''. */
function block(css: string, header: string): string {
  const start = css.indexOf(header)
  if (start < 0) return ''
  const open = css.indexOf('{', start)
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i)
  }
  return ''
}

describe('a faixa é um container pela largura do canal', () => {
  it('o invólucro declara `persona-strip / inline-size`', () => {
    expect(block(STRIP, '.host')).toMatch(/container:\s*persona-strip\s*\/\s*inline-size\s*;/u)
  })

  it('abaixo de 980 px de largura útil a faixa vira 1 coluna (o título deixa de ter os 220 px fixos)', () => {
    const narrow = block(STRIP, '@container persona-strip (max-width: 980px)')
    expect(narrow).toMatch(/\.strip\s*\{[^}]*grid-template-columns:\s*1fr\s*;/u)
    expect(narrow).toMatch(/\.title\s*\{[^}]*max-width:\s*none\s*;/u)
  })

  it('o colapso NÃO depende mais da janela: nenhuma `@media (max-width: 1180px)` mexe em `.strip`', () => {
    expect(block(STRIP, '@media (max-width: 1180px)')).not.toMatch(/\.strip\b/u)
  })
})

describe('o bicho e o selo cabem na caixa do membro', () => {
  it('a pose (base, piscar, rabo e a que sai) tem `max-width: 100%`, nunca 210 px fixos', () => {
    expect(FIGURE).not.toMatch(/max-width:\s*210px/u)
    expect(block(FIGURE, '.poseBase,')).toMatch(/max-width:\s*100%\s*;/u)
    expect(block(FIGURE, '.poseLeaving')).toMatch(/max-width:\s*100%\s*;/u)
  })

  it('com a caixa do membro em 130 px ou menos a figura baixa para 136 px', () => {
    expect(block(FIGURE, '@container persona-member (max-width: 130px)')).toMatch(/\.figure\s*\{[^}]*--figure-h:\s*136px\s*;/u)
  })

  it('o overlay de estado fica DENTRO da pose (2 px), nunca para fora: a faixa corta o que sai', () => {
    const overlay = block(FIGURE, '.overlay {')
    expect(overlay).toMatch(/top:\s*2px\s*;/u)
    expect(overlay).toMatch(/right:\s*2px\s*;/u)
  })
})

describe('GPU (DESIGN-01-MUSE §2.7): sem blur contínuo e a pausa tripla também para os assentos', () => {
  it('a sombra de contato do chão é um degradê radial dentro da caixa, nunca `filter: blur`', () => {
    const shadow = block(STRIP, '.member::before')
    expect(shadow).toMatch(/background:\s*radial-gradient\(50%\s+50%\s+at\s+50%\s+50%,\s*var\(--persona-scene-shadow\)\s+0%,\s*transparent\s+100%\)\s*;/u)
    expect(shadow).not.toMatch(/filter\s*:/u)
    expect(STRIP).not.toMatch(/filter:\s*blur/u)
  })

  it('os assentos pausam com o atributo da faixa E com o atributo único `data-persona-ambient-paused`', () => {
    const header = STRIP.slice(STRIP.indexOf(':global([data-ambient-paused]) .seat'))
    expect(header).toMatch(/^:global\(\[data-ambient-paused\]\) \.seat,\s*:global\(\[data-persona-ambient-paused\]\) \.seat\s*\{\s*animation-play-state:\s*paused;/u)
  })
})

describe('o ponto de "Esperando você" sobre o âmbar', () => {
  it('usa a tinta escura (nunca âmbar sobre âmbar nem branco)', () => {
    expect(STRIP).toMatch(/\.member\[data-persona-state='waiting'\]\s+\.statusDot\s*\{[^}]*background:\s*var\(--persona-accent-ink\)\s*;/u)
  })
})
