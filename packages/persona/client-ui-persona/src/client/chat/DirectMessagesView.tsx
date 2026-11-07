import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96, ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { houseEmptyArt } from '../decor/HouseDecor.tsx'
import { poseUrl, type PersonaCharacterId } from '../assets/asset-url.ts'
import { uiStateToPose, type PersonaWorkUiState } from '../team/persona-work-state.ts'
import { Avatar, BrandIcon, Button, Chip, EmptyState, MenuButton, Skeleton, Toast, ToastRegion, UiIcon, type ChipTone } from '../primitives/index.ts'
import { subjectDisplayName } from './SubjectBar.tsx'
import { useCallback, useEffect, useState } from 'react'
import type { HostQueueControls } from './host-queue.ts'
import type { HostTurnControls } from './host-turn.ts'
import { QueuedMessageBubble } from './QueuedMessageBubble.tsx'
import { TypingIndicator } from './TypingIndicator.tsx'
import { typingPersona } from './typing-indicator.ts'
import type { ChannelPersonaMember } from '../team/persona-work-state.ts'
import type { ChannelMessageUi } from '../remote/map-host-ui.ts'
import { ChannelComposer } from './ChannelComposer.tsx'
import { SubjectBar, type SubjectBarProps } from './SubjectBar.tsx'
import { DEFAULT_CONVERSATION_SUBJECT_ID } from './conversation-subjects.ts'
import { MessageList } from './GeneralChannelView.tsx'
import { isLampLightEnabled, useLampLight } from './lamp-light.ts'
import { isPlacesNavEnabled } from '../shell/nav-flag.ts'
import { TurnContextDrawer } from './TurnContextDrawer.tsx'
import type { TurnContextUi } from '../remote/turn-context-ui.ts'
import type { RunErrorHandlerContext } from './run-error-handlers.ts'
import { NewDmPersonaModal, type SelectablePersonaOption } from './NewDmPersonaModal.tsx'
import type { PersonaAsksBinding } from '../ask/use-connected-persona-asks.ts'
import styles from './DirectMessagesView.module.css'

/** One DM row as the presentation needs it (Prism maps host data). */
export interface DmRowUi {
  readonly id: string
  readonly peerId: string
  readonly peerName: string
  /** AVATAR_96 key when the peer is a persona with gallery art. */
  readonly characterId?: string | undefined
  readonly role?: string | undefined
  readonly stateLabel?: string | undefined
  readonly stateTone?: ChipTone | undefined
  /** Live work state → pose in the thread header (UX-GUIDE §3). */
  readonly state?: PersonaWorkUiState | undefined
  /** CV-2: a tarefa em que a persona trabalha agora (título real, ao vivo); ausente = sem tarefa em andamento. */
  readonly workingOn?: string | undefined
  readonly unread?: number | undefined
  readonly lastLine?: string | undefined
  readonly timeLabel?: string | undefined
  /** A-2: persona da equipe que ainda não tem conversa; a linha diz "Começar conversa" e o clique abre a DM. */
  readonly notStarted?: boolean | undefined
}

