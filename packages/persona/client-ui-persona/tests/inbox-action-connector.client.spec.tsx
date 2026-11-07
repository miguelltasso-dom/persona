// @vitest-environment jsdom
// D-095 / blocker de release (Keel 05/11 04:01): na Caixa de Aprovações V2 (agora a padrão) um cartão de ação externa mostra a PRÉVIA REAL
// (para quem, assunto, corpo) e o botão principal é "Enviar", nunca "Aceitar"; o de conector mostra as três escolhas; sem prévia só dá para
// Cancelar. Os atalhos A / D e o lote nunca decidem um desses dois.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApprovalView } from '@deepseek-ai/dsh-persona-host/types'
import { ApprovalsInboxV2, type ApprovalsInboxV2Props } from '../src/client/approvals/ApprovalsInboxV2.tsx'
import { genericDecisionRoute } from '../src/client/approvals/action-approval.ts'
import { batchEligible, buildInboxGroups, flattenRows } from '../src/client/approvals/inbox-model.ts'
import type { ApprovalItem } from '../src/client/approvals/mock-data.ts'
import { approvalViewToItem } from '../src/client/data/adapters/approvals.ts'
import { pt as approvalsPt } from '../src/client/locale/approvals/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'

installPreviewTheme()
afterEach(() => { cleanup(); localStorage.clear() })

const preview = (extra: Record<string, unknown> = {}) => ({
  actionClass: 'send', verb: 'email', connectorName: 'Gmail', to: 'ana@padarialua.com.br', subject: 'Encomenda de sexta', body: 'Oi, Ana! Confirmo os bolos.',
  truncated: false, masked: false, requestedByPerson: true, status: 'pending', canRemember: true, ...extra,
})
const actionView = (extra: Record<string, unknown> = {}, actionPreview: Record<string, unknown> | null = preview()): ApprovalView => ({
  id: 'act-1', kind: 'action', title: 'Enviar um email', question: 'Nina quer enviar um email', status: 'pending', personaId: 'p-nina', personaName: 'Nina',
  ...(actionPreview === null ? {} : { actionPreview }), ...extra,
} as unknown as ApprovalView)
const connectorView = (): ApprovalView => ({
  id: 'conn-1', kind: 'connector', title: 'Liberar o Gmail para Téo', question: 'Bia pediu a Téo Arte da home, mas Téo não pode usar o Gmail.', status: 'pending', personaId: 'p-teo', personaName: 'Téo',
  connector: { reason: 'colleague', connectorName: 'Gmail', cli: 'claude', connectorId: 'gmail', access: 'read', requestedByPersonaId: 'p-bia', requestedByPersonaName: 'Bia', taskId: 't-arte', taskTitle: 'Arte da home', options: ['once', 'always', 'not-now'] },
} as unknown as ApprovalView)

const pending = (item: ApprovalItem): ApprovalItem => ({ ...item, decisionState: 'pending' })
const ACTION = pending(approvalViewToItem(actionView()))
const BLIND_PREVIEW = pending(approvalViewToItem(actionView({ id: 'act-blind' }, preview({ truncated: true }))))
const NO_PREVIEW = pending(approvalViewToItem(actionView({ id: 'act-none' }, null)))
const CONNECTOR = pending(approvalViewToItem(connectorView()))

function mount(items: readonly ApprovalItem[], props: Partial<ApprovalsInboxV2Props> = {}) {
  const handlers = { onDecideItem: vi.fn(), onDecideAction: vi.fn(), onDecideConnector: vi.fn() }
  const view = render(
    <PreviewFrame brandLabel="Persona">
      <ApprovalsInboxV2 dict={approvalsPt} items={items} {...handlers} {...props} />
    </PreviewFrame>,
  )
  return { ...view, ...handlers }
}
const detail = (): HTMLElement => document.querySelector<HTMLElement>('[data-persona-approval-detail]')!
const root = (): HTMLElement => document.querySelector<HTMLElement>('[data-persona-inbox]')!

