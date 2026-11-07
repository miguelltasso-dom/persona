// @vitest-environment jsdom
// HT-9 / D-095 (the permission-gated send ships in v1.1): an external action waiting for the person is a card in Aprovações — the SAME card the
// thread shows. Everything that leaves the company is seen first; a preview that is cut, masked or missing what it must show cannot be sent
// (no Enviar); pay and delete never offer "Não perguntar de novo" and carry the irreversible warning; the example never reaches the host.
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApprovalView } from '@deepseek-ai/dsh-persona-host/types'
import { actionPreviewFromApproval, genericDecisionRoute } from '../src/client/approvals/action-approval.ts'
import { ApprovalsInbox } from '../src/client/approvals/ApprovalsInbox.tsx'
import { CONNECTOR_DEV_SAMPLE } from '../src/client/approvals/connector-dev-sample.ts'
import type { PersonaTenantSnapshot } from '../src/client/data/persona-tenant.ts'
import { approvalViewToItem } from '../src/client/data/adapters/approvals.ts'
import { deriveDecisions } from '../src/client/decisions/derive-decisions.ts'
import { pt as approvalsPt } from '../src/client/locale/approvals/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { ConnectedApprovalsPanel } from '../src/client/remote/ConnectedApprovalsPanel.tsx'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'

installPreviewTheme()
beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); localStorage.clear() })

const preview = (extra: Record<string, unknown> = {}) => ({
  actionClass: 'send', verb: 'email', connectorName: 'Gmail', to: 'ana@padarialua.com.br', subject: 'Encomenda de sexta', body: 'Oi, Ana! Confirmo os bolos.',
  truncated: false, masked: false, requestedByPerson: true, status: 'pending', canRemember: true, ...extra,
})
const approval = (extra: Record<string, unknown> = {}, actionPreview: Record<string, unknown> | null = preview()): ApprovalView => ({
  id: 'act-1', kind: 'action', title: 'Enviar um email', question: 'Nina quer enviar um email', status: 'pending', personaId: 'p-nina', personaName: 'Nina',
  ...(actionPreview === null ? {} : { actionPreview }), ...extra,
} as unknown as ApprovalView)

describe('the approval becomes the card model', () => {
  it('takes the id and the persona from the approval itself; the preview is the real content', () => {
    const ui = actionPreviewFromApproval(approval())
    expect(ui).toMatchObject({ approvalId: 'act-1', personaId: 'p-nina', personaName: 'Nina', verb: 'email', actionClass: 'send', connectorName: 'Gmail', to: 'ana@padarialua.com.br', blind: false, requestedByPerson: true })
  })

  it('cut, masked, or missing what must be shown = blind (cannot be sent)', () => {
    expect(actionPreviewFromApproval(approval({}, preview({ truncated: true })))?.blind).toBe(true)
    expect(actionPreviewFromApproval(approval({}, preview({ masked: true })))?.blind).toBe(true)
    expect(actionPreviewFromApproval(approval({}, preview({ to: undefined })))?.blind).toBe(true)
    expect(actionPreviewFromApproval(approval({}, preview({ actionClass: 'delete' })))?.blind).toBe(true)
  })

  it('no preview = no card model', () => {
    expect(actionPreviewFromApproval(approval({}, null))).toBeUndefined()
  })

  it("the adapter makes an action item with the preview; without one it stays a plain attention card (the host's words)", () => {
    expect(approvalViewToItem(approval()).kind).toBe('action')
    expect(approvalViewToItem(approval()).actionPreview?.approvalId).toBe('act-1')
    const plain = approvalViewToItem(approval({}, null))
    expect(plain.kind).toBe('attention')
    expect(plain.actionPreview).toBeUndefined()
  })
})

describe('an action or a connector is never "de risco baixo" (no batch, no one-click)', () => {
  it('even when the host says low, the decision stays normal; a plain skill keeps the host\'s word', () => {
    const decisions = deriveDecisions({
      approvals: [
        { ...approval(), risk: 'low' },
        { ...approval({ id: 'con-1', kind: 'connector' }, null), risk: 'low' },
        { ...approval({ id: 'skill-1', kind: 'skill' }, null), risk: 'low' },
      ],
    })
    const riskOfId = (id: string) => decisions.find(decision => decision.id === id)?.risk
    expect(riskOfId('act-1')).toBe('normal')
    expect(riskOfId('con-1')).toBe('normal')
    expect(riskOfId('skill-1')).toBe('low')
  })
})

describe('the generic Aceitar / Dispensar of an inbox detail (the V2 pane has no preview)', () => {
  it('an external action is never approved without its content: Aceitar is refused, Dispensar is the contract cancel', () => {
    const action = approvalViewToItem(approval())
    expect(genericDecisionRoute(action, true)).toBe('action-refused')
    expect(genericDecisionRoute(action, false)).toBe('action-cancel')
  })

  it('the other kinds keep their way: connector = só desta vez / agora não, examples never leave, the rest is the plain decision', () => {
    const connector = { kind: 'connector', example: undefined } as const
    expect(genericDecisionRoute(connector, true)).toBe('connector')
    expect(genericDecisionRoute(connector, false)).toBe('connector')
    expect(genericDecisionRoute({ kind: 'action', example: true }, true)).toBe('ignore')
    expect(genericDecisionRoute({ kind: 'skill', example: undefined }, true)).toBe('generic')
  })
})

