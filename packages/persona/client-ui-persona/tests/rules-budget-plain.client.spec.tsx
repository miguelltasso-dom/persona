// @vitest-environment jsdom
/**
 * Muse, passada de leigo nº 4 (app real, Memória › Regras da casa › "Orçamento e propostas"): (1) o selo "Recomendado" no "Normal" fere a regra 1 do DESIGN-01-MUSE (o selo só existe onde uma opção
 * evita perder dados): sai; (2) "Evita barulho e uso descontrolado da sua cota": "cota" é jargão, vira "gasto descontrolado do seu plano"; (3) os campos de "Personalizar" mostravam "50000" e
 * "200000" crus: a tela mostra o separador de milhar ("50.000") e o campo só guarda os dígitos que a pessoa digita.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BUDGET_PRESETS, TriageRulesView, countOf, formatCount } from '../src/client/rules/TriageRulesView.tsx'
import { en as rulesEn, pt as rulesPt } from '../src/client/locale/rules/locales.ts'

afterEach(() => { cleanup() })

const PERSONA = /Limite de uso de IA por mês, por persona/u
const PROJECT = /Limite de uso de IA por mês, por projeto/u

describe('o cartão "Orçamento e propostas" fala como gente', () => {
  it('nenhuma opção traz o selo "Recomendado" (nem em pt, nem em en)', () => {
    const { container, unmount } = render(<TriageRulesView dict={rulesPt as never} limits={BUDGET_PRESETS.normal} onSaveLimits={vi.fn()} />)
    expect(screen.queryByText('Recomendado')).toBeNull()
    expect(container.textContent).not.toMatch(/Recomend/u)
    expect((screen.getByRole('radio', { name: /Normal/u }) as HTMLInputElement).checked).toBe(true) // a opção segura segue marcada, só sem selo
    unmount()
    const english = render(<TriageRulesView dict={rulesEn as never} limits={BUDGET_PRESETS.normal} onSaveLimits={vi.fn()} />)
    expect(english.container.textContent).not.toMatch(/Recommended/u)
  })

  it('o subtítulo diz "plano", não "cota"', () => {
    const { container } = render(<TriageRulesView dict={rulesPt as never} limits={BUDGET_PRESETS.normal} onSaveLimits={vi.fn()} />)
    expect(screen.getByText('Evita barulho e gasto descontrolado do seu plano')).toBeTruthy()
    expect(container.textContent).not.toMatch(/\bcota\b/iu)
  })
})

describe('os números aparecem com o separador de milhar', () => {
  it('formatCount e countOf: "50.000" na tela, só os dígitos digitados na conta', () => {
    expect(formatCount(50_000)).toBe('50.000')
    expect(formatCount(200_000)).toBe('200.000')
    expect(formatCount(1_500_000)).toBe('1.500.000')
    expect(formatCount(3)).toBe('3')
    expect(countOf('1.200.000')).toBe(1_200_000)
    expect(countOf('1 200 000')).toBe(1_200_000)
    expect(countOf('1200000')).toBe(1_200_000)
    expect(countOf('12abc3')).toBe(123)
    expect(countOf('')).toBe(0)
    expect(countOf('abc')).toBe(0)
  })

  it('em "Personalizar" os campos mostram 500.000 e 1.000.000 (não 500000), e a linha de baixo continua explicando em tarefas', () => {
    render(<TriageRulesView dict={rulesPt as never} limits={BUDGET_PRESETS.normal} onSaveLimits={vi.fn()} />)
    fireEvent.click(screen.getByRole('radio', { name: /Personalizar/u }))
    expect((screen.getByLabelText(PERSONA) as HTMLInputElement).value).toBe('500.000')
    expect((screen.getByLabelText(PROJECT) as HTMLInputElement).value).toBe('1.000.000')
    expect((screen.getByLabelText(/Máx. propostas por persona \/ dia/u) as HTMLInputElement).value).toBe('3')
    expect(screen.getAllByText(/50 tarefas/u).length).toBeGreaterThanOrEqual(2) // 500.000 / 10.000: o cartão do preset e a dica do campo seguem explicando em tarefas
  })

  it('digitar "1.200.000" guarda 1200000 e a tela segue mostrando "1.200.000"; letras não entram', () => {
    const onSave = vi.fn()
    render(<TriageRulesView dict={rulesPt as never} limits={BUDGET_PRESETS.normal} onSaveLimits={onSave} />)
    fireEvent.click(screen.getByRole('radio', { name: /Personalizar/u }))
    const field = screen.getByLabelText(PERSONA) as HTMLInputElement
    fireEvent.change(field, { target: { value: '1.200.000' } })
    expect((screen.getByLabelText(PERSONA) as HTMLInputElement).value).toBe('1.200.000')
    fireEvent.change(screen.getByLabelText(PERSONA), { target: { value: '1.200.000abc' } })
    expect((screen.getByLabelText(PERSONA) as HTMLInputElement).value).toBe('1.200.000')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar regras' }))
    expect(onSave).toHaveBeenCalledWith({ ...BUDGET_PRESETS.normal, tokensPerPersonaMonth: 1_200_000 })
  })
})
