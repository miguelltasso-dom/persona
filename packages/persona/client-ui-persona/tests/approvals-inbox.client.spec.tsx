// @vitest-environment jsdom
// REVIEW-APPROVALS-REDESIGN §2: Aprovações as an inbox (list + detail, J/K/A/D/Enter, batch of the low-risk ones), flagged.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApprovalView } from '@deepseek-ai/dsh-persona-host/types'
import { ApprovalsInboxV2, type ApprovalsInboxV2Props } from '../src/client/approvals/ApprovalsInboxV2.tsx'
import { APPROVALS_DEV_SAMPLE, approvalsDevSampleEnabled } from '../src/client/approvals/approvals-dev-sample.ts'
import { APPROVALS_INBOX_V2_KEY, approvalsInboxV2Enabled } from '../src/client/approvals/inbox-flag.ts'
import { setFlagDefaults } from '../src/client/flags.ts'
import { batchEligible, buildInboxGroups, flattenRows, nextOpenAfter } from '../src/client/approvals/inbox-model.ts'
import type { ApprovalItem } from '../src/client/approvals/mock-data.ts'
import type { PersonaDailyProactiveSummary } from '../src/client/approvals/proactivity-mock-data.ts'
import { approvalViewToItem, type HostHireCard } from '../src/client/data/adapters/approvals.ts'
import { pt as approvalsPt } from '../src/client/locale/approvals/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
installPreviewTheme()

afterEach(() => { cleanup(); localStorage.clear() })

const base: ApprovalView = {
  id: 'x', kind: 'hire', title: 'Bolota', question: 'Contratar Bolota?', status: 'pending', personaId: 'atlas', personaName: 'Atlas', hireAvatarRef: 'tamandua',
}
const card = (extra: Partial<HostHireCard>): ApprovalItem => approvalViewToItem({ ...base, ...extra })

const HIRE = card({ id: 'hire-1', roleTitle: 'revisar cláusulas de rescisão', description: 'Lê contratos e avisa dos riscos.', monthlyTasks: 12 })
const VAULT_LOW: ApprovalItem = { ...card({ id: 'vault-1', kind: 'vault', title: 'preco-do-pao', personaName: 'Nina', personaId: 'nina', changeField: 'Preço do pão', changeBefore: 'R$ 12', changeAfter: 'R$ 14' }), risk: 'low' }
const SKILL_LOW: ApprovalItem = { ...card({ id: 'skill-1', kind: 'skill', title: 'Resumo diário', personaName: 'Sol', personaId: 'sol' }), risk: 'low' }
const TASK: ApprovalItem = { ...card({ id: 'task-1', kind: 'attention', title: 'Aprovar o deploy', personaName: 'Bento', personaId: 'bento' }), risk: 'normal' }

const SUMMARIES: readonly PersonaDailyProactiveSummary[] = [{
  personaId: 'nina', personaName: 'Nina', personaCharacterId: 'nina', summaryDate: '2026-11-03',
  proposals: [{ id: 'prop-1', kind: 'initiative', title: 'Automatizar o smoke do checkout', oneQuestion: 'Posso rodar o smoke no main?', impactDetail: 'Reduz o risco de regressão.', approvalKind: 'skill' }],
}]

function mount(props: Partial<ApprovalsInboxV2Props> = {}): ReturnType<typeof render> {
  return render(
    <PreviewFrame brandLabel="Persona">
      <ApprovalsInboxV2 dict={approvalsPt} items={[HIRE, TASK, VAULT_LOW, SKILL_LOW]} proactiveSummaries={SUMMARIES} onDecideItem={vi.fn()} onDecideProactive={vi.fn()} {...props} />
    </PreviewFrame>,
  )
}

const rows = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('[role="option"]')]
const selectedRow = (): HTMLElement | undefined => rows().find(row => row.getAttribute('aria-selected') === 'true')

