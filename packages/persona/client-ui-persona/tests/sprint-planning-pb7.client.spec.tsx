// @vitest-environment jsdom
// PB-7 (BOARDS-SPEC §3): planejamento backlog ↔ sprint com teclado, arrastar e soltar, busca/filtros e capacidade.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SprintPlanningView, sprintCapacity, type SprintPlanningViewProps } from '../src/client/kanban/SprintPlanningView.tsx'
import type { FlowCardModel } from '../src/client/kanban/flow-types.ts'
import { pt } from '../src/client/locale/kanban/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const card = (id: string, title: string, assignee?: { id: string; name: string }): FlowCardModel => ({
  id,
  title,
  columnId: 'col-todo',
  column: 'todo',
  projectId: 'code',
  projectName: 'Software',
  teamId: 'team',
  teamName: 'Equipe',
  blocked: false,
  waitingEvent: false,
  reviewApproved: false,
  ...(assignee === undefined ? {} : { assignee: { ...assignee, initials: assignee.name.slice(0, 1) } }),
})

const BACKLOG = [
  card('t1', 'Escrever o README', { id: 'nina', name: 'Nina' }),
  card('t2', 'Revisar contrato', { id: 'bento', name: 'Bento' }),
  card('t3', 'Planejar lançamento'),
]
const IN_SPRINT = [card('s1', 'Corrigir login', { id: 'nina', name: 'Nina' }), card('s2', 'Ajustar preços', { id: 'nina', name: 'Nina' })]

function view(extra: Partial<SprintPlanningViewProps> = {}) {
  const props: SprintPlanningViewProps = {
    dict: pt,
    projectName: 'Software',
    backlog: BACKLOG,
    sprintCards: IN_SPRINT,
    draft: { name: 'Sprint 3', objective: 'Entregar o login', startsAt: '', endsAt: '' },
    selectedBacklogId: null,
    selectedSprintId: null,
    onDraftChange: () => undefined,
    onSelectBacklog: () => undefined,
    onSelectSprint: () => undefined,
    onAddToSprint: () => undefined,
    onRemoveFromSprint: () => undefined,
    onCancel: () => undefined,
    onStart: () => undefined,
    ...extra,
  }
  return render(<PreviewFrame brandLabel="Persona"><SprintPlanningView {...props} /></PreviewFrame>)
}

describe('linhas de tarefa: teclado (antes eram Cards clicáveis sem foco)', () => {
  it('cada tarefa é um checkbox rotulado pelo título; marcar chama a seleção', () => {
    const onSelectBacklog = vi.fn()
    const onSelectSprint = vi.fn()
    view({ onSelectBacklog, onSelectSprint })
    const box = screen.getByRole('checkbox', { name: /Escrever o README/u })
    box.focus()
    expect(document.activeElement).toBe(box)
    fireEvent.click(box) // Espaço num checkbox
    expect(onSelectBacklog).toHaveBeenCalledWith('t1')
    fireEvent.click(screen.getByRole('checkbox', { name: /Corrigir login/u }))
    expect(onSelectSprint).toHaveBeenCalledWith('s1')
  })

  it('a tarefa selecionada aparece marcada; marcar de novo limpa a seleção', () => {
    const onSelectBacklog = vi.fn()
    view({ selectedBacklogId: 't2', onSelectBacklog })
    expect((screen.getByRole('checkbox', { name: /Revisar contrato/u }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: /Revisar contrato/u }))
    expect(onSelectBacklog).toHaveBeenCalledWith(null)
  })

  it('mostra o responsável de cada tarefa', () => {
    view()
    const row = screen.getByRole('checkbox', { name: /Escrever o README/u }).closest('li') as HTMLElement
    expect(within(row).getByText('Nina')).toBeTruthy()
  })
})

