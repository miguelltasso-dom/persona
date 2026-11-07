// @vitest-environment jsdom
// Configurações › Personas (esqueleto atrás de persona.flag.settingsPersonas): a aba só existe com a flag e lista a equipe real.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PersonasSettingsPanel } from '../src/client/settings-personas/PersonasSettingsPanel.tsx'
import { SETTINGS_PERSONAS_FLAG_KEY, isSettingsPersonasEnabled } from '../src/client/settings-personas/personas-flag.ts'
import { pt } from '../src/client/locale/shell/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => {
  cleanup()
  localStorage.clear()
  delete (window as unknown as { __PERSONA_FLAGS__?: unknown }).__PERSONA_FLAGS__
})

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(pt, key, params)) as never

describe('Configurações › Personas (esqueleto)', () => {
  it('lista a equipe com rosto, nome e função; nenhum controle sem host por trás', () => {
    render(<PersonasSettingsPanel t={t} personas={[
      { id: 'p-nina', name: 'Nina', title: 'Design', characterId: 'nina' },
      { id: 'p-bento', name: 'Bento', title: '   ', characterId: 'bento' },
    ]} />)
    expect(screen.getByRole('heading', { name: 'Personas' })).toBeTruthy()
    const card = screen.getByRole('heading', { name: 'O que cada persona pode fazer' }).closest('section')!
    const rows = within(card).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]!).getByText('Nina')).toBeTruthy()
    expect(within(rows[0]!).getByText('Design')).toBeTruthy()
    expect(within(rows[1]!).queryByText('Design')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('sem equipe (ou o host ainda não respondeu): diz por quê, sem lista vazia', () => {
    render(<PersonasSettingsPanel t={t} personas={[]} />)
    expect(screen.getByText('Ainda não há personas')).toBeTruthy()
    expect(screen.getByText('Quando você contratar uma persona, ela aparece aqui.')).toBeTruthy()
    cleanup()
    render(<PersonasSettingsPanel t={t} personas={null} />)
    expect(screen.getByText('Ainda não há personas')).toBeTruthy()
  })

  it('a flag nasce desligada; a aba entra entre Conexões e Uso só com ela ligada', async () => {
    expect(isSettingsPersonasEnabled()).toBe(false)
    vi.resetModules()
    const off = await import('../src/client/shell/nav-places.ts')
    expect(off.NAV_PLACES.find(place => place.id === 'settings')!.tabs.map(tab => tab.panel)).not.toContain('personas')
    localStorage.setItem(SETTINGS_PERSONAS_FLAG_KEY, '1')
    expect(isSettingsPersonasEnabled()).toBe(true)
    vi.resetModules()
    const on = await import('../src/client/shell/nav-places.ts')
    const tabs = on.NAV_PLACES.find(place => place.id === 'settings')!.tabs.map(tab => tab.panel)
    expect(tabs.indexOf('personas')).toBe(tabs.indexOf('connections') + 1)
    expect(tabs.indexOf('usage')).toBe(tabs.indexOf('personas') + 1)
    expect(on.placeOfPanel('personas')?.id).toBe('settings')
  })
})

