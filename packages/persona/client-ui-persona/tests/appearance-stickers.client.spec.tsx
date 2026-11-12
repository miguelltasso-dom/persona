// @vitest-environment jsdom
// Cena 22 (Muse): Configurações › Aparência reúne o tema, a figurinha (leque de 3 reais, com o interruptor) e as dicas de atalho.
// Personalidade não é mais aba. Não há controle de som ao concluir: não existe backend (decisão do Keel).
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppearanceSettingsPanel } from '../src/client/shell/AppearanceSettingsPanel.tsx'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import type { ThemeBridge } from '../src/client/theme/theme-preference.ts'

installPreviewTheme()
beforeEach(() => {
  // A figurinha em Aparência é atrás da flag figurinhas; o padrão de teste é desligado, então ligamos aqui.
  localStorage.setItem('persona.flag.figurinhas', '1')
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

const t = (key: string) => bindLocale(shellPt, key)
const themeBridge: ThemeBridge = {
  persistence: 'local',
  read: () => 'system',
  write: () => undefined,
  subscribe: () => () => undefined,
}

describe('Configurações › Aparência', () => {
  it('reúne tema, figurinhas (leque de 3) e dicas de atalho', () => {
    const { container } = render(<AppearanceSettingsPanel t={t} themeBridge={themeBridge} />)
    expect(screen.getByRole('heading', { name: t('personality.stickers.title') })).toBeTruthy()
    expect(container.querySelectorAll('[data-sticker-fan] > li')).toHaveLength(3)
    expect(screen.getByRole('switch', { name: t('personality.stickers.label') })).toBeTruthy()
    expect(screen.getByRole('switch', { name: t('appearance.shortcutTips') })).toBeTruthy()
  })

  it('o leque fica lavanda quando as figurinhas estão desligadas', () => {
    localStorage.setItem('persona.figurinhas.enabled.v1', '0')
    const { container } = render(<AppearanceSettingsPanel t={t} themeBridge={themeBridge} />)
    expect(container.querySelector('[data-sticker-fan]')?.getAttribute('data-enabled')).toBe('false')
  })

  it('não há controle de som ao concluir (sem backend)', () => {
    render(<AppearanceSettingsPanel t={t} themeBridge={themeBridge} />)
    expect(screen.queryByRole('switch', { name: /som ao concluir/i })).toBeNull()
  })
})
