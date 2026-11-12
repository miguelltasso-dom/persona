import { useEffect, useState, type ReactNode } from 'react'
import type { VoiceTranscribe } from '../voice/voice-send.ts'
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { DirectMessagesView, type DmRowUi } from '../chat/DirectMessagesView.tsx'
import { buildResponderEngine } from '../chat/responder-engine.ts'
import type { SelectablePersonaOption } from '../chat/NewDmPersonaModal.tsx'
import { subjectDisplayName } from '../chat/SubjectBar.tsx'
import { conversationStreamKey } from '../chat/conversation-stream-key.ts'
import { useHostConversationSubjects } from '../chat/use-host-conversation-subjects.ts'
import type { ComposerSlashActions } from '../chat/composer-slash-commands.ts'
import { useConnectedAside } from './use-connected-aside.tsx'
import type { ChipTone } from '../primitives/index.ts'
import { WORK_STATUS_KEY, type PersonaWorkUiState } from '../team/persona-work-state.ts'
import { resolveHostPersonaId } from './map-host-ui.ts'
import type { PersonaLiveSnapshot, PersonaLiveStore } from './persona-live-store.ts'
import type { ActivityGroupProps } from '../primitives/Pooled.tsx'
import type { RunErrorHandlerContext } from '../chat/run-error-handlers.ts'
import type { EngineRemoteWire } from './engine-status.ts'
import { ConnectedEngineBanner } from './ConnectedEngineBanner.tsx'
import { appendNotStartedRows } from './dm-team-rows.ts'
import { dmRowOf } from './dm-rows.ts'
import { workingOnFor } from './working-on.ts'
import { useEngineLimits } from './use-engine-limits.ts'
import { useConnectedPersonaAsks } from '../ask/use-connected-persona-asks.ts'
import { IndicatorsProvider } from '../indicators/use-indicators.tsx'
import { useConnectedReply } from '../answer/use-connected-reply.ts'
import { useConnectedHostQueue } from './use-connected-host-queue.ts'
import { useConnectedTurnControls } from './use-connected-turn-controls.ts'

const STATE_TONE: Readonly<Record<PersonaWorkUiState, ChipTone>> = { working: 'success', waiting: 'accent', stuck: 'danger', resting: 'neutral' }