describe('the model: three groups, no forced order', () => {
  it('sorts reactive cards into "Precisa de você agora" and "Cofre", persona initiatives into "Propostas"', () => {
    const groups = buildInboxGroups(approvalsPt, [HIRE, TASK, VAULT_LOW, SKILL_LOW], SUMMARIES)
    expect(groups.map(group => [group.id, group.rows.map(row => row.id)])).toEqual([
      ['now', ['hire-1', 'task-1', 'skill-1']],
      ['proposals', ['prop-1']],
      ['vault', ['vault-1']],
    ])
    expect(flattenRows(groups)).toHaveLength(5)
  })

  it('the batch takes only low-risk, open, real cards: never a hire, a task or a persona proposal', () => {
    const rowsAll = flattenRows(buildInboxGroups(approvalsPt, [HIRE, TASK, VAULT_LOW, SKILL_LOW], SUMMARIES))
    expect(batchEligible(rowsAll).map(row => row.id)).toEqual(['skill-1', 'vault-1'])
    const waiting = { ...VAULT_LOW, dependsOnTitle: 'Contratar Bolota' }
    expect(batchEligible(flattenRows(buildInboxGroups(approvalsPt, [waiting], [])))).toEqual([])
    const deciding = { ...VAULT_LOW, decisionState: 'deciding' as const }
    expect(batchEligible(flattenRows(buildInboxGroups(approvalsPt, [deciding], [])))).toEqual([])
  })

  it('after a decision the selection goes to the next open row, else the nearest one above', () => {
    const all = flattenRows(buildInboxGroups(approvalsPt, [HIRE, TASK, VAULT_LOW], []))
    expect(nextOpenAfter(all, 'hire-1')).toBe('task-1')
    expect(nextOpenAfter(all, 'vault-1')).toBe('task-1')
  })
})

describe('Muse 22:25: one title for list and detail, a role in the middle of the sentence, an icon for the team', () => {
  it('the list row says the SAME title as the detail heading (the list only truncates it)', () => {
    mount()
    const row = rows().find(node => node.getAttribute('data-decision-id') === 'hire-1')!
    expect(within(row).getByText('Contratar uma persona para revisar cláusulas de rescisão?')).toBeTruthy()
    expect(within(row).queryByText(/^Contratar Bolota$/u)).toBeNull()
    const groups = buildInboxGroups(approvalsPt, [HIRE], [])
    expect(groups[0]?.rows[0]?.listTitle).toBe(groups[0]?.rows[0]?.title)
  })

  it('a role the host capitalises is lowered in the middle of the sentence; acronyms and names stay', () => {
    const shouting = card({ id: 'hire-2', roleTitle: 'Aprovar envio do contrato' })
    const groups = buildInboxGroups(approvalsPt, [shouting], [])
    expect(groups[0]?.rows[0]?.title).toBe('Contratar uma persona para aprovar envio do contrato?')
    const acronym = card({ id: 'hire-3', roleTitle: 'SDR de vendas' })
    expect(buildInboxGroups(approvalsPt, [acronym], [])[0]?.rows[0]?.title).toBe('Contratar uma persona para SDR de vendas?')
  })

  it('an actor with no persona ("Equipe") gets the team icon, not a letter; a known persona keeps the portrait', () => {
    const team: ApprovalItem = card({ id: 'task-team', kind: 'attention', title: 'Bom dia, equipe! Preciso fechar o orçamento', personaName: 'Equipe', personaId: '' })
    mount({ items: [team, TASK] })
    const teamRow = rows().find(node => node.getAttribute('data-decision-id') === 'task-team')!
    expect(teamRow.querySelector('[data-icon]')).not.toBeNull()
    const knownRow = rows().find(node => node.getAttribute('data-decision-id') === 'task-1')!
    expect(knownRow.querySelector('[data-icon]')).toBeNull()
  })
})

