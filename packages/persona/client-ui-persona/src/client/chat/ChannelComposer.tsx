import { useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChatKey } from '../locale/chat/locales.ts'
import styles from './ChannelComposer.module.css'

const MODEL_KEYS: readonly { id: string; labelKey: ChatKey }[] = [
  { id: 'atlas', labelKey: 'composer.modelAtlas' },
  { id: 'bento', labelKey: 'composer.modelBento' },
  { id: 'nina', labelKey: 'composer.modelNina' },
]

export interface ChannelComposerProps extends PropsLocale<'persona.chat'> {}

/** Composer with persona model selector (identifies who answers). */
export function ChannelComposer({ t }: ChannelComposerProps): ReactNode {
  const [modelId, setModelId] = useState(MODEL_KEYS[0]?.id ?? '')
  const [draft, setDraft] = useState('')

  return (
    <div className={styles.composer} role="form" aria-label={t('composer.placeholder')}>
      <label className={styles.modelLabel}>
        <span className={styles.modelCaption}>{t('composer.modelLabel')}</span>
        <select
          className={styles.modelSelect}
          value={modelId}
          onChange={(event) => { setModelId(event.target.value) }}
        >
          {MODEL_KEYS.map(row => (
            <option key={row.id} value={row.id}>{t(row.labelKey)}</option>
          ))}
        </select>
      </label>
      <textarea
        className={styles.input}
        value={draft}
        onChange={(event) => { setDraft(event.target.value) }}
        placeholder={t('composer.placeholder')}
        rows={2}
      />
      <button type="button" className={styles.send} disabled={draft.trim().length === 0}>
        {t('composer.send')}
      </button>
    </div>
  )
}
