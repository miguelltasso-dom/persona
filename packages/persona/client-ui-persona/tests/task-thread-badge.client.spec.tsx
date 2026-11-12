// @vitest-environment jsdom
// COLHEITA 18 (Muse §18): o cartão do Quadro e a conversa da tarefa — o selo de não lidas (22 px, só leitura) e o jeito de o cartão abrir o painel
// (clique no cartão ou Enter/Espaço nele; os botões e o menu de dentro seguem com o significado deles).
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { projectBoardToFlow } from '../src/client/data/adapters/board.ts'
import { KanbanCard } from '../src/client/kanban/KanbanCard.tsx'
import type { KanbanCardModel } from '../src/client/kanban/types.ts'
import { pt as kanbanPt } from '../src/client/locale/kanban/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'

installPreviewTheme()
afterEach(() => { cleanup() })

const CARD: KanbanCardModel = {
  id: 'c1', title: 'Post de sexta', projectId: 'p1', projectName: 'Padaria', teamId: 't', teamName: 'Equipe', column: 'in_progress',
  waitingEvent: false, blocked: false, reviewApproved: false,
}
const COLUMN_LABELS = { todo: 'A fazer', in_progress: 'Fazendo', in_review: 'Em revisão', blocked: 'Bloqueado', done: 'Concluído' } as const
const thread = (unread: number) => ({ topicId: 'task:c1', count: 9, unread, lastSeq: 40 })

function mount(card: KanbanCardModel, onOpenConversation?: (cardId: string) => void, onMoveCard?: () => void) {
  return render(
    <PreviewFrame brandLabel="Persona">
      <KanbanCard
        dict={kanbanPt}
        card={card}
        draggingId={null}
        showProject={false}
        columnLabels={COLUMN_LABELS}
        onDragStart={() => {}}
        onDragEnd={() => {}}
        {...(onOpenConversation === undefined ? {} : { onOpenConversation })}
        {...(onMoveCard === undefined ? {} : { onMoveCard })}
      />
    </PreviewFrame>,
  )
}
const card = (): HTMLElement => document.querySelector('[data-persona-kanban-card]') as HTMLElement

describe('o selo de não lidas', () => {
  it('só aparece com mensagens não lidas; um cartão sem conversa ou sem novidade fica quieto', () => {
    mount(CARD)
    expect(document.querySelector('[data-task-thread-unread]')).toBeNull()
    cleanup()
    mount({ ...CARD, thread: thread(0) })
    expect(document.querySelector('[data-task-thread-unread]')).toBeNull()
  })

  it('mostra o número e diz em palavras (singular e plural), sem depender da cor', () => {
    mount({ ...CARD, thread: thread(1) })
    expect(screen.getByRole('img', { name: '1 mensagem não lida na conversa da tarefa' }).textContent).toBe('1')
    cleanup()
    mount({ ...CARD, thread: thread(3) })
    expect(screen.getByRole('img', { name: '3 mensagens não lidas na conversa da tarefa' }).textContent).toBe('3')
    cleanup()
    mount({ ...CARD, thread: thread(150) })
    expect(screen.getByRole('img', { name: '150 mensagens não lidas na conversa da tarefa' }).textContent).toBe('99+')
  })

  it('é só leitura: não é botão nem tem tabindex', () => {
    mount({ ...CARD, thread: thread(2) })
    const seal = document.querySelector('[data-task-thread-unread]') as HTMLElement
    expect(seal.tagName).toBe('SPAN')
    expect(seal.getAttribute('tabindex')).toBeNull()
    expect(seal.closest('button')).toBeNull()
  })
})

describe('abrir a conversa pelo cartão', () => {
  it('um clique no cartão abre, uma vez, com o id do cartão', () => {
    const onOpen = vi.fn()
    mount({ ...CARD, thread: thread(2) }, onOpen)
    fireEvent.click(screen.getByRole('heading', { name: 'Post de sexta' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith('c1')
  })

  it('Enter e Espaço no cartão abrem; uma tecla num botão de dentro não', () => {
    const onOpen = vi.fn()
    mount(CARD, onOpen, () => {})
    fireEvent.keyDown(card(), { key: 'Enter' })
    fireEvent.keyDown(card(), { key: ' ' })
    expect(onOpen).toHaveBeenCalledTimes(2)
    const inner = card().querySelector('button') as HTMLElement
    fireEvent.keyDown(inner, { key: 'Enter' })
    expect(onOpen).toHaveBeenCalledTimes(2)
    fireEvent.keyDown(card(), { key: 'a' })
    expect(onOpen).toHaveBeenCalledTimes(2)
  })

  it('o clique no menu do cartão e nos botões de dentro NÃO abre a conversa', () => {
    const onOpen = vi.fn()
    mount(CARD, onOpen, () => {})
    for (const button of Array.from(card().querySelectorAll('button'))) fireEvent.click(button)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('sem onOpenConversation o cartão é o de sempre (nenhum clique faz nada)', () => {
    mount(CARD)
    fireEvent.click(screen.getByRole('heading', { name: 'Post de sexta' }))
    fireEvent.keyDown(card(), { key: 'Enter' })
    expect(card()).toBeTruthy() // nada quebra e nada é chamado
  })
})

describe('o adaptador do Quadro (fio do Forge: threadTopicId/threadCount/threadUnread/threadLastSeq)', () => {
  const board = (extra: Record<string, unknown>) => ({
    projectId: 'pp', projectName: 'Padaria', template: 'simples',
    workflow: { columns: [{ id: 'doing', name: 'Fazendo', category: 'doing' }] },
    cards: [{ ticketId: 't1', title: 'Post de sexta', columnId: 'doing', category: 'doing', blocked: false, ...extra }],
  }) as never

  it('o cartão leva o fio quando o host manda; sem os campos, nada', () => {
    const withThread = projectBoardToFlow(board({ threadTopicId: 'task:t1', threadCount: 5, threadUnread: 2, threadLastSeq: 33 }))
    expect(withThread.cards[0]?.thread).toEqual({ topicId: 'task:t1', count: 5, unread: 2, lastSeq: 33 })
    const without = projectBoardToFlow(board({}))
    expect(without.cards[0]?.thread).toBeUndefined()
  })
})
