// @vitest-environment jsdom
// DESIGN-01 onda 2 · #10 (Muse §5.1): UM lugar "Projetos" que abre no QUADRO; abas Quadro · Arquivos · Canvas do projeto da vez; a aba
// "Quadros" sai; a grade de cartões ("Ver todos os projetos") continua alcançável mas não é aba; Rotinas da equipe toda moram em Equipe.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  NAV_PLACES,
  PLACE_ALIASES,
  panelsReachableFromPlaces,
  placeEntryPanel,
  placeOfPanel,
  rememberPlaceTab,
  resolvePlaceAlias,
  visibleTabs,
} from '../src/client/shell/nav-places.ts'
import { PlaceTabsBar } from '../src/client/shell/PlaceTabsBar.tsx'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { pt as shellPt, en as shellEn } from '../src/client/locale/shell/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellPt, key, params)) as never

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    data,
  }
}

const projects = NAV_PLACES.find(place => place.id === 'projects')!
const team = NAV_PLACES.find(place => place.id === 'team')!

describe('o lugar Projetos', () => {
  it('as abas são Quadro · Arquivos · Canvas (a aba "Quadros" saiu); a grade existe mas não é aba', () => {
    expect(visibleTabs(projects).map(tab => tab.panel)).toEqual(['kanban', 'files', 'canvas'])
    expect(visibleTabs(projects).map(tab => shellPt[tab.labelKey])).toEqual(['Quadro', 'Arquivos', 'Canvas'])
    expect(visibleTabs(projects).map(tab => shellEn[tab.labelKey])).toEqual(['Board', 'Files', 'Canvas'])
    // a grade ("Ver todos os projetos") segue pertencendo ao lugar, escondida da barra
    expect(placeOfPanel('projects')?.id).toBe('projects')
    expect(panelsReachableFromPlaces()).toContain('projects')
    expect(projects.tabs.find(tab => tab.panel === 'projects')?.hidden).toBe(true)
  })

  it('abre no quadro: mesmo que a última tela lembrada seja a grade, a entrada é o quadro', () => {
    expect(placeEntryPanel(projects, memoryStorage())).toBe('kanban')
    expect(placeEntryPanel(projects, memoryStorage({ 'persona.place.lastTab.projects': 'projects' }))).toBe('kanban')
    expect(placeEntryPanel(projects, memoryStorage({ 'persona.place.lastTab.projects': 'files' }))).toBe('files')
  })

  it('a grade não é lembrada como "última aba"', () => {
    const storage = memoryStorage()
    rememberPlaceTab(projects, 'projects', storage)
    expect(storage.data.size).toBe(0)
    rememberPlaceTab(projects, 'canvas', storage)
    expect(storage.data.get('persona.place.lastTab.projects')).toBe('canvas')
  })

  it('as rotinas da equipe toda moram em Equipe, não em Projetos', () => {
    expect(placeOfPanel('routines')?.id).toBe('team')
    expect(team.tabs.map(tab => tab.panel)).toEqual(['team', 'orgChart', 'teamHealth', 'routines'])
    expect(projects.tabs.map(tab => tab.panel)).not.toContain('routines')
    expect(shellPt['sidebar.routines']).toBe('Rotinas')
  })

  it('o Ctrl K entende "todos os projetos" (a grade); "Quadros" continua levando ao quadro', () => {
    expect(resolvePlaceAlias('Todos os projetos')).toBe('projects')
    expect(resolvePlaceAlias('Quadros')).toBe('kanban')
    expect(PLACE_ALIASES.find(row => row.alias === 'todos os projetos')?.panel).toBe('projects')
  })
})

describe('PlaceTabsBar nos Projetos', () => {
  it('no quadro: 3 abas, com o quadro marcado; clicar em Arquivos troca de tela', () => {
    const onSelect = vi.fn()
    const { container } = render(<PlaceTabsBar t={t} activePanel="kanban" onSelect={onSelect} />)
    const panels = [...container.querySelectorAll('[role="tab"]')].map(node => node.getAttribute('data-tab-panel'))
    expect(panels).toEqual(['kanban', 'files', 'canvas'])
    expect(screen.getByRole('tab', { name: 'Quadro' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('tab', { name: 'Arquivos' }))
    expect(onSelect).toHaveBeenCalledWith('files')
  })

  it('na grade de projetos não há barra de abas (as abas são do projeto da vez, e a grade não é de um projeto)', () => {
    expect(render(<PlaceTabsBar t={t} activePanel="projects" onSelect={() => undefined} />).container.firstChild).toBeNull()
  })

  it('Equipe ganha a aba Rotinas', () => {
    const { container } = render(<PlaceTabsBar t={t} activePanel="routines" onSelect={() => undefined} />)
    expect([...container.querySelectorAll('[role="tab"]')].map(node => node.getAttribute('data-tab-panel'))).toEqual(['team', 'orgChart', 'teamHealth', 'routines'])
    expect(screen.getByRole('tab', { name: 'Rotinas' }).getAttribute('aria-selected')).toBe('true')
  })

  it('abrir a grade não apaga a aba lembrada do lugar', () => {
    localStorage.clear()
    render(<PlaceTabsBar t={t} activePanel="files" onSelect={() => undefined} />)
    cleanup()
    render(<PlaceTabsBar t={t} activePanel="projects" onSelect={() => undefined} />)
    expect(placeEntryPanel(projects)).toBe('files')
    localStorage.clear()
  })
})