describe('Configurações › Personas (HT-13 + EFF-1 + D-090)', () => {
  it('renderiza autonomia, chip EFF-1, Sem perguntar (×), Pode contratar e controles D-090 por persona', () => {
    const onChangeAutonomy = vi.fn()
    const onOpenEngine = vi.fn()
    const onChangeCanRecruit = vi.fn()
    const onChangeTeamwork = vi.fn()
    const onRevokeGrant = vi.fn()

    const { container } = render(
      <PersonasSettingsPanel
        t={t}
        personas={[
          {
            id: 'p-clara',
            name: 'Clara',
            title: 'Revisora de contratos',
            characterId: 'clara',
            autonomy: 'act-within-limits',
            engine: {
              runnerKind: 'cli',
              runnerCli: 'claude-code',
              runnerModel: 'opus',
              runnerEffort: 'max',
            },
            canRecruit: true,
            teamwork: {
              canAskColleagues: true,
              askCapPerDay: 6,
              askedToday: 2,
              maxOpinionRounds: 2,
            },
            grants: [
              { cli: 'claude-code', connectorId: 'google-calendar', name: 'Google Calendar' },
            ],
          },
        ]}
        onChangeAutonomy={onChangeAutonomy}
        onOpenEngine={onOpenEngine}
        onChangeCanRecruit={onChangeCanRecruit}
        onChangeTeamwork={onChangeTeamwork}
        onRevokeGrant={onRevokeGrant}
      />,
    )

    // Chip EFF-1 clicável abre o editor de Motor e Esforço (o nível com o nome nativo do motor)
    const chipBtn = container.querySelector<HTMLButtonElement>('[data-persona-engine-trigger="p-clara"]')!
    expect(chipBtn.textContent).toContain('Opus · max')
    fireEvent.click(chipBtn)
    expect(onOpenEngine).toHaveBeenCalledWith('p-clara')

    // ChoiceCards de autonomia ("Sempre pergunta" · "Sugere e espera" · "Decide o rotineiro")
    expect(screen.getByText('Sempre pergunta')).toBeTruthy()
    expect(screen.getByText('Sugere e espera')).toBeTruthy()
    expect(screen.getByText('Decide o rotineiro')).toBeTruthy()
    fireEvent.click(screen.getByText('Sempre pergunta'))
    expect(onChangeAutonomy).toHaveBeenCalledWith('p-clara', 'on-request')

    // "Sem perguntar: Google Calendar ×"
    expect(screen.getByText('Sem perguntar:')).toBeTruthy()
    const revokeBtns = screen.getAllByRole('button', { name: 'Tirar a permissão de Clara no Google Calendar' })
    fireEvent.click(revokeBtns[0]!)
    expect(onRevokeGrant).toHaveBeenCalledWith('p-clara', 'claude-code', 'google-calendar')

    // Switch "Pode contratar"
    const switches = screen.getAllByRole('switch')
    expect(switches).toHaveLength(2)
    fireEvent.click(switches[0]!)
    expect(onChangeCanRecruit).toHaveBeenCalledWith('p-clara', false)

    // D-090 TEAM-3 / TEAM-4 / TEAM-5: "Pode pedir ajuda a colegas", teto 1..20 (padrão 6), rodadas 1..3 (padrão 2)
    fireEvent.click(switches[1]!)
    expect(onChangeTeamwork).toHaveBeenCalledWith('p-clara', { canAskColleagues: false })

    const capSelect = screen.getByLabelText('Pedidos a colegas por dia de Clara') as HTMLSelectElement
    expect(capSelect.value).toBe('6')
    expect(within(capSelect).getByText('Até 6 pedidos a colegas por dia')).toBeTruthy()
    expect(screen.getByText('2 de 6 hoje')).toBeTruthy()
    fireEvent.change(capSelect, { target: { value: '10' } })
    expect(onChangeTeamwork).toHaveBeenCalledWith('p-clara', { askCapPerDay: 10 })

    const roundsSelect = screen.getByLabelText('Rodadas de opinião por tarefa de Clara') as HTMLSelectElement
    expect(roundsSelect.value).toBe('2')
    expect(within(roundsSelect).getByText('Até 2 rodadas de opinião por tarefa')).toBeTruthy()
    // Plural (Keel 13:31): the value 1 is singular, the others keep the plural.
    expect(within(capSelect).getByText('Até 1 pedido a colegas por dia')).toBeTruthy()
    expect(within(capSelect).queryByText('Até 1 pedidos a colegas por dia')).toBeNull()
    expect(within(capSelect).getByText('Até 20 pedidos a colegas por dia')).toBeTruthy()
    expect(within(roundsSelect).getByText('Até 1 rodada de opinião por tarefa')).toBeTruthy()
    expect(within(roundsSelect).queryByText('Até 1 rodadas de opinião por tarefa')).toBeNull()
    expect(within(roundsSelect).getByText('Até 3 rodadas de opinião por tarefa')).toBeTruthy()
    fireEvent.change(roundsSelect, { target: { value: '3' } })
    expect(onChangeTeamwork).toHaveBeenCalledWith('p-clara', { maxOpinionRounds: 3 })

    // Zero jargão técnico
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/MCP|allowlist|xhigh|localStorage|flag/i)
  })

  it('D-090 TEAM-6: bloco "Revisão antes de entregar · {projeto}" com seletor de projeto condicional, radiogroup por setas e "Quem revisa"', () => {
    const onSelectProject = vi.fn()
    const onChangeMode = vi.fn()
    const onChangeReviewer = vi.fn()

    // Com 1 só projeto: não mostra Select de projeto
    const { rerender } = render(
      <PersonasSettingsPanel
        t={t}
        personas={[{ id: 'p-clara', name: 'Clara', title: 'Revisora' }]}
        reviewBeforeDelivery={{
          projects: [{ id: 'proj-1', name: 'Atlas' }],
          selectedProjectId: 'proj-1',
          mode: 'off',
          reviewer: 'coordination',
          onSelectProject,
          onChangeMode,
          onChangeReviewer,
        }}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Revisão antes de entregar · Atlas' })).toBeTruthy()
    expect(screen.queryByLabelText('Projeto')).toBeNull()
    expect(screen.queryByLabelText('Quem revisa')).toBeNull()
    expect(screen.getByText('Cada entrega revisada usa ≈ 1 tarefa curta a mais da sua cota.')).toBeTruthy()

    const group = screen.getByRole('radiogroup', { name: 'Quando revisar' })
    const radios = within(group).getAllByRole('radio')
    expect(radios).toHaveLength(3)
    expect(radios[0]!.getAttribute('aria-checked')).toBe('true')
    expect(radios[0]!.textContent).toBe('Desligada')
    expect(radios[1]!.textContent).toBe('Em todas as entregas')
    expect(radios[2]!.textContent).toBe('Só em código e documentos')

    fireEvent.keyDown(group, { key: 'ArrowRight' })
    expect(onChangeMode).toHaveBeenCalledWith('all')

    // Com >1 projeto e modo != 'off': mostra Select de projeto e Select "Quem revisa"
    rerender(
      <PersonasSettingsPanel
        t={t}
        personas={[{ id: 'p-clara', name: 'Clara', title: 'Revisora' }]}
        reviewBeforeDelivery={{
          projects: [
            { id: 'proj-1', name: 'Atlas' },
            { id: 'proj-2', name: 'Vega' },
          ],
          selectedProjectId: 'proj-1',
          mode: 'all',
          reviewer: 'coordination',
          onSelectProject,
          onChangeMode,
          onChangeReviewer,
        }}
      />,
    )

    const projSelect = screen.getByLabelText('Projeto') as HTMLSelectElement
    fireEvent.change(projSelect, { target: { value: 'proj-2' } })
    expect(onSelectProject).toHaveBeenCalledWith('proj-2')

    const whoSelect = screen.getByLabelText('Quem revisa') as HTMLSelectElement
    expect(within(whoSelect).getByText('A Coordenação')).toBeTruthy()
    expect(within(whoSelect).getByText('Um colega da mesma função')).toBeTruthy()
    expect(within(whoSelect).getByText('Clara')).toBeTruthy()
    fireEvent.change(whoSelect, { target: { value: 'same_role' } })
    expect(onChangeReviewer).toHaveBeenCalledWith('same_role')
  })

  it('HT-11 / HT-13 §5: "Suas skills do Claude" e "Contratar direto, sem Aprovações" (com Notice de aviso quando ligado)', () => {
    const onChangeUseClaudeSkills = vi.fn()
    const onChangeHireDirect = vi.fn()

    const { rerender } = render(
      <PersonasSettingsPanel
        t={t}
        personas={[{ id: 'p-clara', name: 'Clara' }]}
        houseSettings={{
          useClaudeSkills: true,
          hireDirect: false,
          codexLoadedAlways: true,
          onChangeUseClaudeSkills,
          onChangeHireDirect,
        }}
      />,
    )

    expect(screen.getByText('Usar as minhas skills do Claude nas personas')).toBeTruthy()
    expect(screen.getByText('Contratar direto, sem Aprovações')).toBeTruthy()
    expect(screen.getByText('No Codex, todos os seus conectores já ficam carregados nas personas que usam o Codex.')).toBeTruthy()
    expect(screen.queryByText(/contratam na hora, sem passar por Aprovações/i)).toBeNull()

    rerender(
      <PersonasSettingsPanel
        t={t}
        personas={[{ id: 'p-clara', name: 'Clara' }]}
        houseSettings={{
          useClaudeSkills: true,
          hireDirect: true,
          onChangeUseClaudeSkills,
          onChangeHireDirect,
        }}
      />,
    )

    expect(screen.getByText('As personas com permissão contratam na hora, sem passar por Aprovações. Você vê na atividade e pode desfazer.')).toBeTruthy()
  })

  it('mostra o Notice de Codex na sua conta própria (HT-0) só nas personas que o usam, com a ação Abrir Conexões', () => {
    const onOpenConnections = vi.fn()
    render(
      <PersonasSettingsPanel
        t={t}
        personas={[
          { id: 'p-clara', name: 'Clara', codexOwnAccount: true },
          { id: 'p-bia', name: 'Bia' },
        ]}
        onOpenConnections={onOpenConnections}
      />,
    )
    expect(screen.getAllByText(/Codex na sua conta própria: as personas não mexem no app/u)).toHaveLength(1)
    expect(document.body.textContent).not.toContain('ferramentas da Persona')
    expect(document.body.textContent).not.toContain('home nativa')
    expect(document.body.textContent).not.toContain('conta do produto')
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Conexões' }))
    expect(onOpenConnections).toHaveBeenCalledTimes(1)
  })
})
