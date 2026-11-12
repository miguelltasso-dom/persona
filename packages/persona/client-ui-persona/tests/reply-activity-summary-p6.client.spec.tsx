// @vitest-environment jsdom
// COLHEITA §6 (item 6, Quill): a resposta de uma persona mostra, acima do texto, o resumo recolhido do turno ("N passos"), com a
// atividade que o host guardou para a mensagem da pessoa respondida (listTurnActivity pelo subjectId). Turno sem ferramenta: nada.
// Vermelho primeiro: hoje a resposta de conversa não recebe atividade nenhuma (só o turno de tarefa tem resumo).
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BUBBLES_FLAG_KEY } from '../src/client/chat/bubbles-flag.ts'
import { MessageList } from '../src/client/chat/GeneralChannelView.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import type { ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'
import type { ReplyActivityUi } from '../src/client/remote/map-reply-activity.ts'
import type { TeamView } from '../src/client/remote/persona-remote-types.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}
beforeEach(() => { localStorage.setItem(BUBBLES_FLAG_KEY, '1') })
afterEach(() => {
  cleanup()
  localStorage.clear()
})

const t = (key: string, params?: Readonly<Record<string, string | number>>) => {
  const raw = chatPt[key as keyof typeof chatPt] ?? key
  return params === undefined ? raw : raw.replace(/\{(\w+)\}/gu, (_m, name: string) => String(params[name] ?? ''))
}

const TEAM = {
  members: [],
  personas: [{ id: 'p-nina', name: 'Nina', title: 'Pesquisa' }],
} as unknown as TeamView

const msg = (id: string, authorId: string, timeLabel: string, body: string, over: Partial<ChannelMessageUi> = {}): ChannelMessageUi => ({
  id,
  authorId,
  authorName: authorId === 'user' ? 'Você' : authorId.charAt(0).toUpperCase() + authorId.slice(1),
  body,
  timeLabel,
  reactions: [],
  ...(authorId === 'user' ? {} : { authorPersonaId: `p-${authorId}` }),
  ...over,
})

// Duas ferramentas no turno que respondeu a mensagem "m1" da pessoa (o host grava uma linha por ferramenta, com threadId = m1).
const ACTIVITY: ReplyActivityUi = {
  items: [
    { id: 'talk:m1:0', kind: 'read', title: 'Read', status: 'done', at: '2026-11-12T11:00:00.000Z' },
    { id: 'talk:m1:1', kind: 'command', title: 'Bash', status: 'done', at: '2026-11-12T11:00:04.000Z' },
  ],
  moreCount: 0,
}

const CONVERSATION = [
  msg('m1', 'user', '11:00', 'Pesquise os preços dos concorrentes.'),
  msg('m2', 'nina', '11:00', 'Achei três concorrentes.', { replyToId: 'm1' }),
]

describe('item 6 · resumo do turno acima da resposta da persona', () => {
  it('a resposta com atividade guardada mostra o resumo "2 passos" acima do texto', () => {
    const { container } = render(
      <MessageList t={t as never} team={TEAM} messages={CONVERSATION} replyActivity={{ m1: ACTIVITY }} />,
    )
    expect(container.querySelector('[aria-expanded]')).not.toBeNull()
    expect(screen.getByRole('button', { name: /2 passos/u })).toBeTruthy()
  })

  it('a linha do resumo fica antes do texto da resposta', () => {
    const { container } = render(
      <MessageList t={t as never} team={TEAM} messages={CONVERSATION} replyActivity={{ m1: ACTIVITY }} />,
    )
    const summary = screen.getByRole('button', { name: /2 passos/u })
    const bubble = container.querySelector('[data-persona-bubble][data-author="persona"]') as HTMLElement
    expect(summary.compareDocumentPosition(bubble) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('pede a atividade da mensagem respondida (pelo id da pessoa), uma vez por resposta', () => {
    const onNeedReplyActivity = vi.fn()
    render(<MessageList t={t as never} team={TEAM} messages={CONVERSATION} onNeedReplyActivity={onNeedReplyActivity} />)
    expect(onNeedReplyActivity).toHaveBeenCalledWith('m1')
    expect(onNeedReplyActivity.mock.calls.filter(call => call[0] === 'm1').length).toBeGreaterThan(0)
  })

  it('turno sem ferramenta (nada guardado): sem resumo', () => {
    const { container } = render(<MessageList t={t as never} team={TEAM} messages={CONVERSATION} replyActivity={{}} />)
    expect(container.querySelector('[aria-expanded]')).toBeNull()
  })

  it('a pessoa não recebe resumo (só a persona responde com ferramentas)', () => {
    const { container } = render(
      <MessageList t={t as never} team={TEAM} messages={CONVERSATION} replyActivity={{ m1: ACTIVITY }} />,
    )
    const userBubble = container.querySelector('[data-author="user"]') as HTMLElement
    expect(userBubble.querySelector('[aria-expanded]')).toBeNull()
  })
})
