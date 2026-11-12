// @vitest-environment jsdom
// DESIGN-01 onda 2 · #10 (Muse §5.1): o quadro do projeto da vez é a tela do lugar Projetos. Cabeçalho "Pessoal ▾" + "+ Novo projeto";
// uma barra de abas só (a do lugar), sem "Voltar aos quadros"; projeto vazio = colunas vazias + um convite único ao #geral.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectFlowBoard } from '../src/client/kanban/ProjectFlowBoard.tsx'
import type { ProjectFlowSnapshot } from '../src/client/kanban/flow-types.ts'
import { pt as kanbanPt } from '../src/client/locale/kanban/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'

installPreviewTheme()
afterEach(() => { cleanup() })

const EMPTY_FLOW: ProjectFlowSnapshot = {
  projectId: 'p-pessoal',
  projectName: 'Pessoal',
  template: 'simples',
  columns: [
    { id: 'c1', name: 'A fazer', category: 'todo' },
    { id: 'c2', name: 'Fazendo', category: 'doing' },
    { id: 'c3', name: 'Pronto', category: 'done' },
  ],
  cards: [],
}

const CARD = {
  id: 't1', title: 'Escrever a página inicial', column: 'todo' as const, columnId: 'c1', projectId: 'p-pessoal', projectName: 'Pessoal', teamId: 'team', teamName: 'Equipe', waitingEvent: false, blocked: false, reviewApproved: false,
}

const projects = [
  { id: 'p-pessoal', name: 'Pessoal', kind: 'personal' },
  { id: 'p-site', name: 'Site da loja', kind: 'shared' },
]

function board(props: Partial<Parameters<typeof ProjectFlowBoard>[0]> = {}) {
  return render(
    <PreviewFrame brandLabel="Persona">
      <ProjectFlowBoard dict={kanbanPt} flow={EMPTY_FLOW} surfaceState="ready" {...props} />
    </PreviewFrame>,
  )
}

describe('ProjectFlowBoard · cabeçalho do lugar Projetos (#10)', () => {
  it('o título é o seletor de projeto e há "+ Novo projeto"; o seletor leva à grade', () => {
    const onSelectProject = vi.fn()
    const onSeeAllProjects = vi.fn()
    const onNewProject = vi.fn()
    board({ switcher: { projects, currentId: 'p-pessoal', onSelect: onSelectProject, onSeeAll: onSeeAllProjects }, onNewProject })
    const heading = screen.getByRole('heading', { level: 1 })
    fireEvent.click(within(heading).getByRole('button', { name: /Pessoal/u }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Site da loja' }))
    expect(onSelectProject).toHaveBeenCalledWith('p-site')
    fireEvent.click(within(heading).getByRole('button', { name: /Pessoal/u }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver todos os projetos' }))
    expect(onSeeAllProjects).toHaveBeenCalledTimes(1)
    // "Novo projeto" is an item of the same menu (the header keeps two controls)
    fireEvent.click(within(heading).getByRole('button', { name: /Pessoal/u }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Novo projeto' }))
    expect(onNewProject).toHaveBeenCalledTimes(1)
  })

  it('uma barra de abas só (a do lugar): sem a barra interna e sem "Voltar aos quadros"', () => {
    board({ switcher: { projects, currentId: 'p-pessoal', onSelect: () => undefined, onSeeAll: () => undefined }, onNewProject: () => undefined })
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Voltar aos quadros' })).toBeNull()
  })

  it('"Histórico" abre o histórico do projeto (era uma aba interna)', () => {
    const onOpenHistory = vi.fn()
    board({ onOpenHistory })
    fireEvent.click(screen.getByRole('button', { name: 'Opções' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Histórico' }))
    expect(onOpenHistory).toHaveBeenCalledTimes(1)
  })

  it('sem o seletor (uso antigo) o título segue sendo o nome do projeto', () => {
    board()
    expect(screen.getByRole('heading', { level: 1, name: 'Pessoal' })).toBeTruthy()
  })

  it('a raiz do quadro leva o marcador de superfície que os gates leem', () => {
    board()
    expect(document.querySelector('[data-persona-surface="boards"]')).not.toBeNull()
  })
})

describe('ProjectFlowBoard · projeto vazio (#10)', () => {
  it('colunas vazias + um convite único a pedir a primeira tarefa no #geral', () => {
    const onNewTask = vi.fn()
    board({ onNewTask })
    for (const name of ['A fazer', 'Fazendo', 'Pronto']) expect(screen.getAllByText(name).length, name).toBeGreaterThan(0)
    expect(screen.getByText('Peça a primeira tarefa no #geral')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir o #geral' }))
    expect(onNewTask).toHaveBeenCalledTimes(1)
    // nenhum índice vazio no lugar das colunas
    expect(screen.queryByText(kanbanPt['empty.title'])).toBeNull()
  })

  it('com tarefas no quadro o convite não aparece; sem o envio ligado também não (nada de botão morto)', () => {
    board({ flow: { ...EMPTY_FLOW, cards: [CARD] }, onNewTask: () => undefined })
    expect(screen.queryByText('Peça a primeira tarefa no #geral')).toBeNull()
    cleanup()
    board()
    expect(screen.queryByText('Peça a primeira tarefa no #geral')).toBeNull()
  })
})
