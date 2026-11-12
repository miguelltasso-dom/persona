// @vitest-environment jsdom
// DESIGN-01 onda 3 · #16 (Muse cena 14 + HONEST-1): a tela "Regras da casa". O nome e o subtítulo são os do Muse; o que o host ainda não obedece
// (janelas de silêncio, criar regra, receitas de 1 clique) NÃO aparece como opção até o contrato do HONEST-1 existir; o dado salvo continua aí;
// e cada regra tem um espaço para "última aplicação" quando o host passar a dizê-la.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TriageRulesView } from '../src/client/rules/TriageRulesView.tsx'
import { MOCK_PROACTIVITY_LIMITS, MOCK_QUIET_WINDOWS, MOCK_TRIAGE_LOG, MOCK_TRIAGE_RULES } from '../src/client/rules/mock-data.ts'
import { pt as rulesPt, en as rulesEn } from '../src/client/locale/rules/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

function view(extra: Partial<Parameters<typeof TriageRulesView>[0]> = {}) {
  return render(
    <PreviewFrame brandLabel="Persona">
      <TriageRulesView dict={rulesPt} rules={MOCK_TRIAGE_RULES} quietWindows={MOCK_QUIET_WINDOWS} limits={MOCK_PROACTIVITY_LIMITS} triageLog={MOCK_TRIAGE_LOG} {...extra} />
    </PreviewFrame>,
  )
}

describe('Regras da casa · nome e subtítulo', () => {
  it('h1 "Regras da casa" e o subtítulo do Muse; nada de "Regras de triagem" nem "Combinados"', () => {
    view()
    expect(screen.getByRole('heading', { level: 1, name: 'Regras da casa' })).toBeTruthy()
    expect(screen.getByText('O que a equipe resolve sozinha, quando fica em silêncio e o que nunca faz sem você.')).toBeTruthy()
    for (const dict of [rulesPt, rulesEn]) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value, key).not.toMatch(/Regras de triagem|Triage rules|Combinados/iu)
      }
    }
  })
})

describe('HONEST-1 · o que o host não obedece não é opção', () => {
  it('sem o contrato: nenhuma janela de silêncio na tela e nenhuma receita de 1 clique, mas o orçamento, as regras salvas e o registro seguem', () => {
    view()
    expect(screen.queryByText(/Noites de semana/u)).toBeNull()
    expect(screen.queryByText(rulesPt['quiet.title'])).toBeNull()
    expect(screen.queryByRole('button', { name: /Silêncio das 20h às 8h|Confirmar antes de falar com cliente|Nunca aprovar gasto sem mim/u })).toBeNull()
    expect(screen.getByLabelText(rulesPt['limits.maxProposals'])).toBeTruthy()
    expect(screen.getByText(/deploy em produção/u)).toBeTruthy()
    expect(screen.getByText(/Teria aberto ticket de revisão/u)).toBeTruthy()
  })

  it('quando o host disser que obedece janelas de silêncio, elas voltam (o gancho está pronto)', () => {
    view({ obeyed: { quietWindows: true } })
    // P1-10 (Muse 07:07): a janela é uma linha "Toda noite · 22h às 7h · Toda a equipe" (o host só tem início e fim, todo dia; sem Dias nem Quem).
    expect(screen.getByText('Toda noite · 22h às 7h · Toda a equipe')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull() // sem handlers a lista é só leitura
  })

  it('sem regras e sem poder criar: o estado vazio não oferece botão nenhum (controle falso é pior que nenhum)', () => {
    const onEmptyPrimary = vi.fn()
    view({ rules: [], quietWindows: [], triageLog: [], initialState: 'empty', onEmptyPrimary })
    expect(screen.queryByRole('button', { name: /Criar/u })).toBeNull()
    expect(screen.getByText('Nenhuma regra da casa por enquanto')).toBeTruthy()
  })

  it('com o contrato de criar regras, o botão do estado vazio volta e age', () => {
    const onEmptyPrimary = vi.fn()
    view({ rules: [], quietWindows: [], triageLog: [], initialState: 'empty', onEmptyPrimary, obeyed: { newRules: true } })
    fireEvent.click(screen.getByRole('button', { name: /Criar a primeira regra/u }))
    expect(onEmptyPrimary).toHaveBeenCalledTimes(1)
  })
})

describe('Regras da casa · "última aplicação" (gancho)', () => {
  it('a regra que traz a última aplicação a mostra; a que não traz não ganha linha vazia nem número inventado', () => {
    view({ rules: [
      { id: 'a', gateText: 'Gasto acima de R$ 200', assessmentText: 'Pedir a você', logOnly: false, speculativeEnabled: false, lastApplied: 'Barrou 2 gastos esta semana' },
      { id: 'b', gateText: 'Falar com cliente', assessmentText: 'Confirmar antes', logOnly: false, speculativeEnabled: false },
    ] })
    const lines = [...document.querySelectorAll('[data-rule-last-applied]')].map(node => node.textContent)
    expect(lines).toEqual(['Barrou 2 gastos esta semana'])
  })
})
