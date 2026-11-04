import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96, ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { usePersonaMotion } from '../motion/index.ts'
import {
  Avatar,
  BrandIcon,
  DayDivider,
  Button,
  EmptyState,
  IconButton,
  REACTION_EMOJI,
  REACTION_IDS,
  ReactionChip,
  UiIcon,
  stickerUrl,
  Toast,
  ToastRegion,
  type ReactionId,
} from '../primitives/index.ts'
import type { ConversationSubjectUi } from './conversation-subjects.ts'
import { DEFAULT_CONVERSATION_SUBJECT_ID } from './conversation-subjects.ts'
import { MoveMessageSubject } from './MoveMessageSubject.tsx'
import { subjectDisplayName } from './SubjectBar.tsx'
import type { ChannelPersonaMember } from '../team/persona-work-state.ts'
import { TeamChannelStrip } from '../team/TeamChannelStrip.tsx'
import { ChannelComposer } from './ChannelComposer.tsx'
import { MessageQuoteToolbar, type MessageQuote } from './MessageQuoteToolbar.tsx'
import type { ComposerSlashCommand } from './composer-slash-commands.ts'
import { SubjectBar, type SubjectBarProps } from './SubjectBar.tsx'
import { ReactionAdder, reactionIdFromEmoji } from './ReactionAdder.tsx'
import { TurnContextDrawer } from './TurnContextDrawer.tsx'
import type { GestorPlanView } from '@deepseek-ai/dsh-persona-host/types'
import { GestorPlanMessageCard } from './GestorPlanMessageCard.tsx'
import type { ChannelMessageUi } from '../remote/map-host-ui.ts'
import { resolveHostPersonaId } from '../remote/map-host-ui.ts'
import type { PersonaCardShellBridge } from '../remote/persona-card-shell-bridge.ts'
import type { TeamView } from '../remote/persona-remote-types.ts'
import type { TurnContextUi } from '../remote/turn-context-ui.ts'
import { PersonaCardPopoverHost, usePersonaCardController } from '../profile/PersonaCardPopoverHost.tsx'
import styles from './GeneralChannelView.module.css'

