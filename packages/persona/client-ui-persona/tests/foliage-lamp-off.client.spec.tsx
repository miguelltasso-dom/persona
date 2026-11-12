// @vitest-environment jsdom
// Momento uau 5 (DESIGN-01 §4, Muse 11/11 16:05): no escuro, ao abrir o app, a folhagem do rail entra com a luminária APAGADA e faz um
// único crossfade (420 ms, --ease-glow in-out simétrica, só opacity, 1 iteração) para a acesa; depois a apagada sai do DOM. Reduced-motion e o claro: já nasce aceso.
// Só conta como "abrir" com a pessoa olhando o rail (sem o onboarding por cima); a vez só se gasta quando o crossfade termina.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ILLUSTRATIONS } from '../src/client/assets/generated-imports.ts'
import { FoliageLampOff, LAMP_ON_MS, resetFoliageLampSwitchForTest } from '../src/client/shell/FoliageLampOff.tsx'

const CSS = readFileSync(join(import.meta.dirname, '../src/client/shell/PersonaSidebar.module.css'), 'utf8').replaceAll('\r\n', '\n')
const SIDEBAR = readFileSync(join(import.meta.dirname, '../src/client/shell/PersonaSidebar.tsx'), 'utf8').replaceAll('\r\n', '\n')

const OFF = '[data-persona-foliage-dark-off]'

function setReducedMotion(reduce: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: reduce && query.includes('prefers-reduced-motion'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }),
  })
}

/** O fim da animação: o jsdom faz o React escutar `webkitAnimationEnd` (o Chrome real escuta `animationend`); manda os dois, só um chega. */
function endAnimation(element: HTMLElement): void {
  fireEvent.animationEnd(element)
  fireEvent(element, new Event('webkitAnimationEnd', { bubbles: true }))
}

beforeEach(() => {
  vi.useFakeTimers()
  resetFoliageLampSwitchForTest()
  document.body.setAttribute('data-ds-dark-theme', 'true')
  setReducedMotion(false)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  document.body.removeAttribute('data-ds-dark-theme')
  document.body.removeAttribute('data-persona-covered')
  document.body.removeAttribute('data-persona-ambient-paused')
})

