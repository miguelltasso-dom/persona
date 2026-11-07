import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Avatar, Button, Chip, MenuButton, UiIcon } from '../primitives/index.ts'
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
  /** P0-19: entrou na fila porque a cota acabou; só sai quando ela voltar (não quando a persona termina o passo). */
  readonly heldForQuota?: boolean | undefined
  /** Depois do Parar a fila fica guardada e a persona está parada: o balão diz "sai quando você continuar" (e não "quando {name} terminar o passo atual"). Quem monta a tela decide pelo fio (`queued-after-stop.ts`). */
  readonly heldAfterStop?: boolean | undefined
  /** Voltou do `localStorage` depois de recarregar a janela: o balão diz "Ainda na fila". */
  readonly restored?: boolean | undefined
  /** Anexos já enviados ao host, só nesta sessão (os ids não são guardados): saem junto com a mensagem. */
  readonly attachments?: readonly { readonly id: string; readonly name: string }[] | undefined
  /** Anexos que a mensagem tinha antes de recarregar a janela e que NÃO ficaram guardados: o balão avisa e a fila não a envia calada. */
  readonly lostAttachmentNames?: readonly string[] | undefined
}

export interface QueuedMessageBubbleProps extends PropsLocale<'persona.chat'> {
  readonly item: QueuedMessageItem
  readonly isOnlyItem?: boolean | undefined
  /** Quando a cota volta (já formatada pelo host): "Na fila · sai quando a cota voltar às {hora}". */
  readonly quotaUntil?: string | undefined
  readonly onSendNow: (id: string) => void
  readonly onEdit: (id: string) => void
  readonly onRemove: (id: string) => void
}

function metaText(t: QueuedMessageBubbleProps['t'], item: QueuedMessageItem, quotaUntil: string | undefined): string {
  if (item.heldForQuota === true) {
    return quotaUntil !== undefined && quotaUntil.length > 0
      ? t('composer.steer.queuedMetaQuotaAt', { time: quotaUntil })
      : t('composer.steer.queuedMetaQuota')
  }
  if (item.restored === true) return t('composer.steer.stillQueued')
  if (item.heldAfterStop === true) return t('composer.steer.queuedMetaStopped')
  return t('composer.steer.queuedMeta', { name: item.targetPersonaName })
}

export function QueuedMessageBubble({
  t,
  item,
  isOnlyItem = true,
  quotaUntil,
  onSendNow,
  onEdit,
  onRemove,
}: QueuedMessageBubbleProps): ReactNode {
  // Com anexos desta sessão o "Editar" não existe: o texto voltaria ao composer sem eles (a fila só edita texto).
  const canEdit = item.attachments === undefined || item.attachments.length === 0
  const lost = item.lostAttachmentNames ?? []
  // Parada pela pessoa: "Mandar agora" envia de verdade e a persona responde, ou seja, ela CONTINUA (Muse 16:37): o nome acessível diz isso.
  const sendNowLabel = t(item.heldAfterStop === true ? 'composer.steer.sendNowStoppedLabel' : 'composer.steer.sendNowLabel')
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
          <span>{metaText(t, item, quotaUntil)}</span>
        </div>

        <p className={styles.text}>{item.text}</p>

        {item.attachments !== undefined && item.attachments.length > 0 && (
          <ul className={styles.attachments} aria-label={t('composer.attachmentsLabel')}>
            {item.attachments.map(file => (
              <li key={file.id}>
                <Chip size="s" tone="plain" icon={<UiIcon name="attach" size={12} strokeWidth={2.2} />}>{file.name}</Chip>
              </li>
            ))}
          </ul>
        )}
        {lost.length > 0 && (
          // Nunca sumir calado: o anexo não sobrevive ao recarregar, e a fila não envia esta mensagem sem ele por conta própria.
          <p className={styles.lostAttachment} role="status" data-persona-queued-attachment-lost="">
            <UiIcon name="alert" size={14} strokeWidth={2.2} />
            <span>{t(lost.length === 1 ? 'composer.steer.attachmentLost' : 'composer.steer.attachmentsLost')}</span>
          </p>
        )}

        <div className={styles.actions}>
          {isOnlyItem ? (
            <>
              <Button
                size="s"
                variant="ghost"
                onClick={() => { onSendNow(item.id) }}
                aria-label={sendNowLabel}
              >
                {t('composer.steer.sendNow')}
              </Button>
              {canEdit && (
                <Button
                  size="s"
                  variant="ghost"
                  onClick={() => { onEdit(item.id) }}
                  aria-label={t('composer.steer.editLabel')}
                >
                  {t('composer.steer.edit')}
                </Button>
              )}
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
                aria-label={sendNowLabel}
              >
                {t('composer.steer.sendNow')}
              </Button>
              <MenuButton
                variant="ghost"
                align="end"
                label={metaText(t, item, quotaUntil)}
                items={[
                  ...(canEdit
                    ? [{
                      id: 'edit',
                      label: t('composer.steer.edit'),
                      onSelect: () => { onEdit(item.id) },
                    }]
                    : []),
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
