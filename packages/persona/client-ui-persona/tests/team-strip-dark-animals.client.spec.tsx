// @vitest-environment jsdom
// D-103c (Carbon, REVISAO-01 §9.5): "faixa da equipe vazia, sem animais de corpo inteiro, no tema escuro" (captura do bundle 6).
// No app instalado atual a faixa escura mostra os 5 animais (captura 09/11 `accept-installed/39b2b6165b-v11/geral-dark-1440x900.png`);
// este guarda mantém assim: no escuro cada pessoa da equipe tem o seu animal (pose por estado), a faixa não encolhe a ponto de
// cortá-los e nenhuma regra do escuro os esconde (só o banner CLARO some no escuro).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TeamChannelStrip } from '../src/client/team/TeamChannelStrip.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import type { ChannelPersonaMember } from '../src/client/team/persona-work-state.ts'

installPreviewTheme()

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellPt, key, params)) as never
const TEAM: readonly ChannelPersonaMember[] = [
  { id: 'atlas', name: 'Atlas', role: 'Coordenação', state: 'resting' },
  { id: 'bento', name: 'Bento', role: 'Engenharia', state: 'resting' },
  { id: 'nina', name: 'Nina', role: 'Pesquisa', state: 'working' },
  { id: 'sol', name: 'Sol', role: 'Relacionamento', state: 'resting' },
  { id: 'luna', name: 'Luna', role: 'Vigia', state: 'resting' },
]

beforeEach(() => { document.body.setAttribute('data-ds-dark-theme', 'true') })
afterEach(() => {
  cleanup()
  document.body.removeAttribute('data-ds-dark-theme')
})

const css = (name: string): string =>
  readFileSync(join(__dirname, '..', 'src', 'client', 'team', name), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '')

describe('faixa da equipe no tema escuro (D-103c / Carbon §9.5)', () => {
  it('cada pessoa da equipe tem o seu animal de corpo inteiro (uma <img> de pose com src), nunca uma silhueta vazia', () => {
    const { container } = render(<TeamChannelStrip t={t} members={TEAM} />)
    const figures = Array.from(container.querySelectorAll('[data-character]'))
    expect(figures.map(figure => figure.getAttribute('data-character'))).toEqual(['atlas', 'bento', 'nina', 'sol', 'luna'])
    for (const figure of figures) {
      const pose = figure.querySelector('img[data-pose], img')
      expect(pose?.getAttribute('src') ?? '').not.toBe('')
    }
    expect(container.querySelectorAll('[class*="silhouette"]')).toHaveLength(0)
  })

  it('o banner ESCURO é o que aparece no escuro (o claro some) e os animais não ficam atrás de nada que os esconda', () => {
    const strip = css('TeamChannelStrip.module.css')
    expect(strip).toMatch(/body\[data-ds-dark-theme='true'\]\)\s*\.bannerLight\s*\{\s*display:\s*none/u)
    expect(strip).toMatch(/body\[data-ds-dark-theme='true'\]\)\s*\.bannerDark\s*\{\s*display:\s*block/u)
    // nenhuma regra do tema escuro esconde as figuras, o elenco ou as poses
    for (const file of ['TeamChannelStrip.module.css', 'PersonaTeamFigure.module.css']) {
      const darkRules = [...css(file).matchAll(/body\[data-ds-dark-theme='true'\][^{]*\{([^}]*)\}/gu)]
      for (const [selectorAndBody] of darkRules) {
        if (/\.(bannerLight)\b/u.test(selectorAndBody)) continue
        expect(selectorAndBody).not.toMatch(/display:\s*none|visibility:\s*hidden|opacity:\s*0\b/u)
      }
    }
  })

  it('a faixa tem altura mínima que cabe os animais (não encolhe a uma tira só com as etiquetas)', () => {
    const strip = /\.strip\s*\{([^}]*)\}/u.exec(css('TeamChannelStrip.module.css'))?.[1] ?? ''
    const min = /min-height:\s*(\d+)px/u.exec(strip)?.[1]
    expect(Number(min)).toBeGreaterThanOrEqual(240)
  })
})
