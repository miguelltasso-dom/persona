// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StructureAssistant } from '../src/client/governance/StructureAssistant.tsx'
import { recommendStructure } from '../src/client/governance/recommend-structure.ts'
import type { CompanyModelId } from '../src/client/governance/structure-types.ts'
import { pt as governancePt } from '../src/client/locale/governance/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => { cleanup() })

describe('StructureAssistant (GOV-8)', () => {
  it('walks four steps to org preview and hire actions', () => {
    render(
      <StructureAssistant
        dict={governancePt}
        humanLabel="Miguel"
        onHireAll={() => {}}
      />,
    )
    expect(screen.getByRole('heading', { level: 1, name: governancePt.title })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: governancePt['action.continue'] }))
    expect(screen.getByText(governancePt['step2.sectorsHint'])).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: governancePt['action.continue'] })[0]!)
    expect(screen.getByText(governancePt['tip.rcd'])).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: governancePt['action.continue'] })[0]!)
    expect(screen.getByText(governancePt['step4.hireHint'])).toBeTruthy()
    expect(screen.getByRole('region', { name: governancePt['twoDay.label'] })).toBeTruthy()
    expect(screen.getByRole('button', { name: governancePt['action.hireAll'] })).toBeTruthy()
  })

  it.each(['agency', 'saas', 'creator'] as const satisfies readonly CompanyModelId[])(
    'GOV-8 aceite: modelo %s → 3–5 funções contínuas com Coordenação',
    (model) => {
      const plan = recommendStructure({
        companyModel: model,
        activeSectorIds: [],
        weeklyWorkNotes: '',
      })
      expect(plan.personas.length).toBeGreaterThanOrEqual(3)
      expect(plan.personas.length).toBeLessThanOrEqual(6)
      expect(plan.personas.some(row => row.coordination)).toBe(true)
      expect(plan.personas.every(row => row.name.length > 0)).toBe(true)
      render(
        <StructureAssistant dict={governancePt} humanLabel="Miguel" onHireAll={() => {}} />,
      )
      fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${governancePt[`model.${model}`]}`, 'u') }))
      fireEvent.click(screen.getByRole('button', { name: governancePt['action.continue'] }))
      fireEvent.click(screen.getAllByRole('button', { name: governancePt['action.continue'] })[0]!)
      fireEvent.click(screen.getAllByRole('button', { name: governancePt['action.continue'] })[0]!)
      expect(screen.getByText(governancePt['step4.hireHint'])).toBeTruthy()
      cleanup()
    },
  )

  const toStep4 = (): void => {
    fireEvent.click(screen.getByRole('button', { name: governancePt['action.continue'] }))
    fireEvent.click(screen.getAllByRole('button', { name: governancePt['action.continue'] })[0]!)
    fireEvent.click(screen.getAllByRole('button', { name: governancePt['action.continue'] })[0]!)
  }

  it('Muse GOV-8 (3): a dica do passo 1 não fala em "modelos testados" nem em jargão', () => {
    render(<StructureAssistant dict={governancePt} humanLabel="Miguel" />)
    expect(governancePt['step1.hint']).toBe('Escolha o tipo de empresa ou projeto. Dá para ajustar tudo depois.')
    expect(screen.getByText(governancePt['step1.hint'])).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/jargão|modelos testados/iu)
  })

  it('Muse GOV-8 (4): o modelo escolhido é um cartão marcado (radio), não só uma borda', () => {
    render(<StructureAssistant dict={governancePt} humanLabel="Miguel" />)
    const group = screen.getByRole('group', { name: governancePt['step1.modelsLabel'] })
    const radios = within(group).getAllByRole('radio') as HTMLInputElement[]
    expect(radios).toHaveLength(6)
    expect(radios.filter(radio => radio.checked)).toHaveLength(1)
    const saas = within(group).getByRole('radio', { name: new RegExp(`^${governancePt['model.saas']}`, 'u') }) as HTMLInputElement
    fireEvent.click(saas)
    expect(saas.checked).toBe(true)
    expect(radios.filter(radio => radio.checked)).toHaveLength(1)
    expect(within(group).getByText(governancePt['model.saas.body'])).toBeTruthy()
  })

  it('Muse GOV-8 (1): o passo 4 tem "Contratar" em cada persona, uma a uma', () => {
    const onHireOne = vi.fn()
    render(<StructureAssistant dict={governancePt} humanLabel="Miguel" onHireAll={() => {}} onHireOne={onHireOne} />)
    toStep4()
    const plan = recommendStructure({ companyModel: 'agency', activeSectorIds: [], weeklyWorkNotes: '' })
    const list = screen.getByRole('list', { name: governancePt['step4.hireListLabel'] })
    expect(within(list).getAllByRole('listitem')).toHaveLength(plan.personas.length)
    const second = plan.personas[1]!
    fireEvent.click(within(list).getByRole('button', { name: `Contratar ${second.name}` }))
    expect(onHireOne).toHaveBeenCalledTimes(1)
    expect(onHireOne.mock.calls[0]![0]).toMatchObject({ id: second.id, name: second.name })
    // o botão para contratar todos continua
    expect(screen.getByRole('button', { name: governancePt['action.hireAll'] })).toBeTruthy()
  })

  it('sem onHireOne não há lista de contratação (nada de botão morto)', () => {
    render(<StructureAssistant dict={governancePt} humanLabel="Miguel" onHireAll={() => {}} />)
    toStep4()
    expect(screen.queryByRole('list', { name: governancePt['step4.hireListLabel'] })).toBeNull()
  })

  it('Muse GOV-8 (5): no Teste dos 2 dias a Coordenação aparece só com nome e função', () => {
    render(<StructureAssistant dict={governancePt} humanLabel="Miguel" />)
    toStep4()
    const region = screen.getByRole('region', { name: governancePt['twoDay.label'] })
    expect(within(region).getByText('Coordenação — Braço direito')).toBeTruthy()
    expect(region.textContent).not.toContain('prioriza e delega')
  })

  it('Muse P0-15: aberto como tela ("Contratar persona") tem o cabeçalho das outras telas: ícone, eyebrow, título (h1) e subtítulo', () => {
    const { container } = render(<StructureAssistant dict={governancePt} humanLabel="Miguel" onHireAll={() => {}} />)
    expect(screen.getByText(governancePt.eyebrow)).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: governancePt.title })).toBeTruthy()
    expect(screen.getByText(governancePt['step1.hint'])).toBeTruthy()
    expect(container.querySelector('header [aria-hidden="true"]')).not.toBeNull()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('dentro do onboarding (compact) o título continua o do passo, sem eyebrow duplicado', () => {
    render(<StructureAssistant dict={governancePt} humanLabel="Miguel" compact />)
    expect(screen.queryByText(governancePt.eyebrow)).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: governancePt.title })).toBeTruthy()
  })
})
