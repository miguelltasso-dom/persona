// @vitest-environment jsdom
// PB-7 (BOARDS-SPEC §2.1 e §4): faixa da sprint e encerramento com resumo honesto.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SprintView } from '@deepseek-ai/dsh-persona-host/types'
import { CloseSprintModal } from '../src/client/kanban/CloseSprintModal.tsx'
import { SprintBand } from '../src/client/kanban/SprintBand.tsx'
import { ProjectFlowBoard } from '../src/client/kanban/ProjectFlowBoard.tsx'
import type { FlowCardModel, ProjectFlowSnapshot } from '../src/client/kanban/flow-types.ts'
import { pt } from '../src/client/locale/kanban/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const wrap = (node: React.ReactNode) => render(<PreviewFrame brandLabel="Persona">{node}</PreviewFrame>)

describe('CloseSprintModal', () => {
  it('"Atrasadas" só aparece quando o dado existe (nada de "0" inventado)', () => {
    const { rerender } = wrap(<CloseSprintModal dict={pt} sprintName="Sprint 3" delivered={4} rolled={2} onClose={() => undefined} onConfirm={() => undefined} />)
    expect(screen.queryByText(pt['closeSprint.late'])).toBeNull()
    expect(screen.getByText(pt['closeSprint.delivered'])).toBeTruthy()
    rerender(<PreviewFrame brandLabel="Persona"><CloseSprintModal dict={pt} sprintName="Sprint 3" delivered={4} late={1} rolled={2} onClose={() => undefined} onConfirm={() => undefined} /></PreviewFrame>)
    expect(screen.getByText(pt['closeSprint.late'])).toBeTruthy()
  })

  it('"Quem fez o quê" mostra cada persona com a contagem; sem entregas não há bloco', () => {
    wrap(
      <CloseSprintModal
        dict={pt}
        sprintName="Sprint 3"
        delivered={3}
        rolled={0}
        contributors={[{ id: 'nina', name: 'Nina', count: 2 }, { id: 'bento', name: 'Bento', count: 1 }]}
        onClose={() => undefined}
        onConfirm={() => undefined}
      />,
    )
    const who = screen.getByRole('region', { name: pt['closeSprint.who'] })
    expect(within(who).getByText('Nina')).toBeTruthy()
    expect(within(who).getByText('2')).toBeTruthy()
    expect(within(who).getByText('Bento')).toBeTruthy()
    cleanup()
    wrap(<CloseSprintModal dict={pt} sprintName="Sprint 3" delivered={0} rolled={0} onClose={() => undefined} onConfirm={() => undefined} />)
    expect(screen.queryByRole('region', { name: pt['closeSprint.who'] })).toBeNull()
  })

  it('as tarefas que ficaram vêm numa lista recolhível (singular e plural) e a escolha vai ao confirmar', () => {
    const onConfirm = vi.fn()
    wrap(
      <CloseSprintModal
        dict={pt}
        sprintName="Sprint 3"
        delivered={1}
        rolled={2}
        leftoverTasks={[{ id: 'a', title: 'Revisar contrato' }, { id: 'b', title: 'Escrever README' }]}
        onClose={() => undefined}
        onConfirm={onConfirm}
      />,
    )
    const summary = screen.getByText('Ver as 2 tarefas que ficaram')
    const details = summary.closest('details') as HTMLDetailsElement
    expect(details.open).toBe(false)
    expect(within(details).getByText('Revisar contrato')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: pt['closeSprint.leftoverBacklog'] }))
    expect(screen.getByRole('button', { name: pt['closeSprint.leftoverBacklog'] }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: pt['closeSprint.confirm'] }))
    expect(onConfirm).toHaveBeenCalledWith('backlog')
  })
})

