import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Avatar, Button, MenuButton, UiIcon } from '../primitives/index.ts'
import styles from './QueuedMessageBubble.module.css'

export interface QueuedMessageItem {
  readonly id: string
  readonly text: string
  readonly targetPersonaName: string
  /** Quem responde (composer): a fila sai sozinha quando essa persona deixa de trabalhar. */
  readonly targetPersonaId?: string | undefined
  readonly authorName?: string | undefined
  readonly authorAvatar?: string | undefined
  readonly isSending?: boolean | undefined
}

export interface QueuedMessageBubbleProps extends PropsLocale<'persona.chat'> {
  readonly item: QueuedMessageItem
  readonly isOnlyItem?: boolean | undefined
  readonly onSendNow: (id: string) => void
  readonly onEdit: (id: string) => void
  readonly onRemove: (id: string) => void
}

export function QueuedMessageBubble({
  t,
  item,
  isOnlyItem = true,
  onSendNow,
  onEdit,
  onRemove,
}: QueuedMessageBubbleProps): ReactNode {
  return (
    <article
      className={styles.queuedMessage}
      data-sending={item.isSending ? 'true' : undefined}
      aria-label={t('composer.steer.queuedLabel', { text: item.text })}
      data-persona-queued-message=""
    >
      <div className={styles.gutter}>
        <Avatar
          name={item.authorName ?? 'Eu'}
          src={item.authorAvatar}
          shape="person"
          size={40}
          decorative
        />
      </div>
      <div className={styles.body}>
        <div className={styles.meta}>
          <span className={styles.clockIcon} aria-hidden="true">
            <UiIcon name="clock" size={14} />
          </span>
          <span>{t('composer.steer.queuedMeta', { name: item.targetPersonaName })}</span>
        </div>

        <p className={styles.text}>{item.text}</p>

        <div className={styles.actions}>
          {isOnlyItem ? (
            <>
              <Button
                size="s"
                variant="ghost"
                onClick={() => { onSendNow(item.id) }}
                aria-label={t('composer.steer.sendNowLabel')}
              >
                {t('composer.steer.sendNow')}
              </Button>
              <Button
                size="s"
                variant="ghost"
                onClick={() => { onEdit(item.id) }}
                aria-label={t('composer.steer.editLabel')}
              >
                {t('composer.steer.edit')}
              </Button>
              <Button
                size="s"
                variant="ghost"
                onClick={() => { onRemove(item.id) }}
                aria-label={t('composer.steer.removeLabel')}
              >
                {t('composer.steer.remove')}
              </Button>
            </>
          ) : (
            <>
              <Button
                size="s"
                variant="ghost"
                onClick={() => { onSendNow(item.id) }}
                aria-label={t('composer.steer.sendNowLabel')}
              >
                {t('composer.steer.sendNow')}
              </Button>
              <MenuButton
                variant="ghost"
                align="end"
                label={t('composer.steer.queuedMeta', { name: item.targetPersonaName })}
                items={[
                  {
                    id: 'edit',
                    label: t('composer.steer.edit'),
                    onSelect: () => { onEdit(item.id) },
                  },
                  {
                    id: 'remove',
                    label: t('composer.steer.remove'),
                    onSelect: () => { onRemove(item.id) },
                  },
                ]}
              />
            </>
          )}
        </div>
      </div>
    </article>
  )
}