describe('external action in the V2 detail: the real preview, and Enviar as the primary', () => {
  it('shows to whom, the subject and the body, and the primary is "Enviar" (never "Aceitar" / "Revisar")', () => {
    const { onDecideAction, onDecideItem } = mount([ACTION])
    const pane = within(detail())
    expect(pane.getByText('ana@padarialua.com.br')).toBeTruthy()
    expect(pane.getByText('Encomenda de sexta')).toBeTruthy()
    expect(pane.getByText(/Confirmo os bolos/)).toBeTruthy()
    expect(pane.getByRole('button', { name: 'Enviar' })).toBeTruthy()
    expect(pane.getByRole('button', { name: 'Cancelar' })).toBeTruthy()
    expect(pane.queryByRole('button', { name: /Aceitar|Aprovar|Revisar|Dispensar/ })).toBeNull()
    expect(detail().querySelector('[aria-keyshortcuts]')).toBeNull()
    fireEvent.click(pane.getByRole('button', { name: 'Enviar' }))
    expect(onDecideAction).toHaveBeenCalledWith(expect.objectContaining({ approvalId: 'act-1', choice: 'send' }))
    expect(onDecideItem).not.toHaveBeenCalled()
  })

  it('the row and the heading say the host\'s own words, not a raw key', () => {
    mount([ACTION])
    expect(document.querySelector('[role="option"]')?.textContent).toContain('Enviar um email')
    expect(detail().textContent).not.toMatch(/action\.title/)
    expect(within(detail()).getByRole('heading', { level: 2 }).textContent).toBe('Enviar um email')
  })

  it('payment: Pagar, the irreversible warning, no "Não perguntar de novo"', () => {
    const pay = pending(approvalViewToItem(actionView({ id: 'act-pay' }, preview({ actionClass: 'pay', verb: 'pay', connectorName: 'Mercado Pago', amount: 'R$ 120,00', payee: 'Gráfica Boa Impressão', to: undefined, subject: undefined, body: undefined, canRemember: false }))))
    mount([pay])
    const pane = within(detail())
    expect(pane.getByRole('button', { name: 'Pagar' })).toBeTruthy()
    expect(pane.getByText('Isso não dá para desfazer depois.')).toBeTruthy()
    expect(pane.queryByText(/Não perguntar de novo/)).toBeNull()
  })

  it('a cut preview cannot be sent (Enviar off) and says why', () => {
    mount([BLIND_PREVIEW])
    expect((within(detail()).getByRole('button', { name: 'Enviar' }) as HTMLButtonElement).disabled).toBe(true)
    expect(within(detail()).getByText(/não dá para enviar às cegas/)).toBeTruthy()
  })

  it('with no way to answer wired it is read-only: no button that looks alive', () => {
    mount([ACTION], { onDecideAction: undefined })
    expect(within(detail()).queryByRole('button', { name: 'Enviar' })).toBeNull()
    expect(within(detail()).queryByRole('button', { name: 'Cancelar' })).toBeNull()
  })

  it('A and D never send or cancel it (only the card\'s own buttons do)', () => {
    const { onDecideAction, onDecideItem } = mount([ACTION])
    const row = document.querySelector<HTMLElement>('[role="option"]')!
    fireEvent.keyDown(row, { key: 'a' })
    fireEvent.keyDown(row, { key: 'A' })
    fireEvent.keyDown(row, { key: 'd' })
    fireEvent.keyDown(root(), { key: 'a' })
    expect(onDecideAction).not.toHaveBeenCalled()
    expect(onDecideItem).not.toHaveBeenCalled()
  })
})

describe('external action without a preview: nothing approves, only Cancelar', () => {
  it('the adapter keeps it cancel-only (a plain card whose Aceitar is refused)', () => {
    expect(NO_PREVIEW.kind).toBe('attention')
    expect(NO_PREVIEW.blindAction).toBe(true)
    expect(genericDecisionRoute(NO_PREVIEW, true)).toBe('action-refused')
    expect(genericDecisionRoute(NO_PREVIEW, false)).toBe('action-cancel')
    expect(approvalViewToItem({ ...actionView({}, null), kind: 'attention' } as ApprovalView).blindAction).toBeUndefined()
  })

  it('the detail has its own sentence ("A prévia não chegou…", not the partial one) and a Cancelar; no Enviar, no Aceitar, no shortcut', () => {
    const { onDecideItem, onDecideAction } = mount([NO_PREVIEW])
    const pane = within(detail())
    expect(pane.getByText('A prévia não chegou, então não dá para conferir antes de enviar.')).toBeTruthy()
    expect(pane.queryByText(/está parcial/)).toBeNull()
    // The chip says what it is ("Ação externa"), in the list and in the detail — not a plain "Tarefa".
    expect(document.querySelector('[role="option"]')?.textContent).toContain('Ação externa')
    expect(detail().textContent).toContain('Ação externa')
    expect(detail().textContent).not.toContain('Tarefa')
    expect(pane.queryByRole('button', { name: /Enviar|Aceitar|Aprovar|Revisar/ })).toBeNull()
    expect(detail().querySelector('[aria-keyshortcuts]')).toBeNull()
    fireEvent.click(pane.getByRole('button', { name: 'Cancelar' }))
    expect(onDecideItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'act-none' }), false)
    expect(onDecideAction).not.toHaveBeenCalled()
  })

  it('A and D do nothing on it', () => {
    const { onDecideItem } = mount([NO_PREVIEW])
    const row = document.querySelector<HTMLElement>('[role="option"]')!
    fireEvent.keyDown(row, { key: 'a' })
    fireEvent.keyDown(row, { key: 'd' })
    expect(onDecideItem).not.toHaveBeenCalled()
  })
})