describe('SprintBand', () => {
  const sprint = (patch: Partial<SprintView> = {}): SprintView => ({
    id: 's1',
    name: 'Sprint 3',
    objective: 'Entregar o login',
    status: 'ativo',
    ticketIds: [],
    daysLeft: 4,
    ...patch,
  } as SprintView)

  it('sem sprint em andamento: faixa tracejada com "Planejar sprint"', () => {
    const onPlan = vi.fn()
    wrap(<SprintBand dict={pt} onPlan={onPlan} />)
    expect(screen.getByText(pt['sprint.idle'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: pt['sprint.plan'] }))
    expect(onPlan).toHaveBeenCalledTimes(1)
  })

  it('sprint ativa: nome, objetivo, progresso e as duas ações', () => {
    const onPlan = vi.fn()
    const onClose = vi.fn()
    wrap(<SprintBand dict={pt} sprint={sprint()} doneCount={2} totalCount={5} onPlan={onPlan} onCloseSprint={onClose} />)
    expect(screen.getByText('Entregar o login')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: pt['sprint.plan'] }))
    fireEvent.click(screen.getByRole('button', { name: pt['sprint.close'] }))
    expect(onPlan).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('o prazo avisa: normal, ≤ 1 dia (warning) e atrasada (danger), com singular e plural corretos', () => {
    // O tom do chip é só classe do CSS module: acha o chip pelo texto e lê a classe.
    const chipFor = (daysLeft: number, label: string): string => {
      const { unmount } = wrap(<SprintBand dict={pt} sprint={sprint({ daysLeft })} doneCount={1} totalCount={3} />)
      const chip = screen.getByText(label).closest('span[class*="chip"]')
      const className = chip?.className ?? ''
      unmount()
      return className
    }
    expect(chipFor(4, 'faltam 4 dias')).not.toMatch(/warning|danger/u)
    expect(chipFor(1, 'falta 1 dia')).toMatch(/warning/u)
    expect(chipFor(0, pt['sprint.overdue'])).toMatch(/danger/u)
  })

  it('sem prazo do host não inventa "faltam 0 dias": o chip some', () => {
    const { daysLeft: _withDays, ...noDeadline } = sprint()
    void _withDays
    const { container } = wrap(<SprintBand dict={pt} sprint={noDeadline as SprintView} doneCount={1} totalCount={3} />)
    expect(screen.queryByText(/faltam|falta /u)).toBeNull()
    expect(container.querySelector('span[class*="chip"]')).toBeNull()
  })
})

describe('encerrar a sprint pelo quadro do projeto (dados reais, nada fixo)', () => {
  const flowCard = (id: string, title: string, column: 'todo' | 'done', assignee?: { id: string; name: string }): FlowCardModel => ({
    id, title, columnId: column === 'done' ? 'c-done' : 'c-todo', column, projectId: 'p', projectName: 'Software', teamId: 't', teamName: 'Equipe',
    blocked: false, waitingEvent: false, reviewApproved: false,
    ...(assignee === undefined ? {} : { assignee: { ...assignee, initials: assignee.name.slice(0, 1) } }),
  })
  const flow: ProjectFlowSnapshot = {
    projectId: 'p',
    projectName: 'Software',
    template: 'software',
    columns: [
      { id: 'c-todo', name: 'A fazer', category: 'todo' },
      { id: 'c-done', name: 'Pronto', category: 'done' },
    ],
    cards: [
      flowCard('a', 'Login', 'done', { id: 'nina', name: 'Nina' }),
      flowCard('b', 'Preços', 'done', { id: 'nina', name: 'Nina' }),
      flowCard('c', 'Contrato', 'done', { id: 'bento', name: 'Bento' }),
      flowCard('d', 'README', 'todo', { id: 'bento', name: 'Bento' }),
    ],
  }

  it('o resumo conta entregues, quem fez e o que ficou — e não inventa "atrasadas"', () => {
    const onConfirm = vi.fn()
    wrap(
      <ProjectFlowBoard
        dict={pt}
        flow={flow}
        surfaceState="ready"
        currentSprint={{ id: 's1', name: 'Sprint 3', objective: 'Entregar', status: 'ativo', ticketIds: ['a', 'b', 'c', 'd'], daysLeft: 2 } as never}
        onConfirmCloseSprint={onConfirm}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: pt['sprint.close'] }))
    const dialog = screen.getByRole('dialog')
    const who = within(dialog).getByRole('region', { name: pt['closeSprint.who'] })
    expect(within(who).getByText('Nina')).toBeTruthy()
    expect(within(who).getByText('2')).toBeTruthy()
    expect(within(dialog).queryByText(pt['closeSprint.late'])).toBeNull()
    expect(within(dialog).getByText('Ver a tarefa que ficou')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: pt['closeSprint.confirm'] }))
    expect(onConfirm).toHaveBeenCalledWith('next')
  })
})