export interface DirectMessagesViewProps {
  readonly t: PropsLocale<'persona.chat'>['t']
  readonly shellT: PropsLocale<'persona.shell'>['t']
  readonly loading: boolean
  readonly dms: readonly DmRowUi[]
  readonly selectedId: string | null
  readonly messages: readonly ChannelMessageUi[]
  readonly onSelect: (dmId: string) => void
  readonly onSend: (body: string, attachmentIds?: readonly string[]) => void
  readonly uploadAttachment?: ((file: File) => Promise<{ readonly id: string; readonly name: string }>) | undefined
  readonly onNewConversation?: (() => void) | undefined
  /** "Contexto usado" for a task cited in the DM (same drawer as #geral). */
  readonly turnContext?: TurnContextUi | null | undefined
  readonly turnActivityLabels?: import('../primitives/Pooled.tsx').ActivityGroupProps['labels'] | undefined
  readonly onLoadTurnContext?: ((ticketId: string) => void) | undefined
  readonly onOpenTaskOnBoard?: ((ticketId: string) => void) | undefined
  readonly memberId?: string | undefined
  readonly onToggleReaction?: ((messageId: string, stickerId: import('../primitives/index.ts').ReactionId) => void) | undefined
  readonly subjectBar?: Omit<SubjectBarProps, 't'> | undefined
  readonly composerSubjectPlaceholder?: string | undefined
  readonly composerSubjectColorIndex?: import('./conversation-subjects.ts').SubjectColorIndex | undefined
  readonly subjectMoveTargets?: import('./conversation-subjects.ts').ConversationSubjectUi[] | undefined
  readonly onMoveMessageSubject?: ((messageId: string, subjectId: string) => void) | undefined
  readonly onUndoMoveMessage?: ((messageId: string, revertSubjectId: string) => void) | undefined
  readonly subjectsLoadError?: import('../remote/persona-remote-unwrap.ts').PersonaRemoteError | null | undefined
  readonly onRetrySubjects?: (() => void) | undefined
  readonly passThroughFollowers?: readonly { readonly name: string }[] | undefined
  readonly runErrorHandlers?: RunErrorHandlerContext | undefined
  /** P0-30: "Tentar de novo" numa mensagem que não foi enviada. */
  readonly onRetrySend?: ((messageId: string) => void) | undefined
  /** HT-3: "Retomar {persona}" na linha de evento do fio. */
  readonly onResumePersona?: ((personaId: string) => void | Promise<void>) | undefined
  /** IV-10 (atrás de `persona.flag.personaAsk`): o estado vivo e o "responder" dos cartões de pergunta com chips. */
  readonly personaAsks?: PersonaAsksBinding | undefined
  /** IV-6: o cartão "Pergunta à parte" (`/lado`, `/resumo`), acima do composer e fora do fio. */
  readonly asideSlot?: ReactNode
  /** W2-10 — consent overlay for the persona in this thread. */
  readonly onTeach?: (() => void) | undefined
  readonly availablePersonas?: readonly SelectablePersonaOption[] | undefined
  readonly onSelectPersonaForNewDm?: ((personaId: string) => void) | undefined
  readonly onHirePersona?: (() => void) | undefined
  /** FR-3: faixa "Falta uma IA" acima do composer. */
  readonly engineBanner?: import('react').ReactNode | undefined
  /** O que cada comando "/" faz nesta conversa (P0-27); sem handler o comando não aparece no menu. */
  readonly slashActions?: import('./composer-slash-commands.ts').ComposerSlashActions | undefined
  /** IV-4: limites reais do motor (`/limites` e gaveta); sem fonte, "indisponível" (nunca número de exemplo). */
  readonly engineLimits?: import('../remote/engine-limits.ts').EngineLimitsUi | undefined
  /** O `/limites` abriu: quem monta a tela lê as cotas agora. */
  readonly onOpenLimits?: (() => void) | undefined
  /** FL-11 (atrás de `persona.flag.workingControl`): a fila por item que o HOST guarda para esta conversa; a DM usa a MESMA fila do canal (`streamKind:'dm'`). */
  readonly hostQueue?: HostQueueControls | undefined
  /** FL-11 / IV-5: Parar, "Direcionar agora" e "está escrevendo…" de verdade. Sem isto, a DM é a de sempre. */
  readonly turnControls?: HostTurnControls | undefined
  /** IV-10: "Responder" a uma pergunta da persona (o chip e o envio que chama answerAttention). */
  readonly replyTarget?: { readonly id: string; readonly label: string; readonly onClear: () => void } | undefined
  readonly onSendReply?: ((text: string, attachmentIds: readonly string[]) => Promise<void>) | undefined
}

const PORTRAITS = AVATAR_96 as Readonly<Record<string, string>>

type SuggestionKind = 'coordination' | 'engineering' | 'research' | 'support' | 'content' | 'default'

/** RCD "value first": first-request ideas that match the persona's job title. */
function suggestionKind(role: string | undefined): SuggestionKind {
  const text = (role ?? '').toLowerCase()
  if (/coord|vigia|gest|lider|líder/u.test(text)) return 'coordination'
  if (/engenh|dev|códig|codig|tecn|software|implement/u.test(text)) return 'engineering'
  if (/pesquis|anális|analis|dados|research/u.test(text)) return 'research'
  if (/atend|suporte|relacion|client|venda/u.test(text)) return 'support'
  if (/conte|market|copy|social|redaç|design/u.test(text)) return 'content'
  return 'default'
}

function portraitFor(row: DmRowUi): string | undefined {
  return PORTRAITS[row.characterId ?? row.peerName.trim().toLowerCase()]
}

