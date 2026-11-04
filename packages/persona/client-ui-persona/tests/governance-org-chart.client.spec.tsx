// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { OrgChartView } from '../src/client/governance/OrgChartView.tsx'
import { mockLargeOrgChart, mockOrgChart } from '../src/client/governance/mock-governance.ts'
import { pt } from '../src/client/locale/governance/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => {
  cleanup()
})

describe('OrgChartView (GOV-6)', () => {
  it('renders organogram region and list mode toggle', () => {
    const data = mockOrgChart('ws', 'person')
    render(
      <PreviewFrame brandLabel="Persona">
        <OrgChartView
          dict={pt}
          data={data}
          surfaceState="ready"
          groupBy="person"
          onGroupByChange={() => {}}
        />
      </PreviewFrame>,
    )
    expect(screen.getByRole('heading', { name: pt['org.title'] })).toBeTruthy()
    expect(screen.getByRole('region', { name: pt['a11y.orgRegion'] })).toBeTruthy()
    expect(screen.getByRole('tab', { name: pt['org.layoutList'] })).toBeTruthy()
  })

  it('list layout exposes the same personas with keyboard buttons (GOV-6 a11y)', () => {
    const data = mockOrgChart('ws', 'person')
    render(
      <PreviewFrame brandLabel="Persona">
        <OrgChartView
          dict={pt}
          data={data}
          surfaceState="ready"
          groupBy="person"
          onGroupByChange={() => {}}
        />
      </PreviewFrame>,
    )
    fireEvent.click(screen.getByRole('tab', { name: pt['org.layoutList'] }))
    const region = screen.getByRole('region', { name: pt['a11y.orgRegion'] })
    expect(within(region).getByRole('button', { name: /Nina, Pesquisa/u })).toBeTruthy()
  })

  it('large roster uses OrgMap search (scale seed GOV-6)', () => {
    const data = mockLargeOrgChart('ws', 'person', 60)
    render(
      <PreviewFrame brandLabel="Persona">
        <OrgChartView
          dict={pt}
          data={data}
          surfaceState="ready"
          groupBy="person"
          onGroupByChange={() => {}}
        />
      </PreviewFrame>,
    )
    expect(screen.getByRole('combobox', { name: pt['org.map.search'] })).toBeTruthy()
    expect(screen.getByPlaceholderText(pt['org.map.searchPlaceholder'])).toBeTruthy()
  })
})
