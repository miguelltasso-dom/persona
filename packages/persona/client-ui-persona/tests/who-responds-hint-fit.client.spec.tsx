// @vitest-environment jsdom
// Muse (04/11, captura a 200%): a dica de 1ª vez "A Coordenação distribui o pedido" saía cortada pela borda direita.
// O balão fica dentro da janela (desloca para a esquerda) e a seta continua apontando para o centro do seletor.
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChannelComposer, WHO_RESPONDS_HINT_KEY } from '../src/client/chat/ChannelComposer.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import type { ChannelPersonaMember } from '../src/client/team/persona-work-state.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

const t = (key: string) => chatPt[key as keyof typeof chatPt] ?? key
const MEMBERS: readonly ChannelPersonaMember[] = [
  { id: 'atlas', name: 'Atlas', role: 'Coordenação', state: 'working', systemRoles: ['coordination'] },
  { id: 'nina', name: 'Nina', role: 'Pesquisa', state: 'waiting' },
]

let naturalLeft = 440
const BALLOON_WIDTH = 300
const SELECTOR_WIDTH = 200

beforeEach(() => {
  localStorage.removeItem(WHO_RESPONDS_HINT_KEY)
  vi.stubGlobal('innerWidth', 640)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => SELECTOR_WIDTH)
  // o navegador reporta o balão já deslocado pela variável CSS; o componente desconta o deslocamento anterior
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const shift = Number.parseFloat(this.style.getPropertyValue('--who-responds-shift') || '0')
    const left = naturalLeft + shift
    return { left, right: left + BALLOON_WIDTH, top: 0, bottom: 0, width: BALLOON_WIDTH, height: 0, x: left, y: 0, toJSON: () => ({}) }
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const balloon = (): HTMLElement => screen.getByRole('dialog', { name: chatPt['composer.whoRespondsHintTitle'] })
const cssVar = (name: string): number => Number.parseFloat(balloon().style.getPropertyValue(name))

describe('dica "Quem responde" dentro da janela', () => {
  it('passa da borda direita: desloca para a esquerda até caber, com 12 px de respiro', () => {
    naturalLeft = 440 // 440 + 300 = 740 > 640 - 12
    render(<ChannelComposer t={t} members={MEMBERS} />)
    // 740 - (640 - 12) = 112 para a esquerda
    expect(cssVar('--who-responds-shift')).toBe(-112)
  })

  it('a seta continua no centro do seletor: acompanha o deslocamento', () => {
    naturalLeft = 440
    render(<ChannelComposer t={t} members={MEMBERS} />)
    // centro do seletor (200 / 2 - 8 = 92) + o deslocamento (112) = 204, dentro do balão (300 - 28)
    expect(cssVar('--who-responds-arrow-left')).toBe(204)
  })

  it('já cabe: sem deslocamento e a seta no centro do seletor', () => {
    naturalLeft = 100
    render(<ChannelComposer t={t} members={MEMBERS} />)
    expect(cssVar('--who-responds-shift')).toBe(0)
    expect(cssVar('--who-responds-arrow-left')).toBe(92)
  })

  it('colado na borda esquerda: também respeita os 12 px de respiro', () => {
    vi.stubGlobal('innerWidth', 1000)
    naturalLeft = 5
    render(<ChannelComposer t={t} members={MEMBERS} />)
    expect(cssVar('--who-responds-shift')).toBe(7)
  })

  it('ao redimensionar a janela o balão se ajusta de novo, sem acumular deslocamento', () => {
    naturalLeft = 440
    render(<ChannelComposer t={t} members={MEMBERS} />)
    expect(cssVar('--who-responds-shift')).toBe(-112)
    act(() => { window.dispatchEvent(new Event('resize')) })
    expect(cssVar('--who-responds-shift')).toBe(-112)
    vi.stubGlobal('innerWidth', 1200)
    act(() => { window.dispatchEvent(new Event('resize')) })
    expect(cssVar('--who-responds-shift')).toBe(0)
  })

  it('a seta nunca sai do balão (limite de 28 px antes da borda direita)', () => {
    naturalLeft = 600
    render(<ChannelComposer t={t} members={MEMBERS} />)
    expect(cssVar('--who-responds-arrow-left')).toBeLessThanOrEqual(BALLOON_WIDTH - 28)
    expect(cssVar('--who-responds-arrow-left')).toBeGreaterThanOrEqual(12)
  })
})
