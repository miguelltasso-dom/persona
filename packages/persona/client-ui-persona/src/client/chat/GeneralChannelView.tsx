import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96, ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { usePersonaMotion } from '../motion/index.ts'
import {
  Avatar,
  BrandIcon,
  DayDivider,
  Button,
  Chip,
  EmptyState,
  IconButton,
  REACTION_EMOJI,
  REACTION_IDS,
  ReactionChip,
  Skeleton,
  UiIcon,
  stickerUrl,
  Toast,
  ToastRegion,
  ActivityGroup,
  FixedRowVirtualScroller,
  type ActivityGroupProps,
  type ReactionId,
} from '../primitives/index.ts'
import { CHAT_MESSAGE_ROW_PX, CHAT_MESSAGE_VIRTUAL_MIN } from './message-stream-virtual.ts'
import type { ConversationSubjectUi } from './conversation-subjects.ts'
import { DEFAULT_CONVERSATION_SUBJECT_ID } from './conversation-subjects.ts'
import { MoveMessageSubject } from './MoveMessageSubject.tsx'
import { subjectDisplayName } from './SubjectBar.tsx'
import type { ChannelPersonaMember } from '../team/persona-work-state.ts'
import { TeamChannelStrip } from '../team/TeamChannelStrip.tsx'
import { QueuedMessageBubble, type QueuedMessageItem } from './QueuedMessageBubble.tsx'
import { ChannelComposer } from './ChannelComposer.tsx'
import { MessageQuoteToolbar, type MessageQuote } from './MessageQuoteToolbar.tsx'
import type { ComposerSlashActions } from './composer-slash-commands.ts'
import type { EngineLimitsUi } from '../remote/engine-limits.ts'
import { MarkdownBody } from './markdown/MarkdownBody.tsx'
import { SubjectBar, type SubjectBarProps } from './SubjectBar.tsx'
import { ReactionAdder, reactionIdFromEmoji } from './ReactionAdder.tsx'
import { TurnContextDrawer } from './TurnContextDrawer.tsx'
import type { GestorPlanView } from '@deepseek-ai/dsh-persona-host/types'
import { GestorPlanAdjustModal } from './GestorPlanAdjustModal.tsx'
import { GestorPlanMessageCard } from './GestorPlanMessageCard.tsx'
import { resolveGestorPlanForMessage } from './resolve-gestor-plan-display.ts'
import type { ChannelMessageUi } from '../remote/map-host-ui.ts'
import { resolveHostPersonaId } from '../remote/map-host-ui.ts'
import type { PersonaCardShellBridge } from '../remote/persona-card-shell-bridge.ts'
import type { TeamView } from '../remote/persona-remote-types.ts'
import type { TurnContextActivityFoldUi, TurnContextUi } from '../remote/turn-context-ui.ts'
import { PersonaCardPopoverHost, usePersonaCardController } from '../profile/PersonaCardPopoverHost.tsx'
import { ConversationRunErrorCard } from './ConversationRunErrorCard.tsx'
import type { RunErrorHandlerContext } from './run-error-handlers.ts'
import styles from './GeneralChannelView.module.css'

