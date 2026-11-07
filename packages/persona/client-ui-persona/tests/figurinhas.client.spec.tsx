// @vitest-environment jsdom
// Figurinhas das personas (Colheita Lodi D): modelo puro, legenda em texto vivo e o interruptor em Configurações › Personalidade.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PersonalitySettingsPanel } from '../src/client/figurinhas/PersonalitySettingsPanel.tsx'
import { STICKERS_FLAG_KEY, isStickersEnabled } from '../src/client/figurinhas/figurinhas-flag.ts'
import {
  MOMENT_FALLBACK_REACTION,
  MOMENT_REACTION,
  STICKERS_ENABLED_KEY,
  STICKER_MOMENTS,
  canShowSticker,
  momentStickerUrl,
  readStickersEnabled,
  readStickersShown,
  recordStickerShown,
  stickerCaptionKey,
  stickerDayKey,
  writeStickersShown,
} from '../src/client/figurinhas/figurinhas-model.ts'
import { REACTION_IDS } from '../src/client/primitives/Stickers.tsx'
import { StickerMoment } from '../src/client/figurinhas/StickerMoment.tsx'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => {
  cleanup()
  localStorage.clear()
  delete (window as unknown as { __PERSONA_FLAGS__?: unknown }).__PERSONA_FLAGS__
})

const chatT = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)
const shellT = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellPt, key, params)) as never

describe('modelo (puro)', () => {
  it('cada momento usa a figurinha própria (BR-P5: bom-dia e ate-amanha) com reserva para joinha/feito se ainda não entrou em STICKERS; seletor segue com 6', () => {
    expect(STICKER_MOMENTS).toEqual(['delivery', 'goodMorning', 'endOfDay'])
    expect(MOMENT_REACTION).toEqual({ delivery: 'comemorando', goodMorning: 'bom-dia', endOfDay: 'ate-amanha' })
    expect(MOMENT_FALLBACK_REACTION).toEqual({ delivery: 'comemorando', goodMorning: 'joinha', endOfDay: 'feito' })
    expect(REACTION_IDS).toHaveLength(6)
    expect(REACTION_IDS).not.toContain('bom-dia')
    expect(REACTION_IDS).not.toContain('ate-amanha')
    expect(momentStickerUrl('nina', 'goodMorning', { 'nina-bom-dia': '/new.png', 'nina-joinha': '/old.png' })).toBe('/new.png')
    expect(momentStickerUrl('nina', 'goodMorning', { 'nina-joinha': '/old.png' })).toBe('/old.png')
    expect(momentStickerUrl('nina', 'endOfDay', { 'nina-ate-amanha': '/bye.png', 'nina-feito': '/done.png' })).toBe('/bye.png')
    expect(momentStickerUrl('nina', 'endOfDay', { 'nina-feito': '/done.png' })).toBe('/done.png')
    for (const moment of STICKER_MOMENTS) expect(chatT(stickerCaptionKey(moment))).not.toBe(stickerCaptionKey(moment))
  })

  it('no máximo 1 por persona por dia (dia local), e nenhuma com as figurinhas desligadas', () => {
    const noon = new Date(2026, 10, 4, 12, 0)
    const tomorrow = new Date(2026, 10, 5, 8, 0)
    expect(stickerDayKey(noon)).toBe('2026-11-04')
    let shown = readStickersShown()
    expect(canShowSticker({ enabled: true, personaId: 'p-nina', shown, now: noon })).toBe(true)
    shown = recordStickerShown(shown, 'p-nina', noon)
    expect(canShowSticker({ enabled: true, personaId: 'p-nina', shown, now: noon })).toBe(false)
    // outra persona e o dia seguinte são livres
    expect(canShowSticker({ enabled: true, personaId: 'p-bento', shown, now: noon })).toBe(true)
    expect(canShowSticker({ enabled: true, personaId: 'p-nina', shown, now: tomorrow })).toBe(true)
    // desligado ou persona sem id: nada
    expect(canShowSticker({ enabled: false, personaId: 'p-bento', shown, now: noon })).toBe(false)
    expect(canShowSticker({ enabled: true, personaId: '  ', shown, now: noon })).toBe(false)
  })

  it('o histórico vai e volta do armazenamento; lixo no armazenamento vira vazio; ligada é o padrão', () => {
    writeStickersShown({ 'p-nina': '2026-11-04' })
    expect(readStickersShown()).toEqual({ 'p-nina': '2026-11-04' })
    localStorage.setItem('persona.figurinhas.shown.v1', '[1,2]')
    expect(readStickersShown()).toEqual({})
    localStorage.setItem('persona.figurinhas.shown.v1', '{"p":3,"q":"2026-11-04"}')
    expect(readStickersShown()).toEqual({ q: '2026-11-04' })
    expect(readStickersEnabled()).toBe(true)
    localStorage.setItem(STICKERS_ENABLED_KEY, '0')
    expect(readStickersEnabled()).toBe(false)
  })

  it('a flag nasce desligada; liga pelo armazenamento ou pelo objeto da janela', () => {
    expect(isStickersEnabled()).toBe(false)
    localStorage.setItem(STICKERS_FLAG_KEY, '1')
    expect(isStickersEnabled()).toBe(true)
    localStorage.clear()
    ;(window as unknown as { __PERSONA_FLAGS__?: unknown }).__PERSONA_FLAGS__ = { figurinhas: true }
    expect(isStickersEnabled()).toBe(true)
  })
})

