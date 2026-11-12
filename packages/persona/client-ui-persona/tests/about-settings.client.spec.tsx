// @vitest-environment jsdom
// Muse (cena 24) + revisão do Carbon (item 1): "Sobre" é a última aba de Configurações e mostra o AboutPersona direto sob o cabeçalho.
// Sem o cartão legado "Versão e avisos", sem o botão do modal do DSW e sem o atalho.
import { cleanup, render, screen } from '@testing-library/react'
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

describe('aba "Sobre"', () => {
  it('é a última aba do lugar Configurações, com o id de painel `about`', () => {
    const settings = NAV_PLACES.find(place => place.id === 'settings')!
    expect(settings.tabs.at(-1)?.panel).toBe('about')
    expect(placeOfPanel('about')?.id).toBe('settings')
    expect(shellPt[settings.tabs.at(-1)!.labelKey]).toBe('Sobre')
    expect(shellEn[settings.tabs.at(-1)!.labelKey]).toBe('About')
  })

  it('mostra o AboutPersona direto sob o cabeçalho, sem o cartão legado, o botão do DSW nem o atalho', () => {
    const { container } = render(<AboutSettingsPanel t={t} />)
    expect(screen.getByRole('heading', { name: 'Sobre a Persona' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Abrir Sobre e atualizações' })).toBeNull()
    expect(container.querySelectorAll('kbd')).toHaveLength(0)
    expect(document.body.textContent).not.toMatch(/Versão e avisos/u)
  })

  it('sem versão não mostra a linha "Versão" (a ponte de versão chega num item próprio)', () => {
    render(<AboutSettingsPanel t={t} />)
    expect(screen.queryByText(/^Versão /u)).toBeNull()
  })
})
