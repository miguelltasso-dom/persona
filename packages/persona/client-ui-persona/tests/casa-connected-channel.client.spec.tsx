// @vitest-environment jsdom
// Casa da Equipe, peça 0 (COLHEITA-MUSE §29, atrás de `persona.flag.channelSections`): o canal ESCOLHIDO na barra chega ao canal conectado —
// o cabeçalho é o dele ("#vendas", "Respondem aqui: …") e os ganchos do canal (assuntos, fila, controles) leem o id dele, não o do #geral.
// Com a flag desligada o canal é o de sempre.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { ConnectedGeneralChannelView } from '../src/client/remote/ConnectedGeneralChannelView.tsx'
import type { PersonaLiveSnapshot, PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'
import { CHANNEL_SECTIONS_FLAG_KEY } from '../src/client/shell/channel-sections-flag.ts'
import { NAV_PLACES_FLAG_KEY } from '../src/client/shell/nav-flag.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { personaLiveStoreWave2Stub } from './persona-live-store-stub.client.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

const HEADER = {
  channelId: 'canal-vendas',
  name: 'vendas',
  teamId: 'team-vendas',
  teamName: 'Vendas',
  members: [{ kind: 'persona', id: 'nina', name: 'Nina' }, { kind: 'persona', id: 'atlas', name: 'Atlas' }],
  respondem: 'Respondem aqui: Nina e Atlas',
  empty: { kind: 'ready', title: '#vendas está pronto.', body: 'Aqui estão Nina e Atlas.' },
}

const LIVE: PersonaLiveSnapshot = {
  ready: true,
  tenant: null,
  team: null,
  nowRows: [],
  stripMembers: [{ id: 'nina', name: 'Nina', role: 'Vendas', state: 'resting' }],
  awayEvents: [],
  attentionTitles: [],
  messages: [{ id: 'm1', authorId: 'nina', authorName: 'Nina', body: 'Bom dia!', timeLabel: '08:00', reactions: [] }],
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
  gestorPlanAdjustingIds: {},
  channelComposerHints: { responderAutonomy: 'propose', quotaBlocked: false },
  arrivingHostPersonaIds: [],
  channelSubjects: [],
  selectedChannelId: 'canal-vendas',
  channelHeader: HEADER as never,
}

function mount(): void {
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
    feedbackGestorPlan: async () => {},
    dispose: () => {},
  }
  render(
    <ConnectedGeneralChannelView
      t={key => chatPt[key as keyof typeof chatPt] ?? key}
      shellT={key => shellPt[key as keyof typeof shellPt] ?? key}
      liveStore={liveStore}
      useLive={selector => selector(observable.getSnapshot())}
      postChannelMessage={() => {}}
      uploadChannelAttachment={async () => ({ id: 'att-1', name: 'file.txt' })}
      loadTurnContext={() => {}}
      toggleMessageReaction={() => {}}
    />,
  )
}

afterEach(() => {
  cleanup()
  localStorage.removeItem(CHANNEL_SECTIONS_FLAG_KEY)
  localStorage.removeItem(NAV_PLACES_FLAG_KEY)
})

describe('o canal escolhido chega ao canal conectado', () => {
  it('com a flag ligada o cabeçalho é o do canal escolhido', () => {
    localStorage.setItem(CHANNEL_SECTIONS_FLAG_KEY, '1')
    localStorage.setItem(NAV_PLACES_FLAG_KEY, '1')
    mount()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('#vendas')
    expect(screen.getByText('Respondem aqui: Nina e Atlas')).toBeTruthy()
  })

  it('com a flag desligada o canal é o #geral de sempre, mesmo com um canal escolhido na store', () => {
    localStorage.setItem(NAV_PLACES_FLAG_KEY, '1')
    mount()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(chatPt['header.channelGeneral'])
    expect(screen.queryByText('Respondem aqui: Nina e Atlas')).toBeNull()
  })
})
