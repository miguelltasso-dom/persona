// @vitest-environment jsdom
/**
 * COLHEITA-S1 · P1-05 (Carbon): os sons discretos existem só dentro de `voice/` e nenhuma tela os monta. Vermelho primeiro:
 * Configurações › Aparência tem de mostrar a seção "Sons discretos" (o interruptor e o volume).
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AppearanceSettingsPanel } from '../src/client/shell/AppearanceSettingsPanel.tsx'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { createLocalThemeBridge } from '../src/client/theme/theme-preference.ts'

installPreviewTheme()

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellPt, key, params)) as never

afterEach(() => { cleanup() })

describe('P1-03 · sons discretos sem efeito ficam escondidos na Aparência', () => {
  // Carbon P1-03: o SoundsSection grava a preferência, mas nenhum evento do app toca som (createSoundEffects sem chamadores).
  // Keel: "SoundsSection sem efeito = esconder até tocar". Vermelho: hoje a seção aparece.
  it('não mostra a seção "Sons discretos" enquanto nenhum som do app toca', () => {
    render(<AppearanceSettingsPanel t={t} themeBridge={createLocalThemeBridge()} />)
    expect(screen.queryByRole('heading', { name: 'Sons discretos' })).toBeNull()
  })
})
