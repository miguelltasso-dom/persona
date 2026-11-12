// @vitest-environment jsdom
// P0-10 (Carbon, colheita-s1): o cartão de ação externa em Aprovações não pode ser um cartão morto. O `RemoteApprovalsPanel` (a tela de
// Aprovações ligada direto ao host) não passava `onDecideAction`: o cartão aparecia com o conteúdo, mas SEM "Segure para enviar" nem "Cancelar".
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACTION_PREVIEW_FLAG_KEY } from '../src/client/chat/action-preview-flag.ts'
import { RemoteApprovalsPanel } from '../src/client/data/lumen-remote-panels.tsx'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'
import type { PersonaTenantSnapshot } from '../src/client/data/persona-tenant.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { holdToApprove } from './hold-approve-helper.client.ts'

installPreviewTheme()
beforeEach(() => { localStorage.setItem(ACTION_PREVIEW_FLAG_KEY, '1') })
afterEach(() => { cleanup(); localStorage.removeItem(ACTION_PREVIEW_FLAG_KEY) })

function tenantHarness(): ReturnType<typeof bindObservableForTest<PersonaTenantSnapshot>> {
  const store = createSnapshotStore<PersonaTenantSnapshot>({ status: 'ready', scope: { workspaceId: 'ws', projectId: 'proj', actorId: 'owner' } })
  return bindObservableForTest({ getSnapshot: () => store.getSnapshot(), subscribe: listener => store.subscribe(listener) })
}

function shellHarness(): ReturnType<typeof bindObservableForTest<ReturnType<ReturnType<typeof createShellStore>['store']['getSnapshot']>>> {
  const { store } = createShellStore()
  return bindObservableForTest(store)
}

const ACTION = {
  id: 'ap-act',
  kind: 'action',
  title: 'Enviar um email',
  question: 'A Nina quer enviar um email para ana@padarialua.com.br.',
  status: 'pending',
  personaId: 'nina',
  personaName: 'Nina',
  actionPreview: {
    approvalId: 'ap-act', actionClass: 'send', verb: 'email', connectorName: 'Gmail', personaId: 'nina', personaName: 'Nina',
    to: 'ana@padarialua.com.br', subject: 'Encomenda de sexta', body: 'Oi, Ana! Confirmo os 3 bolos.', truncated: false, requestedByPerson: false, status: 'pending',
  },
}

function mount(decideApproval: ReturnType<typeof vi.fn>) {
  const listApprovals = vi.fn(async () => ({ ok: true as const, value: [ACTION] }))
  const persona = {
    listApprovals,
    listDailySummaries: vi.fn(async () => ({ ok: true as const, value: [] })),
    decideApproval,
  } as unknown as PersonaRemoteClient
  render(
    <PreviewFrame brandLabel="Persona">
      <RemoteApprovalsPanel persona={persona} useTenant={tenantHarness()} useShell={shellHarness()} />
    </PreviewFrame>,
  )
  return { listApprovals }
}

describe('RemoteApprovalsPanel: o cartão de ação externa tem botões que funcionam', () => {
  it('"Segure para enviar" manda a decisão ao host (kind action, choice send) e recarrega a lista', async () => {
    const decideApproval = vi.fn(async () => ({ ok: true as const, value: undefined }))
    const { listApprovals } = mount(decideApproval)
    await holdToApprove(await screen.findByRole('button', { name: 'Segure para enviar' }))
    await waitFor(() => {
      expect(decideApproval).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ws', projectId: 'proj', kind: 'action', id: 'ap-act', choice: 'send' }))
    })
    await waitFor(() => { expect(listApprovals.mock.calls.length).toBeGreaterThanOrEqual(2) })
  })

  it('o host recusou ({ ok: false }): o cartão mostra o motivo do host e NÃO recarrega como se tivesse decidido', async () => {
    const decideApproval = vi.fn(async () => ({ ok: false as const, error: { code: 'invalid-payload', message: 'A prévia está cortada.' } }))
    const { listApprovals } = mount(decideApproval)
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))
    await waitFor(() => { expect(decideApproval).toHaveBeenCalledWith(expect.objectContaining({ kind: 'action', choice: 'cancel' })) })
    expect(await screen.findByText('Não deu para concluir. A prévia está cortada.')).toBeTruthy()
    expect(listApprovals).toHaveBeenCalledTimes(1)
  })
})
