// @vitest-environment jsdom
// BR-P6 (Muse 05/11): o ícone "bom-dia" no eyebrow do Bom dia, o spot "bom-dia" à direita do título e o spot "pedido pronto" no cartão de entrega.
// Regras da Muse: o ícone vive sempre AO LADO do texto (nunca sozinho); o spot é decorativo (sem texto alternativo) e só aparece a partir de 960 px.
import { cleanup, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { DailyBriefCard } from '../src/client/chat/DailyBriefCard.tsx'
import { DeliveryCard } from '../src/client/chat/DeliveryCard.tsx'
import type { GeneralChannelViewProps } from '../src/client/chat/GeneralChannelView.tsx'
import { ILLUSTRATIONS, NAV_ICONS } from '../src/client/assets/generated-imports.ts'
import { mapDailyBrief, mapDeliveryCard, type DailyBriefUi, type DeliveryCardUi } from '../src/client/remote/map-host-ui.ts'
import type { DailyBriefWire, DeliveryCardWire, MessageView, TeamView } from '../src/client/remote/persona-remote-types.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as GeneralChannelViewProps['t']
const TEAM = {
  personas: [
    { id: 'persona-atlas', name: 'Atlas', avatarRef: 'atlas', title: 'Coordenação', systemRoles: ['coordination'] },
    { id: 'persona-nina', name: 'Nina', avatarRef: 'nina', title: 'Pesquisa' },
  ],
  members: [],
} as unknown as TeamView

const brief = (): DailyBriefUi => mapDailyBrief({
  dailyBrief: {
    day: '2026-11-05', coordinatorPersonaId: 'persona-atlas',
    yesterday: [{ taskId: 'task-1', personaId: 'persona-nina', title: 'Pesquisa de preços' }],
    today: [{ taskId: 'task-3', personaId: 'persona-nina', title: 'Logo da padaria' }],
    needsYou: { count: 0 }, paused: false, routineId: 'routine-morning',
  } satisfies DailyBriefWire,
} as unknown as MessageView, TEAM)!

const delivery = (): DeliveryCardUi => mapDeliveryCard({
  deliveryCard: {
    requestId: 'req-1', title: 'Campanha de lançamento',
    parts: [{ taskId: 't-1', personaId: 'persona-nina', title: 'Texto' }],
  } satisfies DeliveryCardWire,
} as unknown as MessageView, TEAM)!

const css = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll('\r\n', '\n')

describe('os 12 ícones e os 2 spots do BR-P6 existem no mapa de assets', () => {
  it('o ícone bom-dia está no mapa dos ícones de navegação e os 2 spots estão nas ilustrações', () => {
    expect(NAV_ICONS['bom-dia']).toBeTruthy()
    expect(ILLUSTRATIONS['spot-bom-dia']).toBeTruthy()
    expect(ILLUSTRATIONS['spot-pedido-pronto']).toBeTruthy()
  })
})

describe('Bom dia: ícone ao lado do eyebrow e spot à direita do título', () => {
  it('o ícone "bom-dia" fica no eyebrow, ao lado do texto "Bom dia · {dia}" (nunca sozinho) e é decorativo', () => {
    const { container } = render(<DailyBriefCard t={t} brief={brief()} rowTag="div" />)
    const article = container.querySelector('article')!
    // o Card põe o eyebrow num <p>: o ícone e o texto moram juntos nele
    const eyebrow = [...article.querySelectorAll('p')].find(node => node.textContent?.includes('Bom dia'))!
    expect(eyebrow).toBeTruthy()
    const icon = eyebrow.querySelector<HTMLElement>('[aria-hidden="true"][style*="--persona-icon-url"]')
    expect(icon).toBeTruthy()
    expect(icon!.getAttribute('style')).toContain(NAV_ICONS['bom-dia'])
    expect(eyebrow.textContent).toMatch(/Bom dia · /u)
  })

  it('o spot é a ilustração "spot-bom-dia", decorativo (alt vazio + aria-hidden) e de 48 px', () => {
    const { container } = render(<DailyBriefCard t={t} brief={brief()} rowTag="div" />)
    const spot = container.querySelector<HTMLImageElement>('[data-daily-spot]')!
    expect(spot).toBeTruthy()
    expect(spot.getAttribute('src')).toBe(ILLUSTRATIONS['spot-bom-dia'])
    expect(spot.getAttribute('alt')).toBe('')
    expect(spot.getAttribute('aria-hidden')).toBe('true')
    expect(spot.getAttribute('width')).toBe('48')
    // à direita do título: no grupo das ações do cabeçalho, antes do ⋯ e do recolher
    expect(spot.parentElement?.getAttribute('class')).toContain('headerActions')
  })

  it('o nome acessível do cartão continua só o texto (o ícone e o spot não entram)', () => {
    const { container } = render(<DailyBriefCard t={t} brief={brief()} rowTag="div" />)
    expect(container.querySelector('article')!.getAttribute('aria-label')).toMatch(/^Bom dia · /u)
  })
})

describe('cartão de entrega: o spot "pedido pronto" à direita do título', () => {
  it('é a ilustração "spot-pedido-pronto", decorativa, no cabeçalho ao lado do título "Pronto: {pedido}"', () => {
    const { container } = render(<DeliveryCard t={t} delivery={delivery()} rowTag="div" />)
    const spot = container.querySelector<HTMLImageElement>('[data-delivery-spot]')!
    expect(spot).toBeTruthy()
    expect(spot.getAttribute('src')).toBe(ILLUSTRATIONS['spot-pedido-pronto'])
    expect(spot.getAttribute('alt')).toBe('')
    expect(spot.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('article')!.getAttribute('aria-label')).toBe('Pronto: Campanha de lançamento')
  })
})

describe('o spot só aparece a partir de 960 px', () => {
  it('Bom dia: escondido por padrão e mostrado só em (min-width: 960px)', () => {
    const source = css('../src/client/chat/DailyBriefCard.module.css')
    expect(source).toMatch(/\.spot \{\n  display: none;/u)
    expect(source).toMatch(/@media \(min-width: 960px\) \{\n  \.spot \{\n    display: block;/u)
  })

  it('entrega: escondido por padrão e mostrado só em (min-width: 960px)', () => {
    const source = css('../src/client/chat/DeliveryCard.module.css')
    expect(source).toMatch(/\.spot \{\n  display: none;/u)
    expect(source).toMatch(/@media \(min-width: 960px\) \{\n  \.spot \{\n    display: block;/u)
  })
})
