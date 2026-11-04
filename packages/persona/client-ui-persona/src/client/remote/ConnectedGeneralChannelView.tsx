import { useEffect, type ReactNode } from 'react'
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { GeneralChannelView } from '../chat/GeneralChannelView.tsx'
import { subjectDisplayName } from '../chat/SubjectBar.tsx'
import { conversationStreamKey } from '../chat/conversation-stream-key.ts'
import { useHostConversationSubjects } from '../chat/use-host-conversation-subjects.ts'
import type { ComposerSlashActions } from '../chat/composer-slash-commands.ts'
import type { TurnContextUi } from './turn-context-ui.ts'
import type { RunErrorHandlerContext } from '../chat/run-error-handlers.ts'
import type { ActivityGroupProps } from '../primitives/Pooled.tsx'
import type { PersonaCardShellBridge } from './persona-card-shell-bridge.ts'
import type { PersonaLiveSnapshot, PersonaLiveStore } from './persona-live-store.ts'
import type { EngineRemoteWire } from './engine-status.ts'
import { ConnectedEngineBanner } from './ConnectedEngineBanner.tsx'
import { useEngineLimits } from './use-engine-limits.ts'
import { openBlockingCount } from '../decisions/decision-selectors.ts'

export interface ConnectedChannelInjected {
  readonly liveStore: PersonaLiveStore
  hooks: { live: HostObservable<PersonaLiveSnapshot> }
  postChannelMessage(body: string, attachmentIds?: readonly string[]): void
  uploadChannelAttachment(file: File): Promise<{ readonly id: string; readonly name: string }>
  loadTurnContext(ticketId: string): void
  openTaskOnBoard?(ticketId: string): void
  toggleMessageReaction(streamKind: 'channel' | 'dm', eventId: string, stickerId: string): void
  /** T3 §12 — open Conexões to swap account at quota limit. */
  onOpenConnections?: (() => void) | undefined
  onOpenHelp?: (() => void) | undefined
  onOpenSearch?: (() => void) | undefined
  /** Sino do cabeçalho → Aprovações. */
  onOpenApprovals?: (() => void) | undefined
  runErrorHandlers?: RunErrorHandlerContext | undefined
  readonly turnActivityLabels?: ActivityGroupProps['labels'] | undefined
  /** FR-3: Remote do host para a faixa "Falta uma IA" (sem ele, nada é mostrado). */
  readonly engineRemote?: EngineRemoteWire | undefined
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
  openTaskOnBoard,
  toggleMessageReaction,
  onBuildTeam,
  personaCard,
  openPersonaProfile,
  onOpenConnections,
  onOpenHelp,
  onOpenSearch,
  onOpenApprovals,
  runErrorHandlers,
  turnActivityLabels,
  engineRemote,
}: ConnectedGeneralChannelViewProps): ReactNode {
  const live = useLive(state => state)
  const composerHints = live.channelComposerHints
  const ownerId = live.tenant?.channelId ?? null
  const subjectStreamKey = ownerId === null ? null : conversationStreamKey('channel', ownerId)
  const subjects = useHostConversationSubjects(liveStore, subjectStreamKey, live.messages, {
    defaultName: n => t('subjects.defaultName', { n }),
  })
  // IV-4: limites REAIS do motor para o /limites e a gaveta; lidos quando o painel abre ou o contexto chega.
  const { limits: engineLimits, load: loadEngineLimits } = useEngineLimits(
    engineRemote,
    live.tenant === null ? null : { workspaceId: live.tenant.workspaceId, projectId: live.tenant.projectId },
  )
  const turnTicketId = live.turnContext?.ticketId
  useEffect(() => {
    if (turnTicketId !== undefined) loadEngineLimits()
  }, [turnTicketId, loadEngineLimits])
  // P0-27: o menu "/" só lista o que faz alguma coisa aqui. /ensinar, /lado e /resumo saem até terem ação neste canal.
  const slashActions: ComposerSlashActions = {
    assunto: (name) => { subjects.openSubjectByName(name) },
    ...(onBuildTeam === undefined ? {} : { contratar: () => { onBuildTeam() } }),
  }
  return (
    <GeneralChannelView
      t={t}
      shellT={shellT}
      slashActions={slashActions}
      engineLimits={engineLimits}
      onOpenLimits={loadEngineLimits}
      onRetrySend={(messageId) => { void liveStore.retryFailedSend?.(messageId) }}
      members={live.stripMembers}
      loading={!live.ready}
      team={live.team}
      // P0-30: as mensagens que o host não recebeu ficam no fim do fio, marcadas "Não enviado".
      messages={[...subjects.filteredMessages, ...(live.failedSends ?? []).filter(row => row.streamKind === 'channel').map(row => row.message)]}
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
      subjectsLoadError={subjects.subjectsError}
      onRetrySubjects={subjects.retrySubjects}
      composerSubjectPlaceholder={t('composer.placeholderInSubject', {
        subject: subjectDisplayName(t, subjects.activeSubject),
      })}
      composerSubjectColorIndex={subjects.activeSubject.colorIndex}
      subjectMoveTargets={subjects.subjects}
      onMoveMessageSubject={subjects.moveMessageToSubject}
      onUndoMoveMessage={(messageId, revertSubjectId) => {
        subjects.moveMessageToSubject(messageId, revertSubjectId)
      }}
      {...(personaCard === undefined ? {} : { personaCard })}
      {...(openPersonaProfile === undefined ? {} : { openPersonaProfile })}
      passThroughFollowers={live.passThroughFollowers}
      turnContext={live.turnContext}
      turnActivityLabels={turnActivityLabels}
      onLoadTurnContext={loadTurnContext}
      {...(openTaskOnBoard === undefined ? {} : { onOpenTaskOnBoard: openTaskOnBoard })}
      onBuildTeam={onBuildTeam}
      onSendMessage={(body, attachmentIds) => { void postChannelMessage(body, attachmentIds) }}
      uploadAttachment={file => uploadChannelAttachment(file)}
      {...(live.tenant === null ? {} : { memberId: live.tenant.memberId })}
      onToggleReaction={(messageId, stickerId) => {
        toggleMessageReaction('channel', messageId, stickerId)
      }}
      gestorPlansById={live.gestorPlansById}
      gestorPlanAdjustingIds={live.gestorPlanAdjustingIds}
      onApproveGestorPlan={(planId) => { void liveStore.approveGestorPlan(planId) }}
      onRejectGestorPlan={(planId) => { void liveStore.rejectGestorPlan(planId) }}
      onFeedbackGestorPlan={(planId, comment) => {
        void liveStore.feedbackGestorPlan(planId, t('gestorPlan.adjustFeedbackBody', { comment }))
      }}
      quotaBlocked={composerHints.quotaBlocked}
      {...(composerHints.quotaResumeLabel === undefined
        ? {}
        : { quotaResumeLabel: composerHints.quotaResumeLabel })}
      responderAutonomy={composerHints.responderAutonomy}
      onResumeQuota={() => { void liveStore.refresh() }}
      {...(onOpenConnections === undefined ? {} : { onSwapAccount: onOpenConnections })}
      {...(onOpenHelp === undefined ? {} : { onOpenHelp })}
      {...(onOpenSearch === undefined ? {} : { onOpenSearch })}
      {...(onOpenApprovals === undefined ? {} : { onOpenNotifications: onOpenApprovals, notificationsCount: openBlockingCount(live.decisions) })}
      {...(runErrorHandlers === undefined ? {} : { runErrorHandlers })}
      conversationKey={ownerId === null ? 'channel:geral' : `channel:${ownerId}`}
      {...(engineRemote === undefined ? {} : {
        engineBanner: (
          <ConnectedEngineBanner
            t={t}
            engineRemote={engineRemote}
            workspaceId={live.tenant?.workspaceId}
            projectId={live.tenant?.projectId}
            onConnect={onOpenConnections}
          />
        ),
      })}
    />
  )
}

export type { TurnContextUi }

export type { PersonaLiveStore }