describe('the screen: list on the left, detail on the right', () => {
  it('shows the groups with their counts, the first card selected and ITS detail', () => {
    mount()
    const list = screen.getByRole('listbox', { name: approvalsPt['inbox.listLabel'] as string })
    expect(within(list).getByRole('group', { name: 'Precisa de você agora, 3' })).toBeTruthy()
    expect(within(list).getByRole('group', { name: 'Propostas, 1' })).toBeTruthy()
    expect(within(list).getByRole('group', { name: 'Cofre, 1' })).toBeTruthy()
    expect(rows()).toHaveLength(5)
    expect(selectedRow()?.getAttribute('data-decision-id')).toBe('hire-1')
    expect(screen.getByRole('heading', { level: 2, name: 'Contratar uma persona para revisar cláusulas de rescisão?' })).toBeTruthy()
    expect(screen.getByText('Lê contratos e avisa dos riscos.')).toBeTruthy()
    expect(screen.getByText('≈ 12 tarefas médias por mês')).toBeTruthy()
  })

  it('the list holds only groups and options, so a screen reader can walk it (listbox structure)', () => {
    mount()
    const list = screen.getByRole('listbox')
    for (const child of Array.from(list.children)) expect(child.getAttribute('role')).toBe('group')
    for (const group of Array.from(list.children)) {
      for (const child of Array.from(group.children)) {
        const visible = child.getAttribute('aria-hidden') !== 'true'
        if (visible) expect(child.getAttribute('role')).toBe('option')
      }
    }
    // exactly one option is reachable by Tab (roving tabindex)
    expect(rows().filter(row => row.tabIndex === 0)).toHaveLength(1)
  })

  it('clicking a row shows that card: a Cofre card says what changes, before → after, and who proposed it', () => {
    mount()
    fireEvent.click(rows().find(row => row.getAttribute('data-decision-id') === 'vault-1')!)
    expect(screen.getByRole('heading', { level: 2, name: 'Atualizar no Cofre: Preço do pão' })).toBeTruthy()
    const detail = document.querySelector('[data-persona-approval-detail="vault-1"]') as HTMLElement
    expect(within(detail).getByText('R$ 12')).toBeTruthy()
    expect(within(detail).getByText('R$ 14')).toBeTruthy()
    expect(within(detail).getByText(/Nina/)).toBeTruthy()
    // no "Ver detalhes" for a card that is not a hire
    expect(within(detail).queryByRole('button', { name: 'Ver detalhes' })).toBeNull()
  })

  it('a persona proposal shows its question and impact in the detail', () => {
    mount()
    fireEvent.click(rows().find(row => row.getAttribute('data-decision-id') === 'prop-1')!)
    expect(screen.getByRole('heading', { level: 2, name: 'Automatizar o smoke do checkout' })).toBeTruthy()
    expect(screen.getByText('Posso rodar o smoke no main?')).toBeTruthy()
  })
})

