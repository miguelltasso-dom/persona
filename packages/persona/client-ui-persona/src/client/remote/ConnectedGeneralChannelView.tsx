import { useEffect, useState, type ReactNode } from 'react'
import type { VoiceTranscribe } from '../voice/voice-send.ts'
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { GeneralChannelView } from '../chat/GeneralChannelView.tsx'
import { buildResponderEngine } from '../chat/responder-engine.ts'
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
import { defaultChannelResponderId } from '../chat/default-channel-responder.ts'
import { resolveHostPersonaId } from './map-host-ui.ts'
import { useConnectedAside } from './use-connected-aside.tsx'
import { useConnectedFanout } from './use-connected-fanout.ts'
import { useConnectedHostQueue } from './use-connected-host-queue.ts'
import { useConnectedTurnControls } from './use-connected-turn-controls.ts'
import { attachmentBytesRemoteFrom, resolveAttachmentImage } from './attachment-image.ts'
import { includeOpinionTextOnly, opinionTextOnlyRemoteFrom } from './opinion-text-only.ts'
import type { OpinionActions } from '../chat/opinion/OpinionBlock.tsx'
import { useConnectedPersonaAsks } from '../ask/use-connected-persona-asks.ts'
import { IndicatorsProvider } from '../indicators/use-indicators.tsx'
import { AudioAttachmentContext } from '../chat/voice-compose/AudioAttachmentSlot.tsx'
import { useConnectedTaskProposals } from '../proposal/use-connected-task-proposals.ts'
import { useConnectedReply } from '../answer/use-connected-reply.ts'

