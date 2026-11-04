// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApprovalView } from '@deepseek-ai/dsh-persona-host/types'
import { ApprovalsInbox } from '../src/client/approvals/ApprovalsInbox.tsx'
import { hireHeading, hireMonthlyTasksLine, hireWhyLine } from '../src/client/approvals/approvals-ui-helpers.ts'
import type { ApprovalItem } from '../src/client/approvals/mock-data.ts'
import { approvalViewToItem, type HostHireCard } from '../src/client/data/adapters/approvals.ts'
import { en as approvalsEn, pt as approvalsPt } from '../src/client/locale/approvals/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
installPreviewTheme()

afterEach(() => { cleanup() })

const baseView: ApprovalView = {
  id: 'hire-1',
  kind: 'hire',
  title: 'Sol',
  question: 'Contratar Sol?',
  status: 'pending',
  personaId: 'atlas',
  personaName: 'Atlas',
  hireAvatarRef: 'sol',
}

function hireCard(extra: Partial<HostHireCard> = {}): HostHireCard {
  return { ...baseView, ...extra }
}

function renderInbox(items: readonly ApprovalItem[], onDecideItem = vi.fn()): ReturnType<typeof render> {
  return render(
    <PreviewFrame brandLabel="Persona">
      <ApprovalsInbox dict={approvalsPt} items={items} onDecideItem={onDecideItem} />
    </PreviewFrame>,
  )
}

