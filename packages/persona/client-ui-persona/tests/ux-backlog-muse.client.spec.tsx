// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BUDGET_PRESETS, TriageRulesView, presetOf, tasksPerMonth } from '../src/client/rules/TriageRulesView.tsx'
import { youInSentence } from '../src/client/governance/TeamHealthView.tsx'
import { PersonaSurfaceEmpty } from '../src/client/kanban/PersonaSurface.tsx'
import { pt as rulesPt } from '../src/client/locale/rules/locales.ts'

afterEach(() => { cleanup() })

describe('UX-05 Regras: presets in plain language', () => {
  it('maps limits to a preset and estimates tasks', () => {
    expect(presetOf(BUDGET_PRESETS.normal)).toBe('normal')
    expect(presetOf({ maxProposalsPerDay: 2, tokensPerPersonaMonth: 1, tokensPerProjectMonth: 1 })).toBe('custom')
    expect(tasksPerMonth(500_000)).toBe(50)
  })

  it('shows presets first, numbers only under Personalizar; save is primary only when changed', () => {
    const onSave = vi.fn()
    render(<TriageRulesView dict={rulesPt as never} limits={BUDGET_PRESETS.normal} onSaveLimits={onSave} />)
    expect((screen.getByRole('radio', { name: /Normal/u }) as HTMLInputElement).checked).toBe(true)
    expect(screen.queryByLabelText(/Limite de uso de IA por mês, por persona/u)).toBeNull()
    expect((screen.getByRole('button', { name: 'Salvar regras' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: /Econômico/u }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar regras' }))
    expect(onSave).toHaveBeenCalledWith(BUDGET_PRESETS.economico)
    fireEvent.click(screen.getByRole('radio', { name: /Personalizar/u }))
    expect(screen.getByLabelText(/Limite de uso de IA por mês, por persona/u)).toBeTruthy()
  })
})

describe('UX-15 / no dead controls', () => {
  it('lowercases the placeholder "Você" mid-sentence only', () => {
    expect(youInSentence('Tudo depende de Você para aprovar.')).toBe('Tudo depende de você para aprovar.')
    expect(youInSentence('Você cuida de 5 personas.')).toBe('Você cuida de 5 personas.')
    expect(youInSentence('Pronto. Você decide.')).toBe('Pronto. Você decide.')
  })

  it('empty-state CTA only exists when it does something', () => {
    const dict = { 't': 'Título', 'a': 'Agir' } as never
    const { rerender } = render(<PersonaSurfaceEmpty dict={dict} titleKey="t" primaryKey="a" />)
    expect(screen.queryByRole('button', { name: 'Agir' })).toBeNull()
    const go = vi.fn()
    rerender(<PersonaSurfaceEmpty dict={dict} titleKey="t" primaryKey="a" onPrimary={go} />)
    fireEvent.click(screen.getByRole('button', { name: 'Agir' }))
    expect(go).toHaveBeenCalled()
  })
})