describe('a luminária que acende ao abrir (uau 5)', () => {
  it('a arte da luminária apagada existe no inventário (a mesma da acesa)', () => {
    expect(ILLUSTRATIONS['rail-foliage-dark-off']).toBeDefined()
    expect(ILLUSTRATIONS['rail-foliage-dark']).toBeDefined()
  })

  it('no escuro, ao abrir com a pessoa olhando o rail: a folhagem apagada entra (decorativa, sem alt)', () => {
    const { container } = render(<FoliageLampOff armed />)
    const off = container.querySelector(OFF) as HTMLImageElement
    expect(off).not.toBeNull()
    expect(off.getAttribute('alt')).toBe('')
    expect(off.getAttribute('src')).toBe(ILLUSTRATIONS['rail-foliage-dark-off'])
  })

  it('quando o crossfade termina, a apagada SAI do DOM e fica parada', () => {
    const { container } = render(<FoliageLampOff armed />)
    endAnimation(container.querySelector(OFF) as HTMLElement)
    expect(container.querySelector(OFF)).toBeNull()
  })

  it('se o animationend nunca vier (janela em segundo plano pausa a animação), um prazo tira a imagem do mesmo jeito', () => {
    const { container } = render(<FoliageLampOff armed />)
    expect(container.querySelector(OFF)).not.toBeNull()
    act(() => { vi.advanceTimersByTime(LAMP_ON_MS + 200) })
    expect(container.querySelector(OFF)).toBeNull()
  })

  it('UMA vez por abertura: depois de acender, remontar o rail (recolher, trocar de tela) não reacende', () => {
    const first = render(<FoliageLampOff armed />)
    endAnimation(first.container.querySelector(OFF) as HTMLElement)
    first.unmount()
    expect(render(<FoliageLampOff armed />).container.querySelector(OFF)).toBeNull()
  })

  it('uma montagem que ninguém viu (o rail monta mais de uma vez no boot e sob o onboarding) NÃO gasta a vez: a próxima ainda acende', () => {
    const throwaway = render(<FoliageLampOff armed />)
    expect(throwaway.container.querySelector(OFF)).not.toBeNull()
    throwaway.unmount() // desmontou no meio do crossfade
    expect(render(<FoliageLampOff armed />).container.querySelector(OFF)).not.toBeNull()
  })

  it('com o onboarding por cima (não armado) nada entra e a vez fica guardada; ao fechar, acende (1º uso: acende ao entrar no #geral)', () => {
    const { container, rerender } = render(<FoliageLampOff armed={false} />)
    expect(container.querySelector(OFF)).toBeNull()
    act(() => { vi.advanceTimersByTime(5_000) })
    expect(container.querySelector(OFF)).toBeNull()
    rerender(<FoliageLampOff armed />)
    expect(container.querySelector(OFF)).not.toBeNull()
    endAnimation(container.querySelector(OFF) as HTMLElement)
    expect(container.querySelector(OFF)).toBeNull()
  })

  it('com um scrim por cima (data-persona-covered, que sai até 1 s depois do onboarding fechar) a folhagem espera descobrir: sem isso a animação nasce congelada', async () => {
    document.body.setAttribute('data-persona-covered', '')
    const { container } = render(<FoliageLampOff armed />)
    expect(container.querySelector(OFF)).toBeNull()
    act(() => { vi.advanceTimersByTime(5_000) })
    expect(container.querySelector(OFF)).toBeNull()
    document.body.removeAttribute('data-persona-covered')
    await act(async () => { await Promise.resolve() })
    expect(container.querySelector(OFF)).not.toBeNull()
    endAnimation(container.querySelector(OFF) as HTMLElement)
    expect(container.querySelector(OFF)).toBeNull()
  })

  it('janela sem foco ou ociosa (data-persona-ambient-paused): não acende para ninguém ver; ao voltar, acende', async () => {
    document.body.setAttribute('data-persona-ambient-paused', '')
    const { container } = render(<FoliageLampOff armed />)
    expect(container.querySelector(OFF)).toBeNull()
    document.body.removeAttribute('data-persona-ambient-paused')
    await act(async () => { await Promise.resolve() })
    expect(container.querySelector(OFF)).not.toBeNull()
  })

  it('o prazo de segurança só corre com a animação livre: pausada no meio, a imagem não é tirada (retoma de onde parou) e o prazo recomeça', async () => {
    const { container } = render(<FoliageLampOff armed />)
    expect(container.querySelector(OFF)).not.toBeNull()
    act(() => { vi.advanceTimersByTime(200) })
    document.body.setAttribute('data-persona-ambient-paused', '')
    await act(async () => { await Promise.resolve() })
    act(() => { vi.advanceTimersByTime(10_000) })
    expect(container.querySelector(OFF)).not.toBeNull()
    document.body.removeAttribute('data-persona-ambient-paused')
    await act(async () => { await Promise.resolve() })
    act(() => { vi.advanceTimersByTime(LAMP_ON_MS + 200) })
    expect(container.querySelector(OFF)).toBeNull()
  })

  it('no claro não há luminária para acender: nada entra, e a vez da abertura se gasta (trocar para o escuro depois não acende)', () => {
    document.body.removeAttribute('data-ds-dark-theme')
    const light = render(<FoliageLampOff armed />)
    expect(light.container.querySelector(OFF)).toBeNull()
    light.unmount()
    document.body.setAttribute('data-ds-dark-theme', 'true')
    expect(render(<FoliageLampOff armed />).container.querySelector(OFF)).toBeNull()
  })

  it('reduced-motion: já entra aceso, sem crossfade (a apagada nem é montada)', () => {
    setReducedMotion(true)
    const { container } = render(<FoliageLampOff armed />)
    expect(container.querySelector(OFF)).toBeNull()
  })

  it('no rail: a apagada fica DENTRO da folhagem, depois da acesa (por cima) e antes do halo (a luz da luminária continua acima), armada pelo onboarding', () => {
    const lit = SIDEBAR.indexOf('data-persona-foliage-dark=""')
    const off = SIDEBAR.indexOf('<FoliageLampOff armed={!shell.onboardingOpen} />')
    const halo = SIDEBAR.indexOf('<FoliageLampHalo />')
    expect(lit).toBeGreaterThan(0)
    expect(off).toBeGreaterThan(lit)
    expect(halo).toBeGreaterThan(off)
  })
})