describe('the keyboard: J/K, arrows, A, D, Enter', () => {
  it('J and K (and the arrows on a row) walk the list; Home and End jump', async () => {
    mount()
    const first = rows()[0]!
    first.focus()
    fireEvent.keyDown(first, { key: 'j' })
    await waitFor(() => { expect(selectedRow()?.getAttribute('data-decision-id')).toBe('task-1') })
    fireEvent.keyDown(selectedRow()!, { key: 'ArrowDown' })
    await waitFor(() => { expect(selectedRow()?.getAttribute('data-decision-id')).toBe('skill-1') })
    fireEvent.keyDown(selectedRow()!, { key: 'k' })
    await waitFor(() => { expect(selectedRow()?.getAttribute('data-decision-id')).toBe('task-1') })
    fireEvent.keyDown(selectedRow()!, { key: 'End' })
    await waitFor(() => { expect(selectedRow()?.getAttribute('data-decision-id')).toBe('vault-1') })
    fireEvent.keyDown(selectedRow()!, { key: 'Home' })
    await waitFor(() => { expect(selectedRow()?.getAttribute('data-decision-id')).toBe('hire-1') })
    // focus follows the selection (the row itself is the focused element)
    expect(document.activeElement).toBe(selectedRow())
  })

  it('D sets the selected card aside and A approves it (any card, in any order)', async () => {
    const onDecideItem = vi.fn()
    mount({ onDecideItem })
    const second = rows().find(row => row.getAttribute('data-decision-id') === 'task-1')!
    fireEvent.click(second)
    second.focus()
    fireEvent.keyDown(second, { key: 'd' })
    expect(onDecideItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-1' }), false)
    const third = rows().find(row => row.getAttribute('data-decision-id') === 'skill-1')!
    fireEvent.click(third)
    third.focus()
    fireEvent.keyDown(third, { key: 'a' })
    await waitFor(() => { expect(onDecideItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'skill-1' }), true, undefined) }, { timeout: 3000 })
  })

  it('Enter on a hire opens "Ver detalhes" and Esc closes it', () => {
    mount()
    const first = rows()[0]!
    first.focus()
    fireEvent.keyDown(first, { key: 'Enter' })
    expect(screen.getByRole('dialog', { name: 'Bolota' })).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('letters typed in a field or a dialog never decide anything', () => {
    const onDecideItem = vi.fn()
    mount({ onDecideItem, items: [HIRE, TASK] })
    const field = document.createElement('input')
    document.body.appendChild(field)
    const root = document.querySelector('[data-persona-inbox]') as HTMLElement
    root.appendChild(field)
    fireEvent.keyDown(field, { key: 'd' })
    fireEvent.keyDown(field, { key: 'a' })
    expect(onDecideItem).not.toHaveBeenCalled()
  })

  it('the buttons teach their shortcut (A, D, Enter) and carry aria-keyshortcuts', () => {
    mount()
    const detail = document.querySelector('[data-persona-approval-detail="hire-1"]') as HTMLElement
    expect(within(detail).getByRole('button', { name: 'Revisar e contratar' }).getAttribute('aria-keyshortcuts')).toBe('A')
    expect(within(detail).getByRole('button', { name: 'Dispensar' }).getAttribute('aria-keyshortcuts')).toBe('D')
  })
})

describe('A-4b in the inbox: no forced order, only a real dependency holds a card back', () => {
  it('every card can be approved first; a dependency named by the host switches only that primary off and says on what', () => {
    const waiting = card({ id: 'hire-w', title: 'Pipa', hireAvatarRef: 'tucano', roleTitle: 'Suporte', dependsOnTitle: 'Contratar Bolota' })
    mount({ items: [HIRE, waiting] })
    fireEvent.click(rows().find(row => row.getAttribute('data-decision-id') === 'hire-w')!)
    const detail = document.querySelector('[data-persona-approval-detail="hire-w"]') as HTMLElement
    expect(within(detail).getByText('Depende de: Contratar Bolota')).toBeTruthy()
    expect((within(detail).getByRole('button', { name: 'Revisar e contratar' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(rows()[0]!)
    const first = document.querySelector('[data-persona-approval-detail="hire-1"]') as HTMLElement
    expect((within(first).getByRole('button', { name: 'Revisar e contratar' }) as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('the batch: only the low-risk ones, one confirmation that lists them, one toast', () => {
  it('lists the titles, approves exactly those, and the toast offers Desfazer only when the host can undo', async () => {
    const onDecideItem = vi.fn()
    const onUndoDecision = vi.fn()
    mount({ onDecideItem, onUndoDecision })
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar 2 de risco baixo' }))
    const dialog = screen.getByRole('dialog', { name: 'Aprovar 2 de risco baixo?' })
    expect(within(dialog).getByText('Atualizar no Cofre: Preço do pão')).toBeTruthy()
    expect(within(dialog).getByText('Nova skill proposta')).toBeTruthy()
    expect(within(dialog).queryByText(/Contratar/)).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aprovar 2' }))
    expect(onDecideItem).toHaveBeenCalledTimes(2)
    expect(onDecideItem.mock.calls.map(call => (call[0] as ApprovalItem).id).sort()).toEqual(['skill-1', 'vault-1'])
    expect(onDecideItem.mock.calls.every(call => call[1] === true)).toBe(true)
    const toast = await screen.findByText('2 aprovados')
    expect(toast).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    expect(onUndoDecision.mock.calls.map(call => call[0]).sort()).toEqual(['skill-1', 'vault-1'])
  })

  it('without a way to undo, the toast says what happened and has no Desfazer', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar 2 de risco baixo' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Aprovar 2' }))
    expect(await screen.findByText('2 aprovados')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull()
  })

  it('no batch button when nothing low-risk is open', () => {
    mount({ items: [HIRE, TASK], proactiveSummaries: [] })
    expect(screen.queryByRole('button', { name: /de risco baixo/ })).toBeNull()
  })
})

describe('the states', () => {
  it('empty: a celebration with one way out, only when there is one', () => {
    const onOpenOverview = vi.fn()
    mount({ items: [], proactiveSummaries: [], onOpenOverview })
    expect(screen.getByText('Nada esperando você')).toBeTruthy()
    expect(screen.getByText('A equipe segue trabalhando. Quando precisarem de você, aparece aqui.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver o que a equipe está fazendo' }))
    expect(onOpenOverview).toHaveBeenCalledTimes(1)
    cleanup()
    mount({ items: [], proactiveSummaries: [] })
    expect(screen.queryByRole('button', { name: 'Ver o que a equipe está fazendo' })).toBeNull()
  })

  it('"Revisar" from Visão geral (focus=<id>) opens that card, highlighted', () => {
    mount({ focusId: 'task-1' })
    expect(selectedRow()?.getAttribute('data-decision-id')).toBe('task-1')
    expect(document.querySelector('[class*="focusHighlight"]')).not.toBeNull()
  })

  it('a decided card keeps its stamp while it leaves, then the selection passes to the next open one', async () => {
    const { rerender } = mount({ items: [HIRE, TASK], proactiveSummaries: [] })
    expect(selectedRow()?.getAttribute('data-decision-id')).toBe('hire-1')
    rerender(
      <PreviewFrame brandLabel="Persona">
        <ApprovalsInboxV2 dict={approvalsPt} items={[{ ...HIRE, decisionState: 'accepted' as const }, TASK]} proactiveSummaries={[]} onDecideItem={vi.fn()} />
      </PreviewFrame>,
    )
    // The decided card keeps the detail (its stamp is on screen) until it leaves.
    expect(document.querySelector('[data-decision-state="accepted"]')).not.toBeNull()
    expect(selectedRow()?.getAttribute('data-decision-id')).toBe('hire-1')
    expect(screen.getByRole('img', { name: 'Aprovado' })).toBeTruthy()
    rerender(
      <PreviewFrame brandLabel="Persona">
        <ApprovalsInboxV2 dict={approvalsPt} items={[TASK]} proactiveSummaries={[]} onDecideItem={vi.fn()} />
      </PreviewFrame>,
    )
    await waitFor(() => { expect(selectedRow()?.getAttribute('data-decision-id')).toBe('task-1') })
  })

  it('a failed decision keeps the card with the honest line and "Tentar de novo"', () => {
    mount({ items: [{ ...HIRE, decisionState: 'failed' as const }], proactiveSummaries: [] })
    expect(screen.getByText(approvalsPt['decision.failed'] as string)).toBeTruthy()
    expect(screen.getByRole('button', { name: approvalsPt['decision.retry'] as string })).toBeTruthy()
  })
})

describe('the capture-only Cofre sample (dev seed)', () => {
  it('says "Exemplo", shows before → after, and never reaches the host or the batch', () => {
    const onDecideItem = vi.fn()
    mount({ onDecideItem, items: [VAULT_LOW, ...APPROVALS_DEV_SAMPLE], proactiveSummaries: [] })
    const sampleRow = rows().find(row => row.getAttribute('data-decision-id') === 'dev-approval-sample-vault')!
    expect(within(sampleRow).getByText('Exemplo')).toBeTruthy()
    fireEvent.click(sampleRow)
    const detail = document.querySelector('[data-persona-approval-detail="dev-approval-sample-vault"]') as HTMLElement
    expect(within(detail).getByText('R$ 12')).toBeTruthy()
    expect(within(detail).getByText('R$ 14')).toBeTruthy()
    expect(within(detail).getByText('Exemplo para ver como fica. Não é uma decisão de verdade.')).toBeTruthy()
    // its buttons are off (with the reason on screen) and the keys do nothing
    expect((within(detail).getByRole('button', { name: 'Revisar proposta' }) as HTMLButtonElement).disabled).toBe(true)
    sampleRow.focus()
    fireEvent.keyDown(sampleRow, { key: 'a' })
    fireEvent.keyDown(sampleRow, { key: 'd' })
    expect(onDecideItem).not.toHaveBeenCalled()
    // the batch counts only the real low-risk card
    expect(screen.getByRole('button', { name: 'Aprovar 1 de risco baixo' })).toBeTruthy()
  })

  it('is off unless the dev seed AND its own flag are on', () => {
    expect(approvalsDevSampleEnabled()).toBe(false)
    localStorage.setItem('persona.devSeed.approvalSample', '1')
    expect(approvalsDevSampleEnabled()).toBe(false)
    localStorage.setItem('persona.devSeed.v1', '1')
    expect(approvalsDevSampleEnabled()).toBe(true)
  })
})

describe('the flag', () => {
  it('is the default (Muse accepted it, 05/11): on unless the key is "0"; blocked storage keeps the default, never a crash', () => {
    setFlagDefaults(undefined) // the test setup leaves every flag off; this proves the PRODUCTION default
    try {
      expect(approvalsInboxV2Enabled()).toBe(true)
      localStorage.setItem(APPROVALS_INBOX_V2_KEY, '1')
      expect(approvalsInboxV2Enabled()).toBe(true)
      localStorage.setItem(APPROVALS_INBOX_V2_KEY, '0')
      expect(approvalsInboxV2Enabled()).toBe(false)
      const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
      expect(approvalsInboxV2Enabled()).toBe(true)
      spy.mockRestore()
    } finally {
      setFlagDefaults(false)
    }
  })
})
