import type { ReactNode } from 'react'
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { DirectMessagesView, type DmRowUi } from '../chat/DirectMessagesView.tsx'
import type { ChipTone } from '../primitives/index.ts'
import { WORK_STATUS_KEY, type PersonaWorkUiState } from '../team/persona-work-state.ts'
import type { PersonaLiveSnapshot, PersonaLiveStore } from './persona-live-store.ts'

const STATE_TONE: Readonly<Record<PersonaWorkUiState, ChipTone>> = { working: 'success', waiting: 'accent', stuck: 'danger', resting: 'neutral' }

export interface ConnectedDmInjected {
  hooks: { live: HostObservable<PersonaLiveSnapshot> }
  selectDm(dmId: string | null): void
  postDmMessage(body: string): void
  startNewConversation(): void
}

export type ConnectedDirectMessagesViewProps =
  & PropsLocale<'persona.chat'>
  & InjectFace<ConnectedDmInjected>
  & { readonly shellT: PropsLocale<'persona.shell'>['t'] }

export function ConnectedDirectMessagesView({
  t: chatT,
  shellT,
  useLive,
  selectDm,
  postDmMessage,
  startNewConversation,
}: ConnectedDirectMessagesViewProps): ReactNode {
  const live = useLive(state => state)
  // Presentation lives in chat/DirectMessagesView (Muse); this file only maps live data (Prism).
  const rows: DmRowUi[] = live.dms.map((row) => {
    const member = live.stripMembers.find(m => m.name === row.peerName)
    return member === undefined
      ? { id: row.id, peerId: row.peerId, peerName: row.peerName }
      : {
        id: row.id,
        peerId: row.peerId,
        peerName: row.peerName,
        characterId: member.id,
        role: member.role,
        stateLabel: shellT(WORK_STATUS_KEY[member.state]),
        stateTone: STATE_TONE[member.state],
      }
  })
  return (
    <DirectMessagesView
      t={chatT}
      shellT={shellT}
      loading={!live.ready}
      dms={rows}
      selectedId={live.selectedDmId}
      messages={live.dmMessages}
      onSelect={(dmId) => { selectDm(dmId) }}
      onSend={(body) => { postDmMessage(body) }}
      onNewConversation={() => { startNewConversation() }}
    />
  )
}

export type { PersonaLiveStore }
