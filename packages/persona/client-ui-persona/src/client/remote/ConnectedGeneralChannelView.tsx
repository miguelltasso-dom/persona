import type { ReactNode } from 'react'
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { GeneralChannelView } from '../chat/GeneralChannelView.tsx'
import { subjectDisplayName } from '../chat/SubjectBar.tsx'
import { useHostConversationSubjects } from '../chat/use-host-conversation-subjects.ts'
import type { TurnContextUi } from './turn-context-ui.ts'
import type { PersonaCardShellBridge } from './persona-card-shell-bridge.ts'
import type { PersonaLiveSnapshot, PersonaLiveStore } from './persona-live-store.ts'

export interface ConnectedChannelInjected {
  readonly liveStore: PersonaLiveStore
  hooks: { live: HostObservable<PersonaLiveSnapshot> }
  postChannelMessage(body: string, attachmentIds?: readonly string[]): void
  uploadChannelAttachment(file: File): Promise<{ readonly id: string; readonly name: string }>
  loadTurnContext(ticketId: string): void
  toggleMessageReaction(streamKind: 'channel' | 'dm', eventId: string, stickerId: string): void
}

export type ConnectedGeneralChannelViewProps =
  & PropsLocale<'persona.chat'>
  & InjectFace<ConnectedChannelInjected>
  & {
    readonly shellT: PropsLocale<'persona.shell'>['t']
    readonly onBuildTeam?: (() => void) | undefined
    readonly personaCard?: PersonaCardShellBridge | undefined
    readonly openPersonaProfile?: ((personaId: string) => void) | undefined
  }

export function ConnectedGeneralChannelView({
  t,
  shellT,
  useLive,
  liveStore,
  postChannelMessage,
  uploadChannelAttachment,
  loadTurnContext,
  toggleMessageReaction,
  onBuildTeam,
  personaCard,
  openPersonaProfile,
}: ConnectedGeneralChannelViewProps): ReactNode {
  const live = useLive(state => state)
  const ownerId = live.tenant?.channelId ?? null
  const scope = ownerId === null ? null : liveStore.conversationScope('channel', ownerId)
  const subjects = useHostConversationSubjects(liveStore, scope, live.messages)
  return (
    <GeneralChannelView
      t={t}
      shellT={shellT}
      members={live.stripMembers}
      team={live.team}
      messages={subjects.filteredMessages}
      subjectBar={{
        subjects: subjects.subjects,
        activeSubjectId: subjects.activeSubjectId,
        onSelect: subjects.selectSubject,
        onCreate: subjects.createSubject,
        onRename: subjects.renameSubject,
        onArchive: subjects.archiveSubject,
        archived: subjects.archived,
        onReopen: subjects.reopenSubject,
        editingSubjectId: subjects.editingSubjectId,
        panelId: 'persona-channel-subject-panel',
      }}
      composerSubjectPlaceholder={t('composer.placeholderInSubject', {
        subject: subjectDisplayName(t, subjects.activeSubject),
      })}
      composerSubjectColorIndex={subjects.activeSubject.colorIndex}
      subjectMoveTargets={subjects.subjects}
      onMoveMessageSubject={subjects.moveMessageToSubject}
      {...(personaCard === undefined ? {} : { personaCard })}
      {...(openPersonaProfile === undefined ? {} : { openPersonaProfile })}
      passThroughFollowers={live.passThroughFollowers}
      turnContext={live.turnContext}
      onLoadTurnContext={loadTurnContext}
      onBuildTeam={onBuildTeam}
      onSendMessage={(body, attachmentIds) => { void postChannelMessage(body, attachmentIds) }}
      uploadAttachment={file => uploadChannelAttachment(file)}
      {...(live.tenant === null ? {} : { memberId: live.tenant.memberId })}
      onToggleReaction={(messageId, stickerId) => {
        toggleMessageReaction('channel', messageId, stickerId)
      }}
      gestorPlansById={live.gestorPlansById}
      onApproveGestorPlan={(planId) => { void liveStore.approveGestorPlan(planId) }}
      onRejectGestorPlan={(planId) => { void liveStore.rejectGestorPlan(planId) }}
      conversationKey={ownerId === null ? 'channel:geral' : `channel:${ownerId}`}
    />
  )
}

export type { TurnContextUi }

export type { PersonaLiveStore }
