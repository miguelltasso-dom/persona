// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { ConnectedGeneralChannelView } from '../src/client/remote/ConnectedGeneralChannelView.tsx'
import type { PersonaLiveSnapshot, PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'
import { personaLiveStoreWave2Stub } from './persona-live-store-stub.client.ts'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

const LIVE: PersonaLiveSnapshot = {
  ready: true,
  tenant: null,
  team: null,
  nowRows: [],
  stripMembers: [{
    id: 'bento',
    name: 'Bento',
    role: 'Eng',
    state: 'working',
  }],
  awayEvents: [],
  attentionTitles: [],
  messages: [{
    id: 'm1',
    authorId: 'bento',
    authorName: 'Bento',
    body: 'Pronto.',
    timeLabel: '10:00',
    reactions: [],
    taskTitle: 'Briefing',
    ticketId: 't-brief',
  }],
  passThroughFollowers: [],
  dms: [],
  selectedDmId: null,
  dmMessages: [],
  projects: [],
  kanbanCards: [],
  dmUnreadByPersonaId: {},
  suggestedTask: null,
  turnContext: null,
  error: null,
  gestorPlansById: {},
  arrivingHostPersonaIds: [],
}

describe('ConnectedGeneralChannelView (C5b)', () => {
  it('forwards loadTurnContext to host inject', () => {
    const observable = createSnapshotStore(LIVE)
    const liveStore: PersonaLiveStore = {
      observable,
      ...personaLiveStoreWave2Stub,
      bootstrap: async () => {},
      runDevHarnessSeedIfEnabled: async () => {},
      refresh: async () => {},
      postChannelMessage: async () => {},
      uploadChannelAttachment: async () => ({ id: 'att-1', name: 'file.txt' }),
      uploadDmAttachment: async () => ({ id: 'att-2', name: 'file.txt' }),
      selectDm: async () => {},
      openPersonaDm: async () => {},
      openFirstAvailableDm: async () => {},
      loadTurnContext: async () => {},
      postDmMessage: async () => {},
      toggleMessageReaction: async () => {},
      commitOnboardingRoster: async () => {},
      completeOnboarding: async () => {},
      setPersonaAutonomyLevel: async () => {},
      approveGestorPlan: async () => {},
      rejectGestorPlan: async () => {},
    }
    const loadTurnContext = vi.fn()
    render(
      <ConnectedGeneralChannelView
        t={key => chatPt[key as keyof typeof chatPt] ?? key}
        shellT={key => shellPt[key as keyof typeof shellPt] ?? key}
        liveStore={liveStore}
        useLive={selector => selector(observable.getSnapshot())}
        postChannelMessage={() => {}}
        uploadChannelAttachment={async () => ({ id: 'att-1', name: 'file.txt' })}
        loadTurnContext={loadTurnContext}
        toggleMessageReaction={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Briefing/u }))
    expect(loadTurnContext).toHaveBeenCalledWith('t-brief')
  })
})
