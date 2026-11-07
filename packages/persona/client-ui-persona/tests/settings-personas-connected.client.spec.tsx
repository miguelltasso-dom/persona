// @vitest-environment jsdom
// Configurações › Personas, a tela CONECTADA (v1.1, Keel 13:56): nenhum controle sem host por trás.
// "Usar as minhas skills do Claude" e "Contratar direto, sem Aprovações" eram estado local que não fazia nada; saem da tela até a v1.2 ligá-los de verdade.
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ConnectedPersonasSettings } from '../src/client/settings-personas/ConnectedPersonasSettings.tsx'
import { pt } from '../src/client/locale/shell/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => {
  cleanup()
  localStorage.clear()
})

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(pt, key, params)) as never

const SNAPSHOT = {
  tenant: { workspaceId: 'ws-1', projectId: 'proj-1' },
  projects: [],
  team: {
    personas: [
      { id: 'p-luna', name: 'Luna', title: 'Vigia', avatarRef: 'luna', canRecruit: false },
    ],
  },
}

function mountConnected(): void {
  render(
    <ConnectedPersonasSettings
      t={t}
      useLive={(<T,>(selector: (state: typeof SNAPSHOT) => T): T => selector(SNAPSHOT)) as never}
      persona={{} as never}
    />,
  )
}

describe('Configurações › Personas (conectada): sem controle morto na v1.1', () => {
  it('não mostra "Usar as minhas skills do Claude" nem "Contratar direto"; o interruptor real "Pode contratar" de cada persona continua', () => {
    mountConnected()
    expect(screen.getByRole('heading', { name: 'O que cada persona pode fazer' })).toBeTruthy()
    expect(screen.queryByText('Usar as minhas skills do Claude nas personas')).toBeNull()
    expect(screen.queryByText('Contratar direto, sem Aprovações')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Suas skills do Claude' })).toBeNull()
    expect(document.querySelector('[data-persona-settings="house"]')).toBeNull()
    expect(document.querySelector('#switch-claude-skills, #switch-hire-direct')).toBeNull()
    // Só o interruptor por persona (Pode contratar), que tem o host por trás.
    expect(screen.getAllByRole('switch')).toHaveLength(1)
    expect(screen.getByText('Pode contratar')).toBeTruthy()
  })

  it('"Revisão antes de entregar" é uma FRASE (a revisão fica sempre ligada), sem modo, revisor nem projeto: eram estado local, o host nunca soube da escolha', () => {
    // Keel 14:53 (achado #3, decisão B): escolher "Desligada" aparecia confirmado na tela, mas o host seguia revisando toda entrega; a tela abria sempre em
    // "Todas as entregas · Coordenação". Frase da Muse (15:00): nenhum controle, nada que pareça clicável. Volta ligada de verdade
    // (getReviewPolicy/setReviewPolicy, com rollback) na v1.1.x.
    // Na faixa de testes as flags nascem DESLIGADAS (setFlagDefaults(false)); no app do Miguel a equipe real nasce LIGADA. Aqui ligamos como o app: a escolha explícita vale.
    localStorage.setItem('persona.flag.teamwork', '1')
    mountConnected()
    expect(screen.getByRole('heading', { name: 'O que cada persona pode fazer' })).toBeTruthy()
    const card = document.querySelector<HTMLElement>('[data-persona-settings="review-before-delivery"]')
    expect(card).not.toBeNull()
    expect(card!.hasAttribute('data-review-always-on')).toBe(true)
    // O título é o da seção, sem projeto ("· Pessoal"), e a frase honesta vem com a dica de custo embaixo.
    expect(within(card!).getByRole('heading', { name: 'Revisão antes de entregar' })).toBeTruthy()
    expect(within(card!).getByText('Cada entrega passa pela revisão de um colega antes de chegar a você; se ninguém puder revisar na hora, ela chega sem revisão e a tarefa avisa.')).toBeTruthy()
    expect(within(card!).getByText('Cada entrega revisada usa ≈ 1 tarefa curta a mais da sua cota.')).toBeTruthy()
    // Nenhum controle dentro do bloco: nem botão, nem rádio, nem seletor, nem interruptor, nem link, nem campo.
    expect(within(card!).queryAllByRole('button')).toHaveLength(0)
    expect(within(card!).queryAllByRole('radio')).toHaveLength(0)
    expect(within(card!).queryAllByRole('radiogroup')).toHaveLength(0)
    expect(within(card!).queryAllByRole('combobox')).toHaveLength(0)
    expect(within(card!).queryAllByRole('switch')).toHaveLength(0)
    expect(within(card!).queryAllByRole('link')).toHaveLength(0)
    expect(within(card!).queryAllByRole('textbox')).toHaveLength(0)
    expect(card!.querySelector('[data-review-mode]')).toBeNull()
    expect(document.querySelector('[data-review-mode]')).toBeNull()
    // Nada do bloco antigo em lugar nenhum da tela.
    expect(screen.queryByText(/Quando revisar/u)).toBeNull()
    expect(screen.queryByText(/Quem revisa/u)).toBeNull()
    expect(screen.queryByText('Desligada')).toBeNull()
    expect(screen.queryByText(/Revisão antes de entregar · /u)).toBeNull()
    // Os rádios que existem na tela são os de autonomia de cada persona (têm host por trás).
    expect(screen.getAllByRole('radio').every(radio => (radio as HTMLInputElement).name.startsWith('persona-autonomy-'))).toBe(true)
  })

  it('com a equipe real desligada não há revisão a explicar: a frase não aparece', () => {
    localStorage.setItem('persona.flag.teamwork', '0')
    mountConnected()
    expect(screen.getByRole('heading', { name: 'O que cada persona pode fazer' })).toBeTruthy()
    expect(document.querySelector('[data-persona-settings="review-before-delivery"]')).toBeNull()
    expect(screen.queryByText(/Revisão antes de entregar/u)).toBeNull()
  })
})
