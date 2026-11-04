// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createOnboardingStore } from '../src/client/onboarding/create-onboarding-store.ts'
import { OnboardingWizard } from '../src/client/onboarding/OnboardingWizard.tsx'
import { pt } from '../src/client/locale/onboarding/locales.ts'
import { pt as governancePt } from '../src/client/locale/governance/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

function step4() {
  const { store, actions } = createOnboardingStore()
  store.set({ ...store.getSnapshot(), step: 4, displayName: 'Miguel' })
  return render(<OnboardingWizard dict={pt} structureDict={governancePt} store={store} actions={actions} />)
}

describe('onboarding passo 4: um caminho principal (UX-17)', () => {
  it('o modelo sugerido já vem marcado, com a equipe à vista: é o caminho principal', () => {
    step4()
    const suggested = screen.getByRole('button', { name: pt['step4.templates.equipeAnimais'] })
    expect(suggested.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(pt['step4.hint'])).toBeTruthy()
    expect(document.querySelectorAll('ul li').length).toBeGreaterThan(0)
  })

  it('os outros dois caminhos são secundários e vêm DEPOIS dos modelos', () => {
    step4()
    const templates = screen.getByRole('group', { name: pt['step4.title'] })
    const assistant = screen.getByRole('button', { name: /Assistente de estrutura/u })
    const toggle = screen.getByRole('button', { name: pt['step4.builderToggle'] })
    const before = (a: Element, b: Element): boolean => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    expect(before(templates, assistant)).toBe(true)
    expect(before(templates, toggle)).toBe(true)
  })

  it('o botão do assistente mantém "Assistente de estrutura" no nome (seletor do E2E da Padaria e das capturas)', () => {
    step4()
    expect(screen.getByRole('button', { name: /Assistente de estrutura/u })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Assistente de estrutura/u }))
    expect(screen.getByRole('button', { name: pt['step4.structureBack'] })).toBeTruthy()
  })

  it('descrever com as próprias palavras abre sob demanda (aria-expanded) e não compete com o modelo', () => {
    step4()
    const toggle = screen.getByRole('button', { name: pt['step4.builderToggle'] })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByPlaceholderText(pt['step4.builderPlaceholder'])).toBeNull()
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByPlaceholderText(pt['step4.builderPlaceholder'])).toBeTruthy()
  })

  it('escolher outro modelo continua a um clique', () => {
    const { store, actions } = createOnboardingStore()
    store.set({ ...store.getSnapshot(), step: 4 })
    render(<OnboardingWizard dict={pt} structureDict={governancePt} store={store} actions={actions} />)
    fireEvent.click(screen.getByRole('button', { name: pt['step4.templates.emBranco'] }))
    expect(store.getSnapshot().templateId).toBe('emBranco')
  })
})
