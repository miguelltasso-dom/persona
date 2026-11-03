// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GeneralChannelView } from '../src/client/chat/GeneralChannelView.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

const MEMBER = {
  id: 'bento' as const,
  name: 'Bento',
  role: 'Engenharia',
  state: 'waiting' as const,
}

describe('GeneralChannelView turn context (C5b data)', () => {
  it('loads turn context when the task card is activated', () => {
    const onLoad = vi.fn()
    render(
      <GeneralChannelView
        t={key => chatPt[key as keyof typeof chatPt] ?? key}
        shellT={key => shellPt[key as keyof typeof shellPt] ?? key}
        members={[MEMBER]}
        messages={[{
          id: 'm1',
          authorId: 'bento',
          authorName: 'Bento',
          body: 'Entrega pronta.',
          timeLabel: '10:00',
          reactions: [],
          taskTitle: 'Briefing',
          ticketId: 't-brief',
        }]}
        turnContext={{
          ticketId: 't-brief',
          title: 'Briefing',
          triggerIds: ['vault:1'],
        }}
        onLoadTurnContext={onLoad}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Briefing/u }))
    expect(onLoad).toHaveBeenCalledWith('t-brief')
    expect(screen.getByRole('region', { name: chatPt['context.drawerTitle'] })).toBeTruthy()
    expect(screen.getByText('vault:1')).toBeTruthy()
  })

  it('lists pass-through followers below the stream (C5b)', () => {
    render(
      <GeneralChannelView
        t={(key, params) => {
          const raw = chatPt[key as keyof typeof chatPt] ?? key
          if (params?.name !== undefined && typeof raw === 'string') {
            return raw.replace('{name}', String(params.name))
          }
          return raw
        }}
        shellT={key => shellPt[key as keyof typeof shellPt] ?? key}
        members={[MEMBER]}
        messages={[]}
        passThroughFollowers={[{ name: 'Nina' }]}
      />,
    )
    expect(screen.getByText('Nina está acompanhando este assunto')).toBeTruthy()
  })
})