export interface ConnectedDmInjected {
  readonly liveStore: PersonaLiveStore
  hooks: { live: HostObservable<PersonaLiveSnapshot> }
  selectDm(dmId: string | null): void
  postDmMessage(body: string, attachmentIds?: readonly string[]): void
  uploadDmAttachment(file: File): Promise<{ readonly id: string; readonly name: string }>
  loadTurnContext(ticketId: string): void
  openTaskOnBoard?(ticketId: string): void
  toggleMessageReaction(streamKind: 'channel' | 'dm', eventId: string, stickerId: string): void
  startNewConversation(): void
  readonly turnActivityLabels?: ActivityGroupProps['labels'] | undefined
  runErrorHandlers?: RunErrorHandlerContext | undefined
  openTeachPersona(personaId: string): void
  /** FR-3: Remote do host para a faixa "Falta uma IA" (sem ele, nada é mostrado). */
  readonly engineRemote?: EngineRemoteWire | undefined
  /** Abre Conexões (ação "Conectar uma IA" da faixa). */
  readonly onOpenConnections?: (() => void) | undefined
  /** `/contratar`: abre o fluxo de contratar persona (o mesmo do #geral). Sem ele o comando sai do menu. */
  readonly onBuildTeam?: (() => void) | undefined
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
  openTaskOnBoard,
  toggleMessageReaction,
  startNewConversation,
  turnActivityLabels,
  runErrorHandlers,
  openTeachPersona,
  engineRemote,
  onOpenConnections,
  onBuildTeam,
}: ConnectedDirectMessagesViewProps): ReactNode {
  const live = useLive(state => state)
  const dmId = live.selectedDmId
  // COLHEITA-S1 P1-03 (Carbon; Keel 10:08): o microfone da DM também depende do transcritor real do host.
  const [voiceTranscriber, setVoiceTranscriber] = useState<VoiceTranscribe | undefined>(undefined)
  useEffect(() => {
    let alive = true
    void Promise.resolve(liveStore.voiceMicAvailable?.() ?? false).then((available) => {
      if (alive && available) setVoiceTranscriber(() => liveStore.voiceTranscriber?.())
    }, () => undefined)
    return () => { alive = false }
  }, [liveStore])
  const subjectStreamKey = dmId === null ? null : conversationStreamKey('dm', dmId)
  const subjectState = useHostConversationSubjects(liveStore, subjectStreamKey, live.dmMessages, {
    defaultName: n => chatT('subjects.defaultName', { n }),
  })
  const peerName = live.dms.find(row => row.id === dmId)?.peerName ?? ''
  const rows: DmRowUi[] = live.dms.map((row) => {
    const member = live.stripMembers.find(m => m.name === row.peerName)
    return dmRowOf(row, member, member === undefined ? undefined : workingOnFor(live.nowRows, member), shellT)
  })
  const availablePersonas: readonly SelectablePersonaOption[] = (live.team?.personas ?? []).map((p) => {
    const member = live.stripMembers.find(m => m.id === p.avatarRef || m.name === p.name)
    const hasExistingDm = live.dms.some(d => d.peerId === p.id || d.peerName === p.name)
    return {
      id: p.id,
      name: p.name,
      role: p.title || p.description,
      characterId: p.avatarRef,
      state: member?.state,
      stateLabel: member !== undefined ? shellT(WORK_STATUS_KEY[member.state]) : undefined,
      stateTone: member !== undefined ? STATE_TONE[member.state] : undefined,
      isCoordination: p.systemRoles.includes('coordination'),
      hasExistingDm,
    }
  })
  const selectedRow = rows.find(row => row.id === dmId)
  const onTeach = selectedRow?.characterId === undefined
    ? undefined
    : () => { openTeachPersona(resolveHostPersonaId(live.team, selectedRow.peerId)) }
  // IV-4: limites REAIS do motor para o /limites e a gaveta; lidos quando o painel abre ou o contexto chega.
  const { limits: engineLimits, load: loadEngineLimits } = useEngineLimits(
    engineRemote,
    live.tenant === null ? null : { workspaceId: live.tenant.workspaceId, projectId: live.tenant.projectId },
  )
  const turnTicketId = live.turnContext?.ticketId
  useEffect(() => {
    if (turnTicketId !== undefined) loadEngineLimits()
  }, [turnTicketId, loadEngineLimits])
  // P0-27: o menu "/" só lista o que faz alguma coisa aqui. /lado e /resumo entram com o host do IV-6.
  // IV-6: /lado e /resumo ao host, com a persona da DM respondendo.
  const aside = useConnectedAside({
    t: chatT,
    liveStore,
    team: live.team,
    conversationKey: subjectStreamKey ?? 'dm',
    personaId: selectedRow === undefined ? '' : resolveHostPersonaId(live.team, selectedRow.peerId),
    subjectId: subjectState.activeSubjectId,
    streamKind: 'dm',
    ownerId: dmId,
  })
  // IV-10 (atrás de `persona.flag.personaAsk`): sem a flag ou sem as chamadas no host, `undefined` e o fio fica como era.
  const personaAsks = useConnectedPersonaAsks({
    remote: engineRemote,
    tenant: live.tenant,
    messages: subjectState.filteredMessages,
    refreshKey: `${String(live.dmMessages.length)}:${live.dmMessages.at(-1)?.id ?? ''}`,
  })
  // FL-11 (atrás de `persona.flag.workingControl`): a fila do host, o Parar e o Direcionar da DM. A DM usa a MESMA fila do canal: `streamKind:'dm'`, e o id da
  // DM é ao mesmo tempo o assunto e o dono (contracts/working-control.md). Sem a flag, sem as chamadas do host ou sem DM aberta, ambos são `undefined`.
  const peerMember = selectedRow === undefined ? undefined : live.stripMembers.find(member => member.name === selectedRow.peerName)
  const dmMembers = peerMember === undefined ? [] : [peerMember]
  const hostQueue = useConnectedHostQueue({
    remote: engineRemote,
    tenant: live.tenant,
    team: live.team,
    members: dmMembers,
    responderMemberId: peerMember?.id ?? '',
    subjectId: dmId ?? '',
    streamKind: 'dm',
    ownerId: dmId,
    refreshKey: `${String(live.dmMessages.length)}:${live.dmMessages.at(-1)?.id ?? ''}`,
  })
  const turnControls = useConnectedTurnControls({
    remote: engineRemote,
    tenant: live.tenant,
    team: live.team,
    members: dmMembers,
    messages: subjectState.filteredMessages,
    responderMemberId: peerMember?.id ?? '',
    subjectId: dmId ?? '',
    streamKind: 'dm',
    ownerId: dmId,
  })
  // IV-10 "Responder" (atrás de `persona.flag.personaAsk`): o alvo escolhido no cartão de decisão vira o chip do composer e o Enviar chama `answerAttention`.
  const reply = useConnectedReply({
    remote: engineRemote,
    tenant: live.tenant,
    streamKind: 'dm',
    ownerId: dmId,
    chipLabel: (name, question) => chatT('reply.chip', { name, question }),
  })
  const slashActions: ComposerSlashActions = {
    ...(dmId === null ? {} : { assunto: (name: string) => { subjectState.openSubjectByName(name) } }),
    ...(onTeach === undefined ? {} : { ensinar: () => { onTeach() } }),
    ...(onBuildTeam === undefined ? {} : { contratar: () => { onBuildTeam() } }),
    ...aside.slashActions,
  }
  // DESIGN-01 #03: a pílula "Modelo · Esforço" da persona desta conversa; abrir leva ao diálogo do EFF-1 dela.
  const responderEngine = buildResponderEngine({
    team: live.team,
    openEngine: runErrorHandlers === undefined ? undefined : runErrorHandlers.openEngineForPersona,
    defaultLabel: shellT('personasTab.engine.defaultChip'),
  })
  return (
    <IndicatorsProvider remote={engineRemote} tenant={live.tenant}>
      <DirectMessagesView
        voiceTranscriber={voiceTranscriber}
        t={chatT}
        shellT={shellT}
        slashActions={slashActions}
        asideSlot={aside.card}
        engineLimits={engineLimits}
        onOpenLimits={loadEngineLimits}
        {...(engineRemote === undefined ? {} : {
          engineBanner: (
            <ConnectedEngineBanner
              t={chatT}
              engineRemote={engineRemote}
              workspaceId={live.tenant?.workspaceId}
              projectId={live.tenant?.projectId}
              onConnect={onOpenConnections}
            />
          ),
        })}
        loading={!live.ready}
        dms={appendNotStartedRows(rows, availablePersonas)}
        selectedId={live.selectedDmId}
        // P0-30: as mensagens que o host não recebeu desta conversa ficam no fim do fio, marcadas "Não enviado".
        messages={[...subjectState.filteredMessages, ...(live.failedSends ?? []).filter(row => row.streamKind === 'dm' && row.ownerId === dmId).map(row => row.message)]}
        onRetrySend={(messageId) => { void liveStore.retryFailedSend?.(messageId) }}
        onResumePersona={personaId => liveStore.resumePersona?.(personaId)}
        {...(personaAsks === undefined ? {} : { personaAsks })}
        // P0-10: a DM tem os mesmos controles do #geral: "Segure para enviar" no cartão de ação externa e "Desfazer" na linha da ação direta.
        {...(liveStore.undoPersonaAction === undefined ? {} : { onUndoAction: (activityId: string) => liveStore.undoPersonaAction?.(activityId) })}
        {...(liveStore.decideActionApproval === undefined ? {} : { onDecideAction: (decision: import('../chat/ActionPreviewCard.tsx').ActionDecision) => liveStore.decideActionApproval?.(decision) })}
        {...(reply ?? {})}
        {...(hostQueue === undefined ? {} : { hostQueue })}
        {...(turnControls === undefined ? {} : { turnControls })}
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
          panelId: 'persona-dm-subject-panel',
          // With one subject the chip "Geral" only suggests the message goes to #geral: it shows up when there is more than one.
          hideSingleTab: true,
        }}
        composerSubjectPlaceholder={dmId === null ? undefined : subjectState.subjects.length > 1
          ? chatT('composer.placeholderInSubjectFor', { subject: subjectDisplayName(chatT, subjectState.activeSubject), name: peerName })
          : chatT('composer.placeholderDm', { name: peerName })}
        composerSubjectColorIndex={dmId === null || subjectState.subjects.length <= 1 ? undefined : subjectState.activeSubject.colorIndex}
        subjectMoveTargets={dmId === null ? undefined : [...subjectState.subjects]}
        onMoveMessageSubject={dmId === null ? undefined : subjectState.moveMessageToSubject}
        onUndoMoveMessage={dmId === null ? undefined : (messageId, revertSubjectId) => {
          subjectState.moveMessageToSubject(messageId, revertSubjectId)
        }}
        subjectsLoadError={subjectState.subjectsError}
        onRetrySubjects={subjectState.retrySubjects}
        passThroughFollowers={live.passThroughFollowers}
        onSelect={(id) => { selectDm(id) }}
        onSend={(body, attachmentIds) => { postDmMessage(body, attachmentIds) }}
        uploadAttachment={file => uploadDmAttachment(file)}
        onNewConversation={() => { startNewConversation() }}
        turnContext={live.turnContext}
        turnActivityLabels={turnActivityLabels}
        onLoadTurnContext={loadTurnContext}
        {...(openTaskOnBoard === undefined ? {} : { onOpenTaskOnBoard: openTaskOnBoard })}
        {...(live.tenant === null ? {} : { memberId: live.tenant.memberId })}
        onToggleReaction={(messageId, stickerId) => {
          toggleMessageReaction('dm', messageId, stickerId)
        }}
        {...(runErrorHandlers === undefined ? {} : { runErrorHandlers })}
        {...(responderEngine === undefined ? {} : { responderEngine })}
        {...(onTeach === undefined ? {} : { onTeach })}
        {...(availablePersonas.length === 0 ? {} : { availablePersonas })}
        onSelectPersonaForNewDm={(personaId) => { void liveStore.openPersonaDm(personaId) }}
      />
    </IndicatorsProvider>
  )
}

export type { PersonaLiveStore }
