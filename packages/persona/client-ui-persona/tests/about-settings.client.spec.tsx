// @vitest-environment jsdom
// Muse (rodapé): "Sobre e atualizações" é a última aba de Configurações e abre o modal do DSW por um botão (Ctrl+, segue).
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AboutSettingsPanel } from '../src/client/shell/AboutSettingsPanel.tsx'
import { NAV_PLACES, placeOfPanel } from '../src/client/shell/nav-places.ts'
import { canOpenSettingsModal, openSettingsModal, setOpenSettings } from '../src/client/shell/settings-launcher-bridge.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { pt as shellPt, en as shellEn } from '../src/client/locale/shell/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => {
  cleanup()
  setOpenSettings(null)
})

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellPt, key, params)) as never

describe('ponte do launcher', () => {
  it('sem launcher montado não abre nada e diz que não pode', () => {
    expect(canOpenSettingsModal()).toBe(false)
    expect(openSettingsModal()).toBe(false)
  })

  it('com launcher montado chama o openSettings do DSW; ao desmontar volta a não abrir', () => {
    const open = vi.fn()
    setOpenSettings(open)
    expect(canOpenSettingsModal()).toBe(true)
    expect(openSettingsModal()).toBe(true)
    expect(open).toHaveBeenCalledTimes(1)
    setOpenSettings(null)
    expect(openSettingsModal()).toBe(false)
    expect(open).toHaveBeenCalledTimes(1)
  })
})

describe('aba "Sobre e atualizações"', () => {
  it('é a última aba do lugar Configurações, com o id de painel `about`', () => {
    const settings = NAV_PLACES.find(place => place.id === 'settings')!
    expect(settings.tabs.at(-1)?.panel).toBe('about')
    expect(placeOfPanel('about')?.id).toBe('settings')
    expect(shellPt[settings.tabs.at(-1)!.labelKey]).toBe('Sobre e atualizações')
    expect(shellEn[settings.tabs.at(-1)!.labelKey]).toBe('About and updates')
  })

  it('o botão abre o modal do DSW', () => {
    const open = vi.fn()
    setOpenSettings(open)
    render(<AboutSettingsPanel t={t} />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Sobre e atualizações' }))
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('sem launcher o botão fica desabilitado e a linha do porquê aparece (nunca botão morto sem motivo)', () => {
    render(<AboutSettingsPanel t={t} />)
    const button = screen.getByRole('button', { name: 'Abrir Sobre e atualizações' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByText(shellPt['about.unavailable'])).toBeTruthy()
    expect(button.getAttribute('aria-describedby')).toBe('persona-about-why')
  })

  it('o atalho aparece em chips de tecla (Ctrl e vírgula), não por extenso', () => {
    const { container } = render(<AboutSettingsPanel t={t} />)
    expect([...container.querySelectorAll('kbd')].map(node => node.textContent)).toEqual(['Ctrl', ','])
    expect(document.body.textContent).not.toMatch(/vírgula/iu)
  })
})
