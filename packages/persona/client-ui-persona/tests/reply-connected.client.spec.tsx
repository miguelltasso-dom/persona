// @vitest-environment jsdom
// IV-10 · "Responder" ponta a ponta no painel conectado de Aprovações: o cartão `attention` (id = o da Tarefa) junta-se ao fio onde a pergunta foi
// feita (TaskView.question + questionStreamId, que o mapa da Tarefa leva ao cartão do quadro); "Responder" põe o alvo na loja, abre a conversa e
// pede o foco do composer. Atrás de persona.flag.personaAsk; sem o handler do shell (`openConversation`) ou sem os dois campos, não há botão.
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApprovalView } from '@deepseek-ai/dsh-persona-host/types'
import { replyTargetStore } from '../src/client/answer/reply-target.ts'
import { PERSONA_ASK_FLAG_KEY } from '../src/client/ask/ask-flag.ts'
import { PERSONA_FOCUS_COMPOSER_EVENT } from '../src/client/chat/composer-focus.ts'
import type { PersonaTenantSnapshot } from '../src/client/data/persona-tenant.ts'
import { deriveDecisions } from '../src/client/decisions/derive-decisions.ts'
import type { KanbanCardModel } from '../src/client/kanban/types.ts'
import { ConnectedApprovalsPanel } from '../src/client/remote/ConnectedApprovalsPanel.tsx'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'

installPreviewTheme()
beforeEach(() => { localStorage.clear(); replyTargetStore.clear() })
afterEach(() => { cleanup(); localStorage.clear(); replyTargetStore.clear() })

const ATTENTION: ApprovalView = {
  id: 'tk-1', kind: 'attention', title: 'Qual preço eu uso?', question: 'Qual preço eu uso para o bolo de cenoura?',
  status: 'pending', personaId: 'p-nina', personaName: 'Nina',
} as unknown as ApprovalView

const cardOf = (extra: Partial<KanbanCardModel> = {}): KanbanCardModel => ({
  id: 'tk-1', title: 'Tabela de preços', projectId: 'proj', projectName: 'Padaria', teamId: 'default', teamName: 'Equipe', column: 'blocked',
  waitingEvent: false, blocked: true, reviewApproved: false, assignee: { id: 'p-nina', name: 'Nina', initials: 'N' },
  question: 'Qual preço eu uso para o bolo de cenoura?', questionStreamId: 'channel:geral', ...extra,
})

function mountPanel(options: { readonly cards?: readonly KanbanCardModel[]; readonly openConversation?: ((kind: 'channel' | 'dm', ownerId: string) => void) | undefined } = {}) {
  const decisions = deriveDecisions({ approvals: [ATTENTION] })
  const live = createSnapshotStore<unknown>({ ready: true, error: null, decisions, kanbanCards: options.cards ?? [cardOf()] })
  const useLive = bindObservableForTest({ getSnapshot: () => live.getSnapshot() as never, subscribe: listener => live.subscribe(listener) })
  const tenant = createSnapshotStore<PersonaTenantSnapshot>({ status: 'ready', scope: { workspaceId: 'ws', projectId: 'proj', actorId: 'owner' } })
  const useTenant = bindObservableForTest({ getSnapshot: () => tenant.getSnapshot(), subscribe: listener => tenant.subscribe(listener) })
  const { store: shellStore } = createShellStore()
  const useShell = bindObservableForTest(shellStore)
  render(
    <PreviewFrame brandLabel="Persona">
      <ConnectedApprovalsPanel
        persona={{} as never}
        useTenant={useTenant}
        useShell={useShell}
        useLive={useLive as never}
        decideDecision={vi.fn(async () => undefined)}
        refreshLive={() => {}}
        clearApprovalFocus={() => {}}
        {...(options.openConversation === undefined ? {} : { openConversation: options.openConversation })}
      />
    </PreviewFrame>,
  )
}

describe('"Responder" no painel conectado de Aprovações', () => {
  it('com a flag, o handler do shell e a Tarefa com pergunta: o primário é "Responder"; clicar põe o alvo, abre a conversa e pede o foco do composer', async () => {
    localStorage.setItem(PERSONA_ASK_FLAG_KEY, '1')
    const openConversation = vi.fn()
    const focus = vi.fn()
    window.addEventListener(PERSONA_FOCUS_COMPOSER_EVENT, focus)
    mountPanel({ openConversation })
    const reply = await screen.findByRole('button', { name: 'Responder' })
    fireEvent.click(reply)
    expect(openConversation).toHaveBeenCalledWith('channel', 'geral')
    expect(replyTargetStore.get()).toEqual({
      ticketId: 'tk-1', personaId: 'p-nina', personaName: 'Nina', question: 'Qual preço eu uso para o bolo de cenoura?', streamKind: 'channel', ownerId: 'geral',
    })
    await waitFor(() => { expect(focus).toHaveBeenCalledTimes(1) }, { timeout: 2000 })
    window.removeEventListener(PERSONA_FOCUS_COMPOSER_EVENT, focus)
  })

  it('uma pergunta feita numa DM leva à DM', async () => {
    localStorage.setItem(PERSONA_ASK_FLAG_KEY, '1')
    const openConversation = vi.fn()
    mountPanel({ openConversation, cards: [cardOf({ questionStreamId: 'dm:dm-nina' })] })
    fireEvent.click(await screen.findByRole('button', { name: 'Responder' }))
    expect(openConversation).toHaveBeenCalledWith('dm', 'dm-nina')
    expect(replyTargetStore.get()).toMatchObject({ streamKind: 'dm', ownerId: 'dm-nina' })
  })

  it('sem a flag, sem o handler do shell, ou sem os campos do host: nada de botão (e a loja fica vazia)', async () => {
    mountPanel({ openConversation: vi.fn() })
    await screen.findAllByText('Qual preço eu uso?')
    expect(screen.queryByRole('button', { name: 'Responder' })).toBeNull()
    cleanup()
    localStorage.setItem(PERSONA_ASK_FLAG_KEY, '1')
    mountPanel({ openConversation: undefined })
    await screen.findAllByText('Qual preço eu uso?')
    expect(screen.queryByRole('button', { name: 'Responder' })).toBeNull()
    cleanup()
    mountPanel({ openConversation: vi.fn(), cards: [cardOf({ questionStreamId: undefined })] })
    await screen.findAllByText('Qual preço eu uso?')
    expect(screen.queryByRole('button', { name: 'Responder' })).toBeNull()
    expect(replyTargetStore.get()).toBeUndefined()
  })
})
