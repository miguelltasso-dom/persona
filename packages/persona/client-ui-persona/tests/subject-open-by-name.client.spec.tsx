// @vitest-environment jsdom
// P0-27 `/assunto nome`: abre o assunto que já existe (sem diferenciar acento/caixa) ou cria e abre um novo. Nunca manda
// nome vazio ao host (o Gauge pegou isso no botão +) e nunca cria duplicado.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConversationSubjectUi } from '../src/client/chat/conversation-subjects.ts'
import { useHostConversationSubjects } from '../src/client/chat/use-host-conversation-subjects.ts'
import type { PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'

afterEach(() => { cleanup() })

const SUBJECTS: readonly ConversationSubjectUi[] = [
  { id: 'sub-geral', name: 'Geral', colorIndex: 0, unreadCount: 0 },
  { id: 'sub-orc', name: 'Orçamento', colorIndex: 1, unreadCount: 0 },
]

function fakeLive() {
  const bundle = { subjects: SUBJECTS, activeSubjectId: 'sub-geral' }
  const live = {
    conversationScopeFromKey: vi.fn(() => ({ kind: 'channel', ownerId: 'c1' })),
    fetchConversationSubjects: vi.fn(() => Promise.resolve(bundle)),
    selectConversationSubject: vi.fn((_scope: unknown, subjectId: string) => Promise.resolve({ ...bundle, activeSubjectId: subjectId })),
    createConversationSubject: vi.fn((_scope: unknown, name: string) => Promise.resolve({
      bundle: { subjects: [...SUBJECTS, { id: 'sub-new', name, colorIndex: 2, unreadCount: 0 }], activeSubjectId: 'sub-geral' },
      createdSubjectId: 'sub-new',
    })),
  }
  return live
}

function Probe({ live, name }: { readonly live: ReturnType<typeof fakeLive>; readonly name: string }) {
  const state = useHostConversationSubjects(live as unknown as PersonaLiveStore, 'channel:c1', [], { defaultName: n => `Assunto ${String(n)}` })
  return (
    <div>
      <span data-testid="active">{state.activeSubjectId}</span>
      <span data-testid="count">{state.subjects.length}</span>
      <button type="button" onClick={() => { state.openSubjectByName(name) }}>abrir</button>
    </div>
  )
}

async function mounted(name: string) {
  const live = fakeLive()
  render(<Probe live={live} name={name} />)
  await waitFor(() => { expect(screen.getByTestId('count').textContent).toBe('2') })
  return live
}

describe('openSubjectByName', () => {
  it('assunto que já existe: abre esse, sem criar outro (sem diferenciar acento nem caixa)', async () => {
    const live = await mounted('  orcamento ')
    fireEvent.click(screen.getByRole('button', { name: 'abrir' }))
    await waitFor(() => { expect(live.selectConversationSubject).toHaveBeenCalledWith(expect.anything(), 'sub-orc') })
    expect(live.createConversationSubject).not.toHaveBeenCalled()
    await waitFor(() => { expect(screen.getByTestId('active').textContent).toBe('sub-orc') })
  })

  it('assunto novo: cria com o nome digitado e abre o criado', async () => {
    const live = await mounted('Compras da semana')
    fireEvent.click(screen.getByRole('button', { name: 'abrir' }))
    await waitFor(() => { expect(live.createConversationSubject).toHaveBeenCalledWith(expect.anything(), 'Compras da semana') })
    await waitFor(() => { expect(live.selectConversationSubject).toHaveBeenCalledWith(expect.anything(), 'sub-new') })
  })

  it('nome vazio ou só espaços: não chama o host (nunca manda name vazio)', async () => {
    const live = await mounted('   ')
    fireEvent.click(screen.getByRole('button', { name: 'abrir' }))
    await act(async () => { await Promise.resolve() })
    expect(live.createConversationSubject).not.toHaveBeenCalled()
    expect(live.selectConversationSubject).not.toHaveBeenCalled()
  })

  it('sem escopo (conversa ainda não carregada): não faz nada', async () => {
    const live = fakeLive()
    live.conversationScopeFromKey.mockReturnValue(null as never)
    render(<Probe live={live} name="Qualquer" />)
    fireEvent.click(screen.getByRole('button', { name: 'abrir' }))
    await act(async () => { await Promise.resolve() })
    expect(live.createConversationSubject).not.toHaveBeenCalled()
  })
})
