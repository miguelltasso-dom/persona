import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import { Avatar, IconButton, UiIcon } from '../primitives/index.ts'
import type { ChannelPersonaMember } from '../team/persona-work-state.ts'
import styles from './ChannelComposer.module.css'

export interface ChannelComposerProps extends PropsLocale<'persona.chat'> {
  /** Channel roster; the first member (coordination) answers by default. */
  readonly members?: readonly ChannelPersonaMember[]
  readonly onSend?: ((body: string) => void) | undefined
}

const MAX_ROWS_PX = 8 * 24

/** Composer card (dirD): auto-growing field, tool row, "Responde" persona chip, amber send. */
export function ChannelComposer({ t, members = [], onSend }: ChannelComposerProps): ReactNode {
  const [draft, setDraft] = useState('')
  const [responderId, setResponderId] = useState<string>(members[0]?.id ?? '')
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const fieldId = useId()
  const hintId = useId()
  const responder = members.find(member => member.id === responderId) ?? members[0]
  const canSend = draft.trim().length > 0

  useLayoutEffect(() => {
    const node = fieldRef.current
    if (node === null) return
    node.style.height = 'auto'
    node.style.height = `${Math.min(node.scrollHeight, MAX_ROWS_PX)}px`
  }, [draft])

  const send = (): void => {
    const text = draft.trim()
    if (text.length === 0) return
    onSend?.(text)
    setDraft('')
    fieldRef.current?.focus()
  }

  return (
    <form
      className={styles.composer}
      aria-label={t('composer.placeholder')}
      onSubmit={(event) => { event.preventDefault(); send() }}
    >
      <label htmlFor={fieldId} className="persona-sr-only">{t('composer.placeholderChannel')}</label>
      <textarea
        ref={fieldRef}
        id={fieldId}
        className={styles.field}
        rows={1}
        value={draft}
        placeholder={t('composer.placeholderChannel')}
        aria-describedby={hintId}
        onChange={(event) => { setDraft(event.target.value) }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
          event.preventDefault()
          send()
        }}
      />
      <div className={styles.toolbar}>
        <div className={styles.tools}>
          <IconButton size="s" label={t('composer.add')} icon={<UiIcon name="plus" size={20} strokeWidth={2} />} variant="secondary" className={styles.plus} />
          <IconButton size="s" label={t('composer.image')} icon={<UiIcon name="image" size={20} />} />
          <IconButton size="s" label={t('composer.attach')} icon={<UiIcon name="attach" size={20} />} />
          <IconButton size="s" label={t('composer.emoji')} icon={<UiIcon name="smile" size={20} />} />
          <IconButton size="s" label={t('composer.mention')} icon={<UiIcon name="at" size={20} />} />
          {responder !== undefined && (
            <>
              <span className={styles.divider} aria-hidden="true" />
              <label className={styles.responder}>
                <span className={styles.responderLabel}>{t('composer.respondsLabel')}</span>
                <Avatar name={responder.name} src={AVATAR_96[responder.id]} size={24} decorative />
                <span className={styles.responderName} aria-hidden="true">{responder.name}</span>
                <UiIcon name="chevronDown" size={14} strokeWidth={2.4} />
                <select
                  className={styles.responderSelect}
                  aria-label={t('composer.modelLabel')}
                  value={responder.id}
                  onChange={(event) => { setResponderId(event.target.value) }}
                >
                  {members.map(member => (
                    <option key={member.id} value={member.id}>{`${member.name} — ${member.role}`}</option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>
        <p id={hintId} className={styles.hint}>{t('composer.hint')}</p>
        <button type="submit" className={styles.send} disabled={!canSend} aria-label={t('composer.send')}>
          <UiIcon name="send" size={20} strokeWidth={2} />
        </button>
      </div>
    </form>
  )
}