export interface GeneralChannelViewProps extends PropsLocale<'persona.chat'> {
  readonly shellT: PropsLocale<'persona.shell'>['t']
  readonly members: readonly ChannelPersonaMember[]
  readonly messages: readonly ChannelMessageUi[]
  /** Os dados do host ainda não chegaram (recarregar): skeleton em vez de "equipe vazia" / "canal quietinho". */
  readonly loading?: boolean | undefined
  readonly passThroughFollowers?: readonly { readonly name: string; readonly id?: string | undefined }[]
  readonly turnContext?: TurnContextUi | null
  readonly turnActivityLabels?: import('../primitives/Pooled.tsx').ActivityGroupProps['labels'] | undefined
  readonly onLoadTurnContext?: ((ticketId: string) => void) | undefined
  /** PRO-4 / C5b — focus the real task card on Quadros. */
  readonly onOpenTaskOnBoard?: ((ticketId: string) => void) | undefined
  readonly onSendMessage?: ((body: string, attachmentIds?: readonly string[]) => void) | undefined
  readonly uploadAttachment?: ((file: File) => Promise<{ readonly id: string; readonly name: string }>) | undefined
  /** Empty-team CTA in the banner (Prism wires: open onboarding/team builder). */
  readonly onBuildTeam?: (() => void) | undefined
  /** Header ? → Ajuda (guide canais). */
  readonly onOpenHelp?: (() => void) | undefined
  readonly onOpenSearch?: (() => void) | undefined
  /** Sino do cabeçalho: abre o que espera a pessoa (Aprovações). Sem handler, o sino nem aparece (nada de controle morto). */
  readonly onOpenNotifications?: (() => void) | undefined
  /** Quantas decisões esperam a pessoa; o ponto do sino só aparece com pelo menos 1. */
  readonly notificationsCount?: number | undefined
  /** Menu da conta (ainda não existe): sem handler o avatar é só a presença, não um botão. */
  readonly onOpenAccount?: (() => void) | undefined
  readonly runErrorHandlers?: RunErrorHandlerContext | undefined
  /** P0-30: "Tentar de novo" numa mensagem que não foi enviada. */
  readonly onRetrySend?: ((messageId: string) => void) | undefined
  readonly team?: TeamView | null
  readonly personaCard?: PersonaCardShellBridge | undefined
  readonly openPersonaProfile?: ((personaId: string) => void) | undefined
  readonly memberId?: string | undefined
  readonly onToggleReaction?: ((messageId: string, stickerId: ReactionId) => void) | undefined
  /** WAVE2 assuntos (Prism data; Muse styles SubjectBar). */
  readonly subjectBar?: Omit<SubjectBarProps, 't'> | undefined
  readonly subjectsLoadError?: import('../remote/persona-remote-unwrap.ts').PersonaRemoteError | null | undefined
  readonly onRetrySubjects?: (() => void) | undefined
  readonly composerSubjectPlaceholder?: string | undefined
  readonly composerSubjectColorIndex?: import('./conversation-subjects.ts').SubjectColorIndex | undefined
  readonly subjectMoveTargets?: readonly ConversationSubjectUi[] | undefined
  readonly onMoveMessageSubject?: ((messageId: string, subjectId: string) => void) | undefined
  readonly onUndoMoveMessage?: ((messageId: string, revertSubjectId: string) => void) | undefined
  readonly gestorPlansById?: Readonly<Record<string, GestorPlanView>>
  readonly onApproveGestorPlan?: ((planId: string) => void) | undefined
  readonly onRejectGestorPlan?: ((planId: string) => void) | undefined
  readonly onFeedbackGestorPlan?: ((planId: string, comment: string) => void) | undefined
  readonly gestorPlanAdjustingIds?: Readonly<Record<string, true>> | undefined
  readonly conversationKey?: string | undefined
  /** O que cada comando "/" faz (P0-27); sem handler o comando não aparece no menu. */
  readonly slashActions?: ComposerSlashActions | undefined
  /** IV-4: limites reais do motor (`/limites` e gaveta "Contexto usado"); sem fonte, "indisponível". */
  readonly engineLimits?: EngineLimitsUi | undefined
  /** O `/limites` abriu: quem monta a tela lê as cotas agora. */
  readonly onOpenLimits?: (() => void) | undefined
  readonly quotaBlocked?: boolean | undefined
  readonly quotaResumeLabel?: string | undefined
  readonly onResumeQuota?: (() => void) | undefined
  readonly onSwapAccount?: (() => void) | undefined
  readonly responderAutonomy?: import('../persona-editor/persona-draft.ts').AutonomyLevel | undefined
  /** UX-PHASE §6: messages waiting for the responder's current step; local queue when the host has none. */
  readonly queuedMessages?: readonly QueuedMessageItem[] | undefined
  readonly onSendQueuedNow?: ((id: string) => void) | undefined
  readonly onEditQueued?: ((id: string) => void) | undefined
  readonly onRemoveQueued?: ((id: string) => void) | undefined
  /** FR-3: faixa "Falta uma IA" fixa acima do composer (Connected liga ao host). */
  readonly engineBanner?: ReactNode | undefined
}

function isReactionId(id: string): id is ReactionId {
  return (REACTION_IDS as readonly string[]).includes(id)
}

function reactionLabels(t: PropsLocale<'persona.chat'>['t']): Readonly<Record<ReactionId, string>> {
  return {
    joinha: t('reaction.joinha'),
    coracao: t('reaction.coracao'),
    rindo: t('reaction.rindo'),
    comemorando: t('reaction.comemorando'),
    pensando: t('reaction.pensando'),
    feito: t('reaction.feito'),
  }
}

function avatarFor(authorId: string): string | undefined {
  return authorId === 'user' ? undefined : AVATAR_96[authorId as keyof typeof AVATAR_96]
}

