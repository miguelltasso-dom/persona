// @vitest-environment jsdom
// IV-10 · "Responder": de onde vem o alvo (TaskView.question + questionStreamId, Forge 00:14), o "Responder" como primário dos cartões da
// pergunta em palavras (caixa V2 e tela antiga) e o composer (replyTarget/onSendReply do Flint) ligado à loja do alvo.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { ApprovalsInbox } from '../src/client/approvals/ApprovalsInbox.tsx'
import { ApprovalsInboxV2 } from '../src/client/approvals/ApprovalsInboxV2.tsx'
import type { ApprovalItem } from '../src/client/approvals/mock-data.ts'
import { approvalViewToItem } from '../src/client/data/adapters/approvals.ts'
import { parseQuestionStream, replyTargetFromCard, replyTargetsByTicket } from '../src/client/answer/reply-actions.ts'
import { createReplyTargetStore } from '../src/client/answer/reply-target.ts'
import { useConnectedReply } from '../src/client/answer/use-connected-reply.ts'
import { PERSONA_ASK_FLAG_KEY } from '../src/client/ask/ask-flag.ts'
import { mapTaskToKanbanCard } from '../src/client/remote/map-host-ui.ts'
import type { KanbanCardModel } from '../src/client/kanban/types.ts'
import { pt as approvalsPt } from '../src/client/locale/approvals/locales.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup(); localStorage.clear() })

const chat = (key: string, params?: Readonly<Record<string, string | number>>): string => bindLocale(chatPt, key, params)
const SCOPE = { workspaceId: 'ws', projectId: 'proj' }

const card = (extra: Partial<KanbanCardModel> = {}): KanbanCardModel => ({
  id: 'tk-1', title: 'Tabela de preços', projectId: 'proj', projectName: 'Padaria', teamId: 'default', teamName: 'Equipe', column: 'blocked',
  waitingEvent: false, blocked: true, reviewApproved: false, assignee: { id: 'p-nina', name: 'Nina', initials: 'N' },
  question: 'Qual preço eu uso para o bolo de cenoura?', questionStreamId: 'channel:geral', ...extra,
})

describe('de onde vem o alvo: TaskView.question + questionStreamId', () => {
  it('o fio da pergunta: channel:<id> ou dm:<id>; qualquer outra forma não tem composer', () => {
    expect(parseQuestionStream('channel:geral')).toEqual({ streamKind: 'channel', ownerId: 'geral' })
    expect(parseQuestionStream('dm:dm-nina')).toEqual({ streamKind: 'dm', ownerId: 'dm-nina' })
    expect(parseQuestionStream('dm:a:b')).toEqual({ streamKind: 'dm', ownerId: 'a:b' })
    for (const bad of [undefined, '', 'geral', ':x', 'channel:', 'room:x']) expect(parseQuestionStream(bad)).toBeUndefined()
  })

  it('só a Tarefa com pergunta E fio E quem perguntou vira alvo; o resto não tem botão', () => {
    expect(replyTargetFromCard(card())).toEqual({ ticketId: 'tk-1', personaId: 'p-nina', personaName: 'Nina', question: 'Qual preço eu uso para o bolo de cenoura?', streamKind: 'channel', ownerId: 'geral' })
    expect(replyTargetFromCard(card({ question: '  ' }))).toBeUndefined()
    expect(replyTargetFromCard(card({ questionStreamId: undefined }))).toBeUndefined()
    const { assignee: _assignee, ...noAsker } = card()
    expect(replyTargetFromCard(noAsker)).toBeUndefined()
    expect([...replyTargetsByTicket([card(), card({ id: 'tk-2', question: undefined })]).keys()]).toEqual(['tk-1'])
  })

  it('o mapa da Tarefa leva os dois campos do host para o cartão (somem quando a pergunta é respondida)', () => {
    const asked = { id: 'tk-9', projectId: 'p', title: 'T', stage: 'blocked', stageAction: '', question: ' Qual preço? ', questionStreamId: 'dm:dm-1' } as never
    expect(mapTaskToKanbanCard(asked)).toMatchObject({ question: 'Qual preço?', questionStreamId: 'dm:dm-1' })
    const answered = { id: 'tk-9', projectId: 'p', title: 'T', stage: 'doing', stageAction: '' } as never
    expect(mapTaskToKanbanCard(answered)).not.toHaveProperty('question')
    expect(mapTaskToKanbanCard(answered)).not.toHaveProperty('questionStreamId')
  })
})

