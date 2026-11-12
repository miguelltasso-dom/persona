// @vitest-environment jsdom
// P0-10 (Keel 04:20): a tela de Aprovações DE PRODUÇÃO (`ConnectedApprovalsPanel`, a que o `register-prism-screens` monta) tem os mesmos controles do
// #geral para uma ação externa de verdade (uma aprovação do host virada em `Decision`, não o cartão de exemplo): Segure para enviar, Cancelar,
// Cc/Cco/Anexos na prévia e o motivo da recusa do host. O `RemoteApprovalsPanel` (só de teste) não é este.
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApprovalView } from '@deepseek-ai/dsh-persona-host/types'
import { ACTION_PREVIEW_FLAG_KEY } from '../src/client/chat/action-preview-flag.ts'
import type { PersonaTenantSnapshot } from '../src/client/data/persona-tenant.ts'
import { deriveDecisions } from '../src/client/decisions/derive-decisions.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { ConnectedApprovalsPanel } from '../src/client/remote/ConnectedApprovalsPanel.tsx'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'
import { holdToApprove } from './hold-approve-helper.client.ts'

installPreviewTheme()
beforeEach(() => { localStorage.clear(); localStorage.setItem(ACTION_PREVIEW_FLAG_KEY, '1') })
afterEach(() => { cleanup(); localStorage.clear() })

const REAL_ACTION = {
  id: 'act-real-1', kind: 'action', title: 'Enviar um email', question: 'A Nina quer enviar um email', status: 'pending', personaId: 'p-nina', personaName: 'Nina',
  actionPreview: {
    actionClass: 'send', verb: 'email', connectorName: 'Gmail', to: 'ana@padarialua.com.br', cc: 'chefe@padarialua.com.br', bcc: 'oculto@padarialua.com.br',
    attachments: ['orcamento.pdf'], subject: 'Encomenda de sexta', body: 'Oi, Ana! Confirmo os bolos.',
    truncated: false, masked: false, requestedByPerson: true, status: 'pending', canRemember: true,
  },
} as unknown as ApprovalView

function mountProduction(decideActionApproval: (decision: unknown) => Promise<void>) {
  const decisions = deriveDecisions({ approvals: [REAL_ACTION] })
  const live = createSnapshotStore<unknown>({ ready: true, error: null, decisions })
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

describe('Aprovações de produção com uma ação externa real do host', () => {
  it('o cartão mostra o conteúdo inteiro: Para, Cc, Cco, Assunto, Anexos e a mensagem (nada escondido na hora de aprovar)', async () => {
    mountProduction(vi.fn(async () => undefined))
    await screen.findByRole('button', { name: 'Segure para enviar' })
    for (const text of ['ana@padarialua.com.br', 'chefe@padarialua.com.br', 'oculto@padarialua.com.br', 'orcamento.pdf', 'Encomenda de sexta']) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
    for (const label of ['Cc', 'Cco', 'Anexos']) expect(screen.getAllByText(label).length).toBeGreaterThan(0)
  })

  it('"Segure para enviar" chama a decisão do host com a aprovação certa (choice send); um clique curto não envia', async () => {
    const decideActionApproval = vi.fn(async () => undefined)
    mountProduction(decideActionApproval)
    const hold = await screen.findByRole('button', { name: 'Segure para enviar' })
    fireEvent.click(hold)
    expect(decideActionApproval).not.toHaveBeenCalled()
    await holdToApprove(hold)
    await waitFor(() => { expect(decideActionApproval).toHaveBeenCalledWith({ approvalId: 'act-real-1', choice: 'send' }) })
  })

  it('"Cancelar" chama a decisão do host (choice cancel)', async () => {
    const decideActionApproval = vi.fn(async () => undefined)
    mountProduction(decideActionApproval)
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))
    await waitFor(() => { expect(decideActionApproval).toHaveBeenCalledWith({ approvalId: 'act-real-1', choice: 'cancel' }) })
  })

  it('o host recusou: o cartão mostra o motivo do host e deixa tentar de novo (não fica preso nem finge que enviou)', async () => {
    const refused = Object.assign(new Error('O host da Persona não conseguiu concluir "decideApproval" (invalid-payload)'), { hostMessage: 'A prévia está cortada.' })
    const decideActionApproval = vi.fn().mockRejectedValueOnce(refused).mockResolvedValue(undefined)
    mountProduction(decideActionApproval)
    await holdToApprove(await screen.findByRole('button', { name: 'Segure para enviar' }))
    expect(await screen.findByText('Não deu para concluir. A prévia está cortada.')).toBeTruthy()
    await waitFor(() => { expect((screen.getByRole('button', { name: 'Segure para enviar' }) as HTMLButtonElement).disabled).toBe(false) })
    await holdToApprove(screen.getByRole('button', { name: 'Segure para enviar' }))
    await waitFor(() => { expect(decideActionApproval).toHaveBeenCalledTimes(2) })
  })

  it('o "Aceitar" genérico nunca envia uma ação externa (só o cartão com a prévia envia)', async () => {
    const decideActionApproval = vi.fn(async () => undefined)
    mountProduction(decideActionApproval)
    await screen.findByRole('button', { name: 'Segure para enviar' })
    expect(screen.queryByRole('button', { name: 'Aceitar' })).toBeNull()
    expect(decideActionApproval).not.toHaveBeenCalled()
  })
})
