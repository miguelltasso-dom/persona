import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import { usePersonaMotion } from '../motion/index.ts'
import { MOCK_CHANNEL_ROSTER } from '../team/mock-channel-roster.ts'
import { TeamChannelStrip } from '../team/TeamChannelStrip.tsx'
import { ChannelComposer } from './ChannelComposer.tsx'
import { MOCK_GERAL_MESSAGES } from './mock-channel-messages.ts'
import styles from './GeneralChannelView.module.css'

export interface GeneralChannelViewProps extends PropsLocale<'persona.chat'> {
  readonly shellT: PropsLocale<'persona.shell'>['t']
}

/** #geral channel — header, team strip, mock stream, composer (RCD: value in conversation). */
export function GeneralChannelView({ t: tChat, shellT }: GeneralChannelViewProps): ReactNode {
  return (
    <div className={styles.view}>
      <header className={styles.header}>
        <p className={styles.breadcrumb}>
          <span className={styles.section}>{tChat('header.section')}</span>
          <span className={styles.dot} aria-hidden="true">·</span>
          <span className={styles.channel}>{tChat('header.channelGeneral')}</span>
        </p>
      </header>
      <TeamChannelStrip t={shellT} members={MOCK_CHANNEL_ROSTER} />
      <div className={styles.stream} role="log" aria-label={tChat('header.channelGeneral')}>
        <ol className={styles.messages}>
          {MOCK_GERAL_MESSAGES.map((message, index) => (
            <ChannelMessageRow key={message.id} message={message} index={index} />
          ))}
        </ol>
      </div>
      <ChannelComposer t={tChat} />
    </div>
  )
}

function ChannelMessageRow(props: {
  message: (typeof MOCK_GERAL_MESSAGES)[number]
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
              <li key={reaction}><span className={styles.reactionChip}>{reaction}</span></li>
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}
