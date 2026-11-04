// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BoardColumn, CategoryBar, SprintStrip } from '../src/client/primitives/index.ts'

afterEach(() => { cleanup() })

describe('board primitives (BOARDS-SPEC)', () => {
  it('CategoryBar labels non-zero categories (color is never the only cue)', () => {
    render(
      <CategoryBar
        label="Tarefas por etapa"
        counts={[
          { category: 'todo', count: 3, label: 'a fazer' },
          { category: 'doing', count: 0, label: 'em andamento' },
          { category: 'needs_you', count: 1, label: 'precisa de você' },
        ]}
      />,
    )
    expect(screen.getByRole('img', { name: 'Tarefas por etapa: 3 a fazer, 1 precisa de você' })).toBeTruthy()
  })

  it('BoardColumn shows the illustrated empty state and WIP warning', () => {
    const { rerender } = render(
      <BoardColumn name="Triagem" category="review" categoryLabel="Em revisão" count={0} emptyLabel="Nada em revisão agora" />,
    )
    expect(screen.getByRole('region', { name: 'Triagem — Em revisão' })).toBeTruthy()
    expect(screen.getByText('Nada em revisão agora')).toBeTruthy()
    rerender(
      <BoardColumn name="Triagem" category="review" categoryLabel="Em revisão" count={3} wipLimit={3} emptyLabel="x">
        <p>cartão</p>
      </BoardColumn>,
    )
    expect(screen.getByText('3/3')).toBeTruthy()
    expect(screen.getByText('cartão')).toBeTruthy()
  })

  it('SprintStrip exposes progress to assistive tech', () => {
    render(
      <SprintStrip name="Sprint 3" goal="Contratar designer" dateLabel="3–14 nov." remainingLabel="faltam 4 dias" done={6} total={10} progressLabel="6 de 10 concluídas" />,
    )
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('6')
    expect(bar.getAttribute('aria-valuetext')).toBe('6 de 10 concluídas')
  })
})
