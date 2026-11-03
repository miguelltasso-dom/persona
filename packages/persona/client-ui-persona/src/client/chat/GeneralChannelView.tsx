import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import { usePersonaMotion } from '../motion/index.ts'
import type { ChannelPersonaMember } from '../team/persona-work-state.ts'
import { TeamChannelStrip } from '../team/TeamChannelStrip.tsx'
import { ChannelComposer } from './ChannelComposer.tsx'
import type { ChannelMessageUi } from '../remote/map-host-ui.ts'
import styles from './GeneralChannelView.module.css'

export interface GeneralChannelViewProps extends PropsLocale<'persona.chat'> {
  readonly shellT: PropsLocale<'persona.shell'>['t']
  readonly members: readonly ChannelPersonaMember[]
  readonly messages: readonly ChannelMessageUi[]
  onSendMessage?(body: string): void
}

/** #geral channel — header, team strip, stream, composer (RCD: value in conversation). */
export function GeneralChannelView({
  t: tChat,
  shellT,
  members,
  messages,
  onSendMessage,
}: GeneralChannelViewProps): ReactNode {
  const composerProps = onSendMessage !== undefined ? { onSend: onSendMessage } : {}

  return (
    <div className={styles.view}>
      <header className={styles.header}>
        <div className={styles.headerMain}>
          <span className={styles.hashBadge} aria-hidden="true">#</span>
          <div className={styles.headerTitles}>
            <h1 className={styles.channelTitle}>
              {tChat('header.section')}
              <span className={styles.titleDot} aria-hidden="true"> · </span>
              {tChat('header.channelGeneral')}
            </h1>
            <p className={styles.subtitle}>{tChat('header.subtitle')}</p>
          </div>
        </div>
        <div className={styles.headerTools}>
          <button type="button" className={styles.iconBtn} aria-label={tChat('header.notifications')}>
            <span className={styles.bellIcon} aria-hidden="true" />
            <span className={styles.notifyDot} aria-hidden="true" />
          </button>
          <button type="button" className={styles.iconBtn} aria-label={tChat('header.help')}>
            ?
          </button>
          <button type="button" className={styles.userAvatar} aria-label={tChat('header.userMenu')}>
            <span className={styles.userStatusDot} aria-hidden="true" />
          </button>
        </div>
      </header>
      <TeamChannelStrip t={shellT} members={members} />
      <div className={styles.stream} role="log" aria-label={tChat('header.channelGeneral')}>
        <div className={styles.dayDivider} role="separator">
          <span>{tChat('stream.today')}</span>
        </div>
        <ol className={styles.messages}>
          {messages.map((message, index) => (
            <ChannelMessageRow key={message.id} message={message} index={index} />
          ))}
        </ol>
      </div>
      <ChannelComposer t={tChat} {...composerProps} />
    </div>
  )
}

function ChannelMessageRow(props: {
  message: ChannelMessageUi
  index: number
}): ReactNode {
  const motion = usePersonaMotion({
    preset: 'base',
    fromOpacity: 0,
    fromTranslateY: 8,
    delayMs: props.index * 60,
  })
  const avatar = props.message.authorId === 'user'
    ? undefined
    : AVATAR_96[props.message.authorId as keyof typeof AVATAR_96]

  return (
    <li className={styles.message} ref={motion.ref} style={motion.style}>
      {avatar !== undefined ? (
        <img className={styles.avatar} src={avatar} alt="" />
      ) : (
        <span className={styles.avatarUser} aria-hidden="true" />
      )}
      <div className={styles.body}>
        <div className={styles.meta}>
          <span className={styles.author}>{props.message.authorName}</span>
          <time className={styles.time} dateTime={props.message.timeLabel}>{props.message.timeLabel}</time>
        </div>
        <p className={styles.text}>{props.message.body}</p>
        {props.message.reactions.length > 0 && (
          <ul className={styles.reactions} aria-label="Reações">
            {props.message.reactions.map(reaction => (
              <li key={reaction}>
                <button type="button" className={styles.reactionChip}>{reaction}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}
