// @vitest-environment jsdom
// A-1 (NAV-SPEC fase 1) + CV-1: 5 lugares compactos no topo do rail (as conversas são a própria barra), telas de hoje como abas, apelidos antigos, última aba lembrada.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NAV_GROUPS } from '../src/client/shell/nav-groups.ts'
import {
  NAV_PLACES,
  PLACE_ALIASES,
  RAIL_PLACES,
  normalizeAlias,
  panelsReachableFromPlaces,
  placeEntryPanel,
  placeOfPanel,
  rememberPlaceTab,
  resolvePlaceAlias,
} from '../src/client/shell/nav-places.ts'
import { PlaceTabsBar } from '../src/client/shell/PlaceTabsBar.tsx'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { setFlagDefaults } from '../src/client/flags.ts'

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

/** CV-1: Canais e Mensagens diretas moram na barra de conversas, não num lugar com abas. */
const CONVERSATION_PANELS: readonly string[] = ['channels', 'directMessages']
/** Cena 20 e cena 23 (Muse): Membros vira cartão em Conexões (aba só com a flag remoteTeamTab); Personalidade vira Figurinhas dentro de Aparência. */
const MOVED_PANELS: readonly string[] = ['members', 'personality']

describe('os lugares', () => {
  it('cinco no topo do rail (sem "Conversas": as conversas são a própria barra) e Configurações no rodapé', () => {
    expect(RAIL_PLACES.map(place => place.id)).toEqual(['overview', 'projects', 'approvals', 'team', 'memory'])
    expect(NAV_PLACES.map(place => place.id)).toContain('settings')
    expect(NAV_PLACES.map(place => place.id)).not.toContain('conversations')
    expect(RAIL_PLACES.map(place => shellPt[place.labelKey])).toEqual([
      'Visão geral', 'Projetos', 'Aprovações', 'Equipe', 'Memória da empresa',
    ])
  })

  it('Configurações com os padrões do produto: Conexões · Cofre · Personas · Uso e limites · Importadores · Aparência · Sobre (sem Membros e sem Ferramentas: a flag toolsCatalog nasce desligada)', async () => {
    setFlagDefaults(undefined)
    vi.resetModules()
    const fresh = await import('../src/client/shell/nav-places.ts')
    setFlagDefaults(false)
    const settings = fresh.NAV_PLACES.find(place => place.id === 'settings')
    expect(settings?.tabs.map(tab => tab.panel)).toEqual(['connections', 'cofre', 'personas', 'usage', 'importers', 'appearance', 'about'])
  })

  it('com a flag remoteTeamTab ligada, Membros volta a ser aba e o apelido "Membros" leva a ela', async () => {
    localStorage.setItem('persona.flag.remoteTeamTab', '1')
    vi.resetModules()
    const fresh = await import('../src/client/shell/nav-places.ts')
    localStorage.removeItem('persona.flag.remoteTeamTab')
    const settings = fresh.NAV_PLACES.find(place => place.id === 'settings')
    expect(settings?.tabs.map(tab => tab.panel)).toContain('members')
    expect(fresh.resolvePlaceAlias('Membros')).toBe('members')
  })

  it('nenhuma tela some: tudo o que o rail antigo mostrava continua a 1 clique de algum lugar (ou da barra de conversas)', () => {
    const reachable = new Set(panelsReachableFromPlaces())
    const old = NAV_GROUPS.flatMap(group => group.items.map(item => item.panel)).filter(panel => panel !== 'help')
    for (const panel of old) {
      if (CONVERSATION_PANELS.includes(panel) || MOVED_PANELS.includes(panel)) continue
      expect(reachable.has(panel), `painel ${panel} perdeu o lugar`).toBe(true)
    }
    // Canais e DMs não estão em nenhum lugar: a barra de conversas os abre.
    for (const panel of CONVERSATION_PANELS) expect(reachable.has(panel as never), panel).toBe(false)
  })

  it('cada tela está em um lugar só (as rotas não mudam e o rótulo da aba não é ambíguo)', () => {
    const all = panelsReachableFromPlaces()
    expect(new Set(all).size).toBe(all.length)
  })

  it('o lugar das abas: Equipe, Memória, Configurações e Projetos (Canais e DMs não têm lugar: são a barra)', () => {
    expect(placeOfPanel('orgChart')?.id).toBe('team')
    expect(placeOfPanel('teamHealth')?.id).toBe('team')
    expect(placeOfPanel('rules')?.id).toBe('memory')
    expect(placeOfPanel('usage')?.id).toBe('settings')
    expect(placeOfPanel('directMessages')).toBeUndefined()
    expect(placeOfPanel('channels')).toBeUndefined()
    expect(placeOfPanel('kanban')?.id).toBe('projects')
    expect(placeOfPanel('help')).toBeUndefined()
    expect(placeOfPanel('profile')).toBeUndefined()
  })

  it('todo rótulo de lugar e de aba existe no pt e no en', async () => {
    const { en } = await import('../src/client/locale/shell/locales.ts')
    for (const place of NAV_PLACES) {
      expect(shellPt[place.labelKey], place.labelKey).toBeTruthy()
      expect(en[place.labelKey], place.labelKey).toBeTruthy()
      for (const tab of place.tabs) {
        expect(shellPt[tab.labelKey], tab.labelKey).toBeTruthy()
        expect(en[tab.labelKey], tab.labelKey).toBeTruthy()
      }
    }
  })
})