describe('StickerMoment', () => {
  it('a figurinha do bicho com a legenda como TEXTO VIVO num chip; a arte é decorativa (sem texto dentro dela)', () => {
    const { container } = render(<StickerMoment t={chatT} moment="delivery" personaName="Nina" characterId="nina" />)
    expect(screen.getByText('Entrega feita!')).toBeTruthy()
    const art = container.querySelector('img')
    expect(art?.getAttribute('alt')).toBe('')
    expect(art?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('[data-persona-sticker="delivery"]')).not.toBeNull()
  })

  it('bicho sem arte ainda: não mostra nada (momento não é reação: sem emoji de reserva)', () => {
    const { container } = render(<StickerMoment t={chatT} moment="goodMorning" personaName="Zé" characterId="bicho-que-nao-existe" />)
    expect(container.firstChild).toBeNull()
    cleanup()
    const none = render(<StickerMoment t={chatT} moment="endOfDay" personaName="Zé" characterId={undefined} />)
    expect(none.container.firstChild).toBeNull()
  })
})

describe('Configurações › Personalidade › Figurinhas', () => {
  it('um interruptor com nome e dica; começa ligado e a escolha fica gravada', () => {
    render(<PersonalitySettingsPanel t={shellT} />)
    const toggle = screen.getByRole('switch', { name: 'Figurinhas das personas' })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(toggle.getAttribute('aria-describedby')).not.toBeNull()
    expect(screen.getByText(/No máximo uma por persona por dia/u)).toBeTruthy()
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(localStorage.getItem(STICKERS_ENABLED_KEY)).toBe('0')
    cleanup()
    render(<PersonalitySettingsPanel t={shellT} />)
    expect(screen.getByRole('switch', { name: 'Figurinhas das personas' }).getAttribute('aria-checked')).toBe('false')
  })

  it('nenhuma palavra técnica na tela', () => {
    render(<PersonalitySettingsPanel t={shellT} />)
    expect(document.body.textContent).not.toMatch(/flag|localStorage|sticker\b|webp/iu)
  })
})

describe('a aba em Configurações só existe com a flag', () => {
  it('desligada: as abas são as de antes (Sobre continua a última); ligada: Personalidade entra antes de Sobre', async () => {
    vi.resetModules()
    const off = await import('../src/client/shell/nav-places.ts')
    const offTabs = off.NAV_PLACES.find(place => place.id === 'settings')!.tabs.map(tab => tab.panel)
    expect(offTabs).not.toContain('personality')
    expect(offTabs.at(-1)).toBe('about')
    localStorage.setItem('persona.flag.figurinhas', '1')
    vi.resetModules()
    const on = await import('../src/client/shell/nav-places.ts')
    const onTabs = on.NAV_PLACES.find(place => place.id === 'settings')!.tabs.map(tab => tab.panel)
    expect(onTabs.at(-2)).toBe('personality')
    expect(onTabs.at(-1)).toBe('about')
    expect(on.placeOfPanel('personality')?.id).toBe('settings')
  })
})