describe('o CSS do acender: só opacity, 420 ms, uma vez, e quieto depois', () => {
  const block = (selector: string): string => {
    const start = CSS.indexOf(selector)
    return start < 0 ? '' : CSS.slice(CSS.indexOf('{', start) + 1, CSS.indexOf('}', start))
  }

  it('o número do CSS é o mesmo da duração exportada', () => {
    expect(LAMP_ON_MS).toBe(420)
    expect(block(":global(body[data-ds-dark-theme='true']) .foliageDarkOff {")).toMatch(/animation:\s*lampSwitchOn 420ms var\(--ease-glow\) 1 forwards\s*;/u)
  })

  it('a curva é a simétrica da luz que esquenta (--ease-glow, in-out): nada de --ease-enter, que estalava a luz nos primeiros 100 ms', () => {
    const palette = readFileSync(join(import.meta.dirname, '../src/client/theme/persona-palette.css'), 'utf8')
    expect(palette).toMatch(/--ease-glow:\s*cubic-bezier\(0\.45,\s*0,\s*0\.55,\s*1\)\s*;/u)
    expect(block(":global(body[data-ds-dark-theme='true']) .foliageDarkOff {")).not.toMatch(/--ease-enter/u)
  })

  it('o halo sobe com a MESMA duração e a MESMA curva da luminária (a luz em volta nunca chega antes da luz: aos 210 ms os dois valem 0,5)', () => {
    const halo = block(":global(body[data-ds-dark-theme='true']) .foliage:has([data-persona-foliage-dark-off]) .halo:not([hidden]) {")
    expect(halo).toMatch(/animation:\s*haloLightUp 420ms var\(--ease-glow\) 1 forwards\s*;/u)
    const lamp = block(":global(body[data-ds-dark-theme='true']) .foliageDarkOff {").match(/animation:\s*lampSwitchOn (\S+) (var\(--[a-z-]+\))/u)
    const sync = halo.match(/animation:\s*haloLightUp (\S+) (var\(--[a-z-]+\))/u)
    expect(lamp?.slice(1)).toEqual(sync?.slice(1))
  })

  it('a apagada só aparece no escuro; no claro é display none', () => {
    expect(block('.foliageDarkOff {')).toMatch(/display:\s*none\s*;/u)
    expect(block(":global(body[data-ds-dark-theme='true']) .foliageDarkOff {")).toMatch(/display:\s*block\s*;/u)
  })

  it('o keyframe anima SÓ opacity (nada de transform, filter nem blur) e nunca é infinito', () => {
    const keyframes = CSS.slice(CSS.indexOf('@keyframes lampSwitchOn'), CSS.indexOf('@media (prefers-reduced-motion: reduce)', CSS.indexOf('@keyframes lampSwitchOn')))
    expect(keyframes).toMatch(/opacity:\s*1/u)
    expect(keyframes).toMatch(/opacity:\s*0/u)
    expect(keyframes).not.toMatch(/transform|filter|blur|scale|translate/u)
    expect(block(":global(body[data-ds-dark-theme='true']) .foliageDarkOff {")).not.toMatch(/infinite/u)
  })

  it('reduced-motion: sem animação e sem a imagem', () => {
    const start = CSS.indexOf('@media (prefers-reduced-motion: reduce) {\n  :global(body[data-ds-dark-theme=\'true\']) .foliageDarkOff')
    expect(start).toBeGreaterThan(0)
    const reduced = CSS.slice(start, start + 220)
    expect(reduced).toMatch(/display:\s*none\s*;/u)
    expect(reduced).toMatch(/animation:\s*none\s*;/u)
  })
})
