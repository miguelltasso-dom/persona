// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DirectMessagesView } from '../src/client/chat/DirectMessagesView.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

describe('DirectMessagesView turn context (C5b)', () => {
  it('loads turn context when a cited task chip is activated in the thread', () => {
    const onLoad = vi.fn()
    render(
      <DirectMessagesView
        t={key => chatPt[key as keyof typeof chatPt] ?? key}
        shellT={key => shellPt[key as keyof typeof shellPt] ?? key}
        loading={false}
        dms={[{ id: 'dm-1', peerId: 'p1', peerName: 'Bento' }]}
        selectedId="dm-1"
        messages={[{
          id: 'm1',
          authorId: 'bento',
          authorName: 'Bento',
          body: 'Segue o plano.',
          timeLabel: '11:00',
          reactions: [],
          taskTitle: 'Contrato v2',
          ticketId: 't-42',
        }]}
        onSelect={() => {}}
        onSend={() => {}}
        turnContext={{
          ticketId: 't-42',
          title: 'Contrato v2',
          triggerIds: ['vault:2'],
          records: [],
        }}
        onLoadTurnContext={onLoad}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: chatPt['context.show'] }))
    expect(onLoad).toHaveBeenCalledWith('t-42')
    expect(screen.getByRole('region', { name: chatPt['context.drawerTitle'] })).toBeTruthy()
  })

  it('lists pass-through followers in the thread (C5b)', () => {
    render(
      <DirectMessagesView
        t={(key, params) => {
          const raw = chatPt[key as keyof typeof chatPt] ?? key
          if (params?.name !== undefined && typeof raw === 'string') {
            return raw.replace('{name}', String(params.name))
          }
          return raw
        }}
        shellT={key => shellPt[key as keyof typeof shellPt] ?? key}
        loading={false}
        dms={[{ id: 'dm-1', peerId: 'p1', peerName: 'Bento' }]}
        selectedId="dm-1"
        messages={[]}
        onSelect={() => {}}
        onSend={() => {}}
        passThroughFollowers={[{ name: 'Nina' }]}
      />,
    )
    expect(screen.getByText('Nina está acompanhando este assunto')).toBeTruthy()
  })
})