export interface ConnectedChannelInjected {
  readonly liveStore: PersonaLiveStore
  hooks: { live: HostObservable<PersonaLiveSnapshot> }
  postChannelMessage(body: string, attachmentIds?: readonly string[], options?: { readonly fanout?: 'everyone' | 'relevant'; readonly opinionFor?: string }): void
  uploadChannelAttachment(file: File): Promise<{ readonly id: string; readonly name: string }>
  loadTurnContext(ticketId: string): void
  openTaskOnBoard?(ticketId: string): void
  toggleMessageReaction(streamKind: 'channel' | 'dm', eventId: string, stickerId: string): void
  /** T3 §12 — open Conexões to swap account at quota limit. */
  onOpenConnections?: (() => void) | undefined
  /** P0-19: "Ver uso e limites" da faixa "No limite até {hora}". */
  onOpenUsage?: (() => void) | undefined
  onOpenHelp?: (() => void) | undefined
  onOpenSearch?: (() => void) | undefined
  /** Sino do cabeçalho → Aprovações. */
  onOpenApprovals?: (() => void) | undefined
  /** D-090 (TEAM-7, cartão "Bom dia"): "e mais n" → Quadros; "⋯ → Pausar o resumo da manhã" → Rotinas. */
  onOpenBoard?: (() => void) | undefined
  onOpenRoutines?: (() => void) | undefined
  /** EQUIPE-REAL §0: "precisa de você" e "Revisar" abrem Aprovações com este item selecionado. */
  onOpenApprovalItem?: ((approvalId: string) => void) | undefined
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
    readonly onOpenPersonaDm?: ((personaId: string) => void) | undefined
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
  onOpenPersonaDm,
  onOpenConnections,
  onOpenUsage,
  onOpenHelp,
  onOpenSearch,
  onOpenApprovals,
  onOpenBoard,
  onOpenRoutines,
  onOpenApprovalItem,
  runErrorHandlers,
  turnActivityLabels,
  engineRemote,
}: ConnectedGeneralChannelViewProps): ReactNode {
  const live = useLive(state => state)
  // COLHEITA-S1 P1-03 (Carbon; Keel 10:08): o microfone só existe com o transcritor real (modelo pronto ou baixável no host).
  const [voiceTranscriber, setVoiceTranscriber] = useState<VoiceTranscribe | undefined>(undefined)
  useEffect(() => {
    let alive = true
    void Promise.resolve(liveStore.voiceMicAvailable?.() ?? false).then((available) => {
      if (alive && available) setVoiceTranscriber(() => liveStore.voiceTranscriber?.())
    }, () => undefined)
    return () => { alive = false }
  }, [liveStore])
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
  // IV-6: /lado e /resumo ao host; quem responde é o responsável padrão do canal (a coordenação).
  const responderMemberId = defaultChannelResponderId(live.stripMembers)
  const aside = useConnectedAside({
    t,
    liveStore,
    team: live.team,
    conversationKey: subjectStreamKey ?? 'channel',
    personaId: responderMemberId === '' ? '' : resolveHostPersonaId(live.team, responderMemberId),
    subjectId: subjects.activeSubjectId,
    streamKind: 'channel',
    ownerId,
  })
  // FL-11 / P0-18 (atrás de `persona.flag.workingControl`): a fila por item que o host guarda. O Remote é o mesmo da faixa de motor.
  const lastMessageId = live.messages.at(-1)?.id ?? ''
  const hostQueue = useConnectedHostQueue({
    remote: engineRemote,
    tenant: live.tenant,
    team: live.team,
    members: live.stripMembers,
    responderMemberId,
    subjectId: subjects.activeSubjectId,
    streamKind: 'channel',
    ownerId,
    refreshKey: `${String(live.messages.length)}:${lastMessageId}`,
  })
  // FL-11 / IV-5: Parar e "Direcionar agora" de verdade (a resposta que cresce é uma das mensagens do assunto aberto).
  const turnControls = useConnectedTurnControls({
    remote: engineRemote,
    tenant: live.tenant,
    team: live.team,
    members: live.stripMembers,
    messages: subjects.filteredMessages,
    responderMemberId,
    subjectId: subjects.activeSubjectId,
    streamKind: 'channel',
    ownerId,
  })
  // IV-10 (atrás de `persona.flag.personaAsk`): sem a flag ou sem as chamadas no host, `undefined` e o fio fica como era.
  const personaAsks = useConnectedPersonaAsks({
    remote: engineRemote,
    tenant: live.tenant,
    messages: subjects.filteredMessages,
    refreshKey: `${String(live.messages.length)}:${lastMessageId}`,
  })
  // CV-8 (host behind `Config.fanout`): the host is ASKED whether "Toda a equipe" exists here; no answer = the composer is the usual one.
  const fanout = useConnectedFanout({ remote: engineRemote, tenant: live.tenant, ownerId })
  // TEAM-8c: o cartão "Pedido de opinião" lê as imagens do rascunho do host (bytes -> data URL, só tipos de imagem) e "Trocar o motor" abre o perfil da persona.
  const imageRemote = attachmentBytesRemoteFrom(engineRemote)
  const textOnlyRemote = opinionTextOnlyRemoteFrom(engineRemote)
  const workspaceId = live.tenant?.workspaceId
  const projectId = live.tenant?.projectId
  const opinionActions: OpinionActions = {
    ...(imageRemote === undefined || workspaceId === undefined || projectId === undefined
      ? {}
      : { resolveImage: (attachmentId: string) => resolveAttachmentImage(imageRemote, { workspaceId, projectId }, attachmentId) }),
    // "Incluir só pelo texto" (team-real.md §12): só existe quando o host tem a chamada (sem botão morto); a recusa volta com a frase do host.
    ...(textOnlyRemote === undefined || workspaceId === undefined || projectId === undefined
      ? {}
      : { onIncludeTextOnly: async (request: { readonly requestId: string; readonly personaId: string }) => { await includeOpinionTextOnly(textOnlyRemote, { workspaceId, projectId }, request) } }),
    // "Trocar o motor" abre o seletor de motor DAQUELA persona (PersonaEngineOverlay); sem esse caminho, abre o perfil dela como antes.
    ...(runErrorHandlers !== undefined
      ? { onChangeEngine: (personaId: string) => { runErrorHandlers.openEngineForPersona(personaId) } }
      : openPersonaProfile === undefined ? {} : { onChangeEngine: openPersonaProfile }),
  }
  // P1-9 (atrás de `persona.flag.taskProposal`): sem a flag ou sem as chamadas no host, `undefined` e o fio fica como era.
  const taskProposals = useConnectedTaskProposals({
    remote: engineRemote,
    tenant: live.tenant,
    messages: subjects.filteredMessages,
    refreshKey: `${String(live.messages.length)}:${lastMessageId}`,
  })
  // IV-10 "Responder" (atrás de `persona.flag.personaAsk`): o alvo escolhido no cartão de decisão vira o chip do composer e o Enviar chama `answerAttention`.
  const reply = useConnectedReply({
    remote: engineRemote,
    tenant: live.tenant,
    streamKind: 'channel',
    ownerId,
    chipLabel: (name, question) => t('reply.chip', { name, question }),
  })
  const slashActions: ComposerSlashActions = {
    assunto: (name) => { subjects.openSubjectByName(name) },
    ...(onBuildTeam === undefined ? {} : { contratar: () => { onBuildTeam() } }),
    ...aside.slashActions,
  }
  // DESIGN-01 #03: a pílula "Modelo · Esforço" da persona que responde; abrir leva ao diálogo do EFF-1 dela.
  const responderEngine = buildResponderEngine({
    team: live.team,
    openEngine: runErrorHandlers === undefined ? undefined : runErrorHandlers.openEngineForPersona,
    defaultLabel: shellT('personasTab.engine.defaultChip'),
  })
  return (
    <AudioAttachmentContext.Provider
      value={{
        t: shellT,
        check: attachmentId => liveStore.isAudioAttachment?.(attachmentId) ?? Promise.resolve(null),
        load: attachmentId => liveStore.loadAudioAttachment?.(attachmentId) ?? Promise.resolve(null),
      }}
    >
      <IndicatorsProvider remote={engineRemote} tenant={live.tenant}>
        <GeneralChannelView
          t={t}
          shellT={shellT}
          slashActions={slashActions}
          asideSlot={aside.card}
          onOpenApprovalItem={onOpenApprovalItem}
          onUndoInitiativeGrant={liveStore.undoInitiativeGrant === undefined ? undefined : approvalId => liveStore.undoInitiativeGrant?.(approvalId)}
          onDecideInitiative={liveStore.decideInitiativeApproval === undefined ? undefined : (approvalId, choice) => liveStore.decideInitiativeApproval?.(approvalId, choice)}
          onUndoAction={liveStore.undoPersonaAction === undefined ? undefined : activityId => liveStore.undoPersonaAction?.(activityId)}
          onDecideAction={liveStore.decideActionApproval === undefined ? undefined : decision => liveStore.decideActionApproval?.(decision)}
          dailyBriefActions={{
            ...(onOpenApprovals === undefined ? {} : { onOpenApprovals }),
            ...(onOpenBoard === undefined ? {} : { onOpenBoard }),
            ...(onOpenRoutines === undefined ? {} : { onOpenRoutines }),
            ...(openTaskOnBoard === undefined ? {} : { onOpenTask: openTaskOnBoard }),
          }}
          engineLimits={engineLimits}
          onOpenLimits={loadEngineLimits}
          onRetrySend={(messageId) => { void liveStore.retryFailedSend?.(messageId) }}
          onResumePersona={personaId => liveStore.resumePersona?.(personaId)}
          {...(personaAsks === undefined ? {} : { personaAsks })}
          {...(taskProposals === undefined ? {} : { taskProposals })}
          {...(reply ?? {})}
          {...fanout}
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
          {...(onOpenPersonaDm === undefined ? {} : { onOpenPersonaDm })}
          passThroughFollowers={live.passThroughFollowers}
          turnContext={live.turnContext}
          voiceTranscriber={voiceTranscriber}
          onSendSticker={(stickerId) => { void liveStore.sendStickerMessage?.(stickerId) }}
          turnActivityLabels={turnActivityLabels}
          onLoadTurnContext={loadTurnContext}
          {...(openTaskOnBoard === undefined ? {} : { onOpenTaskOnBoard: openTaskOnBoard })}
          onBuildTeam={onBuildTeam}
          onSendMessage={(body, attachmentIds, options?: { readonly fanout?: 'everyone' | 'relevant'; readonly opinionFor?: string }) => { void postChannelMessage(body, attachmentIds, options) }}
          {...(hostQueue === undefined ? {} : { hostQueue })}
          {...(turnControls === undefined ? {} : { turnControls })}
          opinionActions={opinionActions}
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
          quotaKnown={composerHints.quotaKnown === true}
          {...(composerHints.quotaResumeLabel === undefined
            ? {}
            : { quotaResumeLabel: composerHints.quotaResumeLabel })}
          responderAutonomy={composerHints.responderAutonomy}
          {...(responderEngine === undefined ? {} : { responderEngine })}
          onResumeQuota={() => { void liveStore.refresh() }}
          {...(onOpenConnections === undefined ? {} : { onSwapAccount: onOpenConnections })}
          {...(onOpenUsage === undefined ? {} : { onSeeUsage: onOpenUsage })}
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
      </IndicatorsProvider>
    </AudioAttachmentContext.Provider>
  )
}

export type { TurnContextUi }

export type { PersonaLiveStore }
