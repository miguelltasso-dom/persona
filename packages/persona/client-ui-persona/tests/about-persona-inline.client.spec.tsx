// @vitest-environment jsdom
// Cena 24 (Muse) + decisão do Keel: AboutPersona inline com `version?`. A linha "Versão" só aparece quando a versão vem
// (a ponte de versão chega num item próprio, com o preload do Cobalt). Sem versão, nada de "Versão undefined".
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AboutPersona, type AboutLabels } from '../src/client/primitives/About.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => cleanup())

const LABELS: AboutLabels = {
  title: 'Sobre a Persona',
  tagline: 'Sua equipe de agentes',
  body: 'Corpo do texto',
  version: (value: string) => `Versão ${value}`,
  creditsTitle: 'Créditos',
  creditWhat: {},
  license: (spdx: string) => `Licença ${spdx}`,
  thirdParty: 'Avisos de terceiros',
  madeBy: 'Feito por',
  artAlt: 'Arte',
}

describe('Sobre (inline)', () => {
  it('sem versão, não mostra a linha "Versão"', () => {
    render(<AboutPersona labels={LABELS} />)
    expect(screen.queryByText(/Versão/)).toBeNull()
  })

  it('com versão, mostra "Versão X"', () => {
    render(<AboutPersona version="1.2.3" labels={LABELS} />)
    expect(screen.getByText('Versão 1.2.3')).toBeTruthy()
  })
})