describe('apelidos para o Ctrl K', () => {
  it('"Quadros", "Kanban", "Canvas", "Saúde", "Cofre", "Membros" levam à aba certa', () => {
    expect(resolvePlaceAlias('Quadros')).toBe('kanban')
    expect(resolvePlaceAlias('KANBAN ')).toBe('kanban')
    expect(resolvePlaceAlias('Canvas')).toBe('canvas')
    expect(resolvePlaceAlias('Saúde')).toBe('teamHealth')
    expect(resolvePlaceAlias('saude')).toBe('teamHealth')
    expect(resolvePlaceAlias('Cofre')).toBe('cofre') // item 15 (Muse 12/11): o Cofre tem aba própria, ao lado de Conexões
    expect(resolvePlaceAlias('Conexões')).toBe('connections')
    // Sem a flag remoteTeamTab (padrão do produto), "Membros" leva ao cartão Equipe à distância, em Conexões.
    expect(resolvePlaceAlias('Membros')).toBe('connections')
  })

  it('o que não é apelido não é interceptado', () => {
    expect(resolvePlaceAlias('')).toBeUndefined()
    expect(resolvePlaceAlias('relatório de maio')).toBeUndefined()
  })

  it('todo apelido leva a uma tela que algum lugar alcança', () => {
    const reachable = new Set(panelsReachableFromPlaces())
    for (const row of PLACE_ALIASES) {
      if (CONVERSATION_PANELS.includes(row.panel)) continue // "canais", "dms"…: a barra de conversas abre
      expect(reachable.has(row.panel), row.alias).toBe(true)
      expect(row.alias, row.alias).toBe(normalizeAlias(row.alias))
    }
  })
})

describe('última aba por lugar', () => {
  const team = NAV_PLACES.find(place => place.id === 'team')!

  it('sem lembrança entra pela primeira aba; depois lembra a escolhida', () => {
    const storage = memoryStorage()
    expect(placeEntryPanel(team, storage)).toBe('team')
    rememberPlaceTab(team, 'teamHealth', storage)
    expect(placeEntryPanel(team, storage)).toBe('teamHealth')
  })

  it('ignora o que não é aba deste lugar (lixo ou aba que saiu)', () => {
    expect(placeEntryPanel(team, memoryStorage({ 'persona.place.lastTab.team': 'kanban' }))).toBe('team')
    const storage = memoryStorage()
    rememberPlaceTab(team, 'kanban', storage)
    expect(storage.data.size).toBe(0)
  })

  it('storage bloqueado não lança', () => {
    const blocked = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    }
    expect(placeEntryPanel(team, blocked)).toBe('team')
    expect(() => { rememberPlaceTab(team, 'orgChart', blocked) }).not.toThrow()
  })
})

describe('PlaceTabsBar', () => {
  it('mostra as abas do lugar, com data-tab-panel = id do painel, e troca de tela pela aba', () => {
    const onSelect = vi.fn()
    const { container } = render(<PlaceTabsBar t={t} activePanel="orgChart" onSelect={onSelect} />)
    expect(screen.getByRole('tablist', { name: 'Seções de Equipe' })).toBeTruthy()
    const panels = [...container.querySelectorAll('[role="tab"]')].map(node => node.getAttribute('data-tab-panel'))
    expect(panels).toEqual(['team', 'orgChart', 'teamHealth', 'routines'])
    expect(screen.getByRole('tab', { name: 'Quem cuida de quem' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('tab', { name: 'Saúde' }))
    expect(onSelect).toHaveBeenCalledWith('teamHealth')
  })

  it('lugar de uma tela só e telas fora dos lugares não têm barra', () => {
    expect(render(<PlaceTabsBar t={t} activePanel="overview" onSelect={() => undefined} />).container.firstChild).toBeNull()
    cleanup()
    expect(render(<PlaceTabsBar t={t} activePanel="approvals" onSelect={() => undefined} />).container.firstChild).toBeNull()
    cleanup()
    expect(render(<PlaceTabsBar t={t} activePanel="help" onSelect={() => undefined} />).container.firstChild).toBeNull()
  })

  it('lembra a aba aberta para a próxima vez que o lugar for aberto', () => {
    localStorage.clear()
    render(<PlaceTabsBar t={t} activePanel="rules" onSelect={() => undefined} />)
    const memory = NAV_PLACES.find(place => place.id === 'memory')!
    expect(placeEntryPanel(memory)).toBe('rules')
    localStorage.clear()
  })
})
