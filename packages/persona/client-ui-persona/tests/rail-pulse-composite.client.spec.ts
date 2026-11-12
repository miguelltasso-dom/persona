// Keel 11/11 16:55: o pulso do selo de presença (persona-rail-pulse) animava `box-shadow` (repaint a cada quadro). Agora é um disco num
// pseudo-elemento atrás do selo, só `transform` + `opacity` (composite), e só pulsa quando a pessoa está "Esperando você" (waiting).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const CSS = readFileSync(join(import.meta.dirname, '../src/client/shell/RailTeam.module.css'), 'utf8').replaceAll('\r\n', '\n')

/** The body of the first rule whose selector (text before `{`) is exactly `selector`; '' when there is none. */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.[\]()*+?^$|\\]/gu, '\\$&')
  const match = new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`, 'u').exec(CSS)
  return match?.[2] ?? ''
}

/** Every rule (outside @keyframes) that sets `animation:` with the pulse, with its selector. */
function pulseUsers(): string[] {
  const outsideKeyframes = CSS.replace(/@keyframes[^{]+\{(?:[^{}]|\{[^}]*\})*\}/gu, '')
  return [...outsideKeyframes.matchAll(/([^{}]+)\{([^}]*)\}/gu)]
    .filter(([, , body]) => /animation:[^;]*persona-rail-pulse/u.test(body ?? ''))
    .map(([, selector]) => (selector ?? '').trim().split('\n').at(-1)?.trim() ?? '')
}

describe('o pulso do selo de presença do rail', () => {
  const keyframes = (/@keyframes persona-rail-pulse\s*\{((?:[^{}]|\{[^}]*\})*)\}/u.exec(CSS))?.[1] ?? ''

  it('o keyframe anima SÓ transform e opacity (nada de box-shadow, filter, width, background…): composite-only', () => {
    expect(keyframes).not.toBe('')
    const properties = new Set([...keyframes.matchAll(/([a-z-]+)\s*:/gu)].map(([, name]) => name))
    expect([...properties].sort()).toEqual(['opacity', 'transform'])
    expect(keyframes).not.toMatch(/box-shadow|filter|blur|outline|border/u)
  })

  it('o disco do anel é um pseudo-elemento do avatar atrás do selo, do tamanho do selo e nos mesmos deslocamentos', () => {
    const disc = ruleBody(".row[data-state='waiting'] .avatar::before")
    expect(disc).toMatch(/content:\s*''/u)
    expect(disc).toMatch(/position:\s*absolute/u)
    expect(disc).toMatch(/right:\s*-5px/u)
    expect(disc).toMatch(/bottom:\s*-5px/u)
    expect(disc).toMatch(/width:\s*19px/u)
    expect(disc).toMatch(/height:\s*19px/u)
    expect(disc).toMatch(/pointer-events:\s*none/u)
    expect(disc).toMatch(/animation:\s*persona-rail-pulse 2\.4s ease-in-out infinite/u)
    // O selo em si não anima mais (era ele que escalava e projetava a sombra).
    expect(ruleBody(".seal[data-state='waiting']")).not.toMatch(/animation|box-shadow/u)
  })

  it('só o estado "Esperando você" (waiting) pulsa: nenhum outro estado e nenhum seletor solto usa a animação', () => {
    expect(pulseUsers()).toEqual([".row[data-state='waiting'] .avatar::before"])
  })

  it('o rail denso de avatares (selo de 17 px) leva o disco junto; reduced-motion: sem animação e sem anel', () => {
    expect(CSS).toMatch(/\.group\[data-density='avatars'\]:not\(\[data-collapsed\]\) \.row\[data-state='waiting'\] \.avatar::before\s*\{\s*width:\s*17px;\s*height:\s*17px;/u)
    const reduced = CSS.slice(CSS.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduced).toMatch(/\.row\[data-state='waiting'\] \.avatar::before\s*\{\s*animation:\s*none;\s*opacity:\s*0;/u)
  })
})
