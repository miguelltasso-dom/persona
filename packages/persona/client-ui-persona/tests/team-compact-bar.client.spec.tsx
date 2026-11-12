// @vitest-environment jsdom
// DESIGN-01-MUSE cena 02 / §5.2 #01: a faixa "Sua equipe neste canal" recolhe numa barra de 56 px QUANDO A PESSOA ROLA o fio (não por contagem
// de mensagens), volta ao rolar até o topo ou com "Mostrar a equipe", e uma mensagem nova NUNCA a reabre. A pílula de rostos do cabeçalho
// só aparece quando a faixa grande não está à vista.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GeneralChannelView, type GeneralChannelViewProps } from '../src/client/chat/GeneralChannelView.tsx'
import { NAV_PLACES_FLAG_KEY } from '../src/client/shell/nav-flag.ts'
import { COMPACT_BAR_HEIGHT, isStageScrolledAway, showStageBehavior } from '../src/client/team/stage-collapse.ts'
import type { ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'
import type { ChannelPersonaMember } from '../src/client/team/persona-work-state.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as GeneralChannelViewProps['t']
const shellT = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellPt, key, params)) as GeneralChannelViewProps['shellT']

const scrollTo = vi.fn()
let stripBottom = 300

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(NAV_PLACES_FLAG_KEY, '1')
  scrollTo.mockClear()
  stripBottom = 300
  HTMLElement.prototype.scrollTo = scrollTo as never
  // jsdom has no layout: the big strip's bottom edge is whatever the test says, the scroll area's top is 0.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const bottom = this.hasAttribute('data-persona-stage') ? stripBottom : 0
    return { x: 0, y: 0, top: 0, left: 0, right: 0, width: 0, height: 0, bottom, toJSON: () => ({}) }
  })
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

const member = (id: string, name: string, state: ChannelPersonaMember['state'] = 'resting', over: Partial<ChannelPersonaMember> = {}): ChannelPersonaMember =>
  ({ id: id as never, name, role: 'Função', state, ...over })
const TEAM = [member('atlas', 'Atlas'), member('bento', 'Bento'), member('nina', 'Nina'), member('sol', 'Sol'), member('luna', 'Luna')]
const message = (index: number): ChannelMessageUi => ({ id: `m${String(index)}`, authorId: 'nina', authorName: 'Nina', body: `Mensagem ${String(index)}`, timeLabel: '10:00', reactions: [] })

function channel(extra: Partial<GeneralChannelViewProps> = {}) {
  return render(<GeneralChannelView t={t} shellT={shellT} members={TEAM} messages={[]} {...extra} />)
}

const region = (): HTMLElement => screen.getByRole('region', { name: chatPt['header.channelGeneral'] })
const bar = (): HTMLElement => document.querySelector('[data-persona-stage-bar]') as HTMLElement
const headerFaces = (): HTMLElement | null => document.querySelector('header ul[aria-label]')
const scrollTheThread = (bottom: number): void => {
  stripBottom = bottom
  fireEvent.scroll(region())
}