/** Mensagens diretas: conversation list + thread with persona header, shared stream and composer. */
export function DirectMessagesView({
  t, shellT, loading, dms, selectedId, messages, onSelect, onSend, uploadAttachment, onNewConversation, turnContext, turnActivityLabels, onLoadTurnContext, onOpenTaskOnBoard, memberId, onToggleReaction,
  subjectBar, composerSubjectPlaceholder, composerSubjectColorIndex,
  subjectMoveTargets, onMoveMessageSubject, onUndoMoveMessage,
  subjectsLoadError = null,
  onRetrySubjects,
  passThroughFollowers = [],
  runErrorHandlers,
  onRetrySend,
  onResumePersona,
  personaAsks,
  asideSlot,
  onTeach,
  availablePersonas,
  onSelectPersonaForNewDm,
  onHirePersona,
  engineBanner,
  slashActions,
  engineLimits,
  onOpenLimits,
  hostQueue,
  turnControls,
  replyTarget,
  onSendReply,
}: DirectMessagesViewProps): ReactNode {
  const [isNewDmModalOpen, setIsNewDmModalOpen] = useState(false)
  const [moveToast, setMoveToast] = useState<{ readonly messageId: string; readonly subjectLabel: string; readonly revertSubjectId: string } | null>(null)

  const handleOpenNewDm = useCallback((): void => {
    if (availablePersonas !== undefined && onSelectPersonaForNewDm !== undefined) {
      setIsNewDmModalOpen(true)
    } else {
      onNewConversation?.()
    }
  }, [availablePersonas, onSelectPersonaForNewDm, onNewConversation])
  const selected = dms.find(row => row.id === selectedId) ?? null
  // Luz da luminária (NIGHT-THEME-SPEC §5): só com `persona.flag.lampLight` + balões; sem isso nada disto existe.
  const lamp = isLampLightEnabled()
  const lampRef = useLampLight<HTMLElement>(lamp, `${selected?.id ?? ''}:${String(messages.length)}`)
  // FL-11: a persona da conversa é o único "responder" (o seletor não existe na DM); só com o controle de trabalho ligado ela entra no composer.
  const [editingQueuedId, setEditingQueuedId] = useState<string | null>(null)
  const peer: ChannelPersonaMember | undefined = selected !== null && selected.characterId !== undefined && (hostQueue !== undefined || turnControls !== undefined)
    ? { id: selected.characterId as ChannelPersonaMember['id'], name: selected.peerName, role: selected.role ?? '', state: selected.state ?? 'resting' }
    : undefined
  // O Toast do Tirar e o aviso do host somem sozinhos (a mensagem é do host, o tempo é nosso).
  const hostRemoved = hostQueue?.removed ?? null
  const hostError = hostQueue?.error ?? turnControls?.error ?? null
  const dismissHostRemoved = hostQueue?.dismissRemoved
  const clearQueueError = hostQueue?.clearError
  const clearTurnError = turnControls?.clearError
  const clearHostError = useCallback(() => { clearQueueError?.(); clearTurnError?.() }, [clearQueueError, clearTurnError])
  useEffect(() => {
    if (hostRemoved === null || dismissHostRemoved === undefined) return undefined
    const timer = setTimeout(() => { dismissHostRemoved() }, 6_000)
    return () => { clearTimeout(timer) }
  }, [hostRemoved, dismissHostRemoved])
  useEffect(() => {
    if (hostError === null) return undefined
    const timer = setTimeout(() => { clearHostError() }, 6_000)
    return () => { clearTimeout(timer) }
  }, [hostError, clearHostError])

  if (!loading && dms.length === 0) {
    return (
      <div className={styles.emptyWrap} data-persona-root="">
        <EmptyState
          illustration={ILLUSTRATIONS['empty-dm']}
          art={houseEmptyArt('empty-dm', 'empty-dm-noite')}
          title={t('dm.emptyTitle')}
          body={t('dm.emptyBody')}
          action={(onSelectPersonaForNewDm !== undefined || onNewConversation !== undefined) ? (
            <Button variant="primary" icon={<UiIcon name="plus" size={18} strokeWidth={2.2} />} onClick={handleOpenNewDm}>
              {t('dm.newConversation')}
            </Button>
          ) : undefined}
        />
        {availablePersonas !== undefined && onSelectPersonaForNewDm !== undefined && (
          <NewDmPersonaModal
            t={t}
            open={isNewDmModalOpen}
            personas={availablePersonas}
            onClose={() => { setIsNewDmModalOpen(false) }}
            onSelectPersona={(personaId) => {
              setIsNewDmModalOpen(false)
              onSelectPersonaForNewDm(personaId)
            }}
            onHirePersona={onHirePersona}
          />
        )}
      </div>
    )
  }

  return (
    <div className={styles.layout} data-persona-root="">
      <aside className={styles.listPane} aria-labelledby="persona-dm-title">
        <header className={styles.listHeader}>
          <span className={styles.badge} aria-hidden="true"><BrandIcon name="mensagens-diretas" size={20} /></span>
          <div className={styles.listTitles}>
            <h1 id="persona-dm-title" className={styles.title}>{shellT('sidebar.directMessages')}</h1>
            <p className={styles.subtitle}>{t('dm.subtitle')}</p>
          </div>
          {(onSelectPersonaForNewDm !== undefined || onNewConversation !== undefined) && (
            <button
              type="button"
              className={styles.newDmHeaderButton}
              onClick={handleOpenNewDm}
              aria-label={t('dm.newConversation')}
              title={t('dm.newConversation')}
            >
              <UiIcon name="plus" size={18} strokeWidth={2.2} />
            </button>
          )}
        </header>
        {loading ? (
          <div className={styles.skeletons} aria-hidden="true">
            {[0, 1, 2, 3].map(key => (
              <div key={key} className={styles.skeletonRow}>
                <Skeleton shape="circle" width={40} height={40} />
                <div className={styles.skeletonText}>
                  <Skeleton width="60%" />
                  <Skeleton width="85%" height={12} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <ul className={styles.dmList} aria-label={t('dm.listTitle')}>
            {dms.map(row => (
              <li key={row.id}>
                <button
                  type="button"
                  className={styles.dmItem}
                  aria-current={row.id === selectedId ? 'true' : undefined}
                  data-not-started={row.notStarted === true ? '' : undefined}
                  onClick={() => {
                    if (row.notStarted === true) onSelectPersonaForNewDm?.(row.peerId)
                    else onSelect(row.id)
                  }}
                >
                  <Avatar name={row.peerName} src={portraitFor(row)} shape="person" size={40} decorative />
                  <span className={styles.dmText}>
                    <span className={styles.dmName}>{row.peerName}</span>
                    <span className={styles.dmLine}>{row.notStarted === true ? t('dm.startConversation') : (row.lastLine ?? row.role ?? '')}</span>
                  </span>
                  <span className={styles.dmMeta}>
                    {row.timeLabel !== undefined && <time className={styles.dmTime}>{row.timeLabel}</time>}
                    {row.unread !== undefined && row.unread > 0 && <span className={styles.unread}>{row.unread}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className={styles.threadPane} aria-label={selected?.peerName ?? t('dm.listTitle')} ref={lampRef} {...(lamp ? { 'data-lamp': '' } : {})}>
        {lamp && <div className={styles.lampLayer} aria-hidden="true" />}
        {selected === null ? (
          <div className={styles.pick}>
            <EmptyState compact illustration={ILLUSTRATIONS['empty-dm']} title={t('dm.pickTitle')} body={t('dm.pickBody')} />
          </div>
        ) : (
          <>
            <header className={styles.threadHeader}>
              {selected.characterId !== undefined && selected.state !== undefined
                && poseUrl(selected.characterId as PersonaCharacterId, uiStateToPose(selected.state)) !== undefined ? (
                  <span className={styles.threadStage} aria-hidden="true">
                    <img
                      key={selected.state}
                      src={poseUrl(selected.characterId as PersonaCharacterId, uiStateToPose(selected.state))}
                      alt=""
                      data-state={selected.state}
                    />
                  </span>
                ) : (
                  <Avatar name={selected.peerName} src={portraitFor(selected)} shape="portrait" size={48} decorative />
                )}
              <div className={styles.threadTitles}>
                <h2 className={styles.threadTitle}>{selected.peerName}</h2>
                {selected.role !== undefined && (
                  <p className={styles.threadRole}>
                    {isPlacesNavEnabled() && selected.workingOn !== undefined
                      ? t('dm.roleWorking', { role: selected.role, task: selected.workingOn })
                      : selected.role}
                  </p>
                )}
              </div>
              {selected.stateLabel !== undefined && <Chip tone={selected.stateTone ?? 'neutral'}>{selected.stateLabel}</Chip>}
              {onTeach !== undefined && (
                <MenuButton
                  variant="ghost"
                  align="end"
                  label={t('dm.threadMenu', { name: selected.peerName })}
                  items={[{ id: 'teach', label: t('dm.threadMenuTeach', { name: selected.peerName }), onSelect: onTeach }]}
                />
              )}
            </header>
            {subjectBar !== undefined && (
              <>
                {subjectsLoadError !== null && subjectsLoadError !== undefined && (
                  <div className={styles.subjectError} role="status">
                    <p>{t('subjects.loadError')}</p>
                    {onRetrySubjects !== undefined && (
                      <button type="button" className={styles.subjectRetry} onClick={() => { onRetrySubjects() }}>
                        {t('subjects.retry')}
                      </button>
                    )}
                  </div>
                )}
                <SubjectBar t={t} {...subjectBar} />
              </>
            )}
            <div
              className={styles.thread}
              {...(subjectBar?.panelId === undefined ? { role: 'log' as const } : { id: subjectBar.panelId, role: 'tabpanel' as const })}
              aria-live="polite"
            >
              {passThroughFollowers.length > 0 && (
                <ul className={styles.passThroughList} aria-live="polite">
                  {passThroughFollowers.map(row => (
                    <li key={row.name} className={styles.passThrough}>{t('stream.passThrough', { name: row.name })}</li>
                  ))}
                </ul>
              )}
              {messages.length === 0 ? (
                <div className={styles.firstAsk}>
                  <EmptyState compact illustration={portraitFor(selected)} title={t('dm.threadEmpty')} />
                  <p className={styles.firstAskTitle} id="persona-dm-suggest">{t('dm.suggestTitle')}</p>
                  <ul className={styles.suggestions} aria-labelledby="persona-dm-suggest">
                    {([1, 2, 3] as const).map((n) => {
                      const text = t(`dm.suggest.${suggestionKind(selected.role)}.${n}`)
                      return (
                        <li key={n}>
                          <button type="button" className={styles.suggestion} onClick={() => { onSend(text) }}>
                            <UiIcon name="sparkle" size={14} strokeWidth={2.2} />
                            {text}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : (
                <MessageList
                  t={t}
                  messages={messages}
                  onLoadTurnContext={onLoadTurnContext}
                  {...(onOpenTaskOnBoard === undefined ? {} : { onOpenTaskOnBoard })}
                  {...(memberId === undefined ? {} : { memberId })}
                  {...(onToggleReaction === undefined ? {} : { onToggleReaction })}
                  {...(selected.characterId === undefined ? {} : { userStickerAnimal: selected.characterId })}
                  {...(subjectMoveTargets === undefined ? {} : { subjectMoveTargets })}
                  {...(onMoveMessageSubject === undefined ? {} : {
                    onMoveMessageSubject: (messageId, subjectId) => {
                      const moved = messages.find(row => row.id === messageId)
                      const revertSubjectId = moved?.conversationSubjectId ?? DEFAULT_CONVERSATION_SUBJECT_ID
                      onMoveMessageSubject(messageId, subjectId)
                      const target = subjectMoveTargets?.find(row => row.id === subjectId)
                      const subjectLabel = target === undefined ? subjectId : subjectDisplayName(t, target)
                      setMoveToast({ messageId, subjectLabel, revertSubjectId })
                    },
                  })}
                  {...(runErrorHandlers === undefined ? {} : { runErrorHandlers })}
                  {...(onRetrySend === undefined ? {} : { onRetrySend })}
                  {...(onResumePersona === undefined ? {} : { onResumePersona })}
                  {...(personaAsks === undefined ? {} : { personaAsks })}
                  {...(turnContext?.ticketId === undefined ? {} : { turnActivityTicketId: turnContext.ticketId })}
                  {...(turnContext?.activityFolds === undefined ? {} : { turnActivityFolds: turnContext.activityFolds })}
                  {...(turnActivityLabels === undefined ? {} : { turnActivityLabels })}
                  onContinue={() => { onSend(t('stream.resumeText')) }}
                />
              )}
              {(hostQueue?.items ?? []).map(item => (
                <QueuedMessageBubble
                  key={item.id}
                  t={t}
                  item={item}
                  isOnlyItem={(hostQueue?.items.length ?? 0) === 1}
                  onSendNow={(id) => { hostQueue?.sendNow(id); if (editingQueuedId === id) setEditingQueuedId(null) }}
                  onEdit={setEditingQueuedId}
                  onRemove={(id) => { hostQueue?.drop(id); if (editingQueuedId === id) setEditingQueuedId(null) }}
                />
              ))}
              {turnControls !== undefined && peer !== undefined && (typingPersona(messages, [peer]) !== null) && <TypingIndicator t={t} member={peer} />}
            </div>
            <TurnContextDrawer t={t} context={turnContext} activityLabels={turnActivityLabels} limits={engineLimits} />
            <div className={styles.composer}>
              {engineBanner}
              {asideSlot}
              <ChannelComposer
                key={selected.id}
                t={t}
                members={peer === undefined ? [] : [peer]}
                {...(peer === undefined ? {} : { responderHidden: true })}
                // O histórico (↑) e o rascunho guardado (Ctrl+S) são de CADA conversa, não de todas as DMs juntas.
                conversationKey={`dm:${selected.id}`}
                {...(slashActions === undefined ? {} : { slashActions })}
                {...(engineLimits === undefined ? {} : { engineLimits })}
                {...(onOpenLimits === undefined ? {} : { onOpenLimits })}
                onSend={(body, attachmentIds) => {
                  // Editar um balão da fila troca o texto dele no host (não é uma mensagem nova).
                  if (editingQueuedId !== null && hostQueue?.items.some(row => row.id === editingQueuedId) === true) {
                    hostQueue.submitEdit(editingQueuedId, body)
                    setEditingQueuedId(null)
                    return
                  }
                  onSend(body, attachmentIds)
                }}
                {...(hostQueue === undefined ? {} : {
                  onQueueMessage: (text: string, responder: { readonly id: string; readonly name: string }) => {
                    if (editingQueuedId !== null && hostQueue.items.some(row => row.id === editingQueuedId)) hostQueue.submitEdit(editingQueuedId, text)
                    else hostQueue.enqueue(text, responder)
                    setEditingQueuedId(null)
                  },
                })}
                {...(turnControls === undefined ? {} : { onSteer: turnControls.steer })}
                {...(replyTarget === undefined ? {} : { replyTarget })}
                {...(onSendReply === undefined ? {} : { onSendReply })}
                {...(turnControls?.stoppable == null ? {} : { stop: { personaName: turnControls.stoppable.personaName, onStop: turnControls.stop } })}
                {...(turnControls === undefined ? {} : { responding: turnControls.stoppable != null })}
                {...(hostQueue?.items.find(row => row.id === editingQueuedId) === undefined ? {} : {
                  editingQueuedText: hostQueue?.items.find(row => row.id === editingQueuedId)?.text ?? '',
                  onCancelEditQueued: () => { setEditingQueuedId(null) },
                })}
                {...(uploadAttachment === undefined ? {} : { uploadAttachment })}
                placeholder={composerSubjectPlaceholder ?? t('dm.composerPlaceholder', { name: selected.peerName })}
                {...(composerSubjectColorIndex === undefined ? {} : { activeSubjectColorIndex: composerSubjectColorIndex })}
              />
            </div>
            <span className="persona-sr-only" role="status" aria-live="polite">
              {turnControls?.stoppedPersona == null ? '' : t('composer.stoppedAnnounce', { name: turnControls.stoppedPersona })}
            </span>
            {hostError !== null && (
              <ToastRegion label={hostError}>
                <Toast tone="warning" title={hostError} />
              </ToastRegion>
            )}
            {hostRemoved !== null && (
              <ToastRegion label={t('composer.steer.removedToast')}>
                <Toast
                  tone="neutral"
                  title={t('composer.steer.removedToast')}
                  action={<Button variant="ghost" size="s" onClick={() => { hostQueue?.undoDrop() }}>{t('composer.steer.undoRemove')}</Button>}
                />
              </ToastRegion>
            )}
            {moveToast !== null && (
              <ToastRegion label={t('subjects.move')}>
                <Toast
                  tone="neutral"
                  title={t('subjects.moved', { subject: moveToast.subjectLabel })}
                  {...(onUndoMoveMessage === undefined ? {} : {
                    action: (
                      <Button
                        variant="ghost"
                        size="s"
                        onClick={() => {
                          onUndoMoveMessage(moveToast.messageId, moveToast.revertSubjectId)
                          setMoveToast(null)
                        }}
                      >
                        {t('subjects.undoMove')}
                      </Button>
                    ),
                  })}
                />
              </ToastRegion>
            )}
          </>
        )}
      </section>
      {availablePersonas !== undefined && onSelectPersonaForNewDm !== undefined && (
        <NewDmPersonaModal
          t={t}
          open={isNewDmModalOpen}
          personas={availablePersonas}
          onClose={() => { setIsNewDmModalOpen(false) }}
          onSelectPersona={(personaId) => {
            setIsNewDmModalOpen(false)
            onSelectPersonaForNewDm(personaId)
          }}
          onHirePersona={onHirePersona}
        />
      )}
    </div>
  )
}
