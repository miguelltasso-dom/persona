import type { ReactNode } from 'react'
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { DirectMessagesView, type DmRowUi } from '../chat/DirectMessagesView.tsx'
import { subjectDisplayName } from '../chat/SubjectBar.tsx'
import { useHostConversationSubjects } from '../chat/use-host-conversation-subjects.ts'
import type { ChipTone } from '../primitives/index.ts'
import { WORK_STATUS_KEY, type PersonaWorkUiState } from '../team/persona-work-state.ts'
import type { PersonaLiveSnapshot, PersonaLiveStore } from './persona-live-store.ts'

const STATE_TONE: Readonly<Record<PersonaWorkUiState, ChipTone>> = { working: 'success', waiting: 'accent', stuck: 'danger', resting: 'neutral' }

export interface ConnectedDmInjected {
  readonly liveStore: PersonaLiveStore
  hooks: { live: HostObservable<PersonaLiveSnapshot> }
  selectDm(dmId: string | null): void
  postDmMessage(body: string, attachmentIds?: readonly string[]): void
  uploadDmAttachment(file: File): Promise<{ readonly id: string; readonly name: string }>
  loadTurnContext(ticketId: string): void
  toggleMessageReaction(streamKind: 'channel' | 'dm', eventId: string, stickerId: string): void
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
  liveStore,
  selectDm,
  postDmMessage,
  uploadDmAttachment,
  loadTurnContext,
  toggleMessageReaction,
  startNewConversation,
}: ConnectedDirectMessagesViewProps): ReactNode {
  const live = useLive(state => state)
  const dmId = live.selectedDmId
  const scope = dmId === null ? null : liveStore.conversationScope('dm', dmId)
  const subjectState = useHostConversationSubjects(liveStore, scope, live.dmMessages)
  const peerName = live.dms.find(row => row.id === dmId)?.peerName ?? ''
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
        state: member.state,
      }
  })
  return (
    <DirectMessagesView
      t={chatT}
      shellT={shellT}
      loading={!live.ready}
      dms={rows}
      selectedId={live.selectedDmId}
      messages={subjectState.filteredMessages}
      subjectBar={dmId === null ? undefined : {
        subjects: subjectState.subjects,
        activeSubjectId: subjectState.activeSubjectId,
        onSelect: subjectState.selectSubject,
        onCreate: subjectState.createSubject,
        onRename: subjectState.renameSubject,
        onArchive: subjectState.archiveSubject,
        archived: subjectState.archived,
        onReopen: subjectState.reopenSubject,
        editingSubjectId: subjectState.editingSubjectId,
      }}
      composerSubjectPlaceholder={dmId === null ? undefined : chatT('composer.placeholderInSubjectFor', {
        subject: subjectDisplayName(chatT, subjectState.activeSubject),
        name: peerName,
      })}
      composerSubjectColorIndex={dmId === null ? undefined : subjectState.activeSubject.colorIndex}
      subjectMoveTargets={dmId === null ? undefined : [...subjectState.subjects]}
      onMoveMessageSubject={dmId === null ? undefined : subjectState.moveMessageToSubject}
      onSelect={(id) => { selectDm(id) }}
      onSend={(body, attachmentIds) => { postDmMessage(body, attachmentIds) }}
      uploadAttachment={file => uploadDmAttachment(file)}
      onNewConversation={() => { startNewConversation() }}
      turnContext={live.turnContext}
      onLoadTurnContext={loadTurnContext}
      {...(live.tenant === null ? {} : { memberId: live.tenant.memberId })}
      onToggleReaction={(messageId, stickerId) => {
        toggleMessageReaction('dm', messageId, stickerId)
      }}
    />
  )
}

export type { PersonaLiveStore }