/** #geral — header, illustrated team banner, grouped stream with reactions, full composer (DESIGN-SYSTEM §6–7). */
export function GeneralChannelView({
  t,
  shellT,
  members,
  messages,
  loading = false,
  passThroughFollowers = [],
  turnContext,
  turnActivityLabels,
  onLoadTurnContext,
  onOpenTaskOnBoard,
  onSendMessage,
  onBuildTeam,
  onOpenHelp,
  onOpenSearch,
  onOpenNotifications,
  notificationsCount = 0,
  onOpenAccount,
  runErrorHandlers,
  onRetrySend,
  uploadAttachment,
  team = null,
  personaCard,
  openPersonaProfile,
  memberId,
  onToggleReaction,
  subjectBar,
  subjectsLoadError = null,
  onRetrySubjects,
  composerSubjectPlaceholder,
  composerSubjectColorIndex,
  subjectMoveTargets,
  onMoveMessageSubject,
  onUndoMoveMessage,
  gestorPlansById = {},
  onApproveGestorPlan,
  onRejectGestorPlan,
  onFeedbackGestorPlan,
  gestorPlanAdjustingIds = {},
  conversationKey = 'channel:geral',
  slashActions,
  engineLimits,
  onOpenLimits,
  quotaBlocked,
  quotaResumeLabel,
  onResumeQuota,
  onSwapAccount,
  responderAutonomy,
  queuedMessages,
  onSendQueuedNow,
  onEditQueued,
  onRemoveQueued,
  engineBanner,
}: GeneralChannelViewProps): ReactNode {
  const [localQueued, setLocalQueued] = useState<readonly QueuedMessageItem[]>([])
  const [editingQueuedId, setEditingQueuedId] = useState<string | null>(null)
  const [removedQueued, setRemovedQueued] = useState<QueuedMessageItem | null>(null)
  const [queueAnnounce, setQueueAnnounce] = useState('')
  const queueSeq = useRef(0)
  const effectiveQueued = queuedMessages ?? localQueued
  const editingQueuedItem = effectiveQueued.find(q => q.id === editingQueuedId)

  /** Enviar de verdade: se a mensagem veio de uma edição da fila, o item original sai da fila. */
  const sendMessage = (body: string, attachmentIds?: readonly string[]): void => {
    if (editingQueuedId !== null) {
      setLocalQueued(prev => prev.filter(q => q.id !== editingQueuedId))
      setEditingQueuedId(null)
    }
    onSendMessage?.(body, attachmentIds)
  }
  /** "Na fila" com a persona trabalhando: guarda como balão tracejado até ela terminar o passo atual. */
  const enqueueMessage = (text: string, responder: { readonly id: string; readonly name: string }): void => {
    queueSeq.current += 1
    const item: QueuedMessageItem = {
      id: `queued-${String(queueSeq.current)}`,
      text,
      targetPersonaName: responder.name,
      targetPersonaId: responder.id,
    }
    setLocalQueued(prev => [...prev.filter(q => q.id !== editingQueuedId), item])
    setEditingQueuedId(null)
    setQueueAnnounce(t('composer.steer.queuedAnnounce'))
  }
  const handleSendQueuedNow = (id: string): void => {
    if (onSendQueuedNow !== undefined) { onSendQueuedNow(id); return }
    const item = localQueued.find(q => q.id === id)
    if (item === undefined) return
    setLocalQueued(prev => prev.filter(q => q.id !== id))
    if (editingQueuedId === id) setEditingQueuedId(null)
    onSendMessage?.(item.text)
    setQueueAnnounce(t('composer.steer.sentAnnounce'))
  }
  const handleEditQueued = (id: string): void => {
    if (onEditQueued !== undefined) { onEditQueued(id); return }
    setEditingQueuedId(id)
  }
  const handleRemoveQueued = (id: string): void => {
    if (onRemoveQueued !== undefined) { onRemoveQueued(id); return }
    const item = localQueued.find(q => q.id === id)
    setLocalQueued(prev => prev.filter(q => q.id !== id))
    if (editingQueuedId === id) setEditingQueuedId(null)
    if (item !== undefined) setRemovedQueued(item)
  }
  const undoRemoveQueued = (): void => {
    if (removedQueued !== null) setLocalQueued(prev => [...prev, removedQueued])
    setRemovedQueued(null)
  }
  useEffect(() => {
    if (removedQueued === null) return undefined
    const timer = setTimeout(() => { setRemovedQueued(null) }, 6_000)
    return () => { clearTimeout(timer) }
  }, [removedQueued])
  // A fila sai sozinha quando a persona alvo termina o passo atual (ou some do elenco).
  useEffect(() => {
    if (queuedMessages !== undefined || localQueued.length === 0) return
    const ready = localQueued.filter((item) => {
      if (item.id === editingQueuedId) return false
      const target = members.find(member => member.id === item.targetPersonaId)
      return target === undefined || target.state !== 'working'
    })
    if (ready.length === 0) return
    setLocalQueued(prev => prev.filter(item => !ready.some(r => r.id === item.id)))
    for (const item of ready) onSendMessage?.(item.text)
    setQueueAnnounce(t('composer.steer.sentAnnounce'))
  }, [members, localQueued, editingQueuedId, queuedMessages, onSendMessage, t])
  const [moveToast, setMoveToast] = useState<{ readonly messageId: string; readonly subjectLabel: string; readonly revertSubjectId: string } | null>(null)
  const [pendingQuote, setPendingQuote] = useState<MessageQuote | null>(null)
  const [adjustTarget, setAdjustTarget] = useState<{ readonly planId: string; readonly gestorName: string } | null>(null)
  const streamRef = useRef<HTMLDivElement>(null)
  const card = usePersonaCardController()
  const cardData = card.personaId === null || personaCard === undefined
    ? undefined
    : personaCard.cardInfo(card.personaId)
  const coordinationAnimal = (members.find(member => member.systemRoles?.includes('coordination') === true) ?? members[0])?.id
  const personaCardTrigger = personaCard === undefined || team === null
    ? undefined
    : (ref: string) => {
      const hostId = resolveHostPersonaId(team, ref)
      const props = card.triggerProps(hostId)
      return {
        ...props,
        onPointerEnter: (event: MouseEvent<HTMLElement>) => {
          personaCard.prefetch(hostId)
          props.onPointerEnter(event)
        },
        onClick: (event: MouseEvent<HTMLElement>) => {
          personaCard.prefetch(hostId)
          props.onClick(event)
        },
      }
    }
  const composerProps = {
    ...(onSendMessage !== undefined ? { onSend: sendMessage, onQueueMessage: enqueueMessage } : {}),
    ...(uploadAttachment !== undefined ? { uploadAttachment } : {}),
    ...(composerSubjectPlaceholder !== undefined ? { placeholder: composerSubjectPlaceholder } : {}),
    ...(composerSubjectColorIndex !== undefined ? { activeSubjectColorIndex: composerSubjectColorIndex } : {}),
    conversationKey,
    pendingQuote,
    onClearQuote: () => { setPendingQuote(null) },
    ...(slashActions === undefined ? {} : { slashActions }),
    ...(engineLimits === undefined ? {} : { engineLimits }),
    ...(onOpenLimits === undefined ? {} : { onOpenLimits }),
    ...(quotaBlocked === undefined ? {} : { quotaBlocked }),
    ...(quotaResumeLabel === undefined ? {} : { quotaResumeLabel }),
    ...(onResumeQuota === undefined ? {} : { onResumeQuota }),
    ...(onSwapAccount === undefined ? {} : { onSwapAccount }),
    ...(responderAutonomy === undefined ? {} : { responderAutonomy }),
  }
  const userName = messages.find(message => message.authorId === 'user')?.authorName ?? t('message.you')
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastId = messages[messages.length - 1]?.id

  useEffect(() => {
    const node = scrollRef.current
    if (node === null || lastId === undefined) return
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 240
    if (nearBottom) node.scrollTo({ top: node.scrollHeight })
  }, [lastId])

  return (
    <div className={styles.view} data-persona-root="">
      <header className={styles.header}>
        <span className={styles.hashBadge} aria-hidden="true">
          <BrandIcon name="canais" size={22} />
        </span>
        <div className={styles.headerTitles}>
          <p className={styles.eyebrow}>{t('header.section')}</p>
          <h1 className={styles.channelTitle}>{t('header.channelGeneral')}</h1>
          <p className={styles.subtitle}>{t('header.subtitle')}</p>
        </div>
        <div className={styles.headerTools}>
          <IconButton
            label={t('header.search')}
            icon={<BrandIcon name="busca" size={20} />}
            {...(onOpenSearch === undefined ? {} : { onClick: onOpenSearch })}
          />
          {onOpenNotifications !== undefined && (
            <IconButton
              label={notificationsCount > 0 ? t('header.notificationsCount', { count: notificationsCount }) : t('header.notifications')}
              icon={<UiIcon name="bell" size={21} />}
              badge={notificationsCount > 0}
              onClick={onOpenNotifications}
            />
          )}
          <IconButton
            label={t('header.help')}
            icon={<UiIcon name="help" size={21} />}
            {...(onOpenHelp === undefined ? {} : { onClick: onOpenHelp })}
          />
          {onOpenAccount === undefined ? (
            <span className={styles.userButton} data-static="">
              <Avatar name={userName} size={40} presence="online" decorative />
            </span>
          ) : (
            <button type="button" className={styles.userButton} aria-label={t('header.userMenu')} onClick={onOpenAccount}>
              <Avatar name={userName} size={40} presence="online" decorative />
              <UiIcon name="chevronDown" size={16} strokeWidth={2.2} />
            </button>
          )}
        </div>
      </header>

      {subjectBar !== undefined && (
        <div className={styles.subjectRow}>
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
        </div>
      )}

      <div className={styles.scroll} ref={scrollRef} tabIndex={0} role="region" aria-label={t('header.channelGeneral')}>
        <div className={styles.column}>
          <TeamChannelStrip
            t={shellT}
            members={members}
            loading={loading}
            onBuildTeam={onBuildTeam}
            {...(personaCardTrigger === undefined ? {} : { personaCardTrigger })}
          />
          {passThroughFollowers.length > 0 && (
            <ul className={styles.passThroughList} aria-live="polite">
              {passThroughFollowers.map(row => (
                <li key={row.name} className={styles.passThrough}>
                  {personaCardTrigger !== undefined && row.id !== undefined ? (
                    <button type="button" className={styles.passThroughButton} {...personaCardTrigger(row.id)}>
                      {t('stream.passThrough', { name: row.name })}
                    </button>
                  ) : t('stream.passThrough', { name: row.name })}
                </li>
              ))}
            </ul>
          )}
          <div
            ref={streamRef}
            className={styles.stream}
            data-persona-channel-stream=""
            {...(messages.length === 0 ? { 'data-empty': '' } : {})}
            {...(subjectBar?.panelId === undefined ? { role: 'log' as const } : { id: subjectBar.panelId, role: 'tabpanel' as const })}
            aria-label={t('header.channelGeneral')}
            aria-live="polite"
          >
            <MessageQuoteToolbar
              t={t}
              containerRef={streamRef}
              onQuote={(quote) => { setPendingQuote({ ...quote, comment: '' }) }}
            />
            {messages.length === 0 && loading ? (
              <div className={styles.streamSkeleton} aria-busy="true" data-loading="">
                <span className="persona-sr-only" role="status">{t('stream.loading')}</span>
                {[78, 52, 66].map(width => (
                  <div key={width} className={styles.skeletonRow} aria-hidden="true">
                    <Skeleton width={32} height={32} shape="circle" />
                    <div className={styles.skeletonLines}>
                      <Skeleton width={96} height={12} />
                      <Skeleton width={`${String(width)}%`} height={14} />
                    </div>
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <EmptyState
                compact
                illustration={ILLUSTRATIONS['empty-dm']}
                title={t('stream.emptyTitle')}
                body={t('stream.emptyBody')}
              />
            ) : (
              <MessageList
                t={t}
                team={team}
                messages={messages}
                gestorPlansById={gestorPlansById}
                gestorPlanAdjustingIds={gestorPlanAdjustingIds}
                onLoadTurnContext={onLoadTurnContext}
                {...(onOpenTaskOnBoard === undefined ? {} : { onOpenTaskOnBoard })}
                {...(onApproveGestorPlan === undefined ? {} : { onApproveGestorPlan })}
                {...(onRejectGestorPlan === undefined ? {} : { onRejectGestorPlan })}
                {...(onFeedbackGestorPlan === undefined ? {} : {
                  onRequestGestorPlanAdjust: (planId: string) => {
                    const plan = gestorPlansById[planId]
                    const gestorName = plan === undefined
                      ? planId
                      : (team?.personas.find(row => row.id === plan.gestorId)?.name ?? plan.gestorId)
                    setAdjustTarget({ planId, gestorName })
                  },
                })}
                {...(personaCardTrigger === undefined ? {} : { personaCardTrigger })}
                {...(memberId === undefined ? {} : { memberId })}
                {...(onToggleReaction === undefined ? {} : { onToggleReaction })}
                {...(coordinationAnimal === undefined ? {} : { userStickerAnimal: coordinationAnimal })}
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
                {...(turnContext?.ticketId === undefined ? {} : { turnActivityTicketId: turnContext.ticketId })}
                {...(turnContext?.activityFolds === undefined ? {} : { turnActivityFolds: turnContext.activityFolds })}
                {...(turnActivityLabels === undefined ? {} : { turnActivityLabels })}
                {...(runErrorHandlers === undefined ? {} : { runErrorHandlers })}
                {...(onRetrySend === undefined ? {} : { onRetrySend })}
              />
            )}
            {effectiveQueued.map(item => (
              <QueuedMessageBubble
                key={item.id}
                t={t}
                item={item}
                isOnlyItem={effectiveQueued.length === 1}
                onSendNow={handleSendQueuedNow}
                onEdit={handleEditQueued}
                onRemove={handleRemoveQueued}
              />
            ))}
          </div>
        </div>
      </div>

      <TurnContextDrawer t={t} context={turnContext} activityLabels={turnActivityLabels} limits={engineLimits} />

      <div className={styles.composerDock}>
        <div className={styles.column}>
          {engineBanner}
          <ChannelComposer
            t={t}
            members={members}
            suppressHint={Object.values(gestorPlansById).some(plan => plan.status === 'proposed')}
            {...composerProps}
            {...(editingQueuedItem === undefined ? {} : {
              editingQueuedText: editingQueuedItem.text,
              onCancelEditQueued: () => { setEditingQueuedId(null) },
            })}
          />
        </div>
      </div>
      <span className="persona-sr-only" role="status" aria-live="polite">{queueAnnounce}</span>
      {removedQueued !== null && (
        <ToastRegion label={t('composer.steer.removedToast')}>
          <Toast
            tone="neutral"
            title={t('composer.steer.removedToast')}
            action={<Button variant="ghost" size="s" onClick={undoRemoveQueued}>{t('composer.steer.undoRemove')}</Button>}
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
      <GestorPlanAdjustModal
        t={t}
        open={adjustTarget !== null}
        gestorName={adjustTarget?.gestorName ?? ''}
        onClose={() => { setAdjustTarget(null) }}
        onSubmit={(comment) => {
          if (adjustTarget === null || onFeedbackGestorPlan === undefined) return
          onFeedbackGestorPlan(adjustTarget.planId, comment)
        }}
      />
      {personaCard !== undefined && openPersonaProfile !== undefined && (
        <PersonaCardPopoverHost
          card={card}
          bridge={personaCard}
          openPersonaProfile={openPersonaProfile}
          cardData={cardData}
        />
      )}
    </div>
  )
}

/** Grouped message stream with day pill (shared by #geral and DMs). */
export function MessageList({ t, team = null, messages, gestorPlansById = {}, gestorPlanAdjustingIds = {}, onApproveGestorPlan, onRejectGestorPlan, onRequestGestorPlanAdjust, onLoadTurnContext, onOpenTaskOnBoard, personaCardTrigger, memberId, onToggleReaction, userStickerAnimal, subjectMoveTargets, onMoveMessageSubject, turnActivityTicketId, turnActivityFolds, turnActivityLabels, runErrorHandlers, onRetrySend }: {
  readonly t: PropsLocale<'persona.chat'>['t']
  readonly team?: TeamView | null
  readonly messages: readonly ChannelMessageUi[]
  /** P0-30: "Tentar de novo" numa mensagem que não foi enviada. */
  readonly onRetrySend?: ((messageId: string) => void) | undefined
  readonly gestorPlansById?: Readonly<Record<string, GestorPlanView>>
  readonly gestorPlanAdjustingIds?: Readonly<Record<string, true>>
  readonly onApproveGestorPlan?: ((planId: string) => void) | undefined
  readonly onRejectGestorPlan?: ((planId: string) => void) | undefined
  readonly onRequestGestorPlanAdjust?: ((planId: string) => void) | undefined
  readonly onLoadTurnContext?: ((ticketId: string) => void) | undefined
  /** PRO-4 / C5b — focus the real task card on Quadros. */
  readonly onOpenTaskOnBoard?: ((ticketId: string) => void) | undefined
  readonly personaCardTrigger?: ((ref: string) => Record<string, unknown>) | undefined
  readonly memberId?: string | undefined
  readonly onToggleReaction?: ((messageId: string, stickerId: ReactionId) => void) | undefined
  /**
   * Whose sticker set reacts to the human's own messages (the DM peer, or the coordination in #geral), so the
   * stream never mixes Brush stickers with emoji (UX-16).
   */
  readonly userStickerAnimal?: string | undefined
  readonly subjectMoveTargets?: readonly ConversationSubjectUi[] | undefined
  readonly onMoveMessageSubject?: ((messageId: string, subjectId: string) => void) | undefined
  /** T3 §9 — inline activity on the message row that cites this ticket (when turn context is loaded). */
  readonly turnActivityTicketId?: string | undefined
  readonly turnActivityFolds?: readonly TurnContextActivityFoldUi[] | undefined
  readonly turnActivityLabels?: ActivityGroupProps['labels'] | undefined
  readonly runErrorHandlers?: RunErrorHandlerContext | undefined
}): ReactNode {
  const virtualized = messages.length >= CHAT_MESSAGE_VIRTUAL_MIN
  const rowProps = (index: number) => ({
    t,
    team,
    message: messages[index]!,
    gestorPlansById,
    gestorPlanAdjustingIds,
    index,
    continued: index > 0 && messages[index - 1]?.authorId === messages[index]?.authorId,
    streamVirtual: virtualized,
    onLoadTurnContext,
    ...(onOpenTaskOnBoard === undefined ? {} : { onOpenTaskOnBoard }),
    ...(onApproveGestorPlan === undefined ? {} : { onApproveGestorPlan }),
    ...(onRejectGestorPlan === undefined ? {} : { onRejectGestorPlan }),
    ...(onRequestGestorPlanAdjust === undefined ? {} : { onRequestGestorPlanAdjust }),
    ...(personaCardTrigger === undefined ? {} : { personaCardTrigger }),
    ...(memberId === undefined ? {} : { memberId }),
    ...(onToggleReaction === undefined ? {} : { onToggleReaction }),
    ...(userStickerAnimal === undefined ? {} : { userStickerAnimal }),
    ...(subjectMoveTargets === undefined ? {} : { subjectMoveTargets }),
    ...(onMoveMessageSubject === undefined ? {} : { onMoveMessageSubject }),
    ...(turnActivityTicketId === undefined ? {} : { turnActivityTicketId }),
    ...(turnActivityFolds === undefined ? {} : { turnActivityFolds }),
    ...(turnActivityLabels === undefined ? {} : { turnActivityLabels }),
    ...(runErrorHandlers === undefined ? {} : { runErrorHandlers }),
    ...(onRetrySend === undefined ? {} : { onRetrySend }),
  })

  return (
    <>
      <DayDivider>{t('stream.today')}</DayDivider>
      {virtualized ? (
        <FixedRowVirtualScroller
          className={styles.messagesVirtual}
          rowCount={messages.length}
          rowHeight={CHAT_MESSAGE_ROW_PX}
          ariaLabel={t('stream.today')}
          getRowKey={index => messages[index]?.id ?? `msg-row-${index}`}
          renderRow={index => (
            <div className={styles.messageVirtualSlot}>
              <ChannelMessageRow {...rowProps(index)} rowTag="div" />
            </div>
          )}
        />
      ) : (
        <ol className={styles.messages}>
          {messages.map((_message, index) => (
            <ChannelMessageRow key={messages[index]!.id} {...rowProps(index)} />
          ))}
        </ol>
      )}
    </>
  )
}

function ChannelMessageRow(props: {
  readonly t: PropsLocale<'persona.chat'>['t']
  readonly team: TeamView | null
  readonly message: ChannelMessageUi
  readonly gestorPlansById: Readonly<Record<string, GestorPlanView>>
  readonly gestorPlanAdjustingIds: Readonly<Record<string, true>>
  readonly index: number
  readonly continued: boolean
  readonly streamVirtual?: boolean
  readonly rowTag?: 'li' | 'div'
  readonly onApproveGestorPlan?: ((planId: string) => void) | undefined
  readonly onRejectGestorPlan?: ((planId: string) => void) | undefined
  readonly onRequestGestorPlanAdjust?: ((planId: string) => void) | undefined
  readonly onLoadTurnContext?: ((ticketId: string) => void) | undefined
  /** PRO-4 / C5b — focus the real task card on Quadros. */
  readonly onOpenTaskOnBoard?: ((ticketId: string) => void) | undefined
  readonly personaCardTrigger?: ((ref: string) => Record<string, unknown>) | undefined
  readonly memberId?: string | undefined
  readonly onToggleReaction?: ((messageId: string, stickerId: ReactionId) => void) | undefined
  readonly userStickerAnimal?: string | undefined
  readonly subjectMoveTargets?: readonly ConversationSubjectUi[] | undefined
  readonly onMoveMessageSubject?: ((messageId: string, subjectId: string) => void) | undefined
  readonly turnActivityTicketId?: string | undefined
  readonly turnActivityFolds?: readonly TurnContextActivityFoldUi[] | undefined
  readonly turnActivityLabels?: ActivityGroupProps['labels'] | undefined
  readonly runErrorHandlers?: RunErrorHandlerContext | undefined
  /** P0-30: "Tentar de novo" numa mensagem que não foi enviada. */
  readonly onRetrySend?: ((messageId: string) => void) | undefined
}): ReactNode {
  const { t, message, team, gestorPlansById, gestorPlanAdjustingIds, continued, onLoadTurnContext, onOpenTaskOnBoard, onApproveGestorPlan, onRejectGestorPlan, onRequestGestorPlanAdjust, memberId, onToggleReaction, subjectMoveTargets, onMoveMessageSubject, turnActivityTicketId, turnActivityFolds, turnActivityLabels, runErrorHandlers, onRetrySend } = props
  const inlineActivity = message.ticketId !== undefined
    && turnActivityTicketId === message.ticketId
    && turnActivityFolds !== undefined
    && turnActivityFolds.length > 0
    && turnActivityLabels !== undefined
  const gestorPlanRaw = message.gestorPlanId === undefined ? undefined : gestorPlansById[message.gestorPlanId]
  const gestorPlan = resolveGestorPlanForMessage(gestorPlanRaw, gestorPlansById, gestorPlanAdjustingIds)
  const motion = usePersonaMotion({
    preset: 'base',
    fromOpacity: props.streamVirtual === true ? 1 : 0,
    fromTranslateY: props.streamVirtual === true ? 0 : 8,
    delayMs: props.streamVirtual === true ? 0 : Math.min(props.index, 8) * 60,
  })
  const gestorMotion = usePersonaMotion({
    preset: 'character',
    fromOpacity: 0,
    fromTranslateY: 12,
    delayMs: 80,
  })
  const isUser = message.authorId === 'user'
  const labels = reactionLabels(t)
  const selectedReactions: ReactionId[] = message.reactions.flatMap((row) => {
    if (!isReactionId(row.stickerId)) return []
    return memberId !== undefined && row.actorIds.includes(memberId) ? [row.stickerId] : []
  })
  const hasReactions = message.reactions.length > 0
  /** Stickers are drawn by the message author's animal; the human's messages use the peer/coordination set. */
  const stickerAnimal = isUser ? props.userStickerAnimal : message.authorId
  const currentSubjectId = message.conversationSubjectId ?? DEFAULT_CONVERSATION_SUBJECT_ID
  const mover = subjectMoveTargets !== undefined && onMoveMessageSubject !== undefined ? (
    <MoveMessageSubject
      t={t}
      subjects={subjectMoveTargets}
      currentSubjectId={currentSubjectId}
      onMove={(subjectId) => { onMoveMessageSubject(message.id, subjectId) }}
    />
  ) : null
  const adder = onToggleReaction === undefined ? null : (
    <ReactionAdder
      animal={stickerAnimal}
      label={t('reaction.add')}
      labels={labels}
      selected={selectedReactions}
      placement={hasReactions ? 'top-start' : 'bottom-end'}
      onReact={(reaction) => { onToggleReaction(message.id, reaction) }}
    />
  )

  const RowTag = props.rowTag === 'div' ? 'div' : 'li'
  const rowRole = props.rowTag === 'div' ? { role: 'listitem' as const } : {}

  return (
    <RowTag
      className={continued ? `${styles.message} ${styles.continued}` : styles.message}
      data-author={isUser ? 'user' : 'persona'}
      data-message-id={message.id}
      ref={motion.ref}
      style={motion.style}
      {...rowRole}
    >
      <div className={styles.gutter}>
        {continued ? (
          <time className={styles.gutterTime} dateTime={message.timeLabel}>{message.timeLabel}</time>
        ) : !isUser && props.personaCardTrigger !== undefined ? (
          <button
            type="button"
            className={styles.avatarButton}
            aria-label={message.authorName}
            {...props.personaCardTrigger(message.authorId)}
          >
            <Avatar
              name={message.authorName}
              src={avatarFor(message.authorId)}
              shape="portrait"
              size={48}
              decorative
            />
          </button>
        ) : (
          <Avatar
            name={message.authorName}
            src={avatarFor(message.authorId)}
            shape={isUser ? 'person' : 'portrait'}
            size={48}
            decorative
          />
        )}
      </div>
      <div className={styles.body}>
        {!continued && (
          <div className={styles.meta}>
            <span className={styles.author}>{message.authorName}</span>
            <time className={styles.time} dateTime={message.timeLabel}>{message.timeLabel}</time>
            {message.steeredPersonaName !== undefined && (
              <Chip size="s" tone="brand">
                <span className={styles.steeredChipContent}>
                  <UiIcon name="arrowRight" size={12} strokeWidth={2.4} />
                  {t('composer.steer.steeredBadge', { name: message.steeredPersonaName })}
                </span>
              </Chip>
            )}
          </div>
        )}
        {message.runError !== undefined && runErrorHandlers !== undefined ? (
          <div className={styles.runError}>
            <ConversationRunErrorCard
              t={t}
              personaName={message.authorName}
              payload={message.runError}
              {...(avatarFor(message.authorId) === undefined ? {} : { avatarSrc: avatarFor(message.authorId) })}
              {...(message.authorPersonaId === undefined ? {} : { hostPersonaId: message.authorPersonaId })}
              handlers={runErrorHandlers}
            />
          </div>
        ) : message.body.length > 0 ? (
          // IV-3: as respostas das personas são markdown (listas, tabelas, código, links), nunca HTML cru; o que a pessoa
          // escreve continua texto simples.
          isUser
            ? <p className={styles.text}>{message.body}</p>
            : <div className={styles.text}><MarkdownBody source={message.body} t={t} /></div>
        ) : null}
        {message.sendFailed === true && (
          // P0-30: o host não recebeu. O texto fica no fio com a falha dita em voz alta e a ação de tentar de novo.
          <div className={styles.sendFailed} role="status" data-persona-send-failed="">
            <UiIcon name="alert" size={14} strokeWidth={2.2} />
            <span>{t('message.notSent')}</span>
            {onRetrySend !== undefined && (
              <Button size="s" variant="ghost" onClick={() => { onRetrySend(message.id) }}>
                {t('runError.action.retry')}
              </Button>
            )}
          </div>
        )}
        {gestorPlan !== undefined && (
          <div className={styles.gestorPlan} ref={gestorMotion.ref} style={gestorMotion.style}>
            <GestorPlanMessageCard
              t={t}
              plan={gestorPlan}
              team={team}
              {...(onApproveGestorPlan === undefined || gestorPlanRaw === undefined || gestorPlanRaw.status !== 'proposed'
                ? {}
                : { onApprove: () => { onApproveGestorPlan(gestorPlanRaw.id) } })}
              {...(onRejectGestorPlan === undefined || gestorPlan.status !== 'proposed'
                ? {}
                : { onDecline: () => { onRejectGestorPlan(gestorPlanRaw!.id) } })}
              {...(onRequestGestorPlanAdjust === undefined || gestorPlanRaw === undefined || gestorPlanRaw.status !== 'proposed'
                ? {}
                : { onAdjust: () => { onRequestGestorPlanAdjust(gestorPlanRaw.id) } })}
            />
          </div>
        )}
        {message.taskTitle !== undefined && message.taskTitle.length > 0 && (
          <div className={styles.taskCard} role="group" aria-label={message.taskTitle}>
            {message.ticketId !== undefined && onLoadTurnContext !== undefined ? (
              <button
                type="button"
                className={styles.taskCardButton}
                onClick={() => { onLoadTurnContext(message.ticketId!) }}
              >
                {message.taskTitle}
                <span className={styles.taskCardHint}>{t('context.show')}</span>
              </button>
            ) : (
              <span className={styles.taskCardButton}>{message.taskTitle}</span>
            )}
            {message.ticketId !== undefined && onOpenTaskOnBoard !== undefined && (
              <button
                type="button"
                className={styles.taskCardButton}
                onClick={() => { onOpenTaskOnBoard(message.ticketId!) }}
              >
                {message.taskTitle}
                <span className={styles.taskCardHint}>{t('context.openBoard')}</span>
              </button>
            )}
          </div>
        )}
        {inlineActivity && (
          <div className={styles.messageActivity} aria-label={t('context.activityLabel')}>
            {turnActivityFolds.map(fold => (
              <ActivityGroup
                key={fold.persona.name}
                persona={fold.persona}
                items={fold.items}
                labels={turnActivityLabels}
              />
            ))}
          </div>
        )}
        {hasReactions && (
          <ul className={styles.reactions} aria-label={t('reaction.listLabel')}>
            {message.reactions.map((reaction) => {
              const reactionId = isReactionId(reaction.stickerId)
                ? reaction.stickerId
                : reactionIdFromEmoji(reaction.stickerId)
              const emoji = reactionId !== undefined ? REACTION_EMOJI[reactionId] : reaction.stickerId
              const sticker = reactionId !== undefined ? stickerUrl(stickerAnimal, reactionId) : undefined
              const selected = reactionId !== undefined && selectedReactions.includes(reactionId)
              const name = reactionId !== undefined ? labels[reactionId] : emoji
              return (
                <li key={reaction.stickerId}>
                  <ReactionChip
                    emoji={emoji}
                    {...(sticker === undefined ? {} : { sticker })}
                    count={reaction.count}
                    selected={selected}
                    label={t('reaction.chipLabel', { name, count: String(reaction.count) })}
                    {...(onToggleReaction === undefined || reactionId === undefined
                      ? {}
                      : {
                        onClick: () => { onToggleReaction(message.id, reactionId) },
                      })}
                  />
                </li>
              )
            })}
            {adder !== null && <li className={styles.reactionAdder}>{adder}</li>}
            {mover !== null && <li className={styles.reactionAdder}>{mover}</li>}
          </ul>
        )}
        {!hasReactions && (adder !== null || mover !== null) && (
          <div className={styles.hoverActions}>
            {mover}
            {adder}
          </div>
        )}
      </div>
    </RowTag>
  )
}
