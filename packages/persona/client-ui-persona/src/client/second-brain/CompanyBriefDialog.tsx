/** Memória › Resumo › "Descrever a empresa em 3 frases": what the person writes here is the profile the team reads before acting. */

import { useState, type ReactNode } from 'react'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Button, Modal, Textarea } from '../primitives/index.ts'
import styles from './SecondBrain.module.css'

export interface CompanyBriefDialogProps {
  readonly dict: LocaleDict
  readonly onClose: () => void
  /** Saves the profile. A rejection is shown as a sentence and the dialog stays open with the text still in the field. */
  readonly onSave: (text: string) => Promise<void>
}

export function CompanyBriefDialog({ dict, onClose, onSave }: CompanyBriefDialogProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const save = (): void => {
    if (text.trim() === '' || busy) return
    setBusy(true)
    setFailed(false)
    void onSave(text.trim())
      .catch(() => { setFailed(true) })
      .finally(() => { setBusy(false) })
  }
  return (
    <Modal
      open
      size="m"
      title={t('brief.title')}
      description={t('brief.body')}
      closeLabel={t('brief.cancel')}
      onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>{t('brief.cancel')}</Button>
          <Button variant="primary" loading={busy} disabled={text.trim() === ''} onClick={save}>{t('brief.save')}</Button>
        </>
      )}
    >
      <form className={styles.newPageForm} onSubmit={(event) => { event.preventDefault(); save() }}>
        <Textarea
          label={t('brief.label')}
          placeholder={t('brief.placeholder')}
          value={text}
          rows={5}
          maxLength={1200}
          autoFocus
          onChange={(event) => { setText(event.target.value) }}
        />
        {failed && <p className={styles.newPageFailed} role="alert">{t('brief.failed')}</p>}
      </form>
    </Modal>
  )
}
