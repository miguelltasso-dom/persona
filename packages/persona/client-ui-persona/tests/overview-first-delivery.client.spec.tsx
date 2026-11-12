// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OverviewView } from '../src/client/overview/OverviewView.tsx'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'

const t = ((key: string, params?: Readonly<Record<string, string>>) => bindLocale(shellPt, key, params)) as never
const FIRST = { taskId: 'task-1', title: 'Revisar contrato', personaName: 'Nina', characterId: 'nina' }

afterEach(() => { cleanup(); localStorage.clear() })

function renderOverview(onNavigate = vi.fn()): void {
  render(<OverviewView t={t} attentionItems={[]} nowRows={[]} awayEvents={[]} firstDelivery={FIRST} onNavigate={onNavigate} />)
}

describe('OverviewView first delivery milestone (peak-end)', () => {
  it('celebrates the first finished task once and remembers the dismissal', () => {
    renderOverview()
    expect(screen.getByRole('heading', { name: 'Sua equipe entregou o primeiro trabalho!' })).toBeTruthy()
    expect(screen.getByText(/Nina concluiu “Revisar contrato”/u)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('heading', { name: 'Sua equipe entregou o primeiro trabalho!' })).toBeNull()
    cleanup()
    renderOverview()
    expect(screen.queryByRole('heading', { name: 'Sua equipe entregou o primeiro trabalho!' })).toBeNull()
  })

  it('"Ver no quadro" opens the task on the board when wired', () => {
    const onOpenAwayTask = vi.fn()
    render(
      <OverviewView
        t={t}
        attentionItems={[]}
        nowRows={[]}
        awayEvents={[]}
        firstDelivery={FIRST}
        onOpenAwayTask={onOpenAwayTask}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ver no quadro' }))
    expect(onOpenAwayTask).toHaveBeenCalledWith('task-1')
  })

  it('"Ver no quadro" falls back to kanban navigation', () => {
    const onNavigate = vi.fn()
    renderOverview(onNavigate)
    fireEvent.click(screen.getByRole('button', { name: 'Ver no quadro' }))
    expect(onNavigate).toHaveBeenCalledWith('kanban')
  })

  it('shows "Primeira entrega a caminho" notice when firstDeliveryPending is true', () => {
    render(
      <OverviewView
        t={t}
        attentionItems={[]}
        nowRows={[]}
        awayEvents={[]}
        firstDeliveryPending
      />,
    )
    expect(screen.getByText(shellPt['overview.firstDeliveryOnTheWay'])).toBeTruthy()
  })
})

describe('Visão geral · um CTA âmbar só (Carbon)', () => {
  it('"Ver no quadro" do cartão da primeira entrega é secundário: o âmbar fica para "Nova tarefa"', () => {
    renderOverview()
    const open = screen.getByRole('button', { name: 'Ver no quadro' })
    expect(open.className).not.toMatch(/primary/u)
    expect(open.className).toMatch(/secondary/u)
  })

  it('a entrega que o cartão destaca não se repete em "Enquanto você estava fora"', () => {
    render(
      <OverviewView
        t={t}
        attentionItems={[]}
        nowRows={[]}
        awayEvents={[]}
        firstDelivery={FIRST}
        away={{
          since: new Date(Date.now() - 3_600_000).toISOString(),
          awayMinutes: 60,
          waiting: [],
          done: [{ id: 'd1', kind: 'delivery', body: 'Revisar contrato', deliveredTitle: 'Revisar contrato', taskLabel: 'Revisar contrato', taskId: 'task-1', persona: { id: 'nina', name: 'Nina', characterId: 'nina' } }],
        } as never}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Sua equipe entregou o primeiro trabalho!' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Enquanto você estava fora' })).toBeNull()
  })
})
