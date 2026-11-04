// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DirectMessagesView } from '../src/client/chat/DirectMessagesView.tsx'
import type { ConversationSubjectUi } from '../src/client/chat/conversation-subjects.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { shellTranslate } from '../src/client/preview/shell-translate.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import type { ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}
afterEach(() => { cleanup() })

const chatT = ((key: string, params?: Readonly<Record<string, string>>) => bindLocale(chatPt, key, params)) as never

const NINA = {
  id: 'dm-nina',
  peerId: 'nina',
  peerName: 'Nina',
  characterId: 'nina',
  role: 'Pesquisa',
  state: 'working' as const,
  stateLabel: 'Trabalhando',
  stateTone: 'plain' as const,
}

const THREE_SUBJECTS: readonly ConversationSubjectUi[] = [
  { id: 'sub-geral', name: 'Geral', colorIndex: 0, unreadCount: 0 },
  { id: 'sub-orcamento', name: 'Orçamento', colorIndex: 1, unreadCount: 2 },
  { id: 'sub-contrato', name: 'Contrato', colorIndex: 2, unreadCount: 0, working: true },
]

describe('W2-3: 3 assuntos na mesma DM (UI, teclado, a11y, mover)', () => {
  it('renders 3 subjects in the DM header with dots, unread count, and working indicator', () => {
    const onSelect = vi.fn()
    render(
      <DirectMessagesView
        t={chatT}
        shellT={shellTranslate}
        loading={false}
        dms={[NINA]}
        selectedId="dm-nina"
        messages={[]}
        onSelect={() => undefined}
        onSend={() => undefined}
        subjectBar={{
          subjects: THREE_SUBJECTS,
          activeSubjectId: 'sub-geral',
          onSelect,
          panelId: 'persona-dm-subject-panel',
        }}
      />,
    )

    const tablist = screen.getByRole('tablist', { name: chatPt['subjects.barLabel'] })
    expect(tablist).toBeTruthy()

    const tabs = within(tablist).getAllByRole('tab')
    expect(tabs).toHaveLength(3)
    expect(tabs[0]?.textContent).toContain('Geral')
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true')

    expect(tabs[1]?.textContent).toContain('Orçamento')
    expect(tabs[1]?.textContent).toContain('2') // unread count

    expect(tabs[2]?.textContent).toContain('Contrato')
    // Contrato has working: true, verified by working indicator
    expect(tablist.querySelector('[class*="working"]')).toBeTruthy()

    // Tabpanel is correctly associated with subject bar panelId
    const panel = screen.getByRole('tabpanel')
    expect(panel.id).toBe('persona-dm-subject-panel')

    // Click switches subject
    fireEvent.click(tabs[1]!)
    expect(onSelect).toHaveBeenCalledWith('sub-orcamento')
  })

  it('navigates subjects via keyboard ArrowRight and ArrowLeft', () => {
    const onSelect = vi.fn()
    render(
      <DirectMessagesView
        t={chatT}
        shellT={shellTranslate}
        loading={false}
        dms={[NINA]}
        selectedId="dm-nina"
        messages={[]}
        onSelect={() => undefined}
        onSend={() => undefined}
        subjectBar={{
          subjects: THREE_SUBJECTS,
          activeSubjectId: 'sub-geral',
          onSelect,
          panelId: 'persona-dm-subject-panel',
        }}
      />,
    )

    const tabs = screen.getAllByRole('tab')
    tabs[0]?.focus()
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' })
    expect(onSelect).toHaveBeenCalledWith('sub-orcamento')

    fireEvent.keyDown(tabs[1]!, { key: 'ArrowRight' })
    expect(onSelect).toHaveBeenCalledWith('sub-contrato')

    fireEvent.keyDown(tabs[2]!, { key: 'ArrowLeft' })
    expect(onSelect).toHaveBeenCalledWith('sub-orcamento')
  })

  it('allows moving a message between subjects in the DM', () => {
    const onMoveMessageSubject = vi.fn()
    const msg: ChannelMessageUi = {
      id: 'msg-1',
      authorId: 'nina',
      authorName: 'Nina',
      body: 'Encontrei os dados de custos.',
      timeLabel: '14:20',
      conversationSubjectId: 'sub-geral',
      reactions: [],
    }

    render(
      <DirectMessagesView
        t={chatT}
        shellT={shellTranslate}
        loading={false}
        dms={[NINA]}
        selectedId="dm-nina"
        messages={[msg]}
        onSelect={() => undefined}
        onSend={() => undefined}
        subjectBar={{
          subjects: THREE_SUBJECTS,
          activeSubjectId: 'sub-geral',
          onSelect: () => {},
          panelId: 'persona-dm-subject-panel',
        }}
        subjectMoveTargets={[...THREE_SUBJECTS]}
        onMoveMessageSubject={onMoveMessageSubject}
      />,
    )

    const moveBtn = screen.getByRole('button', { name: chatPt['subjects.move'] })
    expect(moveBtn).toBeTruthy()
    fireEvent.click(moveBtn)

    const targetItem = screen.getByRole('menuitem', { name: /Orçamento/u })
    fireEvent.click(targetItem)
    expect(onMoveMessageSubject).toHaveBeenCalledWith('msg-1', 'sub-orcamento')
  })
})
