// @vitest-environment jsdom
// DESIGN-01 #10 · ajustes do Carbon (persona-spec/carbon/lotes/projetos-d10.md): o cabeçalho do quadro só tem 2 controles; o projeto vazio não
// empilha faixas; a grade usa chips leves; Arquivos diz "Trabalho · {projeto}" sem chip avulso; o "Trabalhando" dos cartões é verde (regra 0.2).
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BoardsHome } from '../src/client/boards/BoardsHome.tsx'
import { FilesView } from '../src/client/files/FilesView.tsx'
import { ProjectFlowBoard } from '../src/client/kanban/ProjectFlowBoard.tsx'
import { KanbanCard } from '../src/client/kanban/KanbanCard.tsx'
import type { FlowCardModel, ProjectFlowSnapshot } from '../src/client/kanban/flow-types.ts'
import { pt as kanbanPt } from '../src/client/locale/kanban/locales.ts'
import { pt as filesPt } from '../src/client/locale/files/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { PERSONA_STATE_CHIP_TONE } from '../src/client/team/persona-state.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const COLUMNS: ProjectFlowSnapshot['columns'] = [
  { id: 'todo', name: 'Backlog', category: 'todo' },
  { id: 'c1', name: 'Conteúdo', category: 'doing' },
  { id: 'c2', name: 'Design', category: 'doing' },
  { id: 'c3', name: 'Desenvolvimento', category: 'doing' },
  { id: 'rev', name: 'Revisão', category: 'review' },
  { id: 'done', name: 'Publicado', category: 'done' },
]
function card(id: string, columnId: string, column: FlowCardModel['column']): FlowCardModel {
  return { id, title: `Tarefa ${id}`, projectId: 'p', projectName: 'Site', teamId: 't', teamName: 'Time', column, columnId, waitingEvent: false, blocked: false, reviewApproved: false }
}
function flow(cards: readonly FlowCardModel[]): ProjectFlowSnapshot {
  return { projectId: 'p', projectName: 'Site / produto', template: 'site', columns: COLUMNS, cards }
}

/** Props to override; `undefined` means "the host cannot do it" (the prop is absent). */
type BoardOverrides = { [K in keyof Parameters<typeof ProjectFlowBoard>[0]]?: Parameters<typeof ProjectFlowBoard>[0][K] | undefined }

function board(cards: readonly FlowCardModel[], extra: BoardOverrides = {}) {
  return render(
    <PreviewFrame brandLabel="Persona">
      <ProjectFlowBoard
        dict={kanbanPt}
        flow={flow(cards)}
        surfaceState="ready"
        onNewTask={vi.fn()}
        onOpenHistory={vi.fn()}
        onRequestWorkflowProposal={vi.fn()}
        onSaveWorkflow={vi.fn()}
        {...(extra as Partial<Parameters<typeof ProjectFlowBoard>[0]>)}
      />
    </PreviewFrame>,
  )
}