describe('A-4: the hire card says who, for what, and what it costs, in the host own words', () => {
  it('names the role in the heading, with the proposed name and the role chip beside it', () => {
    const item = approvalViewToItem(hireCard({ roleTitle: 'revisar cláusulas de rescisão', description: 'Lê contratos e aponta riscos.' }))
    renderInbox([item])
    expect(screen.getByRole('heading', { level: 3, name: 'Contratar uma persona para revisar cláusulas de rescisão?' })).toBeTruthy()
    const card = screen.getByRole('heading', { level: 3 }).closest('[role="listitem"]') as HTMLElement
    expect(within(card).getByText('Sol')).toBeTruthy()
    // The heading already says the role: no chip repeats it on the card (the details dialog keeps it).
    expect(within(card).queryByText('revisar cláusulas de rescisão')).toBeNull()
    // The description is the intro line, with no label in front of it.
    expect(within(card).getByText('Lê contratos e aponta riscos.')).toBeTruthy()
    expect(within(card).queryByText(/Por quê/)).toBeNull()
  })

  it('without a role the heading is the proposed name and no role chip is invented', () => {
    const item = approvalViewToItem(hireCard())
    expect(hireHeading(approvalsPt, item)).toBe('Contratar Sol?')
    expect(item.hireRoleTitle).toBeUndefined()
    expect(item.hireDescription).toBeUndefined()
    renderInbox([item])
    expect(screen.getByRole('heading', { level: 3, name: 'Contratar Sol?' })).toBeTruthy()
    // The heading already says the name: it is not repeated on a line of its own.
    expect(screen.queryByText('Sol')).toBeNull()
  })

  it('shows the monthly-tasks line only when the host measured a number', () => {
    const measured = approvalViewToItem(hireCard({ monthlyTasks: 12 }))
    expect(hireMonthlyTasksLine(approvalsPt, measured)).toBe('≈ 12 tarefas médias por mês')
    expect(hireMonthlyTasksLine(approvalsEn, measured)).toBe('≈ 12 average tasks per month')
    expect(hireMonthlyTasksLine(approvalsPt, approvalViewToItem(hireCard({ monthlyTasks: 1 })))).toBe('≈ 1 tarefa média por mês')
    for (const unmeasured of [0, -3, Number.NaN]) {
      const item = approvalViewToItem(hireCard({ monthlyTasks: unmeasured }))
      expect(item.hireMonthlyTasks).toBeUndefined()
      expect(hireMonthlyTasksLine(approvalsPt, item)).toBeUndefined()
    }
    // A host that never sends the number (Bolt: it cannot measure for someone not hired yet): no field, no line.
    expect(hireMonthlyTasksLine(approvalsPt, approvalViewToItem(hireCard()))).toBeUndefined()
    renderInbox([measured])
    expect(screen.getByText('≈ 12 tarefas médias por mês')).toBeTruthy()
  })

  it('"Por quê" is the host motive only: a reason that repeats the description is not passed off as one', () => {
    const motive = { ...approvalViewToItem(hireCard({ description: 'Lê contratos.' })), hireWhy: 'Toda semana chegam contratos.' }
    expect(hireWhyLine(approvalsPt, motive)).toBe('Por quê: Toda semana chegam contratos.')
    const echo = { ...approvalViewToItem(hireCard({ description: 'Lê contratos.' })), hireWhy: '  lê contratos. ' }
    expect(hireWhyLine(approvalsPt, echo)).toBeUndefined()
    expect(hireWhyLine(approvalsPt, approvalViewToItem(hireCard()))).toBeUndefined()
  })

  it('"Ver detalhes" opens a read-only dialog with what the host sent, and closes with Esc; one primary action only', () => {
    const onDecide = vi.fn()
    const item = approvalViewToItem(hireCard({ roleTitle: 'Suporte', description: 'Atende clientes.', monthlyTasks: 30 }))
    renderInbox([item], onDecide)
    const card = screen.getByRole('heading', { level: 3 }).closest('[role="listitem"]') as HTMLElement
    expect(within(card).queryByRole('button', { name: /Ver perfil/ })).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: 'Ver detalhes' }))
    const dialog = screen.getByRole('dialog', { name: 'Sol' })
    expect(within(dialog).getByText('Atende clientes.')).toBeTruthy()
    expect(within(dialog).getByText('Proposta de Atlas.')).toBeTruthy()
    expect(within(dialog).getByText('≈ 30 tarefas médias por mês')).toBeTruthy()
    // Details never decide anything.
    expect(onDecide).not.toHaveBeenCalled()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('A-4b: every card decides on its own, in any order: no card waits on the one above', () => {
    const onDecide = vi.fn()
    const first = approvalViewToItem(hireCard({ id: 'h-a', title: 'Bolota', roleTitle: 'Contratos' }))
    const second = approvalViewToItem(hireCard({ id: 'h-b', title: 'Pipa', roleTitle: 'Suporte' }))
    renderInbox([first, second], onDecide)
    const [cardA, cardB] = screen.getAllByRole('listitem')
    for (const card of [cardA!, cardB!]) {
      expect((within(card).getByRole('button', { name: 'Revisar e contratar' }) as HTMLButtonElement).disabled).toBe(false)
      expect(within(card).queryByText(/Depende de/)).toBeNull()
      expect(within(card).queryByText(/cartão de cima/)).toBeNull()
    }
    // The second card is decided first, and it goes through.
    fireEvent.click(within(cardB!).getByRole('button', { name: 'Revisar e contratar' }))
    return waitFor(
      () => { expect(onDecide).toHaveBeenCalledWith(expect.objectContaining({ id: 'h-b' }), true, undefined) },
      { timeout: 3000 },
    )
  })

  it('A-4b: only a dependency the host names holds a card back, and the card says on what', () => {
    const waiting = approvalViewToItem(hireCard({ id: 'h-w', title: 'Pipa', roleTitle: 'Suporte', dependsOnTitle: 'Contratar Bolota' }))
    expect(waiting.dependsOnTitle).toBe('Contratar Bolota')
    renderInbox([waiting])
    expect(screen.getByText('Depende de: Contratar Bolota')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Revisar e contratar' }) as HTMLButtonElement).disabled).toBe(true)
    // The other buttons (details, dismiss) are not part of the dependency.
    expect((screen.getByRole('button', { name: 'Ver detalhes' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('A-4b: a Cofre card shows who proposes it (not initials of its title) and, when the host says, what changes', () => {
    const plain = approvalViewToItem({ ...baseView, id: 'v-1', kind: 'vault', title: 'Tom de voz', question: 'Atualizar?', personaName: 'Nina', personaId: 'nina' })
    const { container, rerender } = renderInbox([plain])
    expect(screen.getByRole('heading', { level: 3, name: 'Atualizar Cofre' })).toBeTruthy()
    expect(container.textContent).not.toContain('TV')
    expect(container.querySelector('img[src]')).not.toBeNull()
    expect(screen.queryByText(/→/)).toBeNull()

    const detailed = approvalViewToItem({
      ...baseView, id: 'v-2', kind: 'vault', title: 'preco-do-pao', question: 'Atualizar?', personaName: 'Nina', personaId: 'nina',
      changeField: 'Preço do pão', changeBefore: 'R$ 12', changeAfter: 'R$ 14',
    })
    rerender(
      <PreviewFrame brandLabel="Persona">
        <ApprovalsInbox dict={approvalsPt} items={[detailed]} onDecideItem={vi.fn()} />
      </PreviewFrame>,
    )
    expect(screen.getByRole('heading', { level: 3, name: 'Atualizar no Cofre: Preço do pão' })).toBeTruthy()
    expect(screen.getByText('Preço do pão: R$ 12 → R$ 14')).toBeTruthy()
    // Half the data is no data: a "before" without an "after" is not a change line.
    expect(approvalViewToItem({ ...baseView, kind: 'vault', changeField: 'X', changeBefore: 'a' }).vaultAfter).toBeUndefined()
  })

  it('non-hire cards have no details button and keep their own titles', () => {
    const vault: ApprovalItem = { id: 'v1', kind: 'vault', title: 'Tom de voz', question: 'Atualizar registro no Cofre?', primaryKey: 'action.primary.vault' }
    renderInbox([vault])
    expect(screen.queryByRole('button', { name: 'Ver detalhes' })).toBeNull()
    expect(screen.getByRole('heading', { level: 3, name: 'Atualizar Cofre' })).toBeTruthy()
  })

  it('the screen speaks plainly: eyebrow "Precisa de você", the new subtitle, no jargon', () => {
    renderInbox([approvalViewToItem(hireCard())])
    expect(screen.getByText('O que a equipe precisa que você decida')).toBeTruthy()
    expect(screen.getByText('Uma pergunta por cartão.')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/iniciativa agrupada|atenção imediata/)
    expect(approvalsPt['header.eyebrow']).toBe('Precisa de você')
  })
})
