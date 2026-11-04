// @vitest-environment jsdom
// Gauge F5 (axe landmark-one-main / region em TODA tela): o shell precisa de um <main> com o painel dentro.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PersonaAppFrame } from '../src/client/shell/PersonaAppFrame.tsx'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'
import { globalStandardProps } from './global-standard-props.client.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'

afterEach(() => {
  cleanup()
  localStorage.removeItem('persona.flag.navPlaces')
})

describe('PersonaAppFrame', () => {
  it('o painel ativo vive dentro de um único landmark <main>, ao lado do rail (nav) e fora do overlay', () => {
    const { store } = createShellStore()
    render(
      <PersonaAppFrame
        {...globalStandardProps}
        t={((key: string, params?: Record<string, string | number>) => bindLocale(shellPt, key, params)) as never}
        selectPanel={() => undefined}
        useShell={bindObservableForTest(store)}
        renderSlot={((name: string) => (name === 'sidebar'
          ? <nav aria-label="Persona">rail</nav>
          : name === 'main' ? <h1>Visão geral</h1> : <div role="dialog" aria-label="onboarding" />)) as never}
      />,
    )
    const mains = screen.getAllByRole('main')
    expect(mains).toHaveLength(1)
    expect(mains[0]!.contains(screen.getByRole('heading', { name: 'Visão geral' }))).toBe(true)
    expect(mains[0]!.getAttribute('data-persona-area')).toBe('main')
    expect(mains[0]!.contains(screen.getByRole('navigation'))).toBe(false)
    expect(mains[0]!.contains(screen.getByRole('dialog'))).toBe(false)
  })

  it('A-1 (flag ligada): as abas do lugar ficam acima do <main> (navegação, não conteúdo) e só existem para lugares com abas', () => {
    localStorage.setItem('persona.flag.navPlaces', '1')
    const { store, actions } = createShellStore()
    actions.selectPanel('teamHealth')
    const { container } = render(
      <PersonaAppFrame
        {...globalStandardProps}
        t={((key: string, params?: Record<string, string | number>) => bindLocale(shellPt, key, params)) as never}
        selectPanel={actions.selectPanel}
        useShell={bindObservableForTest(store)}
        renderSlot={((name: string) => (name === 'main' ? <h1>Saúde</h1> : null)) as never}
      />,
    )
    const bar = container.querySelector('[data-persona-area="place-tabs"]')
    expect(bar).not.toBeNull()
    expect(screen.getByRole('main').contains(bar)).toBe(false)
    expect(screen.getByRole('tab', { name: 'Saúde' }).getAttribute('aria-selected')).toBe('true')
  })
})
