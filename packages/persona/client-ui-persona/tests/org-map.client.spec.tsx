// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { OrgChart, columnsFor, type OrgGroup, type OrgPersona } from '../src/client/primitives/index.ts'

afterEach(() => { cleanup() })

function team(n: number, groupsCount: number, needYouEvery = 0): OrgGroup[] {
  const groups: OrgGroup[] = Array.from({ length: groupsCount }, (_, g) => ({ id: `g${g}`, title: `Setor ${g}`, kind: 'sector' as const, members: [] as OrgPersona[] }))
  for (let i = 0; i < n; i++) {
    const p: OrgPersona = { id: `p${i}`, name: `Persona ${i}`, role: 'Cargo', state: needYouEvery > 0 && i % needYouEvery === 0 ? 'waiting' : 'working', stateLabel: 'x' }
    ;(groups[i % groupsCount]!.members as OrgPersona[]).push(p)
  }
  return groups
}

describe('OrgChart at scale (OrgMap)', () => {
  it('small teams keep the classic chart; big ones get the map with search and zoom', () => {
    render(<OrgChart mode="chart" label="Quem cuida" groups={team(10, 3)} />)
    expect(screen.queryByRole('combobox', { name: 'Encontrar persona' })).toBeNull()
    cleanup()
    render(<OrgChart mode="chart" label="Quem cuida" groups={team(150, 12)} />)
    expect(screen.getByRole('combobox', { name: 'Encontrar persona' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Caber na tela' })).toBeTruthy()
  })

  it('big teams start collapsed except groups that need you; collapsed groups show the count', () => {
    render(<OrgChart mode="chart" label="Quem cuida" groups={team(150, 12, 40)} />)
    const expanded = screen.getAllByRole('button', { expanded: true })
    const collapsed = screen.getAllByRole('button', { expanded: false })
    expect(expanded.length).toBeGreaterThan(0)
    expect(collapsed.length).toBeGreaterThan(expanded.length)
    expect(screen.getAllByText('13 personas').length).toBeGreaterThan(0)
  })

  it('search opens the group (even past the first 8) and marks the persona', () => {
    render(<OrgChart mode="chart" label="Quem cuida" groups={team(150, 12)} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Encontrar persona' }), { target: { value: 'persona 145' } })
    expect(screen.getByRole('option', { name: /Persona 145/u })).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Encontrar persona' }), { key: 'Enter' })
    const found = screen.getByRole('button', { name: /Persona 145,/u })
    expect(found.getAttribute('data-focused')).toBe('')
  })

  it('list mode is virtualized', () => {
    render(<OrgChart mode="list" label="Quem cuida" groups={team(150, 6)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir todos' }))
    const rendered = document.querySelectorAll('[aria-rowindex]').length
    expect(Number(document.querySelector('[aria-rowcount]')?.getAttribute('aria-rowcount'))).toBe(156)
    expect(rendered).toBeLessThan(60)
  })

  it('columns stay landscape and bounded', () => {
    expect(columnsFor(1)).toBe(2)
    expect(columnsFor(12)).toBe(5)
    expect(columnsFor(80)).toBe(6)
  })
})