export interface GeneralChannelViewProps extends PropsLocale<'persona.chat'> {
  readonly shellT: PropsLocale<'persona.shell'>['t']
  readonly members: readonly ChannelPersonaMember[]
  readonly messages: readonly ChannelMessageUi[]
  readonly passThroughFollowers?: readonly { readonly name: string }[]
  readonly turnContext?: TurnContextUi | null
  readonly onLoadTurnContext?: ((ticketId: string) => void) | undefined
  readonly onSendMessage?: ((body: string, attachmentIds?: readonly string[]) => void) | undefined
  readonly uploadAttachment?: ((file: File) => Promise<{ readonly id: string; readonly name: string }>) | undefined
  /** Empty-team CTA in the banner (Prism wires: open onboarding/team builder). */
  readonly onBuildTeam?: (() => void) | undefined
  readonly team?: TeamView | null
  readonly personaCard?: PersonaCardShellBridge | undefined
  readonly openPersonaProfile?: ((personaId: string) => void) | undefined
  readonly memberId?: string | undefined
  readonly onToggleReaction?: ((messageId: string, stickerId: ReactionId) => void) | undefined
  /** WAVE2 assuntos (Prism data; Muse styles SubjectBar). */
  readonly subjectBar?: Omit<SubjectBarProps, 't'> | undefined
  readonly composerSubjectPlaceholder?: string | undefined
  readonly composerSubjectColorIndex?: import('./conversation-subjects.ts').SubjectColorIndex | undefined
  readonly subjectMoveTargets?: readonly ConversationSubjectUi[] | undefined
  readonly onMoveMessageSubject?: ((messageId: string, subjectId: string) => void) | undefined
  readonly onUndoMoveMessage?: ((messageId: string) => void) | undefined
  readonly gestorPlansById?: Readonly<Record<string, GestorPlanView>>
  readonly onApproveGestorPlan?: ((planId: string) => void) | undefined
  readonly onRejectGestorPlan?: ((planId: string) => void) | undefined
  readonly conversationKey?: string | undefined
  readonly onSlashCommand?: ((command: ComposerSlashCommand, arg: string) => void) | undefined
  readonly quotaBlocked?: boolean | undefined
  readonly quotaResumeLabel?: string | undefined
  readonly onResumeQuota?: (() => void) | undefined
  readonly onSwapAccount?: (() => void) | undefined
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
  passThroughFollowers = [],
  turnContext,
  onLoadTurnContext,
  onSendMessage,
  onBuildTeam,
  uploadAttachment,
  team = null,
  personaCard,
  openPersonaProfile,
  memberId,
  onToggleReaction,
  subjectBar,
  composerSubjectPlaceholder,
  composerSubjectColorIndex,
  subjectMoveTargets,
  onMoveMessageSubject,
  onUndoMoveMessage,
  gestorPlansById = {},
  onApproveGestorPlan,
  onRejectGestorPlan,
  conversationKey = 'channel:geral',
  onSlashCommand,
  quotaBlocked,
  quotaResumeLabel,
  onResumeQuota,
  onSwapAccount,
}: GeneralChannelViewProps): ReactNode {
  const [moveToast, setMoveToast] = useState<{ readonly messageId: string; readonly subjectLabel: string } | null>(null)
  const [pendingQuote, setPendingQuote] = useState<MessageQuote | null>(null)
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
    ...(onSendMessage !== undefined ? { onSend: onSendMessage } : {}),
    ...(uploadAttachment !== undefined ? { uploadAttachment } : {}),
    ...(composerSubjectPlaceholder !== undefined ? { placeholder: composerSubjectPlaceholder } : {}),
    ...(composerSubjectColorIndex !== undefined ? { activeSubjectColorIndex: composerSubjectColorIndex } : {}),
    conversationKey,
    pendingQuote,
    onClearQuote: () => { setPendingQuote(null) },
    ...(onSlashCommand === undefined ? {} : { onSlashCommand }),
    ...(quotaBlocked === undefined ? {} : { quotaBlocked }),
    ...(quotaResumeLabel === undefined ? {} : { quotaResumeLabel }),
    ...(onResumeQuota === undefined ? {} : { onResumeQuota }),
    ...(onSwapAccount === undefined ? {} : { onSwapAccount }),
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
          <IconButton label={t('header.search')} icon={<BrandIcon name="busca" size={20} />} />
          <IconButton label={t('header.notifications')} icon={<UiIcon name="bell" size={21} />} badge />
          <IconButton label={t('header.help')} icon={<UiIcon name="help" size={21} />} />
          <button type="button" className={styles.userButton} aria-label={t('header.userMenu')}>
            <Avatar name={userName} size={40} presence="online" decorative />
            <UiIcon name="chevronDown" size={16} strokeWidth={2.2} />
          </button>
        </div>
      </header>

      {subjectBar !== undefined && (
        <div className={styles.subjectRow}>
          <SubjectBar t={t} {...subjectBar} />
        </div>
      )}

      <div className={styles.scroll} ref={scrollRef} tabIndex={0} role="region" aria-label={t('header.channelGeneral')}>
        <div className={styles.column}>
          <TeamChannelStrip
            t={shellT}
            members={members}
            onBuildTeam={onBuildTeam}
            {...(personaCardTrigger === undefined ? {} : { personaCardTrigger })}
          />
          {passThroughFollowers.length > 0 && (
            <ul className={styles.passThroughList} aria-live="polite">
              {passThroughFollowers.map(row => (
                <li key={row.name} className={styles.passThrough}>{t('stream.passThrough', { name: row.name })}</li>
              ))}
            </ul>
          )}
          <div
            ref={streamRef}
            className={styles.stream}
            {...(subjectBar?.panelId === undefined ? { role: 'log' as const } : { id: subjectBar.panelId, role: 'tabpanel' as const })}
            aria-label={t('header.channelGeneral')}
            aria-live="polite"
          >
            <MessageQuoteToolbar
              t={t}
              containerRef={streamRef}
              onQuote={(quote) => { setPendingQuote({ ...quote, comment: '' }) }}
            />
            {messages.length === 0 ? (
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
                onLoadTurnContext={onLoadTurnContext}
                {...(onApproveGestorPlan === undefined ? {} : { onApproveGestorPlan })}
                {...(onRejectGestorPlan === undefined ? {} : { onRejectGestorPlan })}
                {...(personaCardTrigger === undefined ? {} : { personaCardTrigger })}
                {...(memberId === undefined ? {} : { memberId })}
                {...(onToggleReaction === undefined ? {} : { onToggleReaction })}
                {...(coordinationAnimal === undefined ? {} : { userStickerAnimal: coordinationAnimal })}
                {...(subjectMoveTargets === undefined ? {} : { subjectMoveTargets })}
                {...(onMoveMessageSubject === undefined ? {} : {
                  onMoveMessageSubject: (messageId, subjectId) => {
                    onMoveMessageSubject(messageId, subjectId)
                    const target = subjectMoveTargets?.find(row => row.id === subjectId)
                    const subjectLabel = target === undefined ? subjectId : subjectDisplayName(t, target)
                    setMoveToast({ messageId, subjectLabel })
                  },
                })}
              />
            )}
          </div>
        </div>
      </div>

      <TurnContextDrawer t={t} context={turnContext} />

      <div className={styles.composerDock}>
        <div className={styles.column}>
          <ChannelComposer t={t} members={members} {...composerProps} />
        </div>
      </div>
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
                    onUndoMoveMessage(moveToast.messageId)
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
export function MessageList({ t, team = null, messages, gestorPlansById = {}, onApproveGestorPlan, onRejectGestorPlan, onLoadTurnContext, personaCardTrigger, memberId, onToggleReaction, userStickerAnimal, subjectMoveTargets, onMoveMessageSubject }: {
  readonly t: PropsLocale<'persona.chat'>['t']
  readonly team?: TeamView | null
  readonly messages: readonly ChannelMessageUi[]
  readonly gestorPlansById?: Readonly<Record<string, GestorPlanView>>
  readonly onApproveGestorPlan?: ((planId: string) => void) | undefined
  readonly onRejectGestorPlan?: ((planId: string) => void) | undefined
  readonly onLoadTurnContext?: ((ticketId: string) => void) | undefined
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
}): ReactNode {
  return (
    <>
      <DayDivider>{t('stream.today')}</DayDivider>
      <ol className={styles.messages}>
        {messages.map((message, index) => (
          <ChannelMessageRow
            key={message.id}
            t={t}
            team={team}
            message={message}
            gestorPlansById={gestorPlansById}
            index={index}
            continued={index > 0 && messages[index - 1]?.authorId === message.authorId}
            onLoadTurnContext={onLoadTurnContext}
            {...(onApproveGestorPlan === undefined ? {} : { onApproveGestorPlan })}
            {...(onRejectGestorPlan === undefined ? {} : { onRejectGestorPlan })}
            {...(personaCardTrigger === undefined ? {} : { personaCardTrigger })}
            {...(memberId === undefined ? {} : { memberId })}
            {...(onToggleReaction === undefined ? {} : { onToggleReaction })}
            {...(userStickerAnimal === undefined ? {} : { userStickerAnimal })}
            {...(subjectMoveTargets === undefined ? {} : { subjectMoveTargets })}
            {...(onMoveMessageSubject === undefined ? {} : { onMoveMessageSubject })}
          />
        ))}
      </ol>
    </>
  )
}

function ChannelMessageRow(props: {
  readonly t: PropsLocale<'persona.chat'>['t']
  readonly team: TeamView | null
  readonly message: ChannelMessageUi
  readonly gestorPlansById: Readonly<Record<string, GestorPlanView>>
  readonly index: number
  readonly continued: boolean
  readonly onApproveGestorPlan?: ((planId: string) => void) | undefined
  readonly onRejectGestorPlan?: ((planId: string) => void) | undefined
  readonly onLoadTurnContext?: ((ticketId: string) => void) | undefined
  readonly personaCardTrigger?: ((ref: string) => Record<string, unknown>) | undefined
  readonly memberId?: string | undefined
  readonly onToggleReaction?: ((messageId: string, stickerId: ReactionId) => void) | undefined
  readonly userStickerAnimal?: string | undefined
  readonly subjectMoveTargets?: readonly ConversationSubjectUi[] | undefined
  readonly onMoveMessageSubject?: ((messageId: string, subjectId: string) => void) | undefined
}): ReactNode {
  const { t, message, team, gestorPlansById, continued, onLoadTurnContext, onApproveGestorPlan, onRejectGestorPlan, memberId, onToggleReaction, subjectMoveTargets, onMoveMessageSubject } = props
  const gestorPlan = message.gestorPlanId === undefined ? undefined : gestorPlansById[message.gestorPlanId]
  const motion = usePersonaMotion({
    preset: 'base',
    fromOpacity: 0,
    fromTranslateY: 8,
    delayMs: Math.min(props.index, 8) * 60,
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

  return (
    <li
      className={continued ? `${styles.message} ${styles.continued}` : styles.message}
      data-author={isUser ? 'user' : 'persona'}
      data-message-id={message.id}
      ref={motion.ref}
      style={motion.style}
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
          </div>
        )}
        {message.body.length > 0 && <p className={styles.text}>{message.body}</p>}
        {gestorPlan !== undefined && (
          <div className={styles.gestorPlan}>
            <GestorPlanMessageCard
              t={t}
              plan={gestorPlan}
              team={team}
              {...(onApproveGestorPlan === undefined || gestorPlan.status !== 'proposed'
                ? {}
                : { onApprove: () => { onApproveGestorPlan(gestorPlan.id) } })}
              {...(onRejectGestorPlan === undefined || gestorPlan.status !== 'proposed'
                ? {}
                : { onDecline: () => { onRejectGestorPlan(gestorPlan.id) } })}
            />
          </div>
        )}
        {message.taskTitle !== undefined && message.taskTitle.length > 0 && (
          <p className={styles.taskCard}>
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
              <span>{message.taskTitle}</span>
            )}
          </p>
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
    </li>
  )
}
