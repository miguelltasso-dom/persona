// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GeneralChannelView } from '../src/client/chat/GeneralChannelView.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { pt as governancePt } from '../src/client/locale/governance/locales.ts'
import { activityGroupLabelsFromDict } from '../src/client/governance/activity-group-labels.ts'
import { localeBindAsDict } from '../src/client/preview/locale-bind.ts'

const ACT_LABELS = activityGroupLabelsFromDict(localeBindAsDict((key, _params) => governancePt[key as keyof typeof governancePt] ?? key))

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

afterEach(() => { cleanup() })

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
          records: [],
        }}
        onLoadTurnContext={onLoad}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: chatPt['context.show'] }))
    expect(onLoad).toHaveBeenCalledWith('t-brief')
    expect(screen.getByRole('region', { name: chatPt['context.drawerTitle'] })).toBeTruthy()
    expect(screen.getByText('vault:1')).toBeTruthy()
  })

  it('opens the task on the board when the board action is wired (PRO-4 / C5b)', () => {
    const onBoard = vi.fn()
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
        onOpenTaskOnBoard={onBoard}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: chatPt['context.openBoard'] }))
    expect(onBoard).toHaveBeenCalledWith('t-brief')
  })

  it('shows ActivityGroup folds inline on the task message row (T3 §9)', () => {
    render(
      <GeneralChannelView
        t={key => chatPt[key as keyof typeof chatPt] ?? key}
        shellT={key => shellPt[key as keyof typeof shellPt] ?? key}
        members={[MEMBER]}
        messages={[{
          id: 'm1',
          authorId: 'bento',
          authorName: 'Bento',
          body: 'Rodando testes.',
          timeLabel: '10:01',
          reactions: [],
          taskTitle: 'Deploy',
          ticketId: 't1',
        }]}
        turnContext={{
          ticketId: 't1',
          title: 'Deploy',
          triggerIds: [],
          records: [],
          activityFolds: [{
            persona: { name: 'Bento' },
            items: [{ id: 'x', kind: 'command', title: 'pnpm test', status: 'done' }],
            moreCount: 0,
          }],
        }}
        turnActivityLabels={ACT_LABELS}
      />,
    )
    expect(screen.getAllByRole('button', { name: /Bento.*rodou 1 comando/u }).length).toBeGreaterThanOrEqual(1)
  })

  it('shows ActivityGroup folds in the turn-context drawer (T3 §9)', () => {
    render(
      <GeneralChannelView
        t={key => chatPt[key as keyof typeof chatPt] ?? key}
        shellT={key => shellPt[key as keyof typeof shellPt] ?? key}
        members={[MEMBER]}
        messages={[]}
        turnContext={{
          ticketId: 't1',
          title: 'Deploy',
          triggerIds: [],
          records: [],
          activityFolds: [{
            persona: { name: 'Bento' },
            items: [{ id: 'x', kind: 'command', title: 'pnpm test', status: 'done' }],
            moreCount: 0,
          }],
        }}
        turnActivityLabels={ACT_LABELS}
      />,
    )
    const drawerTitle = screen.getByRole('heading', { name: chatPt['context.drawerTitle'] })
    const drawer = drawerTitle.closest('section')
    expect(drawer).toBeTruthy()
    expect(within(drawer!).getByText(chatPt['context.activityLabel'])).toBeTruthy()
    expect(within(drawer!).getByRole('button', { name: /Bento.*rodou 1 comando/u })).toBeTruthy()
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