describe('quadro · o cabeçalho tem 2 controles', () => {
  it('"Opções" (menu) e "Nova tarefa" (primário): Sugestão, Editar fluxo e Histórico moram no menu, e "Novo projeto" não está no cabeçalho', () => {
    const onOpenHistory = vi.fn()
    board([card('a', 'todo', 'todo')], { onOpenHistory })
    const header = document.querySelector('header') as HTMLElement
    const buttons = within(header).getAllByRole('button')
    expect(buttons.map(button => button.textContent?.trim())).toEqual(['Opções', 'Nova tarefa'])
    expect(screen.queryByRole('button', { name: 'Editar fluxo' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Novo projeto' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Opções' }))
    const menu = screen.getByRole('menu', { name: 'Opções' })
    expect(within(menu).getAllByRole('menuitem').map(item => item.textContent?.trim())).toEqual(['Sugestão da Coordenação', 'Editar fluxo', 'Histórico'])
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Histórico' }))
    expect(onOpenHistory).toHaveBeenCalledTimes(1)
  })

  it('só entram no menu as ações que o host sabe fazer (sem item morto) e sem nenhuma ação não há botão "Opções"', () => {
    board([card('a', 'todo', 'todo')], { onOpenHistory: undefined, onRequestWorkflowProposal: undefined })
    fireEvent.click(screen.getByRole('button', { name: 'Opções' }))
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map(item => item.textContent?.trim())).toEqual(['Editar fluxo'])
    cleanup()
    board([card('a', 'todo', 'todo')], { onOpenHistory: undefined, onRequestWorkflowProposal: undefined, onSaveWorkflow: undefined })
    expect(screen.queryByRole('button', { name: 'Opções' })).toBeNull()
  })

  it('"Novo projeto" vai para dentro do seletor de projeto (menu do nome do projeto)', () => {
    const onNewProject = vi.fn()
    board([card('a', 'todo', 'todo')], {
      onNewProject,
      switcher: { projects: [{ id: 'p', name: 'Site / produto', kind: 'personal' }], currentId: 'p', onSelect: vi.fn(), onSeeAll: vi.fn() },
    })
    fireEvent.click(screen.getByRole('button', { name: /Projeto atual: Site/u }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Novo projeto' }))
    expect(onNewProject).toHaveBeenCalledTimes(1)
  })
})

describe('quadro · "Novo projeto" sem seletor', () => {
  it('com o nome do projeto como título simples não há menu de projetos: "Novo projeto" fica em "Opções" (nunca em lugar nenhum)', () => {
    const onNewProject = vi.fn()
    board([card('a', 'todo', 'todo')], { onNewProject })
    fireEvent.click(screen.getByRole('button', { name: 'Opções' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Novo projeto' }))
    expect(onNewProject).toHaveBeenCalledTimes(1)
  })
})

describe('quadro · projeto vazio', () => {
  it('sem tarefa: nada de "Arraste para mover" nem faixa de sprint vazia; só o convite', () => {
    board([])
    expect(screen.queryByText(kanbanPt['drag.hint'])).toBeNull()
    expect(document.querySelector('[data-persona-sprint]')).toBeNull()
    expect(document.querySelector('[data-persona-empty-invite]')).toBeTruthy()
  })

  it('com tarefa, a dica de arrastar e a faixa de sprint voltam', () => {
    board([card('a', 'todo', 'todo')])
    expect(screen.getByText(kanbanPt['drag.hint'])).toBeTruthy()
    expect(document.querySelector('[data-persona-sprint]')).toBeTruthy()
  })

  it('colunas vazias da mesma categoria: a ilustração só na primeira, as outras ficam com o texto curto', () => {
    board([])
    const doing = ['Conteúdo', 'Design', 'Desenvolvimento'].map(name => document.querySelector(`section[aria-label^="${name} —"]`) as HTMLElement)
    expect(doing.map(column => column.querySelectorAll('img').length)).toEqual([1, 0, 0])
    for (const column of doing) expect(column.querySelector('p')).toBeTruthy()
    // a category that appears once keeps its art
    expect((document.querySelector('section[aria-label^="Revisão —"]') as HTMLElement).querySelectorAll('img').length).toBe(1)
  })
})

describe('grade de projetos', () => {
  const summary = { id: 'p', name: 'Site', flowModel: 'site' as const, counts: { todo: 1, doing: 0, review: 0, needs_you: 0, done: 0, blocked: 0 }, needsYouCount: 0, activeWorkers: [], sprintLabel: 'Sprint 1' }

  it('os filtros são chips leves (botões com aria-pressed), não o trilho afundado de abas; "Ver tudo por categoria" é botão', () => {
    const onGlobalView = vi.fn()
    render(<PreviewFrame brandLabel="Persona"><BoardsHome dict={kanbanPt} summaries={[summary]} onOpenProject={vi.fn()} onGlobalView={onGlobalView} /></PreviewFrame>)
    expect(screen.queryByRole('tablist')).toBeNull()
    const group = screen.getByRole('group', { name: 'Filtrar projetos' })
    expect(within(group).getAllByRole('button').map(button => button.textContent?.trim())).toEqual(['Todos', 'Com sprint ativa', 'Precisa de você'])
    expect(within(group).getByRole('button', { name: 'Todos' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(group).getByRole('button', { name: 'Precisa de você' }))
    expect(within(group).getByRole('button', { name: 'Precisa de você' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(kanbanPt['boards.filterEmpty'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver tudo por categoria' }))
    expect(onGlobalView).toHaveBeenCalledTimes(1)
  })
})

describe('Arquivos', () => {
  it('o sobretítulo diz "Trabalho · {projeto}" e não há chip avulso "Projeto: …"', () => {
    render(<PreviewFrame brandLabel="Persona"><FilesView dict={filesPt} initialState="needRoot" scopeProjectName="Site / produto" onChooseProjectRoot={vi.fn()} /></PreviewFrame>)
    expect(screen.getByText('Trabalho · Site / produto')).toBeTruthy()
    expect(screen.queryByText(/Projeto: /u)).toBeNull()
  })

  it('sem projeto da vez: o sobretítulo de antes', () => {
    render(<PreviewFrame brandLabel="Persona"><FilesView dict={filesPt} initialState="needRoot" scopeProjectName={null} /></PreviewFrame>)
    expect(screen.getByText(filesPt['header.eyebrow'])).toBeTruthy()
  })
})

describe('cartões do quadro · regra 0.2', () => {
  it('o cartão em andamento diz "Bento está fazendo" em verde (o tom do vocabulário único); o estado da persona (Trabalhando, Esperando você, Precisa de ajuda) fica no rosto e no rail, nunca no cartão (Muse + Atlas, 12/11)', () => {
    expect(PERSONA_STATE_CHIP_TONE.working).toBe('success')
    const withState = (state: 'working' | 'waiting' | 'stuck') => ({ ...card(`s-${state}`, 'c1', 'in_progress'), assigneeState: state, assignee: { id: 'bento', name: 'Bento', initials: 'B' } })
    for (const [state, label] of [['working', 'Bento está fazendo'], ['waiting', 'Bento está fazendo'], ['stuck', 'Bento está fazendo']] as const) {
      const view = render(
        <PreviewFrame brandLabel="Persona">
          <KanbanCard dict={kanbanPt} card={withState(state)} draggingId={null} showProject={false} columnLabels={{ todo: 'a', in_progress: 'b', in_review: 'c', blocked: 'd', done: 'e' }} onDragStart={vi.fn()} onDragEnd={vi.fn()} />
        </PreviewFrame>,
      )
      const chip = within(view.container).getByText(label)
      expect(chip.className, state).toContain('success') // the card is being worked on: green, whatever the persona's own state is
      expect(view.container.textContent, state).not.toMatch(/Trabalhando|Esperando você|Aguardando você|Precisa de ajuda|Travada|Descansando/u)
      view.unmount()
    }
  })
})