describe('busca e filtros do backlog', () => {
  it('a busca filtra pelo título; sem resultado diz isso', () => {
    view()
    fireEvent.change(screen.getByRole('searchbox', { name: pt['planSprint.search'] }), { target: { value: 'contrato' } })
    expect(screen.queryByRole('checkbox', { name: /README/u })).toBeNull()
    expect(screen.getByRole('checkbox', { name: /Revisar contrato/u })).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox', { name: pt['planSprint.search'] }), { target: { value: 'zzz' } })
    expect(screen.getByText(pt['planSprint.noMatch'])).toBeTruthy()
  })

  it('chips por responsável com aria-pressed; "Todos" limpa', () => {
    view()
    const group = screen.getByRole('group', { name: pt['planSprint.filterAssignee'] })
    const nina = within(group).getByRole('button', { name: 'Nina' })
    expect(nina.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(nina)
    expect(nina.getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('checkbox', { name: /Revisar contrato/u })).toBeNull()
    expect(screen.getByRole('checkbox', { name: /Escrever o README/u })).toBeTruthy()
    fireEvent.click(within(group).getByRole('button', { name: pt['planSprint.filterAll'] }))
    expect(screen.getByRole('checkbox', { name: /Revisar contrato/u })).toBeTruthy()
  })
})

describe('arrastar e soltar (com o equivalente por teclado já existente)', () => {
  const transfer = () => {
    const data: Record<string, string> = {}
    return { setData: (k: string, v: string) => { data[k] = v }, getData: (k: string) => data[k] ?? '', effectAllowed: '', dropEffect: '' }
  }

  it('sem handlers de movimento não há arrastar (só selecionar + botão)', () => {
    view()
    expect(screen.getByRole('checkbox', { name: /Escrever o README/u }).closest('li')?.getAttribute('draggable')).toBeNull()
    expect(screen.queryByText(pt['planSprint.dragHint'])).toBeNull()
  })

  it('arrastar do backlog e soltar na sprint manda a tarefa e anuncia', () => {
    const onMoveToSprint = vi.fn()
    view({ onMoveToSprint, onMoveToBacklog: vi.fn() })
    const row = screen.getByRole('checkbox', { name: /Escrever o README/u }).closest('li') as HTMLElement
    expect(row.getAttribute('draggable')).toBe('true')
    const dataTransfer = transfer()
    fireEvent.dragStart(row, { dataTransfer })
    const sprint = screen.getByRole('heading', { name: pt['planSprint.sprintColumn'] }).closest('section') as HTMLElement
    fireEvent.dragOver(sprint, { dataTransfer })
    expect(sprint.hasAttribute('data-drop-target')).toBe(true)
    fireEvent.drop(sprint, { dataTransfer })
    expect(onMoveToSprint).toHaveBeenCalledWith('t1')
    expect(screen.getByRole('status').textContent).toBe('Escrever o README foi para a sprint')
  })

  it('arrastar da sprint e soltar no backlog devolve a tarefa', () => {
    const onMoveToBacklog = vi.fn()
    view({ onMoveToSprint: vi.fn(), onMoveToBacklog })
    const row = screen.getByRole('checkbox', { name: /Corrigir login/u }).closest('li') as HTMLElement
    const dataTransfer = transfer()
    fireEvent.dragStart(row, { dataTransfer })
    const backlog = screen.getByRole('heading', { name: pt['planSprint.backlog'] }).closest('section') as HTMLElement
    fireEvent.dragOver(backlog, { dataTransfer })
    fireEvent.drop(backlog, { dataTransfer })
    expect(onMoveToBacklog).toHaveBeenCalledWith('s1')
    expect(screen.getByRole('status').textContent).toBe('Corrigir login voltou ao backlog')
  })

  it('soltar fora de uma coluna (ou sem arrastar) não move nada', () => {
    const onMoveToSprint = vi.fn()
    view({ onMoveToSprint, onMoveToBacklog: vi.fn() })
    const sprint = screen.getByRole('heading', { name: pt['planSprint.sprintColumn'] }).closest('section') as HTMLElement
    fireEvent.drop(sprint, { dataTransfer: transfer() })
    expect(onMoveToSprint).not.toHaveBeenCalled()
  })
})

describe('capacidade da sprint', () => {
  it('conta tarefas por persona e ordena do mais carregado ao menos', () => {
    const rows = sprintCapacity([...IN_SPRINT, card('s3', 'Sem dono'), card('s4', 'Outra', { id: 'bento', name: 'Bento' })])
    expect(rows.map(row => [row.name, row.count])).toEqual([['Nina', 2], [null, 1], ['Bento', 1]])
  })

  it('mostra avatar + barra + contagem em português com singular e plural', () => {
    view({ sprintCards: [...IN_SPRINT, card('s4', 'Outra', { id: 'bento', name: 'Bento' })] })
    const list = screen.getByRole('list', { name: pt['planSprint.capacityTitle'] })
    expect(within(list).getByText('2 tarefas')).toBeTruthy()
    expect(within(list).getByText('1 tarefa')).toBeTruthy()
  })

  it('sprint vazia não mostra medidor', () => {
    view({ sprintCards: [] })
    expect(screen.queryByRole('list', { name: pt['planSprint.capacityTitle'] })).toBeNull()
  })
})
