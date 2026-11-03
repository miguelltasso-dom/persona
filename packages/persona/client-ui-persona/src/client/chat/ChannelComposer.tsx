import { useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChatKey } from '../locale/chat/locales.ts'
import styles from './ChannelComposer.module.css'

const MODEL_KEYS: readonly { id: string; labelKey: ChatKey }[] = [
  { id: 'atlas', labelKey: 'composer.modelAtlas' },
  { id: 'bento', labelKey: 'composer.modelBento' },
  { id: 'nina', labelKey: 'composer.modelNina' },
]

export interface ChannelComposerProps extends PropsLocale<'persona.chat'> {
  onSend?(body: string): void
}

/** Single rounded composer bar (dirD): tools + persona chip + field + amber send. */
export function ChannelComposer({ t, onSend }: ChannelComposerProps): ReactNode {
  const [modelId, setModelId] = useState(MODEL_KEYS[0]?.id ?? '')
  const [draft, setDraft] = useState('')
  const activeModel = MODEL_KEYS.find(row => row.id === modelId) ?? MODEL_KEYS[0]

  return (
    <div className={styles.wrap}>
      <div className={styles.bar} role="form" aria-label={t('composer.placeholder')}>
        <button type="button" className={styles.toolBtn} aria-label={t('composer.add')}>+</button>
        <button type="button" className={styles.toolBtn} aria-label={t('composer.image')}>🖼</button>
        <button type="button" className={styles.toolBtn} aria-label={t('composer.attach')}>📎</button>
        <button type="button" className={styles.toolBtn} aria-label={t('composer.emoji')}>☺</button>
        <span className={styles.divider} aria-hidden="true" />
        <label className={styles.personaChip}>
          <span className={styles.srOnly}>{t('composer.modelLabel')}</span>
          <select
            className={styles.personaSelect}
            value={modelId}
            onChange={(event) => { setModelId(event.target.value) }}
          >
            {MODEL_KEYS.map(row => (
              <option key={row.id} value={row.id}>{t(row.labelKey)}</option>
            ))}
          </select>
          <span className={styles.chipLabel} aria-hidden="true">
            {activeModel !== undefined ? t(activeModel.labelKey) : t('composer.modelLabel')}
          </span>
        </label>
        <input
          className={styles.input}
          value={draft}
          onChange={(event) => { setDraft(event.target.value) }}
          placeholder={t('composer.placeholder')}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey) return
            event.preventDefault()
            const text = draft.trim()
            if (text.length === 0) return
            onSend?.(text)
            setDraft('')
          }}
        />
        <button
          type="button"
          className={styles.send}
          disabled={draft.trim().length === 0}
          aria-label={t('composer.send')}
          onClick={() => {
            const text = draft.trim()
            if (text.length === 0) return
            onSend?.(text)
            setDraft('')
          }}
        >
          <span className={styles.sendIcon} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
