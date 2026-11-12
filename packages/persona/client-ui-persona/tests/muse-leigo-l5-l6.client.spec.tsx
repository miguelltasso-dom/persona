// @vitest-environment jsdom
// Muse, passada de leigo 12/11: (L5) o cabeçalho da coluna diz o nome UMA vez; (L6) o cartão feito diz quem fez, não o estado de agora da persona.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BoardColumn, nameSaysStage } from '../src/client/primitives/Board.tsx'
import { KanbanCard } from '../src/client/kanban/KanbanCard.tsx'
import { pt as kanbanPt } from '../src/client/locale/kanban/locales.ts'
import type { KanbanCardModel } from '../src/client/kanban/types.ts'

afterEach(() => { cleanup() })

describe('L5 · o cabeçalho da coluna não repete a etapa', () => {
  it.each([
    ['A fazer', 'todo', 'A fazer'],
    ['Fazendo', 'doing', 'Em andamento'],
    ['Feito', 'done', 'Concluído'],
    ['Em revisão', 'review', 'Em revisão'],
    ['  EM ANDAMENTO ', 'doing', 'Em andamento'],
    ['Concluido', 'done', 'Concluído'],
  ] as const)('"%s" já diz a etapa %s: sem a 2ª linha', (name, category, label) => {
    expect(nameSaysStage(name, category, label)).toBe(true)
    render(<BoardColumn name={name} category={category} categoryLabel={label} count={2} emptyLabel="vazio"><p>cartão</p></BoardColumn>)
    expect(screen.queryByText(label, { selector: 'p' })).toBeNull()
    expect(screen.getByRole('heading', { name: name.trim() })).toBeTruthy()
  })

  it('um nome que é outro mantém a etapa embaixo ("Revisão do cliente" · Em revisão)', () => {
    expect(nameSaysStage('Revisão do cliente', 'review', 'Em revisão')).toBe(false)
    render(<BoardColumn name="Revisão do cliente" category="review" categoryLabel="Em revisão" count={1} emptyLabel="vazio"><p>cartão</p></BoardColumn>)
    expect(screen.getByText('Em revisão', { selector: 'p' })).toBeTruthy()
  })

  it('um nome de outra etapa não conta: "Feito" numa coluna em andamento mantém a linha', () => {
    expect(nameSaysStage('Feito', 'doing', 'Em andamento')).toBe(false)
  })
})

const DONE: KanbanCardModel = {
  id: 'c1', title: 'Cartaz da promoção', projectId: 'p1', projectName: 'Padaria Lua', teamId: 't1', teamName: 'Marketing',
  column: 'done', assignee: { id: 'bia', name: 'Bia', initials: 'B' }, assigneeState: 'resting', waitingEvent: false, blocked: false, reviewApproved: false,
}

function card(model: KanbanCardModel): ReactElementForTest {
  return (
    <KanbanCard
      dict={kanbanPt}
      card={model}
      draggingId={null}
      showProject={false}
      columnLabels={{ backlog: 'A fazer', in_progress: 'Fazendo', in_review: 'Em revisão', blocked: 'Bloqueado', done: 'Feito' } as never}
      onDragStart={() => undefined}
      onDragEnd={() => undefined}
    />
  )
}

type ReactElementForTest = ReturnType<typeof KanbanCard>

describe('L6 · o cartão feito diz quem fez', () => {
  it('feito: "Feito por Bia" e nenhum chip do estado de agora ("Descansando")', () => {
    render(card(DONE))
    expect(screen.getByText('Feito por Bia')).toBeTruthy()
    expect(screen.queryByText('Descansando')).toBeNull()
  })

  it('feito e sem responsável: nenhum chip de estado, nenhuma frase inventada', () => {
    const { assignee: _assignee, assigneeState: _state, ...unassigned } = DONE
    void [_assignee, _state]
    const { container } = render(card(unassigned))
    expect(screen.queryByText(/Feito por/u)).toBeNull()
    expect(screen.queryByText('Descansando')).toBeNull()
    expect(container.querySelector('[data-card-done-by]')).toBeNull()
  })

  it('cartão em andamento diz o estado DO CARTÃO ("Bia está fazendo"), nunca o da persona (Muse + Atlas, 12/11)', () => {
    render(card({ ...DONE, column: 'in_progress', assigneeState: 'working' }))
    expect(screen.queryByText(/Feito por/u)).toBeNull()
    expect(screen.getByText('Bia está fazendo')).toBeTruthy()
    expect(screen.queryByText('Trabalhando')).toBeNull()
  })
})
