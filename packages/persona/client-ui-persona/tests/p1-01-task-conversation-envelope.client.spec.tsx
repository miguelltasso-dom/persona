// @vitest-environment jsdom
// Carbon P1-01 (colheita-s1-fix): a conversa da tarefa no Quadro falhava 100% dos cliques. O host (Typert) responde `{ ok: true, value }` e `{ ok: false, error }` SEM rejeitar,
// e o `taskConversationBridgeOf` repassava o cliente CRU: `openTaskConversation` voltava um envelope sem `streamKind` ("Não deu para abrir a conversa agora."), o envio
// recusado parecia enviado, o clipe de anexo nunca era ligado e o campo não oferecia `@persona`. Os specs antigos usavam um remoto já "limpo" e por isso não pegaram.
// Aqui o caminho é o de PRODUÇÃO: o cliente devolve envelopes, e o bridge os desembrulha.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectedTaskConversation, taskConversationBridgeOf } from '../src/client/remote/ConnectedTaskConversation.tsx'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'
import type { MessageStreamFrame } from '../src/client/remote/apply-message-stream.ts'
import type { MessageView, TeamView } from '../src/client/remote/persona-remote-types.ts'
import type { KanbanCardModel } from '../src/client/kanban/types.ts'
import type { ChannelPersonaMember } from '../src/client/team/persona-work-state.ts'
import { pt as kanbanPt } from '../src/client/locale/kanban/locales.ts'
import { NAV_PLACES_FLAG_KEY } from '../src/client/shell/nav-flag.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { hostMessage } from './message-view-fixture.client.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}
beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); localStorage.clear() })

const TEAM = { personas: [{ id: 'bia', name: 'Bia', avatarRef: 'bia', title: 'Atendimento' }], members: [{ id: 'ana', workspaceId: 'ws', displayName: 'Ana', handle: 'ana', role: 'owner' }] } as unknown as TeamView
const MEMBERS: readonly ChannelPersonaMember[] = [{ id: 'bia', name: 'Bia', role: 'Atendimento', state: 'resting' }] as never
const CARD: KanbanCardModel = {
  id: 't-1', title: 'Post de sexta', projectId: 'pp', projectName: 'Padaria', teamId: 't', teamName: 'Equipe', column: 'in_progress',
  waitingEvent: false, blocked: false, reviewApproved: false, assignee: { id: 'bia', name: 'Bia', initials: 'B' }, dueLabel: 'sexta',
}
const OPEN = { streamKind: 'channel', ownerId: 'geral', topicId: 'task:t-1', title: 'Post de sexta', caring: [{ personaId: 'bia', name: 'Bia' }] }
const message = (id: string, seq: number, body: string, actorId = 'ana'): MessageView => hostMessage({ id, seq, actorId, body, subjectId: '', occurredAt: '2026-11-12T09:00:00.000Z' } as never)
const ok = (value: unknown) => Promise.resolve({ ok: true as const, value })
const refused = () => Promise.resolve({ ok: false as const, error: { code: 'forbidden', message: 'Sem permissão para escrever aqui.' } })