describe('os cartões: "Responder" é o primário da pergunta em palavras', () => {
  const ask = (): ApprovalItem => approvalViewToItem({
    id: 'tk-1', kind: 'attention', title: 'Qual preço eu uso?', question: 'Qual preço eu uso para o bolo de cenoura?', status: 'pending', personaId: 'p-nina', personaName: 'Nina',
  } as never)
  const withTarget = (): ApprovalItem => ({ ...ask(), replyTarget: replyTargetFromCard(card())! })

  it('V2: com o alvo e o handler o primário é "Responder"; clicar entrega o alvo; sem handler ou sem alvo não há botão', () => {
    const onReply = vi.fn()
    render(<PreviewFrame brandLabel="Persona"><ApprovalsInboxV2 dict={approvalsPt} items={[withTarget()]} onDecideItem={vi.fn()} onReply={onReply} /></PreviewFrame>)
    fireEvent.click(screen.getByRole('button', { name: 'Responder' }))
    expect(onReply).toHaveBeenCalledWith(expect.objectContaining({ ticketId: 'tk-1', streamKind: 'channel', ownerId: 'geral' }))
    cleanup()
    render(<PreviewFrame brandLabel="Persona"><ApprovalsInboxV2 dict={approvalsPt} items={[withTarget()]} onDecideItem={vi.fn()} /></PreviewFrame>)
    expect(screen.queryByRole('button', { name: 'Responder' })).toBeNull()
    cleanup()
    render(<PreviewFrame brandLabel="Persona"><ApprovalsInboxV2 dict={approvalsPt} items={[ask()]} onDecideItem={vi.fn()} onReply={onReply} /></PreviewFrame>)
    expect(screen.queryByRole('button', { name: 'Responder' })).toBeNull()
  })

  it('a tela antiga (a padrão) tem o mesmo primário', () => {
    const onReply = vi.fn()
    render(<PreviewFrame brandLabel="Persona"><ApprovalsInbox dict={approvalsPt} items={[withTarget()]} onDecideItem={vi.fn()} onReply={onReply} /></PreviewFrame>)
    fireEvent.click(screen.getByRole('button', { name: 'Responder' }))
    expect(onReply).toHaveBeenCalledTimes(1)
    cleanup()
    render(<PreviewFrame brandLabel="Persona"><ApprovalsInbox dict={approvalsPt} items={[ask()]} onDecideItem={vi.fn()} onReply={onReply} /></PreviewFrame>)
    expect(screen.queryByRole('button', { name: 'Responder' })).toBeNull()
  })
})

describe('o composer: o alvo vira o chip e o Enviar chama answerAttention (useConnectedReply)', () => {
  const TARGET = { ticketId: 'tk-1', personaId: 'p-nina', personaName: 'Nina', question: 'Qual preço eu uso para o bolo de cenoura na tabela de sexta?', streamKind: 'channel' as const, ownerId: 'geral' }

  function Probe({ store, ownerId, streamKind, remote }: { readonly store: ReturnType<typeof createReplyTargetStore>; readonly ownerId: string | null; readonly streamKind: 'channel' | 'dm'; readonly remote: object | undefined }): ReactNode {
    const reply = useConnectedReply({ remote, tenant: SCOPE, streamKind, ownerId, store, chipLabel: (name, question) => chat('reply.chip', { name, question }) })
    return (
      <div>
        <span data-testid="label">{reply?.replyTarget.label ?? 'sem alvo'}</span>
        <button type="button" onClick={() => { reply?.replyTarget.onClear() }}>limpar</button>
        <button type="button" onClick={() => { void reply?.onSendReply('R$ 14', ['att-1']).catch(() => undefined) }}>enviar</button>
      </div>
    )
  }

  it('desligado por padrão; ligado, só na conversa do alvo e só com answerAttention no host', () => {
    const store = createReplyTargetStore()
    store.set(TARGET)
    const answerAttention = vi.fn().mockResolvedValue(true)
    const off = render(<Probe store={store} ownerId="geral" streamKind="channel" remote={{ answerAttention }} />)
    expect(screen.getByTestId('label').textContent).toBe('sem alvo')
    off.unmount()
    localStorage.setItem(PERSONA_ASK_FLAG_KEY, '1')
    const on = render(<Probe store={store} ownerId="geral" streamKind="channel" remote={{ answerAttention }} />)
    expect(screen.getByTestId('label').textContent).toBe('Respondendo a Nina: Qual preço eu uso para o bolo de cenoura na tabela de sexta?')
    on.unmount()
    const elsewhere: readonly (readonly [string | null, 'channel' | 'dm', object])[] = [['outro', 'channel', { answerAttention }], ['geral', 'dm', { answerAttention }], ['geral', 'channel', {}], [null, 'channel', { answerAttention }]]
    for (const [ownerId, kind, remote] of elsewhere) {
      const other = render(<Probe store={store} ownerId={ownerId} streamKind={kind} remote={remote} />)
      expect(screen.getByTestId('label').textContent).toBe('sem alvo')
      other.unmount()
    }
  })

  it('o ✕ limpa o alvo; o Enviar chama answerAttention com o texto e os arquivos', async () => {
    localStorage.setItem(PERSONA_ASK_FLAG_KEY, '1')
    const store = createReplyTargetStore()
    store.set(TARGET)
    const answerAttention = vi.fn().mockResolvedValue(true)
    render(<Probe store={store} ownerId="geral" streamKind="channel" remote={{ answerAttention }} />)
    fireEvent.click(screen.getByRole('button', { name: 'enviar' }))
    await waitFor(() => { expect(answerAttention).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'proj', ticketId: 'tk-1', text: 'R$ 14', attachmentIds: ['att-1'] }) })
    fireEvent.click(screen.getByRole('button', { name: 'limpar' }))
    expect(store.get()).toBeUndefined()
    await waitFor(() => { expect(screen.getByTestId('label').textContent).toBe('sem alvo') })
  })
})