function mount(items: ReturnType<typeof approvalViewToItem>[], onDecideAction?: (decision: unknown) => void) {
  return render(
    <PreviewFrame brandLabel="Persona">
      <ApprovalsInbox dict={approvalsPt} items={items} onDecideItem={vi.fn()} {...(onDecideAction === undefined ? {} : { onDecideAction: onDecideAction as never })} />
    </PreviewFrame>,
  )
}

describe('the card in Aprovações', () => {
  it("e-mail: says the verb and the medium, shows the real content, and Enviar answers with the contract's choice", () => {
    const onDecideAction = vi.fn()
    mount([{ ...approvalViewToItem(approval()), decisionState: 'pending' }], onDecideAction)
    expect(screen.getByText('Vai enviar um email · pelo Gmail')).toBeTruthy()
    expect(screen.getByText('ana@padarialua.com.br')).toBeTruthy()
    expect(screen.getByText('Encomenda de sexta')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(onDecideAction).toHaveBeenCalledWith(expect.objectContaining({ approvalId: 'act-1', choice: 'send' }))
  })

  it('payment: the irreversible warning, no "Não perguntar de novo", and the verb is Pagar', () => {
    const pay = approvalViewToItem(approval({}, preview({ actionClass: 'pay', verb: 'pay', connectorName: 'Mercado Pago', amount: 'R$ 120,00', payee: 'Gráfica Boa Impressão', to: undefined, subject: undefined, body: undefined, canRemember: false })))
    mount([{ ...pay, decisionState: 'pending' }], vi.fn())
    expect(screen.getByText('Isso não dá para desfazer depois.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pagar' })).toBeTruthy()
    expect(screen.queryByText(/Não perguntar de novo/)).toBeNull()
    expect(screen.getByText('R$ 120,00')).toBeTruthy()
  })

  it('a blind preview cannot be sent', () => {
    const blind = approvalViewToItem(approval({}, preview({ truncated: true })))
    mount([{ ...blind, decisionState: 'pending' }], vi.fn())
    expect((screen.getByRole('button', { name: 'Enviar' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('with nothing wired it is read-only: no buttons that look alive', () => {
    mount([{ ...approvalViewToItem(approval()), decisionState: 'pending' }])
    expect(screen.queryByRole('button', { name: 'Enviar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull()
  })

  it('BR-P7: the icon of the medium sits beside the words (hidden from readers)', () => {
    const { container } = mount([{ ...approvalViewToItem(approval()), decisionState: 'pending' }], vi.fn())
    const eyebrow = screen.getByText('Vai enviar um email · pelo Gmail')
    expect(eyebrow.parentElement?.querySelector('[style*="--persona-icon-url"]')).not.toBeNull()
    expect(container.querySelector('[style*="--persona-icon-url"][aria-hidden="true"]')).not.toBeNull()
  })
})

describe('the capture-only examples (two dev keys; never reaching the host)', () => {
  function mountPanel(decideActionApproval: (decision: unknown) => Promise<void>) {
    const live = createSnapshotStore<unknown>({ ready: true, error: null, decisions: [] })
    const useLive = bindObservableForTest({ getSnapshot: () => live.getSnapshot() as never, subscribe: listener => live.subscribe(listener) })
    const tenant = createSnapshotStore<PersonaTenantSnapshot>({ status: 'ready', scope: { workspaceId: 'ws', projectId: 'proj', actorId: 'owner' } })
    const useTenant = bindObservableForTest({ getSnapshot: () => tenant.getSnapshot(), subscribe: listener => tenant.subscribe(listener) })
    const { store: shellStore } = createShellStore()
    const useShell = bindObservableForTest(shellStore)
    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectedApprovalsPanel persona={{} as never} useTenant={useTenant} useShell={useShell} useLive={useLive as never} decideDecision={vi.fn(async () => undefined)} decideActionApproval={decideActionApproval as never} refreshLive={() => {}} clearApprovalFocus={() => {}} />
      </PreviewFrame>,
    )
  }

  it('the sample set has an e-mail and a payment, both marked as examples', () => {
    const actions = CONNECTOR_DEV_SAMPLE.filter(item => item.kind === 'action')
    expect(actions.map(item => item.actionPreview?.verb)).toEqual(['email', 'pay'])
    expect(actions.every(item => item.example === true && item.id.startsWith('dev-'))).toBe(true)
  })

  it('with both keys the two action cards show, tagged "Exemplo", and Enviar / Pagar / Cancelar never call the host', async () => {
    localStorage.setItem('persona.devSeed.v1', '1')
    localStorage.setItem('persona.devSeed.connector', '1')
    const decideActionApproval = vi.fn(async () => undefined)
    mountPanel(decideActionApproval)
    await waitFor(() => { expect(screen.getByText('Vai enviar um email · pelo Gmail')).toBeTruthy() })
    expect(screen.getByText(/Vai pagar R\$ 120,00/)).toBeTruthy()
    for (const name of ['Enviar', 'Pagar', 'Cancelar']) for (const button of screen.getAllByRole('button', { name })) fireEvent.click(button)
    await Promise.resolve()
    expect(decideActionApproval).not.toHaveBeenCalled()
  })
})