describe('o gatilho é a rolagem do fio', () => {
  it('a faixa fica recolhida só quando menos que a altura da barra dela ainda aparece', () => {
    expect(COMPACT_BAR_HEIGHT).toBe(56)
    expect(isStageScrolledAway(COMPACT_BAR_HEIGHT + 1)).toBe(false)
    expect(isStageScrolledAway(COMPACT_BAR_HEIGHT)).toBe(true)
    expect(isStageScrolledAway(-40)).toBe(true)
  })

  it('"Mostrar a equipe" rola até o topo: sem animação quando o movimento está reduzido', () => {
    expect(showStageBehavior(true)).toBe('auto')
    expect(showStageBehavior(false)).toBe('smooth')
  })

  it('no topo: a faixa grande está à vista, a barra está escondida e a pílula do cabeçalho não existe', () => {
    channel({ messages: [message(1)] })
    expect(bar().hidden).toBe(true)
    expect(headerFaces()).toBeNull()
  })

  it('50 mensagens e ninguém rolou: continua igual (a contagem de mensagens NÃO recolhe a faixa)', () => {
    channel({ messages: Array.from({ length: 50 }, (_, index) => message(index)) })
    expect(bar().hidden).toBe(true)
    expect(headerFaces()).toBeNull()
  })

  it('ao rolar o fio para baixo: a barra de 56 px aparece com os 5 rostos, e a pílula do cabeçalho continua NÃO existindo (Muse: os mesmos rostos duplicariam)', () => {
    channel({ messages: [message(1)] })
    scrollTheThread(-120)
    expect(bar().hidden).toBe(false)
    expect(within(bar()).getAllByRole('listitem')).toHaveLength(5)
    expect(headerFaces()).toBeNull()
  })

  it('cada rosto da barra leva o ponto de estado e o nome + estado no nome acessível', () => {
    channel({ members: [member('nina', 'Nina', 'working'), member('atlas', 'Atlas')], messages: [message(1)] })
    scrollTheThread(-120)
    const items = within(bar()).getAllByRole('listitem')
    expect(items[0]?.getAttribute('data-persona-state')).toBe('working')
    expect(items[0]?.querySelector('[data-persona-state]')?.getAttribute('data-persona-state')).toBe('working')
    expect(within(bar()).getByLabelText(`Nina · ${shellPt['team.statusWorking']}`)).toBeTruthy()
    expect(within(bar()).getByLabelText(`Atlas · ${shellPt['team.statusAvailable']}`)).toBeTruthy()
  })

  it('de volta ao topo: a barra some e a faixa grande volta', () => {
    channel({ messages: [message(1)] })
    scrollTheThread(-120)
    expect(bar().hidden).toBe(false)
    scrollTheThread(300)
    expect(bar().hidden).toBe(true)
    expect(headerFaces()).toBeNull()
  })

  it('uma mensagem nova NUNCA reabre a faixa: a barra segue recolhida', () => {
    const view = channel({ messages: [message(1)] })
    scrollTheThread(-120)
    view.rerender(<GeneralChannelView t={t} shellT={shellT} members={TEAM} messages={[message(1), message(2), message(3)]} />)
    expect(bar().hidden).toBe(false)
  })

  it('"Mostrar a equipe" leva o fio ao topo, onde a faixa grande está', () => {
    channel({ messages: [message(1)] })
    scrollTheThread(-120)
    fireEvent.click(within(bar()).getByRole('button', { name: shellPt['team.showStage'] }))
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }))
  })

  it('a pílula viva diz quem trabalha e em quê estado, em palavras do vocabulário único', () => {
    channel({ members: [member('atlas', 'Atlas'), member('nina', 'Nina', 'working')], messages: [message(1)] })
    scrollTheThread(-120)
    expect(within(bar()).getByText(`Nina · ${shellPt['team.statusWorking']}`)).toBeTruthy()
  })

  it('sem equipe nada recolhe: não há barra para mostrar', () => {
    channel({ members: [], messages: [message(1)] })
    scrollTheThread(-120)
    expect(document.querySelector('[data-persona-stage-bar]')).toBeNull()
  })
})

describe('a barra no CSS', () => {
  const CSS = readFileSync(join(import.meta.dirname, '../src/client/team/TeamCompactBar.module.css'), 'utf8').replaceAll('\r\n', '\n')

  it('56 px de altura, flutuando num dock de altura 0 (nada abaixo dela pula quando a faixa sai)', () => {
    expect(/^\.bar\s*\{([^}]*)\}/mu.exec(CSS)?.[1] ?? '').toMatch(/height:\s*56px\s*;/u)
    expect(/^\.dock\s*\{([^}]*)\}/mu.exec(CSS)?.[1] ?? '').toMatch(/position:\s*sticky\s*;[\s\S]*height:\s*0\s*;/u)
  })

  it('220 ms só de transform; em movimento reduzido, corte seco', () => {
    expect(/^\.bar\s*\{([^}]*)\}/mu.exec(CSS)?.[1] ?? '').toMatch(/animation:\s*barIn\s+var\(--motion-base\)/u)
    expect(CSS).toMatch(/@keyframes barIn\s*\{\s*from\s*\{\s*transform:[^}]*\}\s*to\s*\{\s*transform:[^}]*\}\s*\}/u)
    expect(CSS).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.bar\s*\{\s*animation:\s*none;/u)
  })
})
