// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { OrgChart } from '../src/client/primitives/Governance.tsx'
import type { OrgChartProps } from '../src/client/primitives/Governance.tsx'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => {
  cleanup()
})

function largeChart(personaCount: number): OrgChartProps {
  const groups = []
  const perGroup = 5
  const groupCount = Math.ceil(personaCount / perGroup)
  for (let g = 0; g < groupCount; g += 1) {
    const members = []
    for (let m = 0; m < perGroup && g * perGroup + m < personaCount; m += 1) {
      const id = `p-${g * perGroup + m}`
      members.push({
        id,
        name: `Persona ${id}`,
        role: 'Cargo',
        state: 'working' as const,
        stateLabel: 'Trabalhando',
      })
    }
    groups.push({
      id: `g-${g}`,
      title: `Humano ${g}`,
      subtitle: 'Setor',
      kind: 'person' as const,
      members,
    })
  }
  return {
    root: {
      id: 'coord',
      name: 'Atlas',
      role: 'Gestor de equipe',
      caption: 'Gestor de equipe',
      state: 'working',
      stateLabel: 'Trabalhando',
      gestor: true,
      gestorLabel: 'Gestor',
    },
    groups,
    mode: 'chart',
    label: 'Organograma',
  }
}

function renderChart(personaCount: number, mode: 'chart' | 'list'): { ms: number; container: HTMLElement } {
  const props = { ...largeChart(personaCount), mode }
  const start = performance.now()
  const { container } = render(
    <PreviewFrame brandLabel="Persona">
      <OrgChart {...props} />
    </PreviewFrame>,
  )
  return { ms: performance.now() - start, container }
}

describe('OrgChart scale (Probe gate — browser E2E < 1 s)', () => {
  it('renders 60 personas in chart mode via OrgMap within jsdom budget', () => {
    const { ms } = renderChart(60, 'chart')
    expect(screen.getByRole('combobox', { name: 'Encontrar persona' })).toBeTruthy()
    expect(screen.getByText('Caber na tela')).toBeTruthy()
    expect(ms).toBeLessThan(5_000)
  })

  it('renders 150 personas in list mode virtualized within jsdom budget', () => {
    const { ms, container } = renderChart(150, 'list')
    fireEvent.click(screen.getByText('Abrir todos'))
    const rowCount = container.querySelector('[aria-rowcount]')?.getAttribute('aria-rowcount')
    expect(Number(rowCount)).toBeGreaterThanOrEqual(150)
    const rendered = container.querySelectorAll('[aria-rowindex]').length
    expect(rendered).toBeLessThan(60)
    expect(ms).toBeLessThan(8_000)
  })
})