/** O cliente como o Typert o entrega: cada chamada resolve um envelope; o fluxo (`followMessages`) é o iterável cru. */
function envelopeClient(over: Record<string, unknown> = {}, frames: MessageStreamFrame[] = [{ kind: 'baseline', events: [], order: [] }]) {
  const client = {
    openTaskConversation: vi.fn(() => ok(OPEN)),
    markTaskThreadRead: vi.fn(() => ok(true)),
    followMessages: (_request: unknown, signal: AbortSignal) => (async function* () {
      for (const frame of frames) yield frame
      await new Promise<void>((resolve) => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
    })(),
    postMessage: vi.fn(() => ok({})),
    attachFile: vi.fn(() => ok({ id: 'anexo-1', name: 'foto.png' })),
    ...over,
  }
  return client
}

function mount(client: ReturnType<typeof envelopeClient>) {
  const bridge = taskConversationBridgeOf(client as unknown as PersonaRemoteClient, { workspaceId: 'ws', projectId: 'pp', memberId: 'ana' }, TEAM, MEMBERS)
  expect(bridge).toBeDefined()
  return render(<ConnectedTaskConversation bridge={bridge!} kanbanDict={kanbanPt} card={CARD} columnLabel="Fazendo" onClose={vi.fn()} />)
}

const write = async (text: string) => {
  const field = await screen.findByPlaceholderText('Escreva para Bia sobre esta tarefa')
  fireEvent.change(field, { target: { value: text } })
  fireEvent.keyDown(field, { key: 'Enter' })
}

describe('o cliente devolve envelopes ({ ok, value })', () => {
  it('abre o fio real da tarefa no 1º clique (não "Não deu para abrir a conversa agora.")', async () => {
    mount(envelopeClient({}, [{ kind: 'baseline', events: [message('m1', 1, 'Pode ajustar a legenda?')], order: ['m1'] }]))
    await waitFor(() => { expect(screen.getByText('Pode ajustar a legenda?')).toBeTruthy() })
    expect(screen.queryByText(kanbanPt['thread.error'] as string)).toBeNull()
  })

  it('o host recusou abrir ({ ok: false }): diz que não deu e deixa "Tentar de novo" (a falha é real, não um erro de leitura do envelope)', async () => {
    mount(envelopeClient({ openTaskConversation: vi.fn(refused) }))
    expect(await screen.findByText(kanbanPt['thread.error'] as string)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
  })

  it('escrever: o envio aceito não mostra aviso; o RECUSADO ({ ok: false }) diz que não foi enviado', async () => {
    const client = envelopeClient()
    mount(client)
    await write('Troque a foto')
    await waitFor(() => { expect(client.postMessage).toHaveBeenCalledTimes(1) })
    expect(client.postMessage).toHaveBeenCalledWith(expect.objectContaining({ streamKind: 'channel', ownerId: 'geral', topicId: 'task:t-1', body: 'Troque a foto' }))
    expect(screen.queryByText(/Não foi enviad|não foi enviad/u)).toBeNull()
    cleanup()
    mount(envelopeClient({ postMessage: vi.fn(refused) }))
    await write('Troque a foto')
    expect(await screen.findByText(kanbanPt['thread.sendFailed'] as string)).toBeTruthy()
  })

  it('o clipe de anexo existe e manda o arquivo ao stream DA TAREFA pelo `attachFile` do host', async () => {
    const client = envelopeClient()
    mount(client)
    await screen.findByPlaceholderText('Escreva para Bia sobre esta tarefa')
    const input = document.querySelector('input[type="file"]') as HTMLInputElement | null
    expect(input).not.toBeNull() // sem `uploadAttachment` o campo não tem clipe nenhum
    const file = new File(['conteudo'], 'foto.png', { type: 'image/png' })
    fireEvent.change(input!, { target: { files: [file] } })
    await waitFor(() => { expect(client.attachFile).toHaveBeenCalledTimes(1) })
    expect(client.attachFile).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', name: 'foto.png' }))
  })

  it('digitar "@" oferece as personas (o campo recebe os membros da equipe; o `@` é do modo CV-3, flag navPlaces, ligada no produto)', async () => {
    localStorage.setItem(NAV_PLACES_FLAG_KEY, '1')
    mount(envelopeClient())
    const field = await screen.findByPlaceholderText('Escreva para Bia sobre esta tarefa')
    fireEvent.change(field, { target: { value: '@' } })
    expect(await screen.findByRole('option', { name: /Bia/u })).toBeTruthy()
  })

  it('um host sem as chamadas da conversa: o bridge não existe (os cartões não abrem nada, sem clique morto)', () => {
    expect(taskConversationBridgeOf({} as PersonaRemoteClient, { workspaceId: 'ws', projectId: 'pp', memberId: 'ana' }, TEAM, MEMBERS)).toBeUndefined()
  })
})
