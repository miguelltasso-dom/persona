// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
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
      fireEvent.click(screen.getByRole('button', { name: governancePt[`model.${model}`] }))
      fireEvent.click(screen.getByRole('button', { name: governancePt['action.continue'] }))
      fireEvent.click(screen.getAllByRole('button', { name: governancePt['action.continue'] })[0]!)
      fireEvent.click(screen.getAllByRole('button', { name: governancePt['action.continue'] })[0]!)
      expect(screen.getByText(governancePt['step4.hireHint'])).toBeTruthy()
      cleanup()
    },
  )
})