describe('the two sentences are different (Muse 04:26): a missing preview ≠ a partial one', () => {
  it('pt and en carry action.missing next to action.partial', async () => {
    const { pt, en } = await import('../src/client/locale/chat/locales.ts')
    expect(pt['action.missing']).toBe('A prévia não chegou, então não dá para conferir antes de enviar.')
    expect(en['action.missing']).toBe("The preview didn't arrive, so there's no way to check before sending.")
    expect(pt['action.partial']).not.toBe(pt['action.missing'])
  })
})

describe('connector in the V2 detail: the three choices', () => {
  it('"Liberar o Gmail para Téo" shows só desta vez · sempre · agora não, and no generic Aprovar / Dispensar', () => {
    const { onDecideConnector, onDecideItem } = mount([CONNECTOR])
    const pane = within(detail())
    expect(pane.getByRole('heading', { level: 2 }).textContent).toBe('Liberar o Gmail para Téo')
    expect(pane.getByRole('button', { name: 'Liberar só desta vez' })).toBeTruthy()
    expect(pane.getByRole('button', { name: 'Sempre permitir para Téo' })).toBeTruthy()
    expect(pane.getByRole('button', { name: 'Agora não' })).toBeTruthy()
    expect(pane.queryByRole('button', { name: /Aceitar|Aprovar|Dispensar/ })).toBeNull()
    expect(detail().querySelector('[aria-keyshortcuts]')).toBeNull()
    fireEvent.click(pane.getByRole('button', { name: 'Agora não' }))
    expect(onDecideConnector).toHaveBeenCalledWith(expect.objectContaining({ id: 'conn-1' }), 'not-now')
    expect(onDecideItem).not.toHaveBeenCalled()
  })

  it('a store-driven choice goes straight to the host with the choice made', () => {
    const { onDecideConnector } = mount([CONNECTOR])
    fireEvent.click(within(detail()).getByRole('button', { name: 'Sempre permitir para Téo' }))
    expect(onDecideConnector).toHaveBeenCalledWith(expect.objectContaining({ id: 'conn-1' }), 'always')
  })

  it('A and D do not decide it; without a handler the choices are off', () => {
    const { onDecideConnector, onDecideItem } = mount([CONNECTOR])
    const row = document.querySelector<HTMLElement>('[role="option"]')!
    fireEvent.keyDown(row, { key: 'a' })
    fireEvent.keyDown(row, { key: 'd' })
    expect(onDecideConnector).not.toHaveBeenCalled()
    expect(onDecideItem).not.toHaveBeenCalled()
    cleanup()
    mount([CONNECTOR], { onDecideConnector: undefined })
    expect((within(detail()).getByRole('button', { name: 'Agora não' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('an example card (capture-only) never reaches the host', () => {
    const { onDecideConnector } = mount([{ ...CONNECTOR, example: true }])
    fireEvent.click(within(detail()).getByRole('button', { name: 'Agora não' }))
    expect(onDecideConnector).not.toHaveBeenCalled()
  })
})

describe('never in the batch', () => {
  it('even when the host says `low`, an action, a connector and a preview-less action stay out of "Aprovar de risco baixo"', () => {
    const items = [ACTION, BLIND_PREVIEW, NO_PREVIEW, CONNECTOR].map(item => ({ ...item, risk: 'low' as const }))
    const rows = flattenRows(buildInboxGroups(approvalsPt, items, []))
    expect(batchEligible(rows)).toEqual([])
    mount(items)
    expect(screen.queryByRole('button', { name: /risco baixo/i })).toBeNull()
  })
})
