// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BoardsHome } from '../src/client/boards/BoardsHome.tsx'
import { MOCK_PROJECT_BOARD_SUMMARIES } from '../src/client/boards/mock-data.ts'
import type { ProjectBoardSummary } from '../src/client/boards/types.ts'
import { pt as kanbanPt } from '../src/client/locale/kanban/locales.ts'

afterEach(() => { cleanup() })

const EMPTY: ProjectBoardSummary = {
  id: 'pessoal',
  name: 'Pessoal',
  flowModel: 'simples',
  counts: { todo: 0, doing: 0, review: 0, needs_you: 0, done: 0, blocked: 0 },
  needsYouCount: 0,
  activeWorkers: [],
}

function hub(summaries: readonly ProjectBoardSummary[], extra: { onOpen?: (id: string) => void; onCreate?: (id: string) => void } = {}) {
  return render(
    <BoardsHome
      dict={kanbanPt}
      summaries={summaries}
      onOpenProject={extra.onOpen ?? (() => {})}
      {...(extra.onCreate === undefined ? {} : { onCreateFirstTask: extra.onCreate })}
    />,
  )
}

describe('project card mini-summary (PB-5, Muse sweep)', () => {
  it('says how far the project is in words, and the bar carries the same sentence', () => {
    hub(MOCK_PROJECT_BOARD_SUMMARIES)
    // Contratação: 4 done of 11. Site: 6 done of 13.
    const card = screen.getByRole('article', { name: 'Abrir quadro Contratação — Designer' })
    expect(within(card).getByText('4 de 11 prontas')).toBeTruthy()
    const bar = within(card).getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('4')
    expect(bar.getAttribute('aria-valuemax')).toBe('11')
    expect(bar.getAttribute('aria-valuetext')).toMatch(/^4 de 11 prontas\. /u)
    expect(bar.getAttribute('aria-valuetext')).toMatch(/3 a fazer/u)
    expect(screen.getByText('6 de 13 prontas')).toBeTruthy()
  })

  it('shows the current sprint, the count per category and who is working now, by name', () => {
    hub(MOCK_PROJECT_BOARD_SUMMARIES)
    const card = screen.getByRole('article', { name: 'Abrir quadro Contratação — Designer' })
    expect(within(card).getByText('Sprint 3 · faltam 4 dias')).toBeTruthy()
    expect(within(card).getByText(/3 a fazer/u)).toBeTruthy()
    expect(within(card).getByText('Atlas, Nina, Bento trabalham agora')).toBeTruthy()
    const site = screen.getByRole('article', { name: 'Abrir quadro Site da agência' })
    expect(within(site).getByText('Sol, Luna trabalham agora')).toBeTruthy()
  })

  it('uses the singular for one person and one task', () => {
    hub([{ ...EMPTY, id: 'um', name: 'Um', counts: { ...EMPTY.counts, done: 1 }, activeWorkers: [{ name: 'Bia', state: 'working' }] }])
    expect(screen.getByText('1 de 1 pronta')).toBeTruthy()
    expect(screen.getByText('Bia trabalha agora')).toBeTruthy()
  })

  it('an empty board says so and offers the first task instead of an empty bar', () => {
    const onCreate = vi.fn()
    const onOpen = vi.fn()
    hub([EMPTY], { onCreate, onOpen })
    expect(screen.getByText('Nada no quadro ainda')).toBeTruthy()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByRole('img', { name: /Tarefas por etapa/u })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Criar a primeira tarefa' }))
    expect(onCreate).toHaveBeenCalledWith('pessoal')
    // The button is its own action: it must not also open the board behind it.
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('without a task entry the first-task button opens the board', () => {
    const onOpen = vi.fn()
    hub([EMPTY], { onOpen })
    fireEvent.click(screen.getByRole('button', { name: 'Criar a primeira tarefa' }))
    expect(onOpen).toHaveBeenCalledWith('pessoal')
  })

  it('the card still opens its board from the keyboard', () => {
    const onOpen = vi.fn()
    hub(MOCK_PROJECT_BOARD_SUMMARIES, { onOpen })
    fireEvent.keyDown(screen.getByRole('article', { name: 'Abrir quadro Site da agência' }), { key: 'Enter' })
    expect(onOpen).toHaveBeenCalledWith('proj-site')
  })
})
