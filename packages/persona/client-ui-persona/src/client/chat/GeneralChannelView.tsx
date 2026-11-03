import { useEffect, useRef, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96, ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { usePersonaMotion } from '../motion/index.ts'
import { Avatar, BrandIcon, DayDivider, EmptyState, IconButton, ReactionChip, UiIcon } from '../primitives/index.ts'
import type { ChannelPersonaMember } from '../team/persona-work-state.ts'
import { TeamChannelStrip } from '../team/TeamChannelStrip.tsx'
import { ChannelComposer } from './ChannelComposer.tsx'
import type { ChannelMessageUi } from '../remote/map-host-ui.ts'
import type { TurnContextUi } from '../remote/turn-context-ui.ts'
import styles from './GeneralChannelView.module.css'

export interface GeneralChannelViewProps extends PropsLocale<'persona.chat'> {
  readonly shellT: PropsLocale<'persona.shell'>['t']
  readonly members: readonly ChannelPersonaMember[]
  readonly messages: readonly ChannelMessageUi[]
  readonly passThroughFollowers?: readonly { readonly name: string }[]
  readonly turnContext?: TurnContextUi | null
  readonly onLoadTurnContext?: ((ticketId: string) => void) | undefined
  readonly onSendMessage?: ((body: string) => void) | undefined
  /** Empty-team CTA in the banner (Prism wires: open onboarding/team builder). */
  readonly onBuildTeam?: (() => void) | undefined
}

interface ParsedReaction {
  readonly emoji: string
  readonly count: number
}

/** Host/mocks send reactions as "👍 3" strings; "+" is the add-reaction affordance. */
function parseReactions(raw: readonly string[]): ParsedReaction[] {
  const rows: ParsedReaction[] = []
  for (const item of raw) {
    const text = item.trim()
    if (text === '+' || text.length === 0) continue
    const match = /^(.*?)\s+(\d+)$/u.exec(text)
    rows.push(match === null ? { emoji: text, count: 1 } : { emoji: match[1] ?? text, count: Number(match[2]) })
  }
  return rows
}

function avatarFor(authorId: string): string | undefined {
  return authorId === 'user' ? undefined : AVATAR_96[authorId as keyof typeof AVATAR_96]
}

/** #geral — header, illustrated team banner, grouped stream with reactions, full composer (DESIGN-SYSTEM §6–7). */
export function GeneralChannelView({
  t, shellT, members, messages, passThroughFollowers = [], turnContext: _turnContext, onLoadTurnContext: _onLoadTurnContext, onSendMessage, onBuildTeam,
}: GeneralChannelViewProps): ReactNode {
  void _turnContext
  void _onLoadTurnContext
  const composerProps = onSendMessage !== undefined ? { onSend: onSendMessage } : {}
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

      <div className={styles.scroll} ref={scrollRef}>
        <div className={styles.column}>
          <TeamChannelStrip t={shellT} members={members} onBuildTeam={onBuildTeam} />
          {passThroughFollowers.length > 0 && (
            <ul className={styles.passThroughList} aria-live="polite">
              {passThroughFollowers.map(row => (
                <li key={row.name} className={styles.passThrough}>{t('stream.passThrough', { name: row.name })}</li>
              ))}
            </ul>
          )}
          <div className={styles.stream} role="log" aria-label={t('header.channelGeneral')} aria-live="polite">
            {messages.length === 0 ? (
              <EmptyState
                compact
                illustration={ILLUSTRATIONS['empty-dm']}
                title={t('stream.emptyTitle')}
                body={t('stream.emptyBody')}
              />
            ) : (
              <MessageList t={t} messages={messages} />
            )}
          </div>
        </div>
      </div>

      <div className={styles.composerDock}>
        <div className={styles.column}>
          <ChannelComposer t={t} members={members} {...composerProps} />
        </div>
      </div>
    </div>
  )
}

/** Grouped message stream with day pill (shared by #geral and DMs). */
export function MessageList({ t, messages }: {
  readonly t: PropsLocale<'persona.chat'>['t']
  readonly messages: readonly ChannelMessageUi[]
}): ReactNode {
  return (
    <>
      <DayDivider>{t('stream.today')}</DayDivider>
      <ol className={styles.messages}>
        {messages.map((message, index) => (
          <ChannelMessageRow
            key={message.id}
            t={t}
            message={message}
            index={index}
            continued={index > 0 && messages[index - 1]?.authorId === message.authorId}
          />
        ))}
      </ol>
    </>
  )
}

function ChannelMessageRow(props: {
  readonly t: PropsLocale<'persona.chat'>['t']
  readonly message: ChannelMessageUi
  readonly index: number
  readonly continued: boolean
}): ReactNode {
  const { t, message, continued } = props
  const motion = usePersonaMotion({
    preset: 'base',
    fromOpacity: 0,
    fromTranslateY: 8,
    delayMs: Math.min(props.index, 8) * 60,
  })
  const reactions = parseReactions(message.reactions)
  const isUser = message.authorId === 'user'

  return (
    <li
      className={continued ? `${styles.message} ${styles.continued}` : styles.message}
      data-author={isUser ? 'user' : 'persona'}
      ref={motion.ref}
      style={motion.style}
    >
      <div className={styles.gutter}>
        {continued ? (
          <time className={styles.gutterTime} dateTime={message.timeLabel}>{message.timeLabel}</time>
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
        <p className={styles.text}>{message.body}</p>
        {reactions.length > 0 && (
          <ul className={styles.reactions} aria-label={t('message.addReaction')}>
            {reactions.map(reaction => (
              <li key={reaction.emoji}>
                <ReactionChip
                  emoji={reaction.emoji}
                  count={reaction.count}
                  label={t('message.reactionLabel', { count: String(reaction.count), emoji: reaction.emoji })}
                />
              </li>
            ))}
            <li>
              <IconButton size="s" label={t('message.addReaction')} icon={<UiIcon name="smile" size={18} />} className={styles.addReaction} />
            </li>
          </ul>
        )}
      </div>
    </li>
  )
}
